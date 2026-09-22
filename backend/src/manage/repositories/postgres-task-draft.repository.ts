import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  AssessmentType,
  Attachment,
} from '../../assessments/interfaces/assessment-repository.interface.js';
import type { WorkType } from '../../assessments/interfaces/work-repository.interface.js';
import type {
  NewTaskDraft,
  StoredTaskDraft,
  TaskDraftFilter,
  TaskDraftRepository,
  TaskDraftUpdate,
} from '../interfaces/task-draft-repository.interface.js';

interface TaskDraftRow {
  id: string;
  course_id: string;
  type: AssessmentType;
  work_type: WorkType;
  title: string;
  description: string;
  instructions: string;
  /** JSONB arrives parsed. */
  attachments: Attachment[];
  used_count: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `
  id, course_id, type, work_type, title, description, instructions,
  attachments, used_count, created_by, created_at, updated_at
`;

function toDraft(row: TaskDraftRow): StoredTaskDraft {
  return {
    id: row.id,
    courseId: row.course_id,
    type: row.type,
    workType: row.work_type,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    attachments: row.attachments,
    usedCount: row.used_count,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class PostgresTaskDraftRepository implements TaskDraftRepository {
  constructor(private readonly db: DatabaseService) {}

  async findMany(filter: TaskDraftFilter): Promise<StoredTaskDraft[]> {
    if (filter.courseIds !== null && filter.courseIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<TaskDraftRow>(
      `SELECT ${COLUMNS}
         FROM task_drafts
        WHERE ($1::text[] IS NULL OR course_id = ANY($1::text[]))
          AND ($2::text IS NULL OR course_id = $2)
          AND ($3::text IS NULL OR type = $3)
        ORDER BY updated_at DESC, id`,
      [
        filter.courseIds === null ? null : [...filter.courseIds],
        filter.courseId ?? null,
        filter.type ?? null,
      ],
    );
    return rows.map(toDraft);
  }

  async findById(id: string): Promise<StoredTaskDraft | null> {
    const row = await this.db.queryOne<TaskDraftRow>(
      `SELECT ${COLUMNS} FROM task_drafts WHERE id = $1`,
      [id],
    );
    return row ? toDraft(row) : null;
  }

  async create(input: NewTaskDraft): Promise<StoredTaskDraft> {
    const row = await this.db.queryOne<TaskDraftRow>(
      `INSERT INTO task_drafts
         (id, course_id, type, work_type, title, description, instructions,
          attachments, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.courseId,
        input.type,
        input.workType,
        input.title,
        input.description,
        input.instructions,
        // Serialised explicitly: `pg` would send a JS array as a Postgres array
        // literal, which is not JSON.
        JSON.stringify(input.attachments),
        input.createdBy,
      ],
    );
    return toDraft(row as TaskDraftRow);
  }

  /**
   * COALESCE against each column's own value, so `undefined` leaves it alone
   * without assembling the statement from fragments (CLAUDE.md §8). Every
   * column here is NOT NULL, so no sentinel is needed.
   */
  async update(id: string, patch: TaskDraftUpdate): Promise<StoredTaskDraft | null> {
    const row = await this.db.queryOne<TaskDraftRow>(
      `UPDATE task_drafts SET
         type         = COALESCE($2, type),
         work_type    = COALESCE($3, work_type),
         title        = COALESCE($4, title),
         description  = COALESCE($5, description),
         instructions = COALESCE($6, instructions),
         attachments  = COALESCE($7::jsonb, attachments),
         updated_at   = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        patch.type ?? null,
        patch.workType ?? null,
        patch.title ?? null,
        patch.description ?? null,
        patch.instructions ?? null,
        patch.attachments === undefined ? null : JSON.stringify(patch.attachments),
      ],
    );
    return row ? toDraft(row) : null;
  }

  async remove(id: string): Promise<boolean> {
    // `assessments.draft_id` goes to NULL through ON DELETE SET NULL; the
    // tasks authored from this draft keep every word of their content.
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM task_drafts WHERE id = $1 RETURNING id',
      [id],
    );
    return row !== null;
  }

  async incrementUsedCount(
    id: string,
    courseId: string,
  ): Promise<StoredTaskDraft | null> {
    // One statement: atomic, and it takes the row lock that holds off a
    // concurrent DELETE until the surrounding transaction commits.
    const row = await this.db.queryOne<TaskDraftRow>(
      `UPDATE task_drafts SET used_count = used_count + 1
        WHERE id = $1 AND course_id = $2
       RETURNING ${COLUMNS}`,
      [id, courseId],
    );
    return row ? toDraft(row) : null;
  }
}
