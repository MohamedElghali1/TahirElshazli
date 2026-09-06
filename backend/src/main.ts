import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { Logger } from '@nestjs/common';
import {
  resolveAutoMigrate,
  resolveCorsOrigins,
  resolveNodeEnv,
  resolvePersistenceDriver,
  resolvePort,
  resolveTrustedProxyHops,
} from './common/config/env.js';
import { DatabaseService } from './database/database.service.js';
import { MigrationRunner } from './database/migration-runner.js';

async function bootstrap() {
  // Validated before the app is created, so a bad value fails at boot rather
  // than degrading a security control at request time.
  const nodeEnv = resolveNodeEnv();
  const trustedProxyHops = resolveTrustedProxyHops();
  const corsOrigins = resolveCorsOrigins(nodeEnv);
  const persistenceDriver = resolvePersistenceDriver(nodeEnv);
  const autoMigrate = resolveAutoMigrate();
  const port = resolvePort();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Lets DatabaseService.onApplicationShutdown close the pool on SIGTERM, so a
  // container restart drains its connections instead of leaving the server to
  // time them out.
  app.enableShutdownHooks();

  // Decides which X-Forwarded-For entry Express believes, and therefore what
  // the rate limiter keys on. Defaults to 0 - trust nothing - because with a
  // non-zero value and no real proxy in front, a client sets the header itself
  // and gets a fresh bucket per request, disabling brute-force protection.
  // Cloudflare + VPS proxy is 2; set it deliberately for the deployment.
  app.set('trust proxy', trustedProxyHops);

  app.use(helmet());
  // Applied globally so no endpoint can accidentally skip input validation.
  // `whitelist` strips unknown properties, which is what keeps a client-supplied
  // `status` from ever reaching a service.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors({ origin: corsOrigins, credentials: true });

  const logger = new Logger('Bootstrap');
  if (persistenceDriver === 'postgres') {
    const db = app.get(DatabaseService);
    // Fail here rather than on the first request. A process that binds a port
    // and then 500s every read is harder to spot in a deploy than one that
    // never comes up.
    await db.query('SELECT 1');
    if (autoMigrate) {
      await app.get(MigrationRunner).migrate();
    }
  } else {
    logger.warn(
      'PERSISTENCE_DRIVER=memory: data lives in this process only. It is lost ' +
        'on restart and invisible to any other replica.',
    );
  }

  await app.listen(port);
  logger.log(`Listening on ${port} (${nodeEnv}, persistence=${persistenceDriver})`);
}
await bootstrap();
