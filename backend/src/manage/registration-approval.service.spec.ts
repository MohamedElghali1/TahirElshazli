import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RegistrationApprovalService } from './registration-approval.service.js';
import { DirectoryService } from './directory.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from '../recordings/repositories/in-memory-recording.repository.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { Role } from '../auth/roles.enum.js';

const TEACHER = { id: 'teacher-1', role: 'teacher' };
const FULL_ADMIN = { id: 'admin-1', role: 'admin' };
const ASSISTANT = { id: 'assistant-1', role: 'assistant' };

/** `group-1` studies `course-1` in the shipped fixtures. */
const GROUP = 'group-1';

describe('RegistrationApprovalService', () => {
  let service: RegistrationApprovalService;
  let users: InMemoryUserRepository;
  let groups: InMemoryGroupRepository;
  let courses: CoursesService;
  let enrollments: EnrollmentsService;
  let audit: AuditService;
  let db: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationApprovalService,
        DirectoryService,
        CoursesService,
        EnrollmentsService,
        RecordingsService,
        LiveSessionsService,
        StudentGroupsService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction, so the
        // real `DatabaseService` is wired. A null pool selects the memory
        // driver, where `runInTransaction` is a passthrough that still enters
        // the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(RegistrationApprovalService);
    users = module.get(USER_REPOSITORY);
    groups = module.get(GROUP_REPOSITORY);
    courses = module.get(CoursesService);
    enrollments = module.get(EnrollmentsService);
    audit = module.get(AuditService);
    db = module.get(DatabaseService);
  });

  /** A fresh registration, in the state `AuthService.register` leaves it. */
  async function waiting(email = 'queued@example.com') {
    return users.create({
      email,
      passwordHash: 'hash',
      name: 'Queued Student',
      role: Role.Student,
      status: 'waiting',
    });
  }

  describe('accept', () => {
    it('activates, enrols and places - all three, or the accept means nothing', async () => {
      const student = await waiting();

      const row = await service.accept(student.id, GROUP, TEACHER);

      expect(row).toMatchObject({ id: student.id, status: 'active' });
      expect((await users.findById(student.id))?.status).toBe('active');
      const group = (await groups.findById(GROUP))!;
      expect(await enrollments.find(group.courseId, student.id)).not.toBeNull();
      expect(
        (await groups.findMembers(GROUP)).map((m) => m.studentId),
      ).toContain(student.id);
    });

    it('records who placed them', async () => {
      const student = await waiting();
      await service.accept(student.id, GROUP, FULL_ADMIN);
      const membership = (await groups.findMembers(GROUP)).find(
        (m) => m.studentId === student.id,
      );
      expect(membership?.assignedBy).toBe('admin-1');
    });

    it('runs activation, enrolment and placement inside one transaction', async () => {
      // The risk this method's transaction exists for: activation committing
      // without the enrolment leaves a student who is `active`, in a group,
      // and enrolled on nothing - every course read 404s and nothing on any
      // screen says why.
      //
      // **This driver cannot prove the rollback.** `runInTransaction` on the
      // memory driver is a documented passthrough with no rollback
      // (`CLAUDE.md` §9), so a forced failure here leaves the earlier write
      // standing however the service is written, and asserting otherwise would
      // be asserting the driver rather than the code. What *is* provable here
      // is that every write is inside one wrap, and that a failure propagates
      // rather than being swallowed. The rollback itself is asserted against
      // real Postgres - `postgres-repositories.integration-spec.ts`,
      // "rolls a half-finished acceptance back".
      const student = await waiting();
      const wrap = vi.spyOn(db, 'runInTransaction');
      const enrol = vi
        .spyOn(courses, 'enroll')
        .mockImplementation(async () => {
          expect(db.inTransaction, 'enrol ran outside the transaction').toBe(
            true,
          );
          throw new Error('enrol failed');
        });

      await expect(service.accept(student.id, GROUP, TEACHER)).rejects.toThrow(
        'enrol failed',
      );

      expect(wrap).toHaveBeenCalledTimes(1);
      expect(enrol).toHaveBeenCalledTimes(1);
      // Nothing was placed: the failure aborted the method rather than being
      // caught and carried on from.
      expect(
        (await groups.findMembers(GROUP)).map((m) => m.studentId),
      ).not.toContain(student.id);
    });

    it('409s a registration that has already been decided', async () => {
      const student = await waiting();
      await service.accept(student.id, GROUP, TEACHER);
      await expect(
        service.accept(student.id, GROUP, TEACHER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unknown student and an unknown group alike', async () => {
      const student = await waiting();
      await expect(
        service.accept('no-such-student', GROUP, TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.accept(student.id, 'no-such-group', TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('gives a staff id the same 404 a missing student gets', async () => {
      // An admin id typed into this route is not a registration, and saying so
      // would confirm which ids name staff.
      const staffId = await service
        .accept('admin-1', GROUP, TEACHER)
        .catch((e: Error) => e.message);
      const missing = await service
        .accept('no-such-student', GROUP, TEACHER)
        .catch((e: Error) => e.message);
      expect(staffId).toBe(missing);
    });

    it('writes one student.accepted entry naming the group and the course', async () => {
      const student = await waiting();
      await service.accept(student.id, GROUP, FULL_ADMIN);

      const page = await audit.find({ limit: 50, targetType: 'student' });
      const entry = page.entries.find((e) => e.targetId === student.id)!;
      expect(entry).toMatchObject({
        actorId: 'admin-1',
        // From `actorRoleOf`, never a ternary: the admin is recorded as admin.
        actorRole: Role.Admin,
        action: 'student.accepted',
        targetType: 'student',
        courseId: 'course-1',
      });
      expect(entry.before).toEqual({ status: 'waiting' });
      expect(entry.after).toEqual({
        status: 'active',
        groupId: GROUP,
        courseId: 'course-1',
      });
      // The before is a copy, never an alias of the row it describes.
      expect(entry.before).not.toEqual(entry.after);
    });
  });

  describe('reject', () => {
    it('refuses an assistant with 403, before anything is read', async () => {
      // `registration.reject` is one of the four verbs withheld from an
      // assistant. 403 rather than 404 because this is capability, not scope -
      // the assistant is looking at the queue and it is the verb that is
      // refused.
      const student = await waiting();
      await expect(
        service.reject(student.id, 'not this term', ASSISTANT),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await users.findById(student.id))?.status).toBe('waiting');
    });

    it('refuses an assistant even for a student who does not exist', async () => {
      // The capability check is the first statement, so a refused caller
      // learns nothing about whether the id names anybody.
      await expect(
        service.reject('no-such-student', undefined, ASSISTANT),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks the account rejected without deleting it', async () => {
      const student = await waiting();
      expect(await service.reject(student.id, 'Wrong year group', TEACHER))
        .toEqual({ ok: true });
      expect((await users.findById(student.id))?.status).toBe('rejected');
      // The row stays: deleting it would free the address to register again
      // into a clean slate and leave the audit entry naming nothing.
      expect(await users.findByEmail('queued@example.com')).not.toBeNull();
    });

    it('409s a registration that has already been decided', async () => {
      const student = await waiting();
      await service.reject(student.id, undefined, TEACHER);
      await expect(
        service.reject(student.id, undefined, TEACHER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('writes a student.rejected entry carrying the reason and nothing about the student', async () => {
      const student = await waiting();
      await service.reject(student.id, 'Wrong year group', TEACHER);

      const page = await audit.find({ limit: 50, action: 'student.rejected' });
      const entry = page.entries.find((e) => e.targetId === student.id)!;
      expect(entry).toMatchObject({
        actorId: 'teacher-1',
        actorRole: Role.Teacher,
        targetType: 'student',
        courseId: null,
      });
      expect(entry.before).toEqual({ status: 'waiting' });
      expect(entry.after).toEqual({
        status: 'rejected',
        reason: 'Wrong year group',
      });
      // No PII in the payload: not the email, not a parent's address, not a
      // staff note.
      expect(JSON.stringify(entry.after)).not.toContain('@');
    });

    it('records a null reason rather than omitting the field', async () => {
      const student = await waiting();
      await service.reject(student.id, undefined, FULL_ADMIN);
      const page = await audit.find({ limit: 50, action: 'student.rejected' });
      expect(
        page.entries.find((e) => e.targetId === student.id)?.after,
      ).toEqual({ status: 'rejected', reason: null });
    });
  });
});
