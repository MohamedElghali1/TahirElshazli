import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull, numOrNull } from '../../database/database.types.js';
import type {
  ExternalResult,
  GoogleFormBinding,
  NewExternalResult,
  NewGoogleFormBinding,
  ResultProvider,
  ResultTally,
  WorkRepository,
} from '../interfaces/work-repository.interface.js';

interface BindingRow {
  assessment_id: string;
  form_id: string;
  responder_uri: string;
  title: string;
  is_quiz: boolean;
  total_points: number | null;
  collects_email: boolean | null;
  bound_at: Date;
  last_synced_at: Date | null;
  last_sync_error: string | null;
}

interface ResultRow {
  id: string;
  assessment_id: string;
  provider: ResultProvider;
  external_id: string;
  student_id: string | null;
  respondent_id: string | null;
  // NUMERIC arrives as a string from `pg` - it can exceed MAX_SAFE_INTEGER, so
  // the driver refuses to guess. `numOrNull` is the shared conversion.
  score: string | null;
  max_score: string | null;
  submitted_at: Date;
  raw: unknown;
  synced_at: Date;
}

const SELECT_BINDING = `
  SELECT assessment_id, form_id, responder_uri, title, is_quiz, total_points,
         collects_email, bound_at, last_synced_at, last_sync_error
    FROM assessment_google_forms`;

const SELECT_RESULT = `
  SELECT id, assessment_id, provider, external_id, student_id, respondent_id,
         score, max_score, submitted_at, raw, synced_at
    FROM external_results`;

function toBinding(row: BindingRow): GoogleFormBinding {
  return {
    assessmentId: row.assessment_id,
    formId: row.form_id,
    responderUri: row.responder_uri,
    title: row.title,
    isQuiz: row.is_quiz,
    totalPoints: row.total_points,
    collectsEmail: row.collects_email,
    boundAt: iso(row.bound_at),
    lastSyncedAt: isoOrNull(row.last_synced_at),
    lastSyncError: row.last_sync_error,
  };
}

function toResult(row: ResultRow): ExternalResult {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    provider: row.provider,
    externalId: row.external_id,
    studentId: row.student_id,
    respondentId: row.respondent_id,
    score: numOrNull(row.score),
    maxScore: numOrNull(row.max_score),
    submittedAt: iso(row.submitted_at),
    raw: row.raw,
    syncedAt: iso(row.synced_at),
  };
}

@Injectable()
export class PostgresWorkRepository implements WorkRepository {
  constructor(private readonly db: DatabaseService) {}

  async findBinding(assessmentId: string): Promise<GoogleFormBinding | null> {
    const row = await this.db.queryOne<BindingRow>(
      `${SELECT_BINDING} WHERE assessment_id = $1`,
      [assessmentId],
    );
    return row ? toBinding(row) : null;
  }

  async findBindings(
    assessmentIds: readonly string[],
  ): Promise<Record<string, GoogleFormBinding>> {
    if (assessmentIds.length === 0) {
      // `= ANY('{}')` is valid but the round trip is not: an empty list is the
      // common case on a course with no form-based work.
      return {};
    }
    const rows = await this.db.query<BindingRow>(
      `${SELECT_BINDING} WHERE assessment_id = ANY($1)`,
      [assessmentIds],
    );
    return Object.fromEntries(
      rows.map((row) => [row.assessment_id, toBinding(row)]),
    );
  }

  async upsertBinding(
    input: NewGoogleFormBinding,
  ): Promise<GoogleFormBinding> {
    // `bound_at` is deliberately absent from the UPDATE list: when the form was
    // first attached is a fact about this task, and a metadata refresh must not
    // move it. `last_sync_error` is cleared, because re-binding is the fix for
    // the errors it holds.
    const row = await this.db.queryOne<BindingRow>(
      `INSERT INTO assessment_google_forms
         (assessment_id, form_id, responder_uri, title, is_quiz, total_points,
          collects_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (assessment_id) DO UPDATE SET
         form_id         = EXCLUDED.form_id,
         responder_uri   = EXCLUDED.responder_uri,
         title           = EXCLUDED.title,
         is_quiz         = EXCLUDED.is_quiz,
         total_points    = EXCLUDED.total_points,
         collects_email  = EXCLUDED.collects_email,
         last_sync_error = NULL
       RETURNING assessment_id, form_id, responder_uri, title, is_quiz,
                 total_points, collects_email, bound_at, last_synced_at,
                 last_sync_error`,
      [
        input.assessmentId,
        input.formId,
        input.responderUri,
        input.title,
        input.isQuiz,
        input.totalPoints,
        input.collectsEmail,
      ],
    );
    return toBinding(row!);
  }

  async removeBinding(assessmentId: string): Promise<boolean> {
    const rows = await this.db.query<{ assessment_id: string }>(
      `DELETE FROM assessment_google_forms WHERE assessment_id = $1
       RETURNING assessment_id`,
      [assessmentId],
    );
    return rows.length > 0;
  }

  async markSynced(assessmentId: string, error: string | null): Promise<void> {
    // `last_synced_at` advances only on success, so the screen cannot say
    // "synced just now" above numbers that failed to refresh.
    await this.db.query(
      `UPDATE assessment_google_forms
          SET last_sync_error = $2,
              last_synced_at  = CASE WHEN $2::text IS NULL
                                     THEN now() ELSE last_synced_at END
        WHERE assessment_id = $1`,
      [assessmentId, error],
    );
  }

  async replaceResults(
    assessmentId: string,
    provider: ResultProvider,
    incoming: readonly NewExternalResult[],
  ): Promise<ExternalResult[]> {
    return this.db.runInTransaction(async () => {
      // Upsert every incoming row, then delete whatever was not in the payload.
      // That order matters: deleting first would drop the manual attributions
      // the COALESCE below is protecting, and would briefly empty the table for
      // any concurrent reader - inside a transaction nobody sees it, but the
      // window would be real on a driver without one.
      const kept: string[] = [];
      const out: ExternalResult[] = [];

      for (const result of incoming) {
        const row = await this.db.queryOne<ResultRow>(
          `INSERT INTO external_results
             (id, assessment_id, provider, external_id, student_id,
              respondent_id, score, max_score, submitted_at, raw, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (assessment_id, provider, external_id) DO UPDATE SET
             -- COALESCE, not EXCLUDED: a staff member who manually attributed
             -- this response is invisible to the provider, so taking the
             -- incoming value unconditionally would silently undo the
             -- reconciliation on the very next sync.
             student_id    = COALESCE(external_results.student_id,
                                      EXCLUDED.student_id),
             respondent_id = EXCLUDED.respondent_id,
             score         = EXCLUDED.score,
             max_score     = EXCLUDED.max_score,
             submitted_at  = EXCLUDED.submitted_at,
             raw           = EXCLUDED.raw,
             synced_at     = now()
           RETURNING id, assessment_id, provider, external_id, student_id,
                     respondent_id, score, max_score, submitted_at, raw,
                     synced_at`,
          [
            randomUUID(),
            assessmentId,
            provider,
            result.externalId,
            result.studentId,
            result.respondentId,
            result.score,
            result.maxScore,
            result.submittedAt,
            JSON.stringify(result.raw ?? {}),
          ],
        );
        kept.push(row!.external_id);
        out.push(toResult(row!));
      }

      // Responses deleted upstream. `<> ALL` rather than NOT IN so a NULL in
      // the array cannot swallow the whole predicate; `kept` never contains one
      // today, which is exactly the kind of assumption worth not depending on.
      await this.db.query(
        `DELETE FROM external_results
          WHERE assessment_id = $1 AND provider = $2
            AND external_id <> ALL($3)`,
        [assessmentId, provider, kept],
      );

      return out;
    });
  }

  async findResults(assessmentId: string): Promise<ExternalResult[]> {
    const rows = await this.db.query<ResultRow>(
      `${SELECT_RESULT} WHERE assessment_id = $1 ORDER BY submitted_at DESC, id DESC`,
      [assessmentId],
    );
    return rows.map(toResult);
  }

  async findResultById(resultId: string): Promise<ExternalResult | null> {
    const row = await this.db.queryOne<ResultRow>(
      `${SELECT_RESULT} WHERE id = $1`,
      [resultId],
    );
    return row ? toResult(row) : null;
  }

  async findUnmatchedResults(assessmentId: string): Promise<ExternalResult[]> {
    const rows = await this.db.query<ResultRow>(
      `${SELECT_RESULT}
        WHERE assessment_id = $1 AND student_id IS NULL
        ORDER BY submitted_at DESC, id DESC`,
      [assessmentId],
    );
    return rows.map(toResult);
  }

  async findResultsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<ExternalResult[]> {
    if (assessmentIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<ResultRow>(
      `${SELECT_RESULT}
        WHERE assessment_id = ANY($1) AND student_id = $2
        ORDER BY submitted_at DESC, id DESC`,
      [assessmentIds, studentId],
    );
    return rows.map(toResult);
  }

  async attachResultToStudent(
    resultId: string,
    studentId: string,
  ): Promise<ExternalResult | null> {
    // `AND student_id IS NULL` in the predicate, not checked beforehand: it
    // makes the refusal atomic, so two staff members reconciling the same
    // response cannot both succeed and reassign a mark.
    const row = await this.db.queryOne<ResultRow>(
      `UPDATE external_results
          SET student_id = $2
        WHERE id = $1 AND student_id IS NULL
       RETURNING id, assessment_id, provider, external_id, student_id,
                 respondent_id, score, max_score, submitted_at, raw, synced_at`,
      [resultId, studentId],
    );
    return row ? toResult(row) : null;
  }

  async tallyResults(assessmentId: string): Promise<ResultTally> {
    const row = await this.db.queryOne<{
      matched: string;
      unmatched: string;
      average_score: string | null;
      average_max_score: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE student_id IS NOT NULL)     AS matched,
         COUNT(*) FILTER (WHERE student_id IS NULL)         AS unmatched,
         AVG(score)     FILTER (WHERE student_id IS NOT NULL
                                  AND score IS NOT NULL)    AS average_score,
         AVG(max_score) FILTER (WHERE student_id IS NOT NULL
                                  AND score IS NOT NULL)    AS average_max_score
       FROM external_results
      WHERE assessment_id = $1`,
      [assessmentId],
    );
    return {
      // COUNT returns bigint, so `pg` hands back a string.
      matched: Number(row?.matched ?? 0),
      unmatched: Number(row?.unmatched ?? 0),
      averageScore: numOrNull(row?.average_score ?? null),
      averageMaxScore: numOrNull(row?.average_max_score ?? null),
    };
  }

  async countResultsByAssessments(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<Record<string, number>> {
    if (assessmentIds.length === 0) {
      return {};
    }
    const rows = await this.db.query<{ assessment_id: string; count: string }>(
      `SELECT assessment_id, COUNT(*) AS count
         FROM external_results
        WHERE assessment_id = ANY($1) AND student_id = $2
        GROUP BY assessment_id`,
      [assessmentIds, studentId],
    );
    return Object.fromEntries(
      rows.map((row) => [row.assessment_id, Number(row.count)]),
    );
  }
}
