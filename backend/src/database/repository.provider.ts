import type { Provider, Type } from '@nestjs/common';
import { resolveNodeEnv, resolvePersistenceDriver } from '../common/config/env.js';

/**
 * Binds a repository `Symbol` token to whichever implementation the configured
 * persistence driver calls for.
 *
 * Both classes are still constructed - a `PostgresXRepository` only holds a
 * reference to `DatabaseService` and issues no query until something calls it,
 * so building the unused one costs nothing and keeps the wiring one line per
 * module instead of a conditional `providers` array.
 *
 * The driver is read once per process at wiring time, not per request: this
 * decides which code is running, and a value that could change underneath a
 * live request would be a much stranger thing to debug than a restart.
 */
export function repositoryProvider<T>(
  token: symbol,
  memory: Type<T>,
  postgres: Type<T>,
): Provider {
  return {
    provide: token,
    inject: [memory, postgres],
    useFactory: (memoryImpl: T, postgresImpl: T): T =>
      resolvePersistenceDriver(resolveNodeEnv()) === 'postgres'
        ? postgresImpl
        : memoryImpl,
  };
}
