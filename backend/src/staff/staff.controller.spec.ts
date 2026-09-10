import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaffController } from './staff.controller.js';
import { AdminStaffController } from './admin-staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffScopeService } from './staff-scope.service.js';
import { COURSE_STAFF_REPOSITORY } from './interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from './repositories/in-memory-course-staff.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

const ASSIGNED_TA = {
  user: {
    sub: 'assistant-1',
    email: 'assistant@example.com',
    role: 'assistant',
    jti: 'j1',
  },
};
const UNASSIGNED_TA = {
  user: {
    sub: 'assistant-2',
    email: 'assistant2@example.com',
    role: 'assistant',
    jti: 'j2',
  },
};
const ADMIN = {
  user: {
    sub: 'teacher-1',
    email: 'teacher@example.com',
    role: 'teacher',
    jti: 'j3',
  },
};

describe('Staff surface', () => {
  let staff: StaffController;
  let admin: AdminStaffController;
  let audit: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController, AdminStaffController],
      providers: [
        StaffService,
        StaffScopeService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        {
          provide: COURSE_STAFF_REPOSITORY,
          useClass: InMemoryCourseStaffRepository,
        },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    staff = module.get(StaffController);
    admin = module.get(AdminStaffController);
    audit = module.get(AuditService);
  });

  describe('GET /staff/courses', () => {
    it('should return only the courses a TA is assigned to', async () => {
      const courses = await staff.listCourses({}, ASSIGNED_TA);
      expect(courses.map((c) => c.id)).toEqual(['course-1']);
      expect(courses[0]?.assignedAt).toBe('2026-02-01T09:00:00Z');
    });

    it('should return nothing for a TA with no assignments', async () => {
      // Not "everything" and not an error - an empty list is the correct
      // answer, and it is the one a filter-after-fetch bug would get wrong.
      await expect(staff.listCourses({}, UNASSIGNED_TA)).resolves.toEqual([]);
    });

    it('should return every course for an admin, unscoped', async () => {
      const courses = await staff.listCourses({}, ADMIN);
      expect(courses.length).toBeGreaterThan(1);
      expect(courses.map((c) => c.id)).toContain('course-2');
    });

    it('should mark an admin row as holding no assignment', async () => {
      // The asymmetry is visible in the response rather than implied: an admin
      // reaches these courses without a row in course_staff_assignments.
      const courses = await staff.listCourses({}, ADMIN);
      expect(courses.every((c) => c.assignedAt === null)).toBe(true);
    });

    it('should not leak a course to a TA just because an admin can see it', async () => {
      const adminSees = (await staff.listCourses({}, ADMIN)).map((c) => c.id);
      const taSees = (await staff.listCourses({}, ASSIGNED_TA)).map((c) => c.id);
      expect(adminSees).toContain('course-2');
      expect(taSees).not.toContain('course-2');
    });

    it('should page the admin listing', async () => {
      const firstPage = await staff.listCourses({ limit: 1, offset: 0 }, ADMIN);
      const secondPage = await staff.listCourses({ limit: 1, offset: 1 }, ADMIN);
      expect(firstPage).toHaveLength(1);
      expect(secondPage).toHaveLength(1);
      expect(firstPage[0]?.id).not.toBe(secondPage[0]?.id);
    });
  });

  describe('POST /admin/courses/:courseId/staff', () => {
    it('should assign an assistant and return them with a name', async () => {
      const member = await admin.assign(
        'course-2',
        { userId: 'assistant-2' },
        ADMIN,
      );
      expect(member).toMatchObject({
        userId: 'assistant-2',
        name: 'Omar Fathy',
        assignedBy: 'teacher-1',
      });
    });

    it('should immediately widen what that TA can see', async () => {
      await expect(staff.listCourses({}, UNASSIGNED_TA)).resolves.toEqual([]);
      await admin.assign('course-2', { userId: 'assistant-2' }, ADMIN);
      const courses = await staff.listCourses({}, UNASSIGNED_TA);
      expect(courses.map((c) => c.id)).toEqual(['course-2']);
    });

    it('should write an audit entry naming who granted what', async () => {
      await admin.assign('course-2', { userId: 'assistant-2' }, ADMIN);
      const page = await audit.find({ limit: 10 });
      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]).toMatchObject({
        actorId: 'teacher-1',
        action: 'course_staff.assigned',
        courseId: 'course-2',
        before: null,
        after: {
          userId: 'assistant-2',
          courseId: 'course-2',
          assignedBy: 'teacher-1',
        },
      });
    });

    it('should refuse to assign a non-assistant account', async () => {
      // Assigning a student here hands them the TA surface the moment their
      // role changes. The table means one thing only.
      await expect(
        admin.assign('course-1', { userId: 'student-1' }, ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('should refuse an unknown user or an unknown course', async () => {
      await expect(
        admin.assign('course-1', { userId: 'nobody' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      await expect(
        admin.assign('no-such-course', { userId: 'assistant-2' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject a duplicate assignment without logging a second grant', async () => {
      await expect(
        admin.assign('course-1', { userId: 'assistant-1' }, ADMIN),
      ).rejects.toThrow(ConflictException);
      await expect(audit.find({ limit: 10 })).resolves.toMatchObject({
        entries: [],
      });
    });

    it('should not write an audit entry for a rejected assignment', async () => {
      await admin
        .assign('course-1', { userId: 'student-1' }, ADMIN)
        .catch(() => undefined);
      await expect(audit.find({ limit: 10 })).resolves.toMatchObject({
        entries: [],
      });
    });
  });

  describe('DELETE /admin/courses/:courseId/staff/:userId', () => {
    it('should revoke access and log what was removed', async () => {
      await expect(
        admin.unassign('course-1', 'assistant-1', ADMIN),
      ).resolves.toEqual({ removed: true });

      await expect(staff.listCourses({}, ASSIGNED_TA)).resolves.toEqual([]);

      const page = await audit.find({ limit: 10 });
      expect(page.entries[0]).toMatchObject({
        actorId: 'teacher-1',
        action: 'course_staff.unassigned',
        courseId: 'course-1',
        after: null,
      });
      // The removed row is recorded in `before`, which is the whole reason the
      // service reads the assignment before deleting it.
      expect(page.entries[0]?.before).toMatchObject({
        userId: 'assistant-1',
        assignedBy: 'teacher-1',
      });
    });

    it('should 404 an assignment that was never there, and log nothing', async () => {
      await expect(
        admin.unassign('course-2', 'assistant-1', ADMIN),
      ).rejects.toThrow(NotFoundException);
      await expect(audit.find({ limit: 10 })).resolves.toMatchObject({
        entries: [],
      });
    });
  });

  describe('GET /admin/courses/:courseId/staff', () => {
    it('should list the assistants on a course', async () => {
      const members = await admin.list('course-1');
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        userId: 'assistant-1',
        name: 'Nour Hassan',
        email: 'assistant@example.com',
      });
    });

    it('should be empty for a course with no assistants', async () => {
      await expect(admin.list('course-2')).resolves.toEqual([]);
    });

    it('should 404 an unknown course', async () => {
      await expect(admin.list('no-such-course')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
