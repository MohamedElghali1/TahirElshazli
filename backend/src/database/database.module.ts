import { Global, Logger, Module } from '@nestjs/common';
import { Pool } from 'pg';
import {
  redactUrl,
  resolveDatabaseUrl,
  resolveNodeEnv,
  resolvePersistenceDriver,
} from '../common/config/env.js';
import { DatabaseService } from './database.service.js';
import { DATABASE_POOL } from './database.tokens.js';
import { MigrationRunner } from './migration-runner.js';

/**
 * Global so the twelve feature modules can inject `DatabaseService` without
 * each importing this module - the alternative is the same import line
 * repeated in every one of them, and one of them eventually being forgotten.
 *
 * When `PERSISTENCE_DRIVER` is not `postgres` the pool provider resolves to
 * `null`: no connection is opened, no DATABASE_URL is required, and the
 * feature modules select their `InMemory*Repository` instead.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool | null => {
        const nodeEnv = resolveNodeEnv();
        const driver = resolvePersistenceDriver(nodeEnv);
        const connectionString = resolveDatabaseUrl(driver);
        if (!connectionString) {
          return null;
        }

        const logger = new Logger('Database');
        const pool = new Pool({
          connectionString,
          // Sized for a single VPS container. The migration path to a managed
          // cloud database (CLAUDE.md §3) changes this number, not any code.
          max: Number(process.env.DATABASE_POOL_MAX ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          // Managed Postgres (RDS, DigitalOcean, Neon) presents a certificate
          // chain the container does not carry. `PGSSLMODE=no-verify` is the
          // documented escape hatch; anything stricter is the caller's choice.
          ssl:
            process.env.PGSSLMODE === 'no-verify'
              ? { rejectUnauthorized: false }
              : undefined,
        });

        // An idle client erroring out (a database restart, a dropped network
        // route) emits on the pool. Without a listener Node treats it as an
        // unhandled 'error' event and kills the process.
        pool.on('error', (error) => {
          logger.error('Idle client error', error);
        });

        logger.log(`Postgres pool ready for ${redactUrl(connectionString)}`);
        return pool;
      },
    },
    DatabaseService,
    MigrationRunner,
  ],
  exports: [DatabaseService, MigrationRunner],
})
export class DatabaseModule {}
