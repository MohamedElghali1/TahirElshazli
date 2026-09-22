import { Role } from './roles.enum.js';

/**
 * The two staff role sets, defined once.
 *
 * `AUTHORIZATION_MODEL.md` §1 asks for the first: the teacher and the Full admin
 * are identical in permission and distinct only in identity, so writing
 * `Role.Teacher, Role.Admin` out at a call site is a pair that can be got wrong
 * one site at a time. The second exists for the same argument one level up -
 * `@Roles(Role.Assistant, ...STAFF_ADMIN)` hand-written at seven sites is seven
 * chances to omit one.
 *
 * `STAFF_ADMIN` must never contain `Role.Assistant`. That is the `/admin/*`
 * boundary, it is silent when broken, and `role-guards.spec.ts` asserts it.
 */

/** Teacher and admin. The unscoped `/admin/*` surface. */
export const STAFF_ADMIN = [Role.Teacher, Role.Admin] as const;

/** Every staff role. The scoped `/staff/*` surface. */
export const STAFF_ALL = [Role.Assistant, Role.Teacher, Role.Admin] as const;

/**
 * True for the two unscoped staff roles. The single predicate behind every
 * `actor.role === Role.Teacher` bypass that had to widen for the admin.
 */
export function isUnscopedStaffRole(role: string): boolean {
  return (STAFF_ADMIN as readonly string[]).includes(role);
}
