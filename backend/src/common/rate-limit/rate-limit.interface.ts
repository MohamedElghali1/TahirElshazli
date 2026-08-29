export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** When the current window resets, epoch milliseconds. */
  resetAt: number;
}

/**
 * Counts hits per key per window.
 *
 * Behind an interface because the in-memory implementation is per-process: with
 * more than one container each replica keeps its own counters, so the effective
 * limit multiplies by the replica count. That is acceptable while the whole
 * persistence layer is in memory, and a Redis-backed store drops in here
 * without touching the guard - the same seam every repository in this codebase
 * uses (CLAUDE.md §3).
 */
export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule): RateLimitDecision;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
