import { ForbiddenException } from '@nestjs/common';
import { Role } from './roles.enum.js';
import { isUnscopedStaffRole } from './staff-roles.js';

/**
 * The four verbs an assistant may never perform
 * (`AUTHORIZATION_MODEL.md` §3 "The four withheld verbs"), from the client's
 * rule: *"one type of assistant can see and alter all the groups, but his
 * difference from the teacher is he can't remove students"*.
 *
 * A **single capability preset**, which is what
 * `AUTHORIZATION_MODEL.md:142-144` asks for and what `CLAUDE.md` §7 has
 * required from the start: not `if (role === 'assistant')` scattered through
 * services, so the next permission question is a data change rather than an
 * audit of nine services.
 *
 * Deliberately a **pure module, not a provider**. It holds no state, reads no
 * repository and injects nothing, so a `@Injectable` would buy only ceremony -
 * and `ARCHITECTURE.md` §4 asks explicitly that a new provider earn its keep
 * (there are already three `@Global()` modules, which is three more than most
 * of this codebase needs).
 */
export type Capability =
  | 'account.delete' // 1. delete or deactivate an account
  | 'enrollment.remove' // 2. unenrol a student from a course
  | 'group.member.remove' // 3. remove a student from a group
  | 'registration.reject'; // 4. reject a pending registration

/**
 * What an assistant holds. An **exhaustive `Record`**, for exactly the reason
 * `list-audit-log-query.dto.ts:14-24` is one: adding a `Capability` without
 * deciding whether an assistant holds it becomes a **compile error** instead of
 * an oversight that defaults to whichever answer the code happens to give.
 *
 * All four are `false` today. The shape is the point, not the values - the next
 * verb the client withholds is one line here and one refusal test beside it.
 */
const ASSISTANT_CAPABILITIES: Record<Capability, boolean> = {
  'account.delete': false,
  'enrollment.remove': false,
  'group.member.remove': false,
  'registration.reject': false,
};

/**
 * Every capability, derived from the preset's own keys rather than listed a
 * second time.
 *
 * Exported for one reason: so `capabilities.spec.ts` can assert its list of
 * withheld verbs **against this** instead of trusting a hand-written array with
 * a length check. A fifth `Capability` widens the `Record` above - the compiler
 * insists on that - and therefore widens this, and therefore fails the spec
 * until the new verb has a refusal test of its own (`CLAUDE.md` §10: a spec
 * that iterates an array can only prove that what is listed works, never that
 * nothing is missing).
 *
 * Runtime-derived, not a second literal: a literal here would reintroduce
 * exactly the mirror it exists to remove.
 */
export const ALL_CAPABILITIES: readonly Capability[] = Object.keys(
  ASSISTANT_CAPABILITIES,
) as Capability[];

/**
 * One message for all four refusals, deliberately capability-independent.
 *
 * A message naming the capability would tell a caller probing the API which of
 * four rules they tripped, which is a free map of the permission model. It also
 * means the four refusal tests can assert the messages are identical, the same
 * device that holds `StaffScopeService`'s 404 property.
 */
const REFUSAL = 'Assistants cannot perform this action.';

/**
 * Whether this actor holds a capability.
 *
 * - The teacher and the Full admin hold every capability. They are identical in
 *   permission and distinct only in identity (`CHANGELOG.md`, 2026-09-19).
 * - An assistant holds exactly what `ASSISTANT_CAPABILITIES` says.
 * - **Every other role holds nothing.** Default-deny, matching `RolesGuard`'s
 *   fail-closed posture and `staff-scope.service.spec.ts`'s "should not treat
 *   any other role as unscoped": a student, a parent, a visitor or an empty
 *   string reaching this function is a bug upstream, and the safe reading of a
 *   bug is refusal.
 */
export function may(actor: { role: string }, capability: Capability): boolean {
  if (isUnscopedStaffRole(actor.role)) {
    return true;
  }
  if (actor.role === Role.Assistant) {
    return ASSISTANT_CAPABILITIES[capability];
  }
  return false;
}

/**
 * The same question, as a guard clause. Throws `ForbiddenException`.
 *
 * **403, not the 404 `StaffScopeService` uses.** The distinction is the one
 * `blog.service.ts` `assertMayMutate` already draws: 404 is for **scope** - you
 * must not learn that a resource you do not hold exists - and this is
 * **capability**. The assistant is looking at the roster; they can see the
 * group and they can see the student, and it is the *verb* that is refused. A
 * 404 here would claim the student is not in a group the caller is being shown,
 * which makes the UI lie about a row it is rendering. `API_SPEC.yaml:726`
 * specifies 403 for the same reason.
 */
export function assertMay(
  actor: { role: string },
  capability: Capability,
): void {
  if (!may(actor, capability)) {
    throw new ForbiddenException(REFUSAL);
  }
}
