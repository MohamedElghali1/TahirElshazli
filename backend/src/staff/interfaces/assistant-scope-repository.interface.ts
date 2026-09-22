/**
 * What one assistant may reach, as stored (`AUTH-2`).
 *
 * Two tables, one aggregate, one interface. `assistant_scopes` says *how wide*
 * and `assistant_group_assignments` says *which groups*, and no caller ever
 * wants one without the other: the scope row alone cannot answer "may they
 * reach this group" and the assignment rows alone cannot distinguish "holds
 * nothing" from "holds everything". Splitting them into two interfaces would
 * be two abstractions with one consumer between them.
 *
 * Replaces `course_staff_assignments`, which scoped an assistant by *course*.
 * Migration `013` made a group study exactly one course, so a group is the
 * finer grain and a course is derivable from it; the reverse was never true,
 * which is why an assistant could read every cohort on a course they held.
 */

/**
 * How wide an assistant's reach is.
 *
 * Stored as a row rather than inferred from the assignment count, because
 * "no assignment rows" must never be ambiguous between *everything* and *not
 * set up yet* (`AUTHORIZATION_MODEL.md` §3). A missing row is the third state -
 * never configured - and every read of it fails closed.
 */
export type AssistantScope = 'all_groups' | 'assigned_groups';

/** "This assistant may reach this group", granted by an admin. */
export interface AssistantGroupAssignment {
  id: string;
  /** Always a user whose role is `assistant`; the service enforces it. */
  userId: string;
  groupId: string;
  assignedAt: string;
  /** The admin who granted it. Half of the answer to "who took the action". */
  assignedBy: string;
}

export interface AssistantScopeRepository {
  /** The scope row, or **null when it was never configured** - not a default. */
  findScope(userId: string): Promise<AssistantScope | null>;
  /** Upsert. No route writes scope in this slice; `PEOPLE-4` (unit 5) adds one. */
  setScope(userId: string, scope: AssistantScope): Promise<void>;
  /** Every group this assistant holds. */
  findAssignments(userId: string): Promise<AssistantGroupAssignment[]>;
  /**
   * Idempotent, for the reason `EnrollmentRepository.create` is: the caller
   * needs to know whether a row was created, because a no-op must not be
   * written to the audit log as a grant that did not happen.
   */
  assignGroup(
    userId: string,
    groupId: string,
    assignedBy: string,
  ): Promise<{ assignment: AssistantGroupAssignment; created: boolean }>;
  /** True when a row was removed, false when there was nothing to remove. */
  unassignGroup(userId: string, groupId: string): Promise<boolean>;
}

export const ASSISTANT_SCOPE_REPOSITORY = Symbol('ASSISTANT_SCOPE_REPOSITORY');
