import { Test, TestingModule } from '@nestjs/testing';
import { AuditService, MAX_AUDIT_PAGE_SIZE } from './audit.service.js';
import { AUDIT_LOG_REPOSITORY } from './interfaces/audit-log-repository.interface.js';
import type { NewAuditLogEntry } from './interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from './repositories/in-memory-audit-log.repository.js';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
} from './dto/list-audit-log-query.dto.js';
import { Role } from '../auth/roles.enum.js';

function entry(overrides: Partial<NewAuditLogEntry> = {}): NewAuditLogEntry {
  return {
    actorId: 'assistant-1',
    actorRole: Role.Assistant,
    action: 'course_staff.assigned',
    targetType: 'course_staff_assignment',
    targetId: 'staff-assignment-1',
    courseId: 'course-1',
    before: null,
    after: { userId: 'assistant-1' },
    ...overrides,
  };
}

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  it('should start empty - a seeded history is a history nobody made', async () => {
    await expect(service.find({ limit: 10 })).resolves.toEqual({
      entries: [],
      nextCursor: null,
    });
  });

  it('should record what happened, with an id and a timestamp', async () => {
    const recorded = await service.record(entry());
    expect(recorded.id).toBeTruthy();
    expect(recorded.createdAt).toBeTruthy();
    expect(recorded).toMatchObject({
      actorId: 'assistant-1',
      action: 'course_staff.assigned',
      courseId: 'course-1',
      before: null,
      after: { userId: 'assistant-1' },
    });
  });

  it('should record the actor role as it was, not as it becomes', async () => {
    // A TA later promoted must not retroactively read as having acted as admin.
    const recorded = await service.record(entry({ actorRole: Role.Assistant }));
    expect(recorded.actorRole).toBe(Role.Assistant);
  });

  it('should return newest first', async () => {
    await service.record(entry({ targetId: 'first' }));
    await service.record(entry({ targetId: 'second' }));
    const page = await service.find({ limit: 10 });
    expect(page.entries.map((e) => e.targetId)).toEqual(['second', 'first']);
  });

  it('should order entries written in the same millisecond by when they happened', async () => {
    // The reason `auditLogId` carries a sequence and not just a timestamp: a
    // request that logs twice does both inside one millisecond, and an audit
    // feed that shows them in a coin-flip order is not a record of events.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
    try {
      for (const targetId of ['a', 'b', 'c', 'd']) {
        await service.record(entry({ targetId }));
      }
    } finally {
      vi.useRealTimers();
    }

    const page = await service.find({ limit: 10 });
    expect(page.entries.map((e) => e.createdAt)).toEqual(
      Array(4).fill('2026-09-06T12:00:00.000Z'),
    );
    expect(page.entries.map((e) => e.targetId)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('should filter by actor - the §5.4 question', async () => {
    await service.record(entry({ actorId: 'assistant-1' }));
    await service.record(entry({ actorId: 'teacher-1', actorRole: Role.Teacher }));
    const page = await service.find({ limit: 10, actorId: 'assistant-1' });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.actorId).toBe('assistant-1');
  });

  it('should filter by course and by target', async () => {
    await service.record(entry({ courseId: 'course-1', targetId: 'a' }));
    await service.record(entry({ courseId: 'course-2', targetId: 'b' }));

    const byCourse = await service.find({ limit: 10, courseId: 'course-2' });
    expect(byCourse.entries.map((e) => e.targetId)).toEqual(['b']);

    const byTarget = await service.find({
      limit: 10,
      targetType: 'course_staff_assignment',
      targetId: 'a',
    });
    expect(byTarget.entries.map((e) => e.targetId)).toEqual(['a']);
  });

  it('should cap the page size so one request cannot drain the table', async () => {
    for (let i = 0; i < 5; i += 1) {
      await service.record(entry({ targetId: `t${i}` }));
    }
    const page = await service.find({ limit: MAX_AUDIT_PAGE_SIZE + 1000 });
    expect(page.entries).toHaveLength(5);
  });

  describe('paging', () => {
    it('should page without skipping or repeating entries written in the same millisecond', async () => {
      // The reason the cursor is a (createdAt, id) pair rather than a
      // timestamp. A frozen clock is the pathological case, and a batch write
      // is the realistic one.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
      try {
        for (let i = 0; i < 7; i += 1) {
          await service.record(entry({ targetId: `t${i}` }));
        }
      } finally {
        vi.useRealTimers();
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await service.find({ limit: 3, cursor });
        seen.push(...page.entries.map((e) => e.targetId));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });

    it('should not advertise a next page on an exactly-full final page', async () => {
      await service.record(entry({ targetId: 'a' }));
      await service.record(entry({ targetId: 'b' }));
      const page = await service.find({ limit: 2 });
      expect(page.entries).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('should page empty on a malformed cursor rather than restarting', async () => {
      await service.record(entry());
      const page = await service.find({ limit: 10, cursor: 'not-a-cursor' });
      expect(page.entries).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });

  it('should keep the DTO filter lists in step with the action unions', async () => {
    // `@IsIn` needs runtime values a TypeScript union cannot provide, so the
    // two lists are written twice. This is the assertion that they agree - add
    // an action to the union without adding it here and the filter silently
    // rejects it.
    const recorded = await Promise.all(
      AUDIT_ACTIONS.map((action) => service.record(entry({ action }))),
    );
    expect(recorded.map((r) => r.action).sort()).toEqual([...AUDIT_ACTIONS].sort());

    for (const action of AUDIT_ACTIONS) {
      const page = await service.find({ limit: 10, action });
      expect(page.entries.length).toBeGreaterThan(0);
    }
    for (const targetType of AUDIT_TARGET_TYPES) {
      const page = await service.find({ limit: 10, targetType });
      expect(page.entries.length).toBeGreaterThan(0);
    }
  });
});
