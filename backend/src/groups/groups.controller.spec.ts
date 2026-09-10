import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller.js';
import { StaffGroupsController } from './staff-groups.controller.js';
import { ClassmatesController } from './classmates.controller.js';
import { ClassmatesService } from './classmates.service.js';
import { GroupsService } from './groups.service.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { COURSE_STAFF_REPOSITORY } from '../staff/interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from '../staff/repositories/in-memory-course-staff.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
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
        EnrollmentsService,
        StaffScopeService,
        AuditService,
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
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
  });

  const entries = async () =>
    (await audit.find({ limit: 50 })).entries;

  describe('a group is a class of students, not a subdivision of a course', () => {
    it('is created with no course and can then study more than one', async () => {
      const group = await admin.create({ name: 'IELTS — Friday' }, ADMIN);
      // The shape CLAUDE.md §5.16 insisted on: nothing about a course here.
      expect(group).not.toHaveProperty('courseId');

      await admin.addCourse(
        group.id,
        { courseId: 'course-1', learningMode: 'live' },
        ADMIN,
      );
      await admin.addCourse(
        group.id,
        { courseId: 'course-2', learningMode: 'recorded' },
        ADMIN,
      );

      const summary = await admin.get(group.id);
      expect(summary.courses.map((c) => c.courseId).sort()).toEqual([
        'course-1',
        'course-2',
      ]);
      // And each pairing carries its own mode - the reason §5.2 put it on
      // GroupCourse rather than on Group.
      expect(
        summary.courses.find((c) => c.courseId === 'course-1')?.learningMode,
      ).toBe('live');
      expect(
        summary.courses.find((c) => c.courseId === 'course-2')?.learningMode,
      ).toBe('recorded');
    });

    it('lets more than one group study the same course', async () => {
      const second = await admin.create({ name: 'Chemistry — Monday' }, ADMIN);
      await admin.addCourse(
        second.id,
        { courseId: 'course-1', learningMode: 'live' },
        ADMIN,
      );

      const forCourse = await staff.listForCourse('course-1', ADMIN);
      expect(forCourse.map((g) => g.id).sort()).toEqual(
        ['group-1', second.id].sort(),
      );
    });
  });

  describe('adding a course to a group enrolls nobody (§5.16)', () => {
    it('leaves the enrollment table untouched', async () => {
      const before = await enrollments.findByCourse('course-2');

      await admin.addCourse(
        'group-1',
        { courseId: 'course-2', learningMode: 'live' },
        ADMIN,
      );

      // group-1 holds student-1 and student-2. If adding a course cascaded -
      // the convenience the client declined on 2026-09-10 - course-2 would
      // have gained student-2 here.
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
      await staff.addMember('group-2', { studentId: 'student-2' }, ASSIGNED_TA);

      const members = await staff.members('group-2');
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
        groupId: 'group-2',
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

      const members = await staff.members('group-2');
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

  describe('rename keeps a before/after pair that differs', () => {
    it('records the old and new name', async () => {
      await admin.rename('group-1', { name: 'Chemistry — Saturday 19:00' }, ADMIN);

      const entry = (await entries()).find((e) => e.action === 'group.renamed');
      expect(entry?.before).toEqual({ name: 'IGCSE Chemistry — Saturday 18:00' });
      expect(entry?.after).toEqual({ name: 'Chemistry — Saturday 19:00' });
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
      const other = await admin.create({ name: 'Chemistry — Monday' }, ADMIN);
      await admin.addCourse(
        other.id,
        { courseId: 'course-1', learningMode: 'live' },
        ADMIN,
      );
      await staff.addMember(other.id, { studentId: 'student-2' }, ADMIN);

      const groups = await classmates.list('course-1', STUDENT_1);
      expect(groups.map((g) => g.groupId)).toEqual(['group-1']);
    });

    it('returns two lists for a student in two groups, never one merged set', async () => {
      // student-1 already sits in group-1; put them in a second group that also
      // studies course-1.
      const other = await admin.create({ name: 'Chemistry — Monday' }, ADMIN);
      await admin.addCourse(
        other.id,
        { courseId: 'course-1', learningMode: 'live' },
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
});
