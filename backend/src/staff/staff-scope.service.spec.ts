import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StaffScopeService, type StaffActor } from './staff-scope.service.js';
import { COURSE_STAFF_REPOSITORY } from './interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from './repositories/in-memory-course-staff.repository.js';

/** Assigned to course-1 only (see the in-memory fixture). */
const ASSIGNED_TA: StaffActor = { id: 'assistant-1', role: 'assistant' };
/** A TA with no assignments at all. */
const UNASSIGNED_TA: StaffActor = { id: 'assistant-2', role: 'assistant' };
const ADMIN: StaffActor = { id: 'teacher-1', role: 'teacher' };

describe('StaffScopeService', () => {
  let service: StaffScopeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffScopeService,
        { provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository },
      ],
    }).compile();

    service = module.get(StaffScopeService);
  });

  describe('assertAssigned', () => {
    it('should let an assigned TA through and return their assignment', async () => {
      const assignment = await service.assertAssigned('course-1', ASSIGNED_TA);
      expect(assignment?.courseId).toBe('course-1');
      expect(assignment?.userId).toBe('assistant-1');
    });

    it('should refuse a TA on a course they are not assigned to', async () => {
      // The whole point of CLAUDE.md §5.11: holding *a* course is not holding
      // *this* course. A role check alone would pass here.
      await expect(
        service.assertAssigned('course-2', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should refuse a TA with no assignments at all', async () => {
      await expect(
        service.assertAssigned('course-1', UNASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should refuse with 404, not 403, so a TA cannot enumerate courses', async () => {
      // A 403 would confirm the course exists. Same response for a course that
      // does not exist and one the TA simply does not hold.
      const denied = await service
        .assertAssigned('course-2', ASSIGNED_TA)
        .catch((error: unknown) => error);
      const missing = await service
        .assertAssigned('course-does-not-exist', ASSIGNED_TA)
        .catch((error: unknown) => error);

      expect(denied).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((denied as NotFoundException).message).toBe(
        (missing as NotFoundException).message,
      );
    });

    it('should let an admin through without an assignment row', async () => {
      // §5.11: admin queries never join through CourseStaffAssignment.
      await expect(service.assertAssigned('course-2', ADMIN)).resolves.toBeNull();
      await expect(
        service.assertAssigned('course-does-not-exist', ADMIN),
      ).resolves.toBeNull();
    });
  });

  describe('scopeFor', () => {
    it('should return only the assigned courses for a TA', async () => {
      const scope = await service.scopeFor(ASSIGNED_TA);
      expect(scope.unscoped).toBe(false);
      if (scope.unscoped) throw new Error('expected a scoped result');
      expect(scope.assignments.map((a) => a.courseId)).toEqual(['course-1']);
    });

    it('should return an empty list, not everything, for an unassigned TA', async () => {
      const scope = await service.scopeFor(UNASSIGNED_TA);
      expect(scope.unscoped).toBe(false);
      if (scope.unscoped) throw new Error('expected a scoped result');
      expect(scope.assignments).toEqual([]);
    });

    it('should report an admin as unscoped', async () => {
      await expect(service.scopeFor(ADMIN)).resolves.toEqual({ unscoped: true });
    });

    it('should not treat any other role as unscoped', async () => {
      // A student or parent should never reach these services, but if a future
      // @Roles slip lets one through, the scope must still be a closed one.
      for (const role of ['student', 'parent', 'visitor', '']) {
        const scope = await service.scopeFor({ id: 'someone', role });
        expect(scope.unscoped).toBe(false);
      }
    });
  });

  describe('assign and unassign', () => {
    it('should be idempotent and report whether a row was created', async () => {
      const first = await service.assign('course-2', 'assistant-2', 'teacher-1');
      expect(first.created).toBe(true);

      const second = await service.assign('course-2', 'assistant-2', 'teacher-1');
      expect(second.created).toBe(false);
      expect(second.assignment.id).toBe(first.assignment.id);
    });

    it('should grant access that assertAssigned immediately honours', async () => {
      await expect(
        service.assertAssigned('course-2', UNASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);

      await service.assign('course-2', 'assistant-2', 'teacher-1');

      await expect(
        service.assertAssigned('course-2', UNASSIGNED_TA),
      ).resolves.toMatchObject({ courseId: 'course-2' });
    });

    it('should revoke access on unassign', async () => {
      expect(await service.unassign('course-1', 'assistant-1')).toBe(true);
      await expect(
        service.assertAssigned('course-1', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should report false when there was nothing to unassign', async () => {
      expect(await service.unassign('course-2', 'assistant-1')).toBe(false);
    });
  });
});
