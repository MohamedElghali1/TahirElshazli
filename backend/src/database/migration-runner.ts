import { Injectable, Logger } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from './database.service.js';

/**
 * Forward-only SQL migrations, applied in filename order and recorded in
 * `schema_migrations` so a re-run is a no-op.
 *
 * No down-migrations. A rollback of a released schema change is a new forward
 * migration written with the production data in front of you; a `down` script
 * authored months earlier is a guess about a state that no longer exists.
 */
@Injectable()
export class MigrationRunner {
  private readonly logger = new Logger(MigrationRunner.name);

  constructor(private readonly db: DatabaseService) {}

  /** `dist/database/migrations` at runtime, `src/database/migrations` under vitest. */
  private migrationsDir(): string {
    return join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  }

  private seedsDir(): string {
    return join(dirname(fileURLToPath(import.meta.url)), 'seeds');
  }

  private async ensureLedger(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  private async sqlFilesIn(dir: string): Promise<string[]> {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith('.sql')).sort();
  }

  /**
   * Applies every migration not yet recorded. Each file runs inside its own
   * transaction together with its ledger insert, so a failure halfway through
   * a file leaves neither the DDL nor the "already applied" record behind.
   *
   * The whole run is wrapped in a session-level advisory lock. `DB_AUTO_MIGRATE`
   * is off by default precisely so replicas do not race here, but "off by
   * default" is a convention and this is a guarantee: without it two processes
   * can both read the ledger, both see the same file as pending, and both run
   * its DDL - the second failing on a duplicate table and taking that replica
   * down on boot. A second caller blocks, then finds nothing pending.
   */
  async migrate(): Promise<string[]> {
    // Arbitrary but fixed. Any other advisory lock in this application must not
    // reuse this number.
    const LOCK_ID = 8_244_101;
    // Acquired and released on the SAME connection: an advisory lock is
    // session-scoped, and `query()` takes a fresh connection each call, so a
    // lock taken through it could be released on a different session - which
    // does nothing, and leaks the lock until the pool recycles that connection.
    return this.db.withClient(async (client) => {
      await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
      try {
        return await this.applyPending();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
      }
    });
  }

  private async applyPending(): Promise<string[]> {
    await this.ensureLedger();

    const applied = new Set(
      (
        await this.db.query<{ version: string }>(
          'SELECT version FROM schema_migrations',
        )
      ).map((row) => row.version),
    );

    const pending = (await this.sqlFilesIn(this.migrationsDir())).filter(
      (name) => !applied.has(name),
    );

    for (const name of pending) {
      const sql = await readFile(join(this.migrationsDir(), name), 'utf8');
      await this.db.transaction(async (client) => {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [name],
        );
      });
      this.logger.log(`Applied ${name}`);
    }

    if (pending.length === 0) {
      this.logger.log('Schema is up to date');
    }
    return pending;
  }

  /**
   * Development fixture data, matching what the in-memory repositories serve so
   * the two drivers show the same screens. Separate from `migrate()` because
   * seeding a production database with `student@example.com` and a published
   * password hash would be an account-takeover hole, not a convenience.
   */
  async seed(): Promise<string[]> {
    const files = await this.sqlFilesIn(this.seedsDir());
    for (const name of files) {
      const sql = await readFile(join(this.seedsDir(), name), 'utf8');
      await this.db.transaction(async (client) => {
        await client.query(sql);
      });
      this.logger.log(`Seeded ${name}`);
    }
    return files;
  }
}
