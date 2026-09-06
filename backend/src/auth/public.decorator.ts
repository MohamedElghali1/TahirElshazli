import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally-registered `JwtAuthGuard`.
 *
 * Authentication is global and fail-closed: a new controller is protected
 * because it was written, not because someone remembered `@UseGuards`. That
 * inverts the previous default, where a controller written without the
 * decorator was anonymously reachable - a fine posture while only the student
 * surface existed, and a bad one with four unbuilt roles ahead of us.
 *
 * Reach for this only where anonymous access is the point: registration,
 * login, the password-reset pair, and the health check. Every one of them
 * carries its own rate limit.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
