import { Logger } from '@nestjs/common';
import {
  DEV_JWT_SECRET,
  resolveJwtExpiry,
  resolveJwtSecret,
  resolveNodeEnv,
} from '../common/config/env.js';

const nodeEnv = resolveNodeEnv();

/**
 * The signing key for every access token. Validation lives in
 * `common/config/env.ts`; this module just resolves it once at import and
 * warns when the development fallback is in play.
 */
export const JWT_SECRET = resolveJwtSecret(nodeEnv);
export const JWT_EXPIRES_IN = resolveJwtExpiry();

if (JWT_SECRET === DEV_JWT_SECRET) {
  new Logger('Auth').warn(
    'JWT_SECRET is unset; falling back to the development key. Never do this outside local development.',
  );
}
