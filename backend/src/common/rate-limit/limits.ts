import type { RateLimitRule } from './rate-limit.interface.js';

/**
 * Limits for the endpoints worth attacking. CLAUDE.md §8 requires brute-force
 * protection on auth specifically; everything else runs on DEFAULT_RATE_LIMIT.
 *
 * All limits are per client IP per route, unless a rule's `by: 'ip+email'`
 * says otherwise (`LOGIN_LIMIT`, `PASSWORD_RESET_REQUEST_LIMIT`).
 */

/** Login, reset-confirm, password change: slow enough to make guessing pointless. */
export const AUTH_ATTEMPT_LIMIT: RateLimitRule = { limit: 5, windowMs: 60_000 };

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

/**
 * Staff file uploads. Every call writes bytes to storage, which no JSON route
 * does, so this is the one authenticated endpoint where an unbounded caller
 * costs disk rather than CPU. Loose enough for a gallery of certificates in
 * one sitting, tight enough that filling a volume takes deliberate effort.
 */
export const UPLOAD_LIMIT: RateLimitRule = { limit: 30, windowMs: 60_000 };

/**
 * Student submission uploads (`D-48` (a)), the first upload a student can
 * make. Its own, tighter limit rather than the staff one (`SECURITY.md` §2.4):
 * a five-photo hand-in, a retry or two, and nothing like a loop filling disk.
 */
export const STUDENT_UPLOAD_LIMIT: RateLimitRule = { limit: 12, windowMs: 60_000 };

/**
 * The Google OAuth callback.
 *
 * The only `@Public()` route in the build that is neither auth nor the public
 * catalog, and the only one whose work is an outbound HTTP call to a third
 * party. A request reaching it with a forged `state` is rejected by a signature
 * check, but rejecting still costs a JWT verification, and a valid one costs
 * two round trips to Google - so an unbounded caller here spends *our* request
 * budget against *Google's* rate limits, which is a more annoying failure than
 * a merely slow endpoint.
 *
 * Tight, because the legitimate traffic is genuinely tiny: one teacher
 * connecting one account, a handful of times ever.
 */
export const OAUTH_CALLBACK_LIMIT: RateLimitRule = {
  limit: 10,
  windowMs: 60_000,
};

/**
 * `REM-007`: a class of ~30 students behind one school-Wi-Fi NAT address must
 * not share a single bucket. Keeps `AUTH_ATTEMPT_LIMIT`'s 5/min as the
 * per-account brute-force ceiling, and adds a looser per-IP ceiling wide
 * enough for the whole class to sign in within the same minute.
 */
export const LOGIN_LIMIT: RateLimitRule[] = [
  { limit: 5, windowMs: 60_000, by: 'ip+email' },
  { limit: 60, windowMs: 60_000, by: 'ip' },
];

/**
 * `REM-007`: same reasoning as `LOGIN_LIMIT`, applied to the enumeration-prone
 * password-reset request - 3 per account per 5 minutes stays the enumeration
 * ceiling, widened per-IP so a classroom requesting resets together is not
 * bounced.
 */
export const PASSWORD_RESET_REQUEST_LIMIT: RateLimitRule[] = [
  { limit: 3, windowMs: 300_000, by: 'ip+email' },
  { limit: 30, windowMs: 300_000, by: 'ip' },
];

/**
 * `REM-007`: registration has no existing account to key by, so it stays
 * IP-only - loosened from the old 3-per-5-minutes so a class can register
 * together, still bounded against a scripted flood.
 */
export const REGISTER_LIMIT: RateLimitRule = { limit: 30, windowMs: 600_000 };
