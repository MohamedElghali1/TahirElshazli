import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.tokens.js';

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

  async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.requirePool().query<T>(text, params as unknown[]);
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
   * back if it throws. Used where a write is only correct as a unit - archiving
   * a submission revision and overwriting the submission it came from, for
   * instance, must not half-happen.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
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

  async onApplicationShutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
