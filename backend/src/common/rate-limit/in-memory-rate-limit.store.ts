import { Injectable } from '@nestjs/common';
import type {
  RateLimitDecision,
  RateLimitRule,
  RateLimitStore,
} from './rate-limit.interface.js';

interface Window {
  count: number;
  resetAt: number;
}

/** Sweep interval for windows nobody has touched since they expired. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Fixed-window counter. A sliding window would be fairer at the boundary - a
 * caller can spend a full allowance at the end of one window and again at the
 * start of the next - but for brute-force protection the fixed window is
 * sufficient and costs one integer per key.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  hit(key: string, rule: RateLimitRule): RateLimitDecision {
    const now = Date.now();
    this.sweep(now);

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + rule.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: rule.limit - 1, resetAt };
    }

    existing.count += 1;
    return {
      allowed: existing.count <= rule.limit,
      remaining: Math.max(0, rule.limit - existing.count),
      resetAt: existing.resetAt,
    };
  }

  /**
   * Without this the map grows one entry per distinct IP forever, which is a
   * memory leak an attacker controls simply by varying source addresses.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
