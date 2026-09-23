import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller.js';
import { StaffGroupsController } from './staff-groups.controller.js';
import { ClassmatesController } from './classmates.controller.js';
import { ClassmatesService } from './classmates.service.js';
import { GROUP_NOT_FOUND, GroupsService } from './groups.service.js';
import { StudentGroupsService } from './student-groups.service.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../auth/roles.enum.js';

/** `assistant-1` holds course-1 and not course-2; `assistant-2` holds neither. */
const ASSIGNED_TA = {
  user: { sub: 'assistant-1', email: 'a1@example.com', role: 'assistant', jti: 'j1' },
};
const UNASSIGNED_TA = {
  user: { sub: 'assistant-2', email: 'a2@example.com', role: 'assistant', jti: 'j2' },
};
const ADMIN = {
  user: { sub: 'teacher-1', email: 't@example.com', role: 'teacher', jti: 'j3' },
};
/** The Full admin (AUTH-1): the teacher's reach under her own identity. */
const FULL_ADMIN = {
  user: { sub: 'admin-1', email: 'admin@example.com', role: 'admin', jti: 'j6' },
};
const STUDENT_1 = {
  user: { sub: 'student-1', email: 's1@example.com', role: 'student', jti: 'j4' },
};
const STUDENT_2 = {
  user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j5' },
};

describe('Groups', () => {
  let admin: AdminGroupsController;
  let staff: StaffGroupsController;
  let classmates: ClassmatesController;
  let audit: AuditService;
  let enrollments: InMemoryEnrollmentRepository;
  let groupRepo: InMemoryGroupRepository;
  let scopeRepo: InMemoryAssistantScopeRepository;
  let assessmentRepo: InMemoryAssessmentRepository;
  let workRepo: InMemoryWorkRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        AdminGroupsController,
        StaffGroupsController,
        ClassmatesController,
      ],
      providers: [
        GroupsService,
        ClassmatesService,
        StudentGroupsService,
        EnrollmentsService,
        StaffScopeService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        // The mark book's Google Form columns (`D-46`, unit 7).
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    admin = module.get(AdminGroupsController);
    staff = module.get(StaffGroupsController);
    classmates = module.get(ClassmatesController);
    audit = module.get(AuditService);
    // The same instance the controllers hold. Building a second one in a
    // nested beforeEach would assert against an array nothing under test ever
    // writes to - which is a test that cannot fail.
    enrollments = module.get(ENROLLMENT_REPOSITORY);
    // The same instance the service holds, so a spy on it observes the real
    // calls rather than a second repository nothing writes to.
    groupRepo = module.get(GROUP_REPOSITORY);
    scopeRepo = module.get(ASSISTANT_SCOPE_REPOSITORY);
    assessmentRepo = module.get(ASSESSMENT_REPOSITORY);
    workRepo = module.get(WORK_REPOSITORY);
  });

  const entries = async () =>
    (await audit.find({ limit: 50 })).entries;

  describe('a group studies exactly one course (DOM-1)', () => {
    it('names its course at creation', async () => {
      const group = await admin.create(
        { name: 'IELTS — Friday', courseId: 'course-2' },
        ADMIN,
      );
      expect(group.courseId).toBe('course-2');
    });

    it('lets more than one group study the same course', async () => {
      const second = await admin.create(
        { name: 'Chemistry — Monday', courseId: 'course-1' },
        ADMIN,
      );

      const forCourse = await staff.listForCourse('course-1', ADMIN);
      expect(forCourse.map((g) => g.id).sort()).toEqual(
        ['group-1', second.id].sort(),
      );
    });

    it('404s a course that does not exist', async () => {
      await expect(
        admin.create({ name: 'Nowhere', courseId: 'course-nope' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('creating a group enrolls nobody (§5.16)', () => {
    it('leaves the enrollment table untouched', async () => {
      const before = await enrollments.findByCourse('course-2');

      await admin.create(
        { name: 'Chemistry — extra', courseId: 'course-2' },
        ADMIN,
      );

      // If naming a course on a group cascaded - the convenience the client
      // declined on 2026-09-10 - course-2 would have gained students here.
      const after = await enrollments.findByCourse('course-2');
      expect(after).toHaveLength(before.length);
      expect(after.map((e) => e.studentId)).not.toContain('student-2');
    });

    it('leaves a placed student with no access they did not already have', async () => {
      // student-2 holds course-1 only. Placing them in group-2, which studies
      // course-2, must not make course-2 readable: Enrollment is the gate
      // (§5.16), and a group is not an access grant.
      await staff.addMember('group-2', { studentId: 'student-2' }, ADMIN);
      expect(await enrollments.find('course-2', 'student-2')).toBeNull();
    });
  });

  describe('placement is a staff action, and it is audited (§5.4, §5.16)', () => {
    it('lets an assistant place a student and records who did it', async () => {
      // **group-1, not group-2** (`D-10`): assistant-1 holds group-1 and
      // nothing else, so placing into group-2 is now a 404 - asserted in its
      // own case below. The property under test is unchanged: an assistant may
      // place, and the log names them.
      await staff.removeMember('group-1', 'student-2', ADMIN);
      await staff.addMember('group-1', { studentId: 'student-2' }, ASSIGNED_TA);

      const members = await staff.members('group-1', ASSIGNED_TA);
      expect(members.map((m) => m.studentId).sort()).toEqual([
        'student-1',
        'student-2',
      ]);

      const entry = (await entries()).find(
        (e) => e.action === 'group.student_assigned',
      );
      expect(entry).toBeDefined();
      // The actor's role is derived from the caller, never assumed - the
      // defect §5.4 records finding in ManageRecordingsService.
      expect(entry?.actorId).toBe('assistant-1');
      expect(entry?.actorRole).toBe(Role.Assistant);
      expect(entry?.after).toMatchObject({
        groupId: 'group-1',
        studentId: 'student-2',
      });
    });

    it('records a before that actually differs from the after on removal', async () => {
      await staff.removeMember('group-1', 'student-2', ADMIN);

      const entry = (await entries()).find(
        (e) => e.action === 'group.student_removed',
      );
      expect(entry?.before).toMatchObject({
        groupId: 'group-1',
        studentId: 'student-2',
      });
      expect(entry?.after).toBeNull();
      expect(entry?.before).not.toEqual(entry?.after);
    });

    it('is idempotent - placing the same student twice is one membership', async () => {
      await staff.addMember('group-2', { studentId: 'student-2' }, ADMIN);
      await staff.addMember('group-2', { studentId: 'student-2' }, ADMIN);

      const members = await staff.members('group-2', ADMIN);
      expect(members.filter((m) => m.studentId === 'student-2')).toHaveLength(1);
    });

    it('refuses to place an account that is not a student', async () => {
      await expect(
        staff.addMember('group-1', { studentId: 'assistant-1' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s on a group that does not exist', async () => {
      await expect(
        staff.addMember('group-nope', { studentId: 'student-1' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s removing a student who is not in the group', async () => {
      await expect(
        staff.removeMember('group-2', 'student-2', ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the widened PATCH (DOM-2)', () => {
    it('keeps a before/after pair that differs, never an alias', async () => {
      await admin.update(
        'group-1',
        { name: 'Chemistry — Saturday 19:00', room: 'Room 3' },
        ADMIN,
      );

      const entry = (await entries()).find((e) => e.action === 'group.updated');
      expect(entry?.before).toMatchObject({
        name: 'IGCSE Chemistry — Saturday 18:00',
        room: null,
      });
      expect(entry?.after).toMatchObject({
        name: 'Chemistry — Saturday 19:00',
        room: 'Room 3',
      });
      // The defect that shipped twice: a `before` that is the same object as
      // `after` records a change that appears never to have happened.
      expect(entry?.before).not.toEqual(entry?.after);
    });

    it('leaves fields the patch omits alone', async () => {
      const before = await admin.get('group-1', ADMIN);
      const after = await admin.update('group-1', { room: 'Room 9' }, ADMIN);
      expect(after.name).toBe(before.name);
      expect(after.courseId).toBe(before.courseId);
      expect(after.meets).toBe(before.meets);
      expect(after.room).toBe('Room 9');
    });

    it('clears a nullable field when the patch says null, rather than ignoring it', async () => {
      // The distinction COALESCE alone cannot make: `undefined` means "leave
      // alone" and `null` means "clear it", and both arrive as SQL NULL.
      const after = await admin.update('group-1', { assistantId: null }, ADMIN);
      expect(after.assistantId).toBeNull();
    });

    it('sets assistantId without granting the assistant anything', async () => {
      // `groups.assistant_id` is a DISPLAY field. Naming an assistant on a
      // group must not widen what they may reach - that is decided by
      // `StaffScopeService` and nothing else. `unassigned-ta` does not hold
      // course-2, and naming them on group-2 must not change that.
      await admin.update('group-2', { assistantId: 'assistant-2' }, ADMIN);
      await expect(
        staff.listForCourse('course-2', UNASSIGNED_TA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses with 409 when the course changes on a group that has members', async () => {
      // group-1 holds student-1 and student-2. Re-pointing it would leave both
      // enrolled on the old course while being targeted by work set for the
      // new one (`DOMAIN_MODEL.md:98-100`). Stated as an assumption in
      // `groups.service.ts`; ratified by the coordinator 2026-09-20.
      await expect(
        admin.update('group-1', { courseId: 'course-2' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the course to change on an empty group', async () => {
      const empty = await admin.create(
        { name: 'Empty cohort', courseId: 'course-1' },
        ADMIN,
      );
      const moved = await admin.update(
        empty.id,
        { courseId: 'course-2' },
        ADMIN,
      );
      expect(moved.courseId).toBe('course-2');
    });

    it('404s a group that does not exist', async () => {
      await expect(
        admin.update('group-nope', { name: 'x' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * **`D-10`**, closed 2026-09-20 and built by `AUTH-2`. Until this, any
   * assistant could read any group and its roster - every member's name and
   * email. The refusal is a **404 byte-identical to a genuine miss**, so an
   * assistant cannot enumerate cohorts one id at a time, and it covers the
   * write as well as the reads (`AUTHORIZATION_MODEL.md:207`).
   *
   * Both directions, per `CLAUDE.md` §10: the assistant who holds the group
   * succeeds, the one who does not is refused.
   */
  describe('D-10: an assistant reaches only the groups they hold', () => {
    const message = async (p: Promise<unknown>) =>
      p.then(() => 'no error', (e: Error) => e.message);

    it('lets the holding assistant read the group and its roster', async () => {
      // assistant-1 holds group-1. The positive half, without which the
      // negative half below could be satisfied by refusing everyone.
      await expect(staff.get('group-1', ASSIGNED_TA)).resolves.toMatchObject({
        id: 'group-1',
      });
      const members = await staff.members('group-1', ASSIGNED_TA);
      expect(members.map((m) => m.studentId)).toContain('student-1');
    });

    it('404s a group they do not hold, with the message of a genuine miss', async () => {
      // The two messages compared IN THE SAME TEST. Comparing each against its
      // own literal would pass while the property was gone.
      await expect(staff.get('group-2', ASSIGNED_TA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await message(staff.get('group-2', ASSIGNED_TA))).toBe(
        await message(staff.get('group-does-not-exist', ASSIGNED_TA)),
      );
      expect(await message(staff.get('group-2', ASSIGNED_TA))).toBe(
        GROUP_NOT_FOUND,
      );
    });

    it('404s the roster of a group they do not hold, identically', async () => {
      // The leak `D-10` names: this read carries names and email addresses.
      expect(await message(staff.members('group-2', ASSIGNED_TA))).toBe(
        await message(staff.members('group-does-not-exist', ASSIGNED_TA)),
      );
      expect(await message(staff.members('group-2', ASSIGNED_TA))).toBe(
        GROUP_NOT_FOUND,
      );
    });

    it('404s placing a student into a group they do not hold, identically', async () => {
      // The write, not only the reads. And it must not have written first.
      expect(
        await message(
          staff.addMember('group-2', { studentId: 'student-2' }, ASSIGNED_TA),
        ),
      ).toBe(
        await message(
          staff.addMember(
            'group-does-not-exist',
            { studentId: 'student-2' },
            ASSIGNED_TA,
          ),
        ),
      );
      const members = await staff.members('group-2', ADMIN);
      expect(members.map((m) => m.studentId)).not.toContain('student-2');
      expect(
        (await entries()).filter((e) => e.action === 'group.student_assigned'),
      ).toEqual([]);
    });

    it('refuses an assistant with no groups at all, on a group that exists', async () => {
      expect(await message(staff.get('group-1', UNASSIGNED_TA))).toBe(
        GROUP_NOT_FOUND,
      );
    });

    it('lets an all_groups assistant read any group (ruling R-7)', async () => {
      await scopeRepo.setScope('assistant-2', 'all_groups');
      await expect(staff.get('group-1', UNASSIGNED_TA)).resolves.toMatchObject({
        id: 'group-1',
      });
      await expect(staff.get('group-2', UNASSIGNED_TA)).resolves.toMatchObject({
        id: 'group-2',
      });
    });

    it.each([
      ['the teacher', ADMIN],
      ['the full admin', FULL_ADMIN],
    ])('lets %s read every group', async (_label, actor) => {
      await expect(staff.get('group-1', actor)).resolves.toBeDefined();
      await expect(staff.get('group-2', actor)).resolves.toBeDefined();
    });

    it('does not read groups.assistant_id to decide reach (ruling R-1)', async () => {
      // The binding rule, at the group grain this time. Naming assistant-2 on
      // group-2 is a DISPLAY change; it must not make group-2 reachable.
      await admin.update('group-2', { assistantId: 'assistant-2' }, ADMIN);
      expect(await message(staff.get('group-2', UNASSIGNED_TA))).toBe(
        GROUP_NOT_FOUND,
      );
    });
  });

  describe('the course tab is scoped like every other /staff route (§5.11)', () => {
    it('404s a course the TA does not hold', async () => {
      await expect(
        staff.listForCourse('course-2', UNASSIGNED_TA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('gives an unassigned TA the same answer for a course that does not exist', async () => {
      const held = await staff
        .listForCourse('course-2', UNASSIGNED_TA)
        .catch((e: Error) => e.message);
      const missing = await staff
        .listForCourse('course-nope', UNASSIGNED_TA)
        .catch((e: Error) => e.message);
      // Identical messages, so a TA cannot enumerate the catalog one id at a
      // time - the property `staff-scope.service.spec.ts` already pins.
      expect(held).toBe(missing);
    });

    it('lets the admin through unscoped', async () => {
      await expect(
        staff.listForCourse('course-2', ADMIN),
      ).resolves.toBeInstanceOf(Array);
    });
  });

  describe('classmates (§5.17)', () => {
    it('shows the other students in the caller own group, never themselves', async () => {
      const groups = await classmates.list('course-1', STUDENT_1);
      expect(groups).toHaveLength(1);
      expect(groups[0].groupId).toBe('group-1');
      expect(groups[0].classmates.map((c) => c.studentId)).toEqual(['student-2']);
    });

    it('carries a name and nothing else - no email, no marks', async () => {
      const [group] = await classmates.list('course-1', STUDENT_1);
      const classmate = group.classmates[0];
      expect(Object.keys(classmate).sort()).toEqual(['name', 'studentId']);
      expect(classmate.name).toBeTruthy();
    });

    it('does not leak the other group studying the same course', async () => {
      // A second group on course-1, with a student in it. student-1 is in
      // group-1 and must not see them.
      const other = await admin.create(
        { name: 'Chemistry — Monday', courseId: 'course-1' },
        ADMIN,
      );
      await staff.addMember(other.id, { studentId: 'student-2' }, ADMIN);

      const groups = await classmates.list('course-1', STUDENT_1);
      expect(groups.map((g) => g.groupId)).toEqual(['group-1']);
    });

    it('returns two lists for a student in two groups, never one merged set', async () => {
      // student-1 already sits in group-1; put them in a second group that also
      // studies course-1.
      const other = await admin.create(
        { name: 'Chemistry — Monday', courseId: 'course-1' },
        ADMIN,
      );
      await staff.addMember(other.id, { studentId: 'student-1' }, ADMIN);
      await staff.addMember(other.id, { studentId: 'student-2' }, ADMIN);

      const groups = await classmates.list('course-1', STUDENT_1);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.groupName)).not.toContain(undefined);
    });

    it('is empty, not an error, for an enrolled but unplaced student', async () => {
      // student-2 holds course-1 and sits in group-1; remove them and the list
      // empties rather than failing (§7.2 - a normal, temporary state).
      await staff.removeMember('group-1', 'student-2', ADMIN);
      await expect(classmates.list('course-1', STUDENT_2)).resolves.toEqual([]);
    });

    it('404s for a course the caller is not enrolled in', async () => {
      // student-2 holds course-1 only.
      await expect(
        classmates.list('course-2', STUDENT_2),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * `AUTH-3`, at the service layer. The method-level `@Roles(...STAFF_ADMIN)` on
   * the controller is the outer gate and the e2e suite proves it over HTTP; this
   * proves the rule is in the **service**, which is `IMPLEMENTATION_PLAN.md`'s
   * Definition of Done point 5 and `CLAUDE.md` §5. A permission enforced only at
   * a decorator is one refactor away from being enforced nowhere.
   */
  describe('AUTH-3: removing a member is withheld from an assistant', () => {
    it('refuses an assistant before the repository is touched', async () => {
      // `findById` is the **first** read `removeMember` performs, via
      // `requireGroup`. Spying only on `findMembers` or `removeMember` would not
      // pin the ordering: `assertMay` placed after the group read still refuses
      // before either of those, so the test would pass with the check in the
      // wrong place. Verified by moving the assertion and watching this go red.
      const findById = vi.spyOn(groupRepo, 'findById');
      const findMembers = vi.spyOn(groupRepo, 'findMembers');
      const removeMember = vi.spyOn(groupRepo, 'removeMember');

      await expect(
        staff.removeMember('group-1', 'student-2', ASSIGNED_TA),
      ).rejects.toThrow(ForbiddenException);

      // Not merely "did not remove" - did not *read*. The capability check is
      // the first statement in the method, so a refused assistant cannot use the
      // difference between a 403 and a 404 to learn whether a group or a
      // membership exists.
      expect(findById).not.toHaveBeenCalled();
      expect(findMembers).not.toHaveBeenCalled();
      expect(removeMember).not.toHaveBeenCalled();
    });

    it('writes no audit entry for the refused removal', async () => {
      await expect(
        staff.removeMember('group-1', 'student-2', ASSIGNED_TA),
      ).rejects.toThrow(ForbiddenException);
      expect(
        (await entries()).filter((e) => e.action === 'group.student_removed'),
      ).toEqual([]);
    });

    it('leaves the student in the group', async () => {
      await expect(
        staff.removeMember('group-1', 'student-2', ASSIGNED_TA),
      ).rejects.toThrow(ForbiddenException);
      const members = await staff.members('group-1', ADMIN);
      expect(members.map((m) => m.studentId)).toContain('student-2');
    });

    it('still lets the assistant add a member - add stays, remove moves', async () => {
      // The paired grant from the client's 2026-09-10 answer. Losing it would
      // be an over-correction, and the e2e suite alone would not distinguish
      // "the assistant cannot remove" from "the assistant cannot place".
      // group-1, for the same `D-10` reason as above: it is the group this
      // assistant holds.
      await staff.removeMember('group-1', 'student-1', ADMIN);
      await staff.addMember('group-1', { studentId: 'student-1' }, ASSIGNED_TA);
      const members = await staff.members('group-1', ASSIGNED_TA);
      expect(members.map((m) => m.studentId)).toContain('student-1');
    });

    it.each([
      ['the teacher', ADMIN],
      ['the full admin', FULL_ADMIN],
    ])('lets %s remove a member', async (_label, actor) => {
      await staff.removeMember('group-1', 'student-2', actor);
      const members = await staff.members('group-1', ADMIN);
      expect(members.map((m) => m.studentId)).not.toContain('student-2');
    });

    it('records the full admin as admin on the removal', async () => {
      await staff.removeMember('group-1', 'student-2', FULL_ADMIN);
      const entry = (await entries()).find(
        (e) => e.action === 'group.student_removed',
      );
      expect(entry).toMatchObject({
        actorId: 'admin-1',
        actorRole: Role.Admin,
      });
    });
  });

  describe('bulk move (GROUP-3)', () => {
    it('moves several students at once, one write and one audit entry per student', async () => {
      const result = await admin.bulkMoveMembers(
        'group-2',
        { studentIds: ['student-1', 'student-2'] },
        ADMIN,
      );
      expect(result).toEqual({ moved: 2 });

      const members = await staff.members('group-2', ADMIN);
      expect(members.map((m) => m.studentId).sort()).toEqual(['student-1', 'student-2']);

      const assigned = (await entries()).filter(
        (e) => e.action === 'group.student_assigned' && e.after?.groupId === 'group-2',
      );
      expect(assigned.map((e) => e.after?.studentId).sort()).toEqual([
        'student-1',
        'student-2',
      ]);
    });

    it('404s a group that does not exist', async () => {
      await expect(
        admin.bulkMoveMembers('group-nope', { studentIds: ['student-1'] }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates every id before writing any - a batch half valid is refused whole', async () => {
      const before = await staff.members('group-2', ADMIN);
      await expect(
        admin.bulkMoveMembers(
          'group-2',
          { studentIds: ['student-1', 'nobody-at-all'] },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      const after = await staff.members('group-2', ADMIN);
      expect(after.length).toBe(before.length);
    });

    it('400s a non-student id', async () => {
      await expect(
        admin.bulkMoveMembers('group-2', { studentIds: ['teacher-1'] }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('group report (GROUP-4)', () => {
    it('returns the group, its course, and a row per member', async () => {
      const report = await staff.report('group-1', ADMIN);
      expect(report.groupId).toBe('group-1');
      expect(report.courseId).toBe('course-1');
      expect(report.entries.map((e) => e.studentId).sort()).toEqual([
        'student-1',
        'student-2',
      ]);
      expect(report.memberCount).toBe(report.entries.length);
    });

    it('lets the assistant read the group they hold', async () => {
      const report = await staff.report('group-1', ASSIGNED_TA);
      expect(report.groupId).toBe('group-1');
    });

    it('404s a group the assistant does not hold, same message as unknown', async () => {
      const heldMiss = await staff
        .report('group-2', ASSIGNED_TA)
        .catch((e: Error) => e.message);
      const unknownMiss = await staff
        .report('group-nope', ASSIGNED_TA)
        .catch((e: Error) => e.message);
      expect(heldMiss).toBe(GROUP_NOT_FOUND);
      expect(heldMiss).toBe(unknownMiss);
    });
  });

  /**
   * The mark book (`BOOK-1`, unit 7): `D-45` average, `D-46` form columns,
   * em-dash (null) for a missing mark, performance only.
   */
  describe('mark book (BOOK-1, D-45, D-46)', () => {
    const TASK = {
      courseId: 'course-1',
      lessonId: null,
      title: 'Essay',
      description: '',
      instructions: '',
      type: 'homework' as const,
      topics: [],
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 20,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
      workType: 'file_upload' as const,
      externalUrl: null,
      visibility: 'published' as const,
      markerId: null,
      allowResubmission: true,
      submissionModes: [],
      draftId: null,
      attachments: [],
    };

    /**
     * A fresh group on course-1 holding both students (so the seeded group-1
     * tasks and marks stay out of it), with two uploads, a hidden one, a link
     * and a form set for it.
     */
    let gid = '';
    async function book() {
      gid = (await admin.create({ name: 'Mark book group', courseId: 'course-1' }, ADMIN)).id;
      for (const studentId of ['student-1', 'student-2']) {
        await groupRepo.addMember({ groupId: gid, studentId, assignedBy: 'teacher-1' });
      }
      const make = async (over: Partial<typeof TASK> & { workType?: 'file_upload' | 'link' | 'google_form' }) => {
        const t = await assessmentRepo.create({ ...TASK, ...over });
        await assessmentRepo.setTargets(t.id, [{ groupId: gid }]);
        return t;
      };
      const essay = await make({ title: 'Essay', dueAt: '2098-01-01T00:00:00.000Z', maxScore: 20 });
      const letter = await make({ title: 'Letter', dueAt: '2098-02-01T00:00:00.000Z', maxScore: 10 });
      const hidden = await make({ title: 'Hidden', visibility: 'hidden' });
      const reading = await make({ title: 'Reading', workType: 'link', externalUrl: 'https://example.com' });
      const quiz = await make({ title: 'Quiz', workType: 'google_form', dueAt: '2098-03-01T00:00:00.000Z' });
      await workRepo.upsertBinding({
        assessmentId: quiz.id, formId: 'f', responderUri: 'https://docs.google.com/forms/x',
        title: 'Quiz', isQuiz: true, totalPoints: 9, collectsEmail: true,
      });
      await workRepo.markSynced(quiz.id, null);
      return { essay, letter, hidden, reading, quiz };
    }

    it('shows each member against each visible task, a missing mark as null, never 0', async () => {
      const { essay, letter, hidden, reading, quiz } = await book();
      const s1 = await assessmentRepo.createSubmission(essay.id, 'student-1', null, 'mine');
      await assessmentRepo.gradeSubmission(s1.id, { score: 0, feedback: null, annotatedFileUrl: undefined });
      await assessmentRepo.createSubmission(letter.id, 'student-2', null, 'not marked yet');

      const mb = await staff.markbook(gid, ADMIN);
      expect(mb.tasks.map((t) => t.assessmentId)).toEqual([essay.id, letter.id, quiz.id]);
      expect(mb.tasks.map((t) => t.assessmentId)).not.toContain(hidden.id);
      expect(mb.omittedTasks).toEqual([{ assessmentId: reading.id, title: 'Reading', workType: 'link' }]);

      const cell = (studentId: string, taskId: string) =>
        mb.students.find((s) => s.studentId === studentId)!.cells.find((c) => c.assessmentId === taskId)!;
      // A real zero is a zero; a saved-not-returned mark is shown to staff, flagged.
      expect(cell('student-1', essay.id)).toMatchObject({ score: 0, status: 'marked' });
      expect(cell('student-1', letter.id)).toMatchObject({ score: null, status: 'not_submitted' });
      expect(cell('student-2', letter.id)).toMatchObject({ score: null, status: 'submitted' });
      // No completion figure anywhere (CLAUDE.md §11.1).
      expect(JSON.stringify(mb)).not.toMatch(/progress|completion|percentComplete/i);
    });

    it('D-45: averages marked platform work only - GROUP-4\'s arithmetic - and is null with nothing marked', async () => {
      const { essay, letter, quiz } = await book();
      const e = await assessmentRepo.createSubmission(essay.id, 'student-1', null, 'e');
      await assessmentRepo.gradeSubmission(e.id, { score: 15, feedback: null, annotatedFileUrl: undefined });
      const l = await assessmentRepo.createSubmission(letter.id, 'student-1', null, 'l');
      await assessmentRepo.gradeSubmission(l.id, { score: 5, feedback: null, annotatedFileUrl: undefined });
      // A perfect quiz score must not move the platform average.
      await workRepo.replaceResults(quiz.id, 'google_form', [
        { assessmentId: quiz.id, provider: 'google_form', externalId: 'r1', studentId: 'student-1', respondentId: 's1@example.com', score: 9, maxScore: 9, submittedAt: '2026-09-01T00:00:00.000Z', raw: {} },
      ]);
      const mb = await staff.markbook(gid, ADMIN);
      const s1 = mb.students.find((s) => s.studentId === 'student-1')!;
      // (15/20 + 5/10) / 2 = 62.5 -> 63
      expect(s1.averagePercent).toBe(63);
      expect(mb.students.find((s) => s.studentId === 'student-2')!.averagePercent).toBeNull();
      // The group report computes the same student's figure the same way.
      const report = await staff.report(gid, ADMIN);
      expect(report.entries.find((r) => r.studentId === 'student-1')!.averageScorePercent).toBe(63);
    });

    it('D-46: form columns are mirrored, carry the sync time and unmatched count, and show the LATEST response', async () => {
      const { quiz } = await book();
      await workRepo.replaceResults(quiz.id, 'google_form', [
        { assessmentId: quiz.id, provider: 'google_form', externalId: 'old', studentId: 'student-1', respondentId: 'a', score: 3, maxScore: 9, submittedAt: '2026-09-01T00:00:00.000Z', raw: {} },
        { assessmentId: quiz.id, provider: 'google_form', externalId: 'new', studentId: 'student-1', respondentId: 'a', score: 8, maxScore: 9, submittedAt: '2026-09-02T00:00:00.000Z', raw: {} },
        { assessmentId: quiz.id, provider: 'google_form', externalId: 'nobody', studentId: null, respondentId: 'x@y', score: 1, maxScore: 9, submittedAt: '2026-09-02T00:00:00.000Z', raw: {} },
      ]);
      const mb = await staff.markbook(gid, ADMIN);
      const col = mb.tasks.find((t) => t.assessmentId === quiz.id)!;
      expect(col).toMatchObject({ source: 'mirrored', maxScore: 9, unmatchedCount: 1 });
      expect(col.lastSyncedAt).not.toBeNull();
      const cells = (id: string) => mb.students.find((s) => s.studentId === id)!.cells.find((c) => c.assessmentId === quiz.id)!;
      expect(cells('student-1')).toMatchObject({ score: 8, maxScore: 9, status: 'scored' });
      expect(cells('student-2')).toMatchObject({ score: null, status: 'no_response' });
    });

    it('lets the assistant read the group they hold, and 404s any other exactly like an unknown one', async () => {
      await expect(staff.markbook('group-1', ASSIGNED_TA)).resolves.toMatchObject({ groupId: 'group-1' });
      const unheld = await staff.markbook('group-2', ASSIGNED_TA).catch((e: Error) => e.message);
      const unknown = await staff.markbook('group-nope', ASSIGNED_TA).catch((e: Error) => e.message);
      const unscoped = await staff.markbook('group-1', UNASSIGNED_TA).catch((e: Error) => e.message);
      expect(unheld).toBe(GROUP_NOT_FOUND);
      expect(unheld).toBe(unknown);
      expect(unscoped).toBe(unknown);
    });
  });

  /**
   * `D-33`: the course group list is narrowed to the groups the caller holds,
   * so the task-authoring picker offers only what the targeting write accepts.
   */
  describe('the course group list is narrowed to held groups (D-33)', () => {
    it('lists only group-1 for assistant-1, and every group for the teacher', async () => {
      const second = await admin.create({ name: 'Chemistry — Unheld', courseId: 'course-1' }, ADMIN);
      const forTa = await staff.listForCourse('course-1', ASSIGNED_TA);
      expect(forTa.map((g) => g.id)).toEqual(['group-1']);
      const forTeacher = await staff.listForCourse('course-1', ADMIN);
      expect(forTeacher.map((g) => g.id).sort()).toEqual(['group-1', second.id].sort());
    });
  });
});
