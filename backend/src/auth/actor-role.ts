import { InternalServerErrorException } from '@nestjs/common';
import { Role } from './roles.enum.js';

/**
 * Every role, as a runtime value set, written as an **exhaustive `Record`** for
 * the reason `list-audit-log-query.dto.ts:14-24` is one: `Record<Role, true>`
 * will not compile with a member missing, so a seventh role is a build failure
 * here rather than a value this helper silently refuses at runtime.
 */
const ROLE_VALUES: Record<Role, true> = {
  [Role.Visitor]: true,
  [Role.Student]: true,
  [Role.Parent]: true,
  [Role.Assistant]: true,
  [Role.Admin]: true,
  [Role.Teacher]: true,
};

/**
 * The role to record on an audit entry, taken from the caller **as it is**.
 *
 * This replaces twelve hand-written ternaries across nine services, which is
 * not a tidy-up. Each collapsed the role to a binary in one of two directions -
 * `role === Assistant ? Assistant : Teacher` at seven sites, and
 * `role === Teacher ? Teacher : Assistant` at five - and both are wrong for the
 * Full admin, in opposite ways. Seven would have filed an admin's action as the
 * teacher's; five would have filed it as an assistant's, putting it inside the
 * assistant activity trail. Nothing would have errored: migration 011 widens
 * `audit_log_actor_role_check`, so the database accepts the lie. And the audit
 * log has no UPDATE and no DELETE path (SECURITY.md §2, `002_staff_and_audit`),
 * so every entry written that way is wrong permanently.
 *
 * Attribution is the entire reason `Role.Admin` exists rather than a second
 * teacher account (CHANGELOG.md, 2026-09-19). One helper is what makes that
 * property hold at twelve call sites instead of being re-derived at each.
 *
 * **It validates and throws rather than defaulting.** A `role` that is not a
 * `Role` member means the JWT payload or the actor construction upstream is
 * broken; filing it as `assistant` to keep the request alive is how this class
 * of defect recurs, and it would write a wrong entry that cannot be corrected.
 */
export function actorRoleOf(actor: { role: string }): Role {
  if (!Object.prototype.hasOwnProperty.call(ROLE_VALUES, actor.role)) {
    // Deliberately not a `BadRequestException`: the caller cannot influence
    // this, and the message never reaches them (§6 error-leakage rule) - the
    // role came off a verified JWT, so an unknown value is our bug.
    throw new InternalServerErrorException('Unrecognised actor role');
  }
  return actor.role as Role;
}
