import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.tokens.js';

/**
 * The connection an in-flight transaction is holding, if there is one.
 *
 * `AsyncLocalStorage` rather than a parameter threaded through every method,
 * and that is the whole reason this works: thirteen repository interfaces and
 * their twenty-six implementations would otherwise each need a client argument
 * they mostly ignore, and every caller would need to pass it. Ambient context
 * lets `runInTransaction` wrap code that has no idea it is inside one.
 *
 * The trade-off is honest: ambient state is invisible at the call site. It is
 * acceptable here because exactly one thing sets it (`runInTransaction`), it is
 * scoped to one async call tree rather than to the process, and Node's own
 * async context tracking - not a global variable - is what keeps two concurrent
 * requests from seeing each other's client.
 *
 * `null` means *inside a transaction on the memory driver*, which is a real
 * state and not the same as being outside one. Keeping the two distinguishable
 * is what lets `AuditService.record` assert it is inside a unit of work under
 * **both** drivers - and an assertion that only fires in production is not a
 * guard, it is a liability.
 */
const transactionContext = new AsyncLocalStorage<PoolClient | null>();

/**
 * The only thing in the codebase that talks to Postgres.
 *
 * Every method takes the SQL and its parameters separately - `pg` sends them
 * over the extended query protocol, so a value can never be parsed as SQL
 * (CLAUDE.md §8: parameterized queries only, no string-built SQL). There is no
 * escaping helper here on purpose: adding one would create the shortcut that
 * makes injection possible.
 *
 * The pool is injected rather than constructed so `PERSISTENCE_DRIVER=memory`
 * can supply `null` and this service can exist without a database behind it.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  /** True when a Postgres connection is configured for this process. */
  get isConfigured(): boolean {
    return this.pool !== null;
  }

  private requirePool(): Pool {
    if (!this.pool) {
      throw new Error(
        'A Postgres repository was called while PERSISTENCE_DRIVER is not "postgres". ' +
          'This is a wiring bug: the in-memory implementation should have been ' +
          'selected instead.',
      );
    }
    return this.pool;
  }

  /**
   * Whether the caller is inside `runInTransaction`. Exposed so a service can
   * assert it rather than assume it - see `AuditService.record`.
   */
  get inTransaction(): boolean {
    return transactionContext.getStore() !== undefined;
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    // The ambient transaction's client when there is one, a pool connection
    // otherwise. This one line is what lets an existing repository join a
    // transaction without knowing it is in one.
    const runner = transactionContext.getStore() ?? this.requirePool();
    const result = await runner.query<T>(text, params as unknown[]);
    return result.rows;
  }

  /** The single-row read, which is most of what the student surface does. */
  async queryOne<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /**
   * Runs `fn` while holding one connection from the pool, without opening a
   * transaction.
   *
   * Needed for session-scoped state, which advisory locks are: `query()` takes
   * a fresh connection per call, so `pg_advisory_lock` and its matching
   * `pg_advisory_unlock` issued through it can land on different sessions and
   * the unlock silently does nothing, leaking the lock until the pool recycles
   * that connection.
   */
  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /**
   * Runs `fn` inside a transaction on a single dedicated connection, rolling
   * back if it throws, and hands `fn` the client explicitly.
   *
   * The explicit-client form, for a repository that wants to issue several
   * statements it knows belong together. `runInTransaction` below is the
   * ambient form and is what services should reach for.
   *
   * **Nested calls reuse the outer transaction** rather than opening a second
   * one. Postgres has no nested transactions - a second `BEGIN` is a warning
   * and a no-op, and the inner `COMMIT` would end the *outer* transaction
   * early, silently committing half of it. Joining is the only correct
   * behaviour, and it is what makes `setTargets` safe to call from inside an
   * audited service method.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const existing = transactionContext.getStore();
    if (existing) {
      return fn(existing);
    }
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await transactionContext.run(client, () => fn(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // The rollback failing means the connection is already broken; the
        // original error is the one worth surfacing.
        this.logger.error('ROLLBACK failed', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs `fn` as one unit, with every `query` inside it - from any repository,
   * at any depth - going to the same connection.
   *
   * **This is what closes the audit gap CLAUDE.md §5.4 records.** An audit entry
   * used to be written on its own connection *after* the action it describes had
   * already committed, so a crash in between left an action done and unlogged.
   * Wrapping the mutation and its `audit.record` in one of these makes them one
   * commit: either both happened or neither did.
   *
   * **On the memory driver this is a passthrough with no rollback**, and that
   * matters enough to say plainly rather than hide behind the abstraction. There
   * is no journal to unwind an in-memory array, so a failure halfway through
   * leaves the earlier writes in place. That is the dev fallback behaving like
   * the dev fallback (§7.1): the atomicity this method promises is a property of
   * Postgres, and the memory driver's job is to keep the *shape* of the code
   * identical so nothing has to branch on the driver.
   */
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isConfigured) {
      // No client to hand out, but the *context* is still entered - see the
      // note on `transactionContext`. Without this the `inTransaction`
      // assertion would be dead everywhere the tests run, which is precisely
      // where a forgotten wrap needs to be caught.
      return transactionContext.run(null, fn);
    }
    return this.transaction(() => fn());
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
