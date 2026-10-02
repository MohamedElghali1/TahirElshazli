import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  WeeklyReport,
  WeeklyReportRepository,
  WeeklyReportWeek,
} from '../interfaces/weekly-report-repository.interface.js';

/**
 * Process-local, unbounded, starts empty - same convention as every other
 * `InMemory*Repository` here. Every read below returns a deep-enough copy:
 * `content` is the only nested object this table holds and it is replaced
 * wholesale on every write, never mutated in place, so copying the report
 * object and its `content` reference is enough to stop a caller's `before`
 * snapshot from aliasing a later `after` (CLAUDE.md §9).
 */
@Injectable()
export class InMemoryWeeklyReportRepository implements WeeklyReportRepository {
  private reports: WeeklyReport[] = [];

  private copy(report: WeeklyReport): WeeklyReport {
    return { ...report, content: JSON.parse(JSON.stringify(report.content)) };
  }

  async upsertDraft(input: {
    groupId: string;
    studentId: string;
    courseId: string;
    weekStart: string;
    content: WeeklyReport['content'];
    generatedAt: string;
  }): Promise<'inserted' | 'updated' | 'skipped'> {
    const existing = this.reports.find(
      (r) =>
        r.groupId === input.groupId &&
        r.studentId === input.studentId &&
        r.weekStart === input.weekStart,
    );
    if (!existing) {
      this.reports.push({
        id: randomUUID(),
        groupId: input.groupId,
        studentId: input.studentId,
        courseId: input.courseId,
        weekStart: input.weekStart,
        status: 'draft',
        content: JSON.parse(JSON.stringify(input.content)),
        generatedAt: input.generatedAt,
        publishedAt: null,
        publishedBy: null,
      });
      return 'inserted';
    }
    if (existing.status === 'published') return 'skipped';
    existing.content = JSON.parse(JSON.stringify(input.content));
    existing.generatedAt = input.generatedAt;
    return 'updated';
  }

  async findByGroupWeek(groupId: string, weekStart: string): Promise<WeeklyReport[]> {
    return this.reports
      .filter((r) => r.groupId === groupId && r.weekStart === weekStart)
      .sort((a, b) => a.studentId.localeCompare(b.studentId))
      .map((r) => this.copy(r));
  }

  async listWeeks(): Promise<WeeklyReportWeek[]> {
    const byKey = new Map<string, WeeklyReportWeek>();
    for (const r of this.reports) {
      const key = `${r.groupId}::${r.weekStart}`;
      const entry = byKey.get(key) ?? { groupId: r.groupId, weekStart: r.weekStart, drafts: 0, published: 0 };
      if (r.status === 'draft') entry.drafts += 1;
      else entry.published += 1;
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.weekStart !== b.weekStart) return b.weekStart.localeCompare(a.weekStart);
      return a.groupId.localeCompare(b.groupId);
    });
  }

  async publishGroupWeek(
    groupId: string,
    weekStart: string,
    publishedBy: string,
    at: string,
  ): Promise<WeeklyReport[]> {
    const flipped: WeeklyReport[] = [];
    for (const r of this.reports) {
      if (r.groupId === groupId && r.weekStart === weekStart && r.status === 'draft') {
        r.status = 'published';
        r.publishedAt = at;
        r.publishedBy = publishedBy;
        flipped.push(r);
      }
    }
    return flipped.map((r) => this.copy(r));
  }

  async findPublishedForStudent(studentId: string): Promise<WeeklyReport[]> {
    return this.reports
      .filter((r) => r.studentId === studentId && r.status === 'published')
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .map((r) => this.copy(r));
  }
}
