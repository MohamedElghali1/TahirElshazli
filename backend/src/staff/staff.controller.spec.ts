import { Test, TestingModule } from '@nestjs/testing';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffScopeService } from './staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from './interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from './repositories/in-memory-assistant-scope.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
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

/**
 * `AdminStaffController` and its three routes went with
 * `course_staff_assignments` (`AUTH-2`). `StaffService` no longer writes
 * anything, so it no longer needs `AuditService`, `DatabaseService` or
 * `USER_REPOSITORY` - the whole assign/unassign half of this file went with
 * them, and what an assistant may reach is now proved at the group grain in
 * `staff-scope.service.spec.ts`.
 */
describe('Staff surface', () => {
  let staff: StaffController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        StaffService,
        StaffScopeService,
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    staff = module.get(StaffController);
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
      // reaches these courses without holding a group.
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
});
