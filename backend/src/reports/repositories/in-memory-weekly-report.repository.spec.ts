import { describe, expect, it } from 'vitest';
import { InMemoryWeeklyReportRepository } from './in-memory-weekly-report.repository.js';
import type { WeeklyReportContent } from '../interfaces/weekly-report-repository.interface.js';

const content = (presentCount: number): WeeklyReportContent => ({
  attendance: {
    present: presentCount,
    late: 0,
    absent: 0,
    unmarked: 0,
    expected: presentCount,
    sessions: [],
  },
  homework: { due: 0, submitted: 0, tasks: [] },
});

function repo() {
  return new InMemoryWeeklyReportRepository();
}

describe('InMemoryWeeklyReportRepository', () => {
  it('inserts on first write, updates in place on the same key, never aliases content', async () => {
    const r = repo();
    const before = content(1);
    expect(
      await r.upsertDraft({
        groupId: 'group-1',
        studentId: 'student-1',
        courseId: 'course-1',
        weekStart: '2026-10-03',
        content: before,
        generatedAt: '2026-10-03T00:00:00.000Z',
      }),
    ).toBe('inserted');

    const [stored] = await r.findByGroupWeek('group-1', '2026-10-03');
    expect(stored.content).toEqual(content(1));
    // Mutating the input object after the call must not reach the stored copy.
    before.attendance.present = 999;
    const [stillStored] = await r.findByGroupWeek('group-1', '2026-10-03');
    expect(stillStored.content.attendance.present).toBe(1);

    const updated = await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(2),
      generatedAt: '2026-10-04T00:00:00.000Z',
    });
    expect(updated).toBe('updated');
    const [refreshed] = await r.findByGroupWeek('group-1', '2026-10-03');
    expect(refreshed.content.attendance.present).toBe(2);
    expect(refreshed.generatedAt).toBe('2026-10-04T00:00:00.000Z');
  });

  it('publish flips drafts, sets publishedAt/By, and a second publish of the same group-week returns nothing', async () => {
    const r = repo();
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-2',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });

    const flipped = await r.publishGroupWeek('group-1', '2026-10-03', 'teacher-1', '2026-10-05T00:00:00.000Z');
    expect(flipped).toHaveLength(2);
    for (const row of flipped) {
      expect(row.status).toBe('published');
      expect(row.publishedAt).toBe('2026-10-05T00:00:00.000Z');
      expect(row.publishedBy).toBe('teacher-1');
    }

    const secondAttempt = await r.publishGroupWeek('group-1', '2026-10-03', 'teacher-1', '2026-10-06T00:00:00.000Z');
    expect(secondAttempt).toEqual([]);
  });

  it('upsertDraft after publish is skipped and leaves the published content byte-for-byte unchanged', async () => {
    const r = repo();
    const originalContent = content(1);
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: originalContent,
      generatedAt: '2026-10-03T00:00:00.000Z',
    });
    await r.publishGroupWeek('group-1', '2026-10-03', 'teacher-1', '2026-10-05T00:00:00.000Z');

    const result = await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(999),
      generatedAt: '2026-10-09T00:00:00.000Z',
    });
    expect(result).toBe('skipped');

    const [stored] = await r.findByGroupWeek('group-1', '2026-10-03');
    expect(stored.content).toEqual(originalContent);
    expect(stored.generatedAt).toBe('2026-10-03T00:00:00.000Z');
  });

  it('findPublishedForStudent never returns drafts or another student\'s rows', async () => {
    const r = repo();
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });
    // Only student-1's draft exists when the group-week is published, so
    // only their row is flipped; student-2's draft arrives after.
    await r.publishGroupWeek('group-1', '2026-10-03', 'teacher-1', '2026-10-05T00:00:00.000Z');
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-2',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });

    const student1Reports = await r.findPublishedForStudent('student-1');
    expect(student1Reports).toHaveLength(1);
    expect(student1Reports[0].studentId).toBe('student-1');

    const student2Reports = await r.findPublishedForStudent('student-2');
    expect(student2Reports).toEqual([]);
  });

  it('listWeeks counts drafts and published per group-week', async () => {
    const r = repo();
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-1',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });
    await r.upsertDraft({
      groupId: 'group-1',
      studentId: 'student-2',
      courseId: 'course-1',
      weekStart: '2026-10-03',
      content: content(1),
      generatedAt: '2026-10-03T00:00:00.000Z',
    });
    await r.publishGroupWeek('group-1', '2026-10-03', 'teacher-1', '2026-10-05T00:00:00.000Z');
    await r.upsertDraft({
      groupId: 'group-2',
      studentId: 'student-3',
      courseId: 'course-2',
      weekStart: '2026-09-26',
      content: content(1),
      generatedAt: '2026-09-26T00:00:00.000Z',
    });

    const weeks = await r.listWeeks();
    expect(weeks).toEqual([
      { groupId: 'group-1', weekStart: '2026-10-03', drafts: 0, published: 2 },
      { groupId: 'group-2', weekStart: '2026-09-26', drafts: 1, published: 0 },
    ]);
  });
});
