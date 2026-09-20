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
/**
 * The Full admin (AUTH-1). Unscoped for the same reason the teacher is, and
 * covered here because `isAdmin` is one line: if it is missed, an admin passes
 * `RolesGuard`, finds no assignment row and 404s on every course. The e2e parity
 * table would catch that, but this catches it a suite earlier.
 */
const FULL_ADMIN: StaffActor = { id: 'admin-1', role: 'admin' };

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

    it.each([
      ['the teacher', ADMIN],
      ['the full admin', FULL_ADMIN],
    ])('should let %s through without an assignment row', async (_label, actor) => {
      // §5.11: admin queries never join through CourseStaffAssignment.
      await expect(service.assertAssigned('course-2', actor)).resolves.toBeNull();
      await expect(
        service.assertAssigned('course-does-not-exist', actor),
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

    it.each([
      ['the teacher', ADMIN],
      ['the full admin', FULL_ADMIN],
    ])('should report %s as unscoped', async (_label, actor) => {
      await expect(service.scopeFor(actor)).resolves.toEqual({ unscoped: true });
    });

    it('should not treat any other role as unscoped', async () => {
      // A student or parent should never reach these services, but if a future
      // @Roles slip lets one through, the scope must still be a closed one.
      // 'ADMIN' is in the list on purpose: the comparison is case-sensitive
      // and must stay so, or a mis-cased role on a hand-made token is unscoped.
      for (const role of ['student', 'parent', 'visitor', '', 'ADMIN', 'administrator']) {
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
