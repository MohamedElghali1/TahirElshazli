import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  COURSE_NOT_IN_SCOPE,
  StaffScopeService,
  type StaffActor,
} from './staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from './interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from './repositories/in-memory-assistant-scope.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';

/**
 * Holds group-1, which studies course-1, and nothing else (see the in-memory
 * fixture). The name is kept from the course-scoped era on purpose: the seven
 * cases below are the authorization **contract**, and they pass unmodified
 * across the `AUTH-2` rewrite because the fixture reproduces the same reach at
 * the new grain. Renaming them would hide exactly what is being proved.
 */
const ASSIGNED_TA: StaffActor = { id: 'assistant-1', role: 'assistant' };
/** A TA with an explicit `assigned_groups` scope row and no groups at all. */
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
  let scopeRepo: InMemoryAssistantScopeRepository;
  let groupRepo: InMemoryGroupRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffScopeService,
        // The only permitted edit to this file's fixtures (ruling R-8): the
        // repository token changes, the assertions do not.
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
      ],
    }).compile();

    service = module.get(StaffScopeService);
    scopeRepo = module.get(ASSISTANT_SCOPE_REPOSITORY);
    groupRepo = module.get(GROUP_REPOSITORY);
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

  /**
   * **`AUTH-2`: the same questions, at the group grain.** These are new; the
   * seven above are the contract and are unmodified.
   *
   * `describe('assign and unassign')` used to sit here - four cases exercising
   * `StaffScopeService.assign`/`unassign`, which went with
   * `/admin/courses/:id/staff` and `course_staff_assignments`. Deleted under
   * coordinator ruling **R-8**, and their two behavioural properties are
   * restated below and in the repository contract rather than lost.
   */
  describe('AUTH-2: group-grained scope', () => {
    const ALL_GROUPS_TA: StaffActor = { id: 'assistant-2', role: 'assistant' };
    const NEVER_CONFIGURED: StaffActor = { id: 'assistant-9', role: 'assistant' };

    it('should let an all_groups assistant through on any course, holding no group', async () => {
      await scopeRepo.setScope('assistant-2', 'all_groups');
      await expect(
        service.assertAssigned('course-1', ALL_GROUPS_TA),
      ).resolves.toBeNull();
      await expect(
        service.assertAssigned('course-2', ALL_GROUPS_TA),
      ).resolves.toBeNull();
      expect(await scopeRepo.findAssignments('assistant-2')).toEqual([]);
    });

    it('should report an all_groups assistant as unscoped (ruling R-7)', async () => {
      // `unscoped` means *unrestricted*, not *admin*. Their reach IS the
      // platform, so `manage.service`'s 'platform' label stays accurate.
      await scopeRepo.setScope('assistant-2', 'all_groups');
      await expect(service.scopeFor(ALL_GROUPS_TA)).resolves.toEqual({
        unscoped: true,
      });
    });

    it('should report the EARLIEST grant when two held groups reach one course (R-4)', async () => {
      // A second group studying course-1, granted later. The roll-up answers
      // "since when" for the course, which is the oldest of the two.
      const second = await groupRepo.create({
        name: 'Chemistry - Monday',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      await scopeRepo.assignGroup('assistant-1', second.id, 'teacher-1');

      const reach = await service.assertAssigned('course-1', ASSIGNED_TA);
      expect(reach?.assignedAt).toBe('2026-02-01T09:00:00Z');

      const scope = await service.scopeFor(ASSIGNED_TA);
      if (scope.unscoped) throw new Error('expected a scoped result');
      expect(scope.assignments).toHaveLength(1);
      expect(scope.assignments[0]?.assignedAt).toBe('2026-02-01T09:00:00Z');
    });

    it('should fail closed for an assistant with no scope row at all, both ways', async () => {
      // Never configured is the third state, and it is not a free pass.
      // Migration 015 backfills a row for every assistant so this should be
      // unreachable - "should be" is not a guarantee.
      await expect(
        service.assertAssigned('course-1', NEVER_CONFIGURED),
      ).rejects.toThrow(NotFoundException);
      await expect(service.scopeFor(NEVER_CONFIGURED)).resolves.toEqual({
        unscoped: false,
        assignments: [],
      });
    });

    it('should refuse an out-of-scope course with the exported message, byte for byte', async () => {
      // Compared against the genuine-miss path IN THE SAME TEST, and against
      // the `const` the service throws. A spec comparing each against its own
      // literal would pass while the anti-enumeration property was gone.
      const denied = await service
        .assertAssigned('course-2', ASSIGNED_TA)
        .catch((error: Error) => error.message);
      const missing = await service
        .assertAssigned('course-does-not-exist', ASSIGNED_TA)
        .catch((error: Error) => error.message);
      expect(denied).toBe(missing);
      expect(denied).toBe(COURSE_NOT_IN_SCOPE);
    });

    it('should honour a grant immediately, and a revocation immediately', async () => {
      // The replacement for the deleted `assign`/`unassign` cases, at the group
      // grain: granting group-2 grants course-2, revoking it takes it back.
      await expect(
        service.assertAssigned('course-2', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);

      await scopeRepo.assignGroup('assistant-1', 'group-2', 'teacher-1');
      await expect(
        service.assertAssigned('course-2', ASSIGNED_TA),
      ).resolves.toMatchObject({ courseId: 'course-2' });

      expect(await scopeRepo.unassignGroup('assistant-1', 'group-2')).toBe(true);
      await expect(
        service.assertAssigned('course-2', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should be idempotent on a repeated grant, and report which happened', async () => {
      // The deleted suite's first property, moved to where it belongs: the
      // repository contract, asserted in both drivers (the Postgres half is in
      // `postgres-repositories.integration-spec.ts`).
      const first = await scopeRepo.assignGroup(
        'assistant-2',
        'group-2',
        'teacher-1',
      );
      expect(first.created).toBe(true);
      const second = await scopeRepo.assignGroup(
        'assistant-2',
        'group-2',
        'teacher-1',
      );
      expect(second.created).toBe(false);
      expect(second.assignment.id).toBe(first.assignment.id);
      expect(await scopeRepo.unassignGroup('assistant-2', 'group-2')).toBe(true);
      expect(await scopeRepo.unassignGroup('assistant-2', 'group-2')).toBe(false);
    });
  });

  /**
   * `D-10`'s predicate. Non-throwing on purpose: `GroupsService` owns the
   * message, so an out-of-scope group and a missing one are refused by one
   * `throw` rather than two that can drift apart by a byte.
   */
  describe('mayReachGroup', () => {
    it('should be true for a held group and false for one the assistant does not hold', async () => {
      expect(await service.mayReachGroup('group-1', ASSIGNED_TA)).toBe(true);
      expect(await service.mayReachGroup('group-2', ASSIGNED_TA)).toBe(false);
      expect(await service.mayReachGroup('group-1', UNASSIGNED_TA)).toBe(false);
    });

    it('should be true for an admin and for an all_groups assistant, held or not', async () => {
      expect(await service.mayReachGroup('group-2', ADMIN)).toBe(true);
      expect(await service.mayReachGroup('group-2', FULL_ADMIN)).toBe(true);
      await scopeRepo.setScope('assistant-2', 'all_groups');
      expect(await service.mayReachGroup('group-2', UNASSIGNED_TA)).toBe(true);
    });

    it('should be false for an assistant with no scope row, and for a non-staff role', async () => {
      expect(
        await service.mayReachGroup('group-1', {
          id: 'assistant-9',
          role: 'assistant',
        }),
      ).toBe(false);
      expect(
        await service.mayReachGroup('group-1', {
          id: 'student-1',
          role: 'student',
        }),
      ).toBe(false);
    });
  });
});
