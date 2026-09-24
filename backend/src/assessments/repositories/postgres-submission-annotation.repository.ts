import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
  AnnotationFileCount,
  AnnotationKind,
  AnnotationPatch,
  AnnotationPoint,
  NewAnnotation,
  StoredAnnotation,
  SubmissionAnnotationRepository,
} from '../interfaces/submission-annotation-repository.interface.js';

interface AnnotationRow {
  id: string;
  submission_id: string;
  file_url: string;
  page: number;
  kind: AnnotationKind;
  /**
   * `NUMERIC(5,2)` arrives from `pg` as a **string** (unit-7 plan, finding 7).
   * Parsed in `toAnnotation`; without it the memory and Postgres drivers
   * disagree on type and the overlay computes with `"12.50"`.
   */
  x_percent: string;
  y_percent: string;
  text: string;
  /** JSONB arrives parsed. */
  path: AnnotationPoint[] | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `
  id, submission_id, file_url, page, kind, x_percent, y_percent, text, path,
  created_by, created_at, updated_at
`;

function toAnnotation(row: AnnotationRow): StoredAnnotation {
  return {
    id: row.id,
    submissionId: row.submission_id,
    fileUrl: row.file_url,
    page: row.page,
    kind: row.kind,
    xPercent: num(row.x_percent),
    yPercent: num(row.y_percent),
    text: row.text,
    path: row.path,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class PostgresSubmissionAnnotationRepository
  implements SubmissionAnnotationRepository
{
  constructor(private readonly db: DatabaseService) {}

  async findBySubmission(submissionId: string): Promise<StoredAnnotation[]> {
    const rows = await this.db.query<AnnotationRow>(
      `SELECT ${COLUMNS} FROM submission_annotations
        WHERE submission_id = $1
        ORDER BY page, created_at, id`,
      [submissionId],
    );
    return rows.map(toAnnotation);
  }

  async findById(annotationId: string): Promise<StoredAnnotation | null> {
    const row = await this.db.queryOne<AnnotationRow>(
      `SELECT ${COLUMNS} FROM submission_annotations WHERE id = $1`,
      [annotationId],
    );
    return row ? toAnnotation(row) : null;
  }

  async create(input: NewAnnotation): Promise<StoredAnnotation> {
    const row = await this.db.queryOne<AnnotationRow>(
      `INSERT INTO submission_annotations
         (id, submission_id, file_url, page, kind, x_percent, y_percent, text,
          path, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.submissionId,
        input.fileUrl,
        input.page,
        input.kind,
        input.xPercent,
        input.yPercent,
        input.text,
        // Serialised explicitly: `pg` would send nested arrays as a Postgres
        // array literal, which is not JSON.
        input.path === null ? null : JSON.stringify(input.path),
        input.createdBy,
      ],
    );
    return toAnnotation(row!);
  }

  async update(
    annotationId: string,
    patch: AnnotationPatch,
  ): Promise<StoredAnnotation | null> {
    // COALESCE per column, so `undefined` leaves a field alone without the SQL
    // being assembled from fragments (CLAUDE.md §8). None of these is
    // nullable-and-meaningful-to-clear, so no sentinel is needed.
    const row = await this.db.queryOne<AnnotationRow>(
      `UPDATE submission_annotations SET
         page       = COALESCE($2, page),
         x_percent  = COALESCE($3, x_percent),
         y_percent  = COALESCE($4, y_percent),
         text       = COALESCE($5, text),
         path       = COALESCE($6::jsonb, path),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        annotationId,
        patch.page ?? null,
        patch.xPercent ?? null,
        patch.yPercent ?? null,
        patch.text ?? null,
        patch.path === undefined ? null : JSON.stringify(patch.path),
      ],
    );
    return row ? toAnnotation(row) : null;
  }

  async remove(annotationId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM submission_annotations WHERE id = $1 RETURNING id',
      [annotationId],
    );
    return row !== null;
  }

  async countBySubmission(submissionId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*) AS count FROM submission_annotations WHERE submission_id = $1',
      [submissionId],
    );
    // COUNT is bigint: a string from `pg`.
    return num(row?.count ?? 0);
  }

  async countBySubmissionFiles(
    submissionIds: readonly string[],
  ): Promise<AnnotationFileCount[]> {
    if (submissionIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<{ submission_id: string; file_url: string; count: string }>(
      `SELECT submission_id, file_url, COUNT(*) AS count
         FROM submission_annotations
        WHERE submission_id = ANY($1::text[])
        GROUP BY submission_id, file_url`,
      [[...submissionIds]],
    );
    return rows.map((row) => ({
      submissionId: row.submission_id,
      fileUrl: row.file_url,
      count: num(row.count),
    }));
  }
}
