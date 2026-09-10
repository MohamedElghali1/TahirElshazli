import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { Role } from '../auth/roles.enum.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { LearningMode } from '../enrollments/interfaces/enrollment-repository.interface.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import type {
  Group,
  GroupCourse,
  GroupRepository,
} from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';

export const MAX_GROUP_PAGE_SIZE = 100;
export const DEFAULT_GROUP_PAGE_SIZE = 50;

/** One group as a console row: the group, what it studies, how many sit in it. */
export interface GroupSummary extends Group {
  courses: GroupCourse[];
  memberCount: number;
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
 * **A group is not an access grant.** Adding a course to a group enrolls
 * nobody and placing a student grants them nothing (§5.16, answered
 * 2026-09-10). `Enrollment` stays the only gate on course content, which is
 * what keeps the payment question (§5.12) out of this file entirely.
 */
@Injectable()
export class GroupsService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
  ) {}

  private actorRole(actor: StaffActor): Role {
    // Derived from the caller, never assumed. If a teacher-only write here is
    // later widened to TAs, the log must not keep attributing an assistant's
    // action to Dr. Tahir - the defect CLAUDE.md §5.4 records finding in
    // `ManageRecordingsService`.
    return actor.role === Role.Teacher ? Role.Teacher : Role.Assistant;
  }

  private async requireGroup(groupId: string): Promise<Group> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
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
    // `findCourses` per group is the one N+1 left here, and it is bounded by
    // the page rather than by the data: a group studies one or two courses and
    // a page is fifty groups. A `findCoursesByGroups` batch is the fix if the
    // console ever feels slow; at ten groups (§7.3) it is fifty primary-key
    // lookups that never happen because there are not fifty groups.
    const courses = await Promise.all(
      groups.map((group) => this.groupRepo.findCourses(group.id)),
    );
    return groups.map((group, index) => ({
      ...group,
      courses: courses[index],
      memberCount: counts[group.id] ?? 0,
    }));
  }

  async get(groupId: string): Promise<GroupSummary> {
    const group = await this.requireGroup(groupId);
    const [courses, members] = await Promise.all([
      this.groupRepo.findCourses(groupId),
      this.groupRepo.findMembers(groupId),
    ]);
    return { ...group, courses, memberCount: members.length };
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
  async members(groupId: string): Promise<GroupMemberView[]> {
    await this.requireGroup(groupId);
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

  async create(actor: StaffActor, name: string): Promise<Group> {
    const group = await this.groupRepo.create({ name, teacherId: actor.id });
    await this.audit.record({
      actorId: actor.id,
      actorRole: this.actorRole(actor),
      action: 'group.created',
      targetType: 'group',
      targetId: group.id,
      // No course: a group is created before it studies anything (§5.16).
      courseId: null,
      before: null,
      after: { name: group.name, teacherId: group.teacherId },
    });
    return group;
  }

  async rename(
    groupId: string,
    actor: StaffActor,
    name: string,
  ): Promise<Group> {
    // Read before the write, so `before` is the old value and not an alias of
    // the new one. Both repositories return copies for exactly this reason
    // (§7.1: the before/after aliasing defect, found twice).
    const before = await this.requireGroup(groupId);
    const after = await this.groupRepo.rename(groupId, name);
    if (!after) {
      throw new NotFoundException('Group not found');
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: this.actorRole(actor),
      action: 'group.renamed',
      targetType: 'group',
      targetId: groupId,
      courseId: null,
      before: { name: before.name },
      after: { name: after.name },
    });
    return after;
  }

  /**
   * Enrolls a group in a course - the client's verb.
   *
   * Scoped: an admin reaches any course, a TA only one they hold. That is
   * `StaffScopeService`'s single decision, and under the current posture
   * (§5.11.1) it is the one place that would change if TAs stop being scoped.
   *
   * Enrolls **no students** (§5.16). The learning mode is set here because it
   * describes this group studying this course (§5.2).
   */
  async addCourse(
    groupId: string,
    courseId: string,
    actor: StaffActor,
    learningMode: LearningMode,
  ): Promise<GroupCourse> {
    await this.requireGroup(groupId);
    await this.scope.assertAssigned(courseId, actor);
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const pairing = await this.groupRepo.addCourse({
      groupId,
      courseId,
      learningMode,
      enrolledBy: actor.id,
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: this.actorRole(actor),
      action: 'group.course_added',
      targetType: 'group_course',
      targetId: pairing.id,
      courseId,
      before: null,
      after: { groupId, courseId, learningMode: pairing.learningMode },
    });
    return pairing;
  }

  async removeCourse(
    groupId: string,
    courseId: string,
    actor: StaffActor,
  ): Promise<void> {
    await this.requireGroup(groupId);
    await this.scope.assertAssigned(courseId, actor);
    // Snapshot first: the row is gone by the time the entry is written, and an
    // entry that cannot say what was removed is evidence-shaped and empty.
    const existing = (await this.groupRepo.findCourses(groupId)).find(
      (gc) => gc.courseId === courseId,
    );
    if (!existing) {
      throw new NotFoundException('That group does not study this course');
    }
    await this.groupRepo.removeCourse(groupId, courseId);
    await this.audit.record({
      actorId: actor.id,
      actorRole: this.actorRole(actor),
      action: 'group.course_removed',
      targetType: 'group_course',
      targetId: existing.id,
      courseId,
      before: { groupId, courseId, learningMode: existing.learningMode },
      after: null,
    });
  }

  /**
   * Places a student in a group.
   *
   * **No enrollment precondition, deliberately.** The client's workflow is
   * *"enrolled then grouped"* (§5.16) and this method does not enforce it as a
   * constraint, because a group's course list changes after placement - add a
   * second course to a group next term and every existing member would
   * retroactively violate a rule checked at placement time. Enrollment stays
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
    await this.requireGroup(groupId);
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
      actorRole: this.actorRole(actor),
      action: 'group.student_assigned',
      targetType: 'group_membership',
      targetId: membership.id,
      // A group spans courses, so there is no single course this belongs to.
      // Null is the honest answer; the target id is what the log filters on.
      courseId: null,
      before: null,
      after: { groupId, studentId },
    });
  }

  async removeMember(
    groupId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<void> {
    await this.requireGroup(groupId);
    const existing = (await this.groupRepo.findMembers(groupId)).find(
      (m) => m.studentId === studentId,
    );
    if (!existing) {
      throw new NotFoundException('That student is not in this group');
    }
    await this.groupRepo.removeMember(groupId, studentId);
    await this.audit.record({
      actorId: actor.id,
      actorRole: this.actorRole(actor),
      action: 'group.student_removed',
      targetType: 'group_membership',
      targetId: existing.id,
      courseId: null,
      before: { groupId, studentId, assignedBy: existing.assignedBy },
      after: null,
    });
  }

  /** Every group studying one course - the course console's tab. Scoped. */
  async listForCourse(
    courseId: string,
    actor: StaffActor,
  ): Promise<GroupSummary[]> {
    await this.scope.assertAssigned(courseId, actor);
    const pairings = await this.groupRepo.findGroupCoursesByCourse(courseId);
    const groups = await this.groupRepo.findByIds(
      pairings.map((p) => p.groupId),
    );
    const counts = await this.groupRepo.countMembersByGroups(
      groups.map((g) => g.id),
    );
    const byGroup = new Map(pairings.map((p) => [p.groupId, p]));
    return groups.map((group) => ({
      ...group,
      // Only this course's pairing, not every course the group studies - the
      // caller asked about one course and the tab renders one row per group.
      courses: [byGroup.get(group.id)].filter(
        (pairing): pairing is GroupCourse => pairing !== undefined,
      ),
      memberCount: counts[group.id] ?? 0,
    }));
  }
}
