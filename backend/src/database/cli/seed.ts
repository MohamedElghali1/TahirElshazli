import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolveNodeEnv } from '../../common/config/env.js';
import { DatabaseModule } from '../database.module.js';
import { DatabaseService } from '../database.service.js';
import { MigrationRunner } from '../migration-runner.js';

/**
 * `npm run db:seed` - loads the development fixtures.
 *
 * Refuses to run in production. The fixtures share one bcrypt hash of a
 * password published in this repository, so seeding a live database would
 * create three accounts anyone who has read the source can log into.
 */
async function main(): Promise<void> {
  const logger = new Logger('Seed');

  if (resolveNodeEnv() === 'production') {
    throw new Error(
      'Refusing to seed in production: the fixtures use a published password hash.',
    );
  }

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
    // Seeding an unmigrated database fails on a missing table, which is a
    // confusing way to learn the schema was never applied.
    const runner = app.get(MigrationRunner);
    await runner.migrate();
    const files = await runner.seed();
    logger.log(`Seeded ${files.length} file(s): ${files.join(', ')}`);
  } finally {
    await app.close();
  }
}

try {
  await main();
} catch (error) {
  new Logger('Seed').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
