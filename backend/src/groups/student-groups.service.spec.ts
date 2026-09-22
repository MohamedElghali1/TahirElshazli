import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentGroupsService } from './student-groups.service.js';
import {
  GROUP_REPOSITORY,
  type GroupRepository,
} from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';

/**
 * The tie-break, on the **memory** driver.
 *
 * `PHASE_PLAN.md` §4.7 asked for this case and it did not ship with slice 2a;
 * review finding F2A-1. The rule - *longest-standing placement first* - is
 * implemented twice, in SQL at `postgres-group.repository.ts:228` and in
 * JavaScript at `in-memory-group.repository.ts`, and until now only the SQL
 * half was tested (`postgres-repositories.integration-spec.ts:993`). Deleting
 * the JavaScript comparator left all 471 unit tests green while a student in
 * two groups on one course saw one cohort's classmates and another's due dates.
 *
 * The test has to be able to fail, which means the insertion order and the
 * correct order must differ: `addMember` stamps `assignedAt` with the clock, so
 * appending is always chronological. Hence the fake timer - it places the
 * March group *before* the February one in the array, and only the comparator
 * puts them back.
 */
describe('StudentGroupsService', () => {
  let service: StudentGroupsService;
  let groups: GroupRepository;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentGroupsService,
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
      ],
    }).compile();

    service = moduleRef.get(StudentGroupsService);
    groups = moduleRef.get(GROUP_REPOSITORY);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the longest-standing placement first, not the insertion order', async () => {
    // student-1 already sits in group-1 (course-1), placed 2026-01-20.
    const march = await groups.create({
      name: 'Chemistry — Monday',
      teacherId: 'teacher-1',
      courseId: 'course-1',
      assistantId: null,
      meets: 'Monday 18:00',
      room: null,
    });
    const february = await groups.create({
      name: 'Chemistry — Wednesday',
      teacherId: 'teacher-1',
      courseId: 'course-1',
      assistantId: null,
      meets: 'Wednesday 18:00',
      room: null,
    });

    // Placed out of order on purpose: March is written first.
    vi.setSystemTime(new Date('2026-03-01T09:00:00Z'));
    await groups.addMember({
      groupId: march.id,
      studentId: 'student-1',
      assignedBy: 'teacher-1',
    });
    vi.setSystemTime(new Date('2026-02-01T09:00:00Z'));
    await groups.addMember({
      groupId: february.id,
      studentId: 'student-1',
      assignedBy: 'teacher-1',
    });

    const found = await service.groupsFor('course-1', 'student-1');

    expect(found.map((g) => g.id)).toEqual([
      'group-1',
      february.id,
      march.id,
    ]);
    expect(await service.groupIdsFor('course-1', 'student-1')).toEqual([
      'group-1',
      february.id,
      march.id,
    ]);
  });

  it('is empty for a student who is enrolled but not yet placed', async () => {
    expect(await service.groupsFor('course-1', 'student-3')).toEqual([]);
  });
});
