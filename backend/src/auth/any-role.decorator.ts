import { SetMetadata } from '@nestjs/common';

export const ANY_ROLE_KEY = 'anyRole';

/**
 * Marks a route as requiring authentication but no particular role.
 *
 * This exists so "any logged-in account may call this" is something a route
 * states, rather than something it gets by omitting `@Roles`. Logout is the
 * genuine case: a teacher, a parent and a student all end their own session
 * the same way.
 *
 * It is not a shortcut for a route whose roles have not been decided yet.
 */
export const AnyRole = () => SetMetadata(ANY_ROLE_KEY, true);
