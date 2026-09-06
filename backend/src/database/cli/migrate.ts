import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database.module.js';
import { DatabaseService } from '../database.service.js';
import { MigrationRunner } from '../migration-runner.js';

/**
 * `npm run db:migrate` - applies pending migrations and exits.
 *
 * An application *context*, not an HTTP server: no port is bound, no guard or
 * controller is constructed, so this is safe to run as a CI/CD step against a
 * production database before the new image starts serving.
 */
async function main(): Promise<void> {
  const logger = new Logger('Migrate');
  const app = await NestFactory.createApplicationContext(DatabaseModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const db = app.get(DatabaseService);
    if (!db.isConfigured) {
      throw new Error(
        'No database is configured. Set PERSISTENCE_DRIVER=postgres and DATABASE_URL.',
      );
    }
    const applied = await app.get(MigrationRunner).migrate();
    logger.log(
      applied.length
        ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
        : 'Nothing to apply.',
    );
  } finally {
    await app.close();
  }
}

try {
  await main();
} catch (error) {
  new Logger('Migrate').error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
