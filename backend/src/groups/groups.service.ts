import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Role } from '../auth/roles.enum.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { assertMay } from '../auth/capabilities.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import type {
  Group,
  GroupPatch,
  GroupRepository,
} from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';

export const MAX_GROUP_PAGE_SIZE = 100;
export const DEFAULT_GROUP_PAGE_SIZE = 50;

/**
 * The message a group an assistant may not reach and a group that does not
 * exist **both** get (`D-10`).
 *
 * One exported `const` used by every throw in this file, and asserted `===`
 * between the two paths in `groups.controller.spec.ts`. The anti-enumeration
 * property (`CLAUDE.md` §7) dies silently if the two strings drift by one byte,
 * and a spec comparing each against its own literal would pass while it was
 * gone.
 */
export const GROUP_NOT_FOUND = 'Group not found';

/** One group as a console row: the group, and how many sit in it. */
export interface GroupSummary extends Group {
  memberCount: number;
}

/**
 * The whole of a group, as written. Matches `API_SPEC.yaml`'s `GroupWrite` and
 * the shape `CreateGroupDto` validates; the service takes the shape rather than
 * the DTO class so it stays free of the HTTP boundary (`ARCHITECTURE.md` §6).
 */
export interface GroupWrite {
  name: string;
  courseId: string;
  assistantId?: string | null;
  meets?: string | null;
  room?: string | null;
}

/** One member of a group. Deliberately not `StoredUser` - see `members`. */
export interface GroupMemberView {
  studentId: string;
  name: string;
  email: string;
  assignedBy: string;
  assignedAt: string;
}

/**
 * Groups: the cohort Dr. Tahir teaches (CLAUDE.md §5.16).
 *
 * Two rules shape every method here.
 *
 * **Placement is a staff action.** A student never places themselves, so every
 * write takes a `StaffActor` and every one of them is audited (§5.4) - a TA
 * deciding which cohort a student sits in now decides what work that student is
 * set, which makes "who moved them" a question the log has to be able to
 * answer.
 *
 * **A group is not an access grant.** A group naming a course enrols nobody
 * and placing a student grants them nothing (§5.16, answered 2026-09-10).
 * `Enrollment` stays the only gate on course content (`DOMAIN_MODEL.md:98`),
 * which is what keeps the payment question (§5.12) out of this file entirely.
 *
 * **`assistantId` is display only.** It says who runs a group; it never decides
 * who may reach one. See the interface, and migration 013's comment on the
 * column.
 */
@Injectable()
export class GroupsService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * The group, if this actor may reach it. **`D-10`.**
   *
   * An assistant whose scope is `assigned_groups` reaches only the groups they
   * hold; everyone else - an admin, or an `all_groups` assistant - reaches any.
   * Out of scope and nonexistent answer with the **same `GROUP_NOT_FOUND`**, so
   * an assistant cannot enumerate cohorts one id at a time. Before this check,
   * any assistant could read any group's roster, every member's name and email
   * included.
   *
   * It is here rather than on the controller because this is the one place
   * every group read and write already passes through - `get`, `members`,
   * `addMember`, `update` and `removeMember` all call it - so a new route
   * cannot be added that forgets it.
   */
  private async requireGroup(
    groupId: string,
    actor: StaffActor,
  ): Promise<Group> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundException(GROUP_NOT_FOUND);
    }
    if (!(await this.scope.mayReachGroup(groupId, actor))) {
      throw new NotFoundException(GROUP_NOT_FOUND);
    }
    return group;
  }

  /** The console list. Two batch reads, never one per row (§7.3). */
  async list(limit: number, offset: number): Promise<GroupSummary[]> {
    const groups = await this.groupRepo.findAll(
      Math.min(Math.max(limit, 1), MAX_GROUP_PAGE_SIZE),
      Math.max(offset, 0),
    );
    const counts = await this.groupRepo.countMembersByGroups(
      groups.map((g) => g.id),
    );
    // The per-group `findCourses` N+1 this used to carry is gone with the join
    // table: the course is a column on the row already read.
    return groups.map((group) => ({
      ...group,
      memberCount: counts[group.id] ?? 0,
    }));
  }

  async get(groupId: string, actor: StaffActor): Promise<GroupSummary> {
    const group = await this.requireGroup(groupId, actor);
    const members = await this.groupRepo.findMembers(groupId);
    return { ...group, memberCount: members.length };
  }

  /**
   * The roster a staff console shows.
   *
   * Name and email, and nothing else. This is *not* §5.17's classmate list -
   * that one is student-facing and narrower still (no email). Two lists of the
   * same people with different field sets is deliberate: widening this one must
   * not widen that one, and they are built by different methods so that it
   * cannot happen by editing one line.
   */
  async members(
    groupId: string,
    actor: StaffActor,
  ): Promise<GroupMemberView[]> {
    await this.requireGroup(groupId, actor);
    const memberships = await this.groupRepo.findMembers(groupId);
    const users = await this.userRepo.findByIds(
      memberships.map((m) => m.studentId),
    );
    const byId = new Map(users.map((user) => [user.id, user]));
    return memberships.map((membership) => {
      const user = byId.get(membership.studentId);
      return {
        studentId: membership.studentId,
        // A membership whose account is gone should not break the roster. The
        // FK is ON DELETE CASCADE so this is unreachable through Postgres, but
        // the memory driver has no such guarantee and a crash here would be a
        // strange way to learn that.
        name: user?.name ?? 'Unknown student',
        email: user?.email ?? '',
        assignedBy: membership.assignedBy,
        assignedAt: membership.assignedAt,
      };
    });
  }

  /**
   * Creates a group. A group now names its course at birth (migration 013), so
   * unlike before there is no "created, then enrolled in something" state.
   */
  async create(actor: StaffActor, input: GroupWrite): Promise<GroupSummary> {
    return this.db.runInTransaction(async () => {
      await this.requireCourse(input.courseId, actor);
      const group = await this.groupRepo.create({
        name: input.name,
        teacherId: actor.id,
        courseId: input.courseId,
        assistantId: input.assistantId ?? null,
        meets: input.meets ?? null,
        room: input.room ?? null,
      });
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'group.created',
        targetType: 'group',
        targetId: group.id,
        courseId: group.courseId,
        before: null,
        after: {
          name: group.name,
          teacherId: group.teacherId,
          courseId: group.courseId,
          assistantId: group.assistantId,
        },
      });
      // A `GroupSummary`, like every other group response: `API_SPEC.yaml`'s
      // `Group` requires `memberCount`, and a create that answered a shape
      // short of it made a generated client wrong (review F2A-4). A new group
      // has no members, so this costs no query.
      return { ...group, memberCount: 0 };
    });
  }

  /**
   * The widened PATCH: name, course, assistant, meets, room. Replaces `rename`,
   * which was the one-field case of this.
   *
   * **Moving a populated group to another course is refused with 409.** That is
   * an assumption, ratified by the coordinator on 2026-09-20 rather than
   * derived from a requirement, so it is labelled: `DOMAIN_MODEL.md:98-100`
   * makes `Enrollment` the access gate, which means silently re-pointing a
   * group full of students would leave every member enrolled on the *old*
   * course while being targeted by work set for the *new* one - visible as
   * tasks they cannot open. Re-cohorting is a real operation, but it is several
   * decisions (who re-enrols, what happens to existing submissions) and none of
   * them has been asked. Refusing is the reversible half.
   */
  async update(
    groupId: string,
    patch: GroupPatch,
    actor: StaffActor,
  ): Promise<GroupSummary> {
    return this.db.runInTransaction(async () => {
      // Read before the write, so `before` is the old value and not an alias of
      // the new one. Both repositories return copies for exactly this reason
      // (§7.1: the before/after aliasing defect, found twice).
      const before = await this.requireGroup(groupId, actor);

      if (patch.courseId !== undefined && patch.courseId !== before.courseId) {
        await this.requireCourse(patch.courseId, actor);
        const members = await this.groupRepo.findMembers(groupId);
        if (members.length > 0) {
          throw new ConflictException(
            'This group has members; move them out before changing its course.',
          );
        }
      }

      const after = await this.groupRepo.update(groupId, patch);
      if (!after) {
        throw new NotFoundException(GROUP_NOT_FOUND);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'group.updated',
        targetType: 'group',
        targetId: groupId,
        courseId: after.courseId,
        before: {
          name: before.name,
          courseId: before.courseId,
          assistantId: before.assistantId,
          meets: before.meets,
          room: before.room,
        },
        after: {
          name: after.name,
          courseId: after.courseId,
          assistantId: after.assistantId,
          meets: after.meets,
          room: after.room,
        },
      });
      const members = await this.groupRepo.findMembers(groupId);
      return { ...after, memberCount: members.length };
    });
  }

  /**
   * The course must exist and the actor must be able to reach it. Scoped: an
   * admin reaches any course, an assistant only one they hold. That is
   * `StaffScopeService`'s single decision.
   */
  private async requireCourse(
    courseId: string,
    actor: StaffActor,
  ): Promise<void> {
    await this.scope.assertAssigned(courseId, actor);
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }

  /**
   * Places a student in a group.
   *
   * **No enrollment precondition, deliberately.** The client's workflow is
   * *"enrolled then grouped"* (§5.16) and this method does not enforce it as a
   * constraint, because a group's course can change after placement - and a
   * rule checked only at placement time would be retroactively violated by
   * every existing member the moment it did. Enrollment stays
   * the access gate at read time, so a student placed in a group studying a
   * course they do not hold simply reads nothing from it; nothing is granted by
   * being placed.
   *
   * What *is* enforced is that the account is a **student**. Placing a TA in a
   * cohort would put them in a classmate list (§5.17) and in a roster count,
   * and there is no reading under which that is intended.
   */
  async addMember(
    groupId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<void> {
    return this.db.runInTransaction(async () => {
      await this.requireGroup(groupId, actor);
      const student = await this.userRepo.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      if (student.role !== Role.Student) {
        throw new BadRequestException('Only students can be placed in a group');
      }
      const membership = await this.groupRepo.addMember({
        groupId,
        studentId,
        assignedBy: actor.id,
      });
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'group.student_assigned',
        targetType: 'group_membership',
        targetId: membership.id,
        // A group spans courses, so there is no single course this belongs to.
        // Null is the honest answer; the target id is what the log filters on.
        courseId: null,
        before: null,
        after: { groupId, studentId },
      });
    });
  }

  /**
   * Removing a person from a group. **Teacher and admin only** (`AUTH-3`).
   *
   * One of the four verbs withheld from an assistant
   * (`AUTHORIZATION_MODEL.md` §3), from the client's rule that an assistant's
   * *"difference from the teacher is he can't remove students"*. The paired
   * grant survives: `addMember` above is still TA-reachable, because *"a student
   * is assigned to a group by the assistant or the teacher"*. Add stays, remove
   * moves.
   *
   * The check is **here**, not only on the controller's `@Roles`. The decorator
   * is the cheap outer gate; a permission enforced only at the decorator is one
   * refactor away from being enforced nowhere, and `CLAUDE.md` §5 puts the rule
   * in the service. It is also the **first** statement - before the group is
   * read, before the membership is read - so a refused caller learns nothing
   * about whether either exists.
   */
  async removeMember(
    groupId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<void> {
    assertMay(actor, 'group.member.remove');
    return this.db.runInTransaction(async () => {
      await this.requireGroup(groupId, actor);
      const existing = (await this.groupRepo.findMembers(groupId)).find(
        (m) => m.studentId === studentId,
      );
      if (!existing) {
        throw new NotFoundException('That student is not in this group');
      }
      await this.groupRepo.removeMember(groupId, studentId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'group.student_removed',
        targetType: 'group_membership',
        targetId: existing.id,
        courseId: null,
        before: { groupId, studentId, assignedBy: existing.assignedBy },
        after: null,
      });
    });
  }

  /** Every group studying one course - the course console's tab. Scoped. */
  async listForCourse(
    courseId: string,
    actor: StaffActor,
  ): Promise<GroupSummary[]> {
    await this.scope.assertAssigned(courseId, actor);
    // One indexed read where this used to be two: the course is a column on
    // the group now, so there is no pairing to resolve back into groups.
    const groups = await this.groupRepo.findByCourse(courseId);
    const counts = await this.groupRepo.countMembersByGroups(
      groups.map((g) => g.id),
    );
    return groups.map((group) => ({
      ...group,
      memberCount: counts[group.id] ?? 0,
    }));
  }
}
