import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isUnscopedStaffRole } from '../auth/staff-roles.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { AssistantScopeRepository } from './interfaces/assistant-scope-repository.interface.js';
import { ASSISTANT_SCOPE_REPOSITORY } from './interfaces/assistant-scope-repository.interface.js';

/**
 * The caller, reduced to what authorization actually depends on.
 *
 * Every method here takes one instead of a bare `userId`, and that is the
 * single most important decision in this file: with a bare id there is no way
 * to express "admins skip the join", so each caller would re-derive the
 * admin bypass itself and one of them would eventually get it wrong in the
 * direction that grants access.
 */
export interface StaffActor {
  id: string;
  /** `JwtPayload.role` is a plain string; compared against `Role` here. */
  role: string;
}

/**
 * One course an actor can reach, and since when.
 *
 * **Derived, not stored** (`AUTH-2`). It used to be a `course_staff_assignments`
 * row; scope is now held at the group grain, so this is the roll-up of every
 * held group that studies the course. The member names are unchanged from the
 * row it replaces, which is what keeps `StaffService.listCourses` and
 * `ManageService.coursesInScope` untouched by the rewrite.
 *
 * `assignedAt` is the **earliest** grant among the groups that reach the course
 * (coordinator ruling R-4): the field's purpose is that the admin and assistant
 * paths are visibly different in the response rather than silently identical,
 * and the oldest grant is the honest answer to "since when".
 */
export interface StaffCourseReach {
  userId: string;
  courseId: string;
  assignedAt: string;
  /** The admin who granted the earliest of those group assignments. */
  assignedBy: string;
}

/**
 * What a caller may see. Either every course, or an explicit list.
 *
 * A union rather than an optional `courseIds`, so a caller cannot read the
 * field, find it undefined, and treat that as "no restriction" - which is the
 * same bug as forgetting the check, arrived at politely.
 *
 * **`unscoped: true` means unrestricted, not admin** (ruling R-7). An assistant
 * whose scope is `all_groups` reads as unscoped here, because that is what
 * `all_groups` means. Two consumers turn it into a label - `'platform'` in
 * `ManageService` and a null `assignedAt` in `StaffService` - and both are
 * accurate for such an assistant: their reach *is* the platform.
 */
export type StaffScope =
  | { unscoped: true }
  | { unscoped: false; assignments: StaffCourseReach[] };

/**
 * The message an out-of-scope course and a genuinely missing one **both** get.
 *
 * Exported as one `const` and asserted `===` between the two paths in
 * `staff-scope.service.spec.ts`, because the anti-enumeration property
 * (`CLAUDE.md` §7) dies silently if the two strings drift by one byte and a
 * spec comparing against its own literal would pass while it was gone.
 */
export const COURSE_NOT_IN_SCOPE = 'Course not found or not assigned to you';

/**
 * Owns the assistant scoping check required by `CLAUDE.md` §7.
 *
 * It is the direct counterpart of `EnrollmentsService.assertEnrolled` - same
 * job, same failure mode, different table - and it lives in its own module for
 * the same reason: the services that call it (grading, attendance, quizzes,
 * announcements) are also the services it needs to stay independent of.
 *
 * **Scope is held at the group grain** (`AUTH-2`). An assistant carries an
 * explicit `assistant_scopes` row - `all_groups` or `assigned_groups` - and, in
 * the second case, a set of `assistant_group_assignments`. A *course* is
 * reachable when a held group studies it, which is derivable because migration
 * `013` made a group study exactly one course. The reverse was never true, and
 * that gap is the leak this closes: a course-grained grant handed an assistant
 * every cohort on the course, rosters included.
 *
 * **`groups.assistant_id` is not read here, or anywhere else, for an access
 * decision.** It is the display field - who *runs* a group. The moment a query
 * reads it to decide reach there are two disagreeing answers to "may this
 * person see this group", and the authorization one quietly stops being
 * authoritative.
 *
 * Composing two repositories in a *service* is the permitted shape; a
 * repository calling another repository is not (`CLAUDE.md` §5). Both reads are
 * indexed and bounded by ~10 groups (§1), so there is no cache here and should
 * not be one.
 */
@Injectable()
export class StaffScopeService {
  constructor(
    @Inject(ASSISTANT_SCOPE_REPOSITORY)
    private readonly scopeRepo: AssistantScopeRepository,
    /** `GroupDataModule` is `@Global()`; this needs no import edge. */
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepo: GroupRepository,
  ) {}

  /**
   * True for an unscoped staff account - the teacher, or the Full admin, who is
   * identical to the teacher in permission (AUTH-1).
   *
   * `isUnscopedStaffRole` rather than a hand-written pair, because this is the
   * one line that decides whether an admin can reach anything at all: missed,
   * an admin passes `RolesGuard`, finds no scope row and 404s on every course.
   * That fails safe - a broken console, not a leak - but it fails on 63 routes
   * at once.
   */
  private isAdmin(actor: StaffActor): boolean {
    return isUnscopedStaffRole(actor.role);
  }

  /**
   * Every group this actor holds, or `null` when they are unrestricted.
   *
   * A **missing scope row refuses**, and that is the fail-closed half of
   * `AUTHORIZATION_MODEL.md` §3's rule that "no rows" must never be ambiguous
   * between *everything* and *not set up yet*. Migration `015` gives every
   * assistant an explicit row so this path should be unreachable in practice;
   * it is here because "should be" is not a guarantee.
   */
  private async heldGroupIds(
    actor: StaffActor,
  ): Promise<{ unrestricted: boolean; assignments: readonly { groupId: string; assignedAt: string; assignedBy: string }[] } | null> {
    const scope = await this.scopeRepo.findScope(actor.id);
    if (scope === null) {
      return null;
    }
    if (scope === 'all_groups') {
      return { unrestricted: true, assignments: [] };
    }
    return {
      unrestricted: false,
      assignments: await this.scopeRepo.findAssignments(actor.id),
    };
  }

  /**
   * Throws unless the actor may act on this course. Returns the derived reach
   * for an assistant, or null for an admin, who holds no rows and needs none.
   *
   * **404, not 403** - the posture `CLAUDE.md` §7 requires, and what the student
   * surface already does for an unenrolled course. A 403 confirms the course
   * exists, which lets an unassigned assistant enumerate the whole catalog one
   * id at a time; the distinction is invisible to an assistant acting
   * legitimately and the only thing it costs is a slightly vaguer error.
   */
  async assertAssigned(
    courseId: string,
    actor: StaffActor,
  ): Promise<StaffCourseReach | null> {
    if (this.isAdmin(actor)) {
      return null;
    }
    const held = await this.heldGroupIds(actor);
    if (held === null) {
      throw new NotFoundException(COURSE_NOT_IN_SCOPE);
    }
    if (held.unrestricted) {
      return null;
    }

    // The groups studying this course, intersected with the held set. Indexed,
    // and bounded by the ~10 groups a course has (§1).
    const onCourse = new Set(
      (await this.groupRepo.findByCourse(courseId)).map((g) => g.id),
    );
    const reach = held.assignments.filter((a) => onCourse.has(a.groupId));
    if (reach.length === 0) {
      throw new NotFoundException(COURSE_NOT_IN_SCOPE);
    }

    // The earliest grant: ruling R-4, and the same roll-up `scopeFor` makes.
    const earliest = reach.reduce((oldest, a) =>
      a.assignedAt < oldest.assignedAt ? a : oldest,
    );
    return {
      userId: actor.id,
      courseId,
      assignedAt: earliest.assignedAt,
      assignedBy: earliest.assignedBy,
    };
  }

  /**
   * The list form of the same question, for endpoints that return many courses
   * rather than one.
   *
   * Callers must branch on `unscoped` and issue a *different query*, not fetch
   * everything and filter afterwards - `CLAUDE.md` §7 is explicit that there is
   * no "read it all and hide some" shortcut, and a filter applied after the
   * read is one forgotten `.filter()` away from being no filter at all.
   */
  async scopeFor(actor: StaffActor): Promise<StaffScope> {
    if (this.isAdmin(actor)) {
      return { unscoped: true };
    }
    const held = await this.heldGroupIds(actor);
    if (held === null) {
      // Fail closed: never configured is an empty reach, not a free pass.
      return { unscoped: false, assignments: [] };
    }
    if (held.unrestricted) {
      return { unscoped: true };
    }

    const groups = await this.groupRepo.findByIds(
      held.assignments.map((a) => a.groupId),
    );
    const courseOf = new Map(groups.map((g) => [g.id, g.courseId]));

    // One row per course, carrying the earliest grant that reaches it (R-4).
    const byCourse = new Map<string, StaffCourseReach>();
    for (const assignment of held.assignments) {
      const courseId = courseOf.get(assignment.groupId);
      // A grant whose group is gone. The FK cascades in Postgres, so this is
      // the memory driver's case; skipping is the fail-closed reading.
      if (!courseId) continue;
      const existing = byCourse.get(courseId);
      if (!existing || assignment.assignedAt < existing.assignedAt) {
        byCourse.set(courseId, {
          userId: actor.id,
          courseId,
          assignedAt: assignment.assignedAt,
          assignedBy: assignment.assignedBy,
        });
      }
    }
    return { unscoped: false, assignments: [...byCourse.values()] };
  }

  /**
   * Every group this actor may reach, or `null` when they are unrestricted.
   *
   * Additive (unit 6, `TASK-6`), and a predicate-free read for the same reason
   * `mayReachGroup` is one: the caller owns every message, so a refusal can
   * stay byte-identical to a genuine miss. It exists for **list** reads that
   * must restrict in the query rather than ask one group at a time - `GET
   * /staff/tasks` passes the result straight into SQL.
   *
   * `null` for an admin or an `all_groups` assistant; the held ids for
   * `assigned_groups`; and **`[]` for a missing scope row** - fail closed, as
   * `scopeFor` does.
   */
  async reachableGroupIds(actor: StaffActor): Promise<readonly string[] | null> {
    if (this.isAdmin(actor)) {
      return null;
    }
    const held = await this.heldGroupIds(actor);
    if (held === null) {
      return [];
    }
    return held.unrestricted ? null : held.assignments.map((a) => a.groupId);
  }

  /**
   * May this actor reach **this group**? Non-throwing, because the caller owns
   * the message (`D-10`).
   *
   * Additive, and deliberately a predicate rather than an `assertReachesGroup`:
   * the refusal has to be byte-identical to a genuinely missing group, and the
   * only way to guarantee that is to let `GroupsService` throw its own
   * `GROUP_NOT_FOUND` on both paths rather than have two files owning one
   * message.
   */
  async mayReachGroup(groupId: string, actor: StaffActor): Promise<boolean> {
    if (this.isAdmin(actor)) {
      return true;
    }
    const held = await this.heldGroupIds(actor);
    if (held === null) {
      return false;
    }
    return (
      held.unrestricted || held.assignments.some((a) => a.groupId === groupId)
    );
  }
}
