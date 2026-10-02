import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import type {
  WeeklyReport,
  WeeklyReportContent,
  WeeklyReportRepository,
  WeeklyReportWeek,
} from '../interfaces/weekly-report-repository.interface.js';

interface WeeklyReportRow {
  id: string;
  group_id: string;
  student_id: string;
  course_id: string;
  week_start: string; // cast to ::text in every SELECT - no Date, no timezone shift
  status: 'draft' | 'published';
  content: WeeklyReportContent;
  generated_at: Date;
  published_at: Date | null;
  published_by: string | null;
}

/** `content` round-trips through `jsonb` as an already-parsed object. */
const COLUMNS =
  'id, group_id, student_id, course_id, week_start::text AS week_start, status, content, generated_at, published_at, published_by';

function toWeeklyReport(row: WeeklyReportRow): WeeklyReport {
  return {
    id: row.id,
    groupId: row.group_id,
    studentId: row.student_id,
    courseId: row.course_id,
    weekStart: row.week_start,
    status: row.status,
    content: row.content,
    generatedAt: iso(row.generated_at),
    publishedAt: isoOrNull(row.published_at),
    publishedBy: row.published_by,
  };
}

@Injectable()
export class PostgresWeeklyReportRepository implements WeeklyReportRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * One round trip. `ON CONFLICT ... DO UPDATE ... WHERE status = 'draft'`
   * keeps the "never touches a published row" guard in SQL, not only in the
   * caller: a published row conflicts, the WHERE fails, nothing is written
   * and nothing is returned - `queryOne` sees no row, which is 'skipped'.
   *
   * `xmax = 0` on PG distinguishes a row this statement just inserted (no
   * deleting/updating transaction has touched it yet) from one it updated.
   */
  async upsertDraft(input: {
    groupId: string;
    studentId: string;
    courseId: string;
    weekStart: string;
    content: WeeklyReportContent;
    generatedAt: string;
  }): Promise<'inserted' | 'updated' | 'skipped'> {
    const row = await this.db.queryOne<{ inserted: boolean }>(
      `INSERT INTO weekly_reports
         (id, group_id, student_id, course_id, week_start, status, content, generated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
       ON CONFLICT (group_id, student_id, week_start) DO UPDATE
         SET content = EXCLUDED.content,
             generated_at = EXCLUDED.generated_at,
             updated_at = now()
         WHERE weekly_reports.status = 'draft'
       RETURNING (xmax = 0) AS inserted`,
      [
        randomUUID(),
        input.groupId,
        input.studentId,
        input.courseId,
        input.weekStart,
        JSON.stringify(input.content),
        input.generatedAt,
      ],
    );
    if (!row) return 'skipped';
    return row.inserted ? 'inserted' : 'updated';
  }

  async findByGroupWeek(groupId: string, weekStart: string): Promise<WeeklyReport[]> {
    const rows = await this.db.query<WeeklyReportRow>(
      `SELECT ${COLUMNS} FROM weekly_reports WHERE group_id = $1 AND week_start = $2
       ORDER BY student_id`,
      [groupId, weekStart],
    );
    return rows.map(toWeeklyReport);
  }

  async listWeeks(): Promise<WeeklyReportWeek[]> {
    const rows = await this.db.query<{
      group_id: string;
      week_start: string;
      drafts: string;
      published: string;
    }>(
      `SELECT group_id, week_start::text AS week_start,
              count(*) FILTER (WHERE status = 'draft') AS drafts,
              count(*) FILTER (WHERE status = 'published') AS published
         FROM weekly_reports
        GROUP BY group_id, week_start
        ORDER BY week_start DESC, group_id`,
    );
    return rows.map((r) => ({
      groupId: r.group_id,
      weekStart: r.week_start,
      drafts: Number(r.drafts),
      published: Number(r.published),
    }));
  }

  async publishGroupWeek(
    groupId: string,
    weekStart: string,
    publishedBy: string,
    at: string,
  ): Promise<WeeklyReport[]> {
    const rows = await this.db.query<WeeklyReportRow>(
      `UPDATE weekly_reports
          SET status = 'published', published_at = $4, published_by = $3, updated_at = now()
        WHERE group_id = $1 AND week_start = $2 AND status = 'draft'
       RETURNING ${COLUMNS}`,
      [groupId, weekStart, publishedBy, at],
    );
    return rows.map(toWeeklyReport);
  }

  async findPublishedForStudent(studentId: string): Promise<WeeklyReport[]> {
    const rows = await this.db.query<WeeklyReportRow>(
      `SELECT ${COLUMNS} FROM weekly_reports
        WHERE student_id = $1 AND status = 'published'
        ORDER BY week_start DESC`,
      [studentId],
    );
    return rows.map(toWeeklyReport);
  }
}
