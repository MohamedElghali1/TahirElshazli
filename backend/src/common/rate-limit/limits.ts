import type { RateLimitRule } from './rate-limit.interface.js';

/**
 * Limits for the endpoints worth attacking. CLAUDE.md §8 requires brute-force
 * protection on auth specifically; everything else runs on DEFAULT_RATE_LIMIT.
 *
 * All limits are per client IP per route.
 */

/** Login, reset-confirm, password change: slow enough to make guessing pointless. */
export const AUTH_ATTEMPT_LIMIT: RateLimitRule = { limit: 5, windowMs: 60_000 };

/**
 * Registration and reset *requests*. Both reveal or mail something about an
 * address that may not belong to the caller, so they get a harder limit over a
 * longer window than a login attempt.
 */
export const AUTH_ENUMERATION_LIMIT: RateLimitRule = {
  limit: 3,
  windowMs: 300_000,
};

/**
 * The anonymous catalog. Looser than the auth limits - browsing is the point,
 * and a visitor clicking through a course list makes many more requests than
 * someone logging in - but tighter than the 120/min global default, because
 * every one of these is an unauthenticated database read and the route is the
 * only anonymous one that touches course data.
 */
export const PUBLIC_BROWSE_LIMIT: RateLimitRule = {
  limit: 60,
  windowMs: 60_000,
};
