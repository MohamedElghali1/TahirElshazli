import { Global, Module } from '@nestjs/common';
import { RATE_LIMIT_STORE } from './rate-limit.interface.js';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store.js';

/**
 * Global so the app-wide RateLimitGuard can resolve the store no matter which
 * module a route lives in. One store instance means one set of counters.
 */
@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      useClass: InMemoryRateLimitStore,
    },
  ],
  exports: [RATE_LIMIT_STORE],
})
export class RateLimitModule {}
