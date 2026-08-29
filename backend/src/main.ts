import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import {
  resolveCorsOrigins,
  resolveNodeEnv,
  resolveTrustedProxyHops,
} from './common/config/env.js';

async function bootstrap() {
  // Validated before the app is created, so a bad value fails at boot rather
  // than degrading a security control at request time.
  const nodeEnv = resolveNodeEnv();
  const trustedProxyHops = resolveTrustedProxyHops();
  const corsOrigins = resolveCorsOrigins(nodeEnv);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
