import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull, num } from '../../database/database.types.js';
import type {
  AssessmentFilter,
  AssessmentRepository,
  AssessmentTarget,
  AssessmentType,
  AssessmentUpdate,
  NewAssessment,
  NewAssessmentTarget,
  StoredAssessment,
  StoredSubmission,
  SubmissionRevision,
  TargetedAssessment,
} from '../interfaces/assessment-repository.interface.js';
import type { WorkType } from '../interfaces/work-repository.interface.js';

interface AssessmentRow {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  topics: string[];
  available_from: Date;
  available_to: Date;
  due_at: Date;
  max_score: number;
  allowed_file_types: string[];
  max_file_size_bytes: string;
  work_type: WorkType;
  external_url: string | null;
  created_at: Date;
}

/**
 * `findByCourseForGroups` and `findByIdForGroups` return the assessment with the
 * window already coalesced, plus the two extra columns that say which group
 * made it visible and whether the window came from that group's override.
 */
interface TargetedAssessmentRow extends AssessmentRow {
  target_group_id: string;
  window_overridden: boolean;
}

interface AssessmentTargetRow {
  id: string;
  assessment_id: string;
  group_id: string;
  available_from: Date | null;
  available_to: Date | null;
  due_at: Date | null;
}

interface SubmissionRow {
  id: string;
  assessment_id: string;
  student_id: string;
  file_url: string | null;
  answer_text: string | null;
  submitted_at: Date;
  last_submitted_at: Date;
  updated_at: Date;
  score: number | null;
  corrected_at: Date | null;
  feedback: string | null;
  annotated_file_url: string | null;
}

interface RevisionRow {
  id: string;
  submission_id: string;
  file_url: string | null;
  answer_text: string | null;
  submitted_at: Date;
  replaced_at: Date;
}

const ASSESSMENT_COLUMNS = `
  id, course_id, lesson_id, title, description, instructions, type, topics,
  available_from, available_to, due_at, max_score, allowed_file_types,
  max_file_size_bytes, work_type, external_url, created_at
`;

const SUBMISSION_COLUMNS = `
  id, assessment_id, student_id, file_url, answer_text, submitted_at,
  last_submitted_at, updated_at, score, corrected_at, feedback, annotated_file_url
`;

function toAssessment(row: AssessmentRow): StoredAssessment {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    type: row.type,
    topics: row.topics,
    availableFrom: iso(row.available_from),
    availableTo: iso(row.available_to),
    dueAt: iso(row.due_at),
    maxScore: row.max_score,
    allowedFileTypes: row.allowed_file_types,
    maxFileSizeBytes: num(row.max_file_size_bytes),
    workType: row.work_type,
    externalUrl: row.external_url,
    createdAt: iso(row.created_at),
  };
}

function toTargetedAssessment(row: TargetedAssessmentRow): TargetedAssessment {
  // The window on the row is already coalesced by the query, so this is
  // `toAssessment` plus the two columns that say where it came from. Doing the
  // COALESCE in SQL rather than here is what keeps `computeStatus` (CLAUDE.md
  // §5.10) ignorant of targeting entirely.
  return {
    ...toAssessment(row),
    targetGroupId: row.target_group_id,
    windowOverridden: row.window_overridden,
  };
}

function toTarget(row: AssessmentTargetRow): AssessmentTarget {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    groupId: row.group_id,
    availableFrom: isoOrNull(row.available_from),
    availableTo: isoOrNull(row.available_to),
    dueAt: isoOrNull(row.due_at),
  };
}

function toSubmission(row: SubmissionRow): StoredSubmission {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    studentId: row.student_id,
    fileUrl: row.file_url,
    answerText: row.answer_text,
    submittedAt: iso(row.submitted_at),
    lastSubmittedAt: iso(row.last_submitted_at),
    updatedAt: iso(row.updated_at),
    score: row.score,
    correctedAt: isoOrNull(row.corrected_at),
    feedback: row.feedback,
    annotatedFileUrl: row.annotated_file_url,
  };
}

function toRevision(row: RevisionRow): SubmissionRevision {
  return {
    id: row.id,
    submissionId: row.submission_id,
    fileUrl: row.file_url,
    answerText: row.answer_text,
    submittedAt: iso(row.submitted_at),
    replacedAt: iso(row.replaced_at),
  };
}

@Injectable()
export class PostgresAssessmentRepository implements AssessmentRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByCourse(
    courseId: string,
    filter?: AssessmentFilter,
  ): Promise<StoredAssessment[]> {
    const rows = await this.db.query<AssessmentRow>(
      `SELECT ${ASSESSMENT_COLUMNS}
       FROM assessments
       WHERE course_id = $1
         AND ($2::text IS NULL OR type = $2)
       ORDER BY due_at DESC`,
      [courseId, filter?.type ?? null],
    );
    return rows.map(toAssessment);
  }

  /**
   * The student read (CLAUDE.md §5.16). One query: the assessments of this
   * course targeted at any of these groups, with COALESCE applying each
   * target's overrides.
   *
   * `DISTINCT ON (a.id)` with the ORDER BY below is what makes a student in two
   * groups see one row rather than two, and see it on the *longest-standing*
   * placement's terms: `array_position` ranks by the caller's group order,
   * which arrives longest-standing first from `StudentGroupsService`'s own
   * ordering. Without it a due date and a classmate list could resolve through
   * different groups for the same student, which is a support call nobody could
   * answer.
   *
   * The outer SELECT re-sorts, because DISTINCT ON dictates the inner order.
   */
  async findByCourseForGroups(
    courseId: string,
    groupIds: readonly string[],
    filter?: AssessmentFilter,
  ): Promise<TargetedAssessment[]> {
    if (groupIds.length === 0) {
      // A student with no group has been set no work (§5.16). Not a round trip
      // for a known-empty answer, matching every other batch read here.
      return [];
    }
    const rows = await this.db.query<TargetedAssessmentRow>(
      `SELECT * FROM (
         SELECT DISTINCT ON (a.id)
                a.id, a.course_id, a.lesson_id, a.title, a.description,
                a.instructions, a.type, a.topics,
                COALESCE(t.available_from, a.available_from) AS available_from,
                COALESCE(t.available_to,   a.available_to)   AS available_to,
                COALESCE(t.due_at,         a.due_at)         AS due_at,
                a.max_score, a.allowed_file_types, a.max_file_size_bytes,
              a.work_type, a.external_url,
                a.work_type, a.external_url,
                a.created_at,
                t.group_id AS target_group_id,
                (t.available_from IS NOT NULL
                  OR t.available_to IS NOT NULL
                  OR t.due_at IS NOT NULL) AS window_overridden
           FROM assessments a
           JOIN assessment_targets t ON t.assessment_id = a.id
          WHERE a.course_id = $1
            AND t.group_id = ANY($2)
            AND ($3::text IS NULL OR a.type = $3)
          ORDER BY a.id, array_position($2::text[], t.group_id)
       ) targeted
       ORDER BY due_at DESC`,
      [courseId, groupIds, filter?.type ?? null],
    );
    return rows.map(toTargetedAssessment);
  }

  async findByIdForGroups(
    assessmentId: string,
    groupIds: readonly string[],
  ): Promise<TargetedAssessment | null> {
    if (groupIds.length === 0) {
      return null;
    }
    const row = await this.db.queryOne<TargetedAssessmentRow>(
      `SELECT a.id, a.course_id, a.lesson_id, a.title, a.description,
              a.instructions, a.type, a.topics,
              COALESCE(t.available_from, a.available_from) AS available_from,
              COALESCE(t.available_to,   a.available_to)   AS available_to,
              COALESCE(t.due_at,         a.due_at)         AS due_at,
              a.max_score, a.allowed_file_types, a.max_file_size_bytes,
              a.work_type, a.external_url,
              a.created_at,
              t.group_id AS target_group_id,
              (t.available_from IS NOT NULL
                OR t.available_to IS NOT NULL
                OR t.due_at IS NOT NULL) AS window_overridden
         FROM assessments a
         JOIN assessment_targets t ON t.assessment_id = a.id
        WHERE a.id = $1 AND t.group_id = ANY($2)
        ORDER BY array_position($2::text[], t.group_id)
        LIMIT 1`,
      [assessmentId, groupIds],
    );
    return row ? toTargetedAssessment(row) : null;
  }

  async findById(assessmentId: string): Promise<StoredAssessment | null> {
    const row = await this.db.queryOne<AssessmentRow>(
      `SELECT ${ASSESSMENT_COLUMNS} FROM assessments WHERE id = $1`,
      [assessmentId],
    );
    return row ? toAssessment(row) : null;
  }

  async create(input: NewAssessment): Promise<StoredAssessment> {
    const row = await this.db.queryOne<AssessmentRow>(
      `INSERT INTO assessments
         (id, course_id, lesson_id, title, description, instructions, type,
          topics, available_from, available_to, due_at, max_score,
          allowed_file_types, max_file_size_bytes, work_type, external_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16)
       RETURNING ${ASSESSMENT_COLUMNS}`,
      [
        randomUUID(),
        input.courseId,
        input.lessonId,
        input.title,
        input.description,
        input.instructions,
        input.type,
        input.topics,
        input.availableFrom,
        input.availableTo,
        input.dueAt,
        input.maxScore,
        input.allowedFileTypes,
        input.maxFileSizeBytes,
        input.workType,
        input.externalUrl,
      ],
    );
    return toAssessment(row as AssessmentRow);
  }

  /**
   * A partial edit. Every column is written unconditionally from a COALESCE
   * against its own current value, so `undefined` leaves it alone without the
   * query being assembled from string fragments (CLAUDE.md §8: no string-built
   * SQL, ever, including the "safe" kind that only concatenates column names).
   */
  async update(
    assessmentId: string,
    update: AssessmentUpdate,
  ): Promise<StoredAssessment | null> {
    const row = await this.db.queryOne<AssessmentRow>(
      `UPDATE assessments SET
         title               = COALESCE($2, title),
         description         = COALESCE($3, description),
         instructions        = COALESCE($4, instructions),
         topics              = COALESCE($5, topics),
         available_from      = COALESCE($6, available_from),
         available_to        = COALESCE($7, available_to),
         due_at              = COALESCE($8, due_at),
         max_score           = COALESCE($9, max_score),
         allowed_file_types  = COALESCE($10, allowed_file_types),
         max_file_size_bytes = COALESCE($11, max_file_size_bytes),
         -- lesson_id is nullable and clearing it is meaningful, so it takes a
         -- sentinel rather than COALESCE: $12 undefined means leave alone,
         -- and an explicit null arrives as the string 'null' below.
         lesson_id           = CASE WHEN $12::text IS NULL THEN lesson_id
                                    WHEN $12 = 'null' THEN NULL
                                    ELSE $12 END,
         work_type           = COALESCE($13, work_type),
         -- external_url is nullable and clearing it is meaningful - switching a
         -- task away from the link type leaves a stale URL otherwise - so it
         -- takes the same sentinel treatment as lesson_id rather than COALESCE.
         external_url        = CASE WHEN $14::text IS NULL THEN external_url
                                    WHEN $14 = 'null' THEN NULL
                                    ELSE $14 END
       WHERE id = $1
       RETURNING ${ASSESSMENT_COLUMNS}`,
      [
        assessmentId,
        update.title ?? null,
        update.description ?? null,
        update.instructions ?? null,
        update.topics ?? null,
        update.availableFrom ?? null,
        update.availableTo ?? null,
        update.dueAt ?? null,
        update.maxScore ?? null,
        update.allowedFileTypes ?? null,
        update.maxFileSizeBytes ?? null,
        update.lessonId === undefined
          ? null
          : (update.lessonId ?? 'null'),
        update.workType ?? null,
        update.externalUrl === undefined
          ? null
          : (update.externalUrl ?? 'null'),
      ],
    );
    return row ? toAssessment(row) : null;
  }

  async remove(assessmentId: string): Promise<boolean> {
    // Targets and submissions go with it through ON DELETE CASCADE.
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM assessments WHERE id = $1 RETURNING id',
      [assessmentId],
    );
    return row !== null;
  }

  /**
   * Replaces the audience in one transaction. Delete-then-insert rather than a
   * diff: the audience is chosen as a set, and a half-applied change would set
   * work for the wrong cohort - which is the one outcome worth a transaction
   * here.
   */
  async setTargets(
    assessmentId: string,
    targets: readonly NewAssessmentTarget[],
  ): Promise<AssessmentTarget[]> {
    return this.db.transaction(async (client) => {
      await client.query('DELETE FROM assessment_targets WHERE assessment_id = $1', [
        assessmentId,
      ]);
      const written: AssessmentTarget[] = [];
      for (const target of targets) {
        const result = await client.query<AssessmentTargetRow>(
          `INSERT INTO assessment_targets
             (id, assessment_id, group_id, available_from, available_to, due_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, assessment_id, group_id, available_from, available_to, due_at`,
          [
            randomUUID(),
            assessmentId,
            target.groupId,
            target.availableFrom ?? null,
            target.availableTo ?? null,
            target.dueAt ?? null,
          ],
        );
        written.push(toTarget(result.rows[0]));
      }
      return written;
    });
  }

  async findTargets(assessmentId: string): Promise<AssessmentTarget[]> {
    const rows = await this.db.query<AssessmentTargetRow>(
      `SELECT id, assessment_id, group_id, available_from, available_to, due_at
         FROM assessment_targets
        WHERE assessment_id = $1
        ORDER BY group_id`,
      [assessmentId],
    );
    return rows.map(toTarget);
  }

  async findSubmission(
    assessmentId: string,
    studentId: string,
  ): Promise<StoredSubmission | null> {
    const row = await this.db.queryOne<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS}
       FROM assessment_submissions
       WHERE assessment_id = $1 AND student_id = $2`,
      [assessmentId, studentId],
    );
    return row ? toSubmission(row) : null;
  }

  async findSubmissionsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<StoredSubmission[]> {
    if (assessmentIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS}
       FROM assessment_submissions
       WHERE assessment_id = ANY($1::text[]) AND student_id = $2`,
      [[...assessmentIds], studentId],
    );
    return rows.map(toSubmission);
  }

  async findSubmissionsForAssessments(
    assessmentIds: readonly string[],
  ): Promise<StoredSubmission[]> {
    if (assessmentIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS}
       FROM assessment_submissions
       WHERE assessment_id = ANY($1::text[])
       ORDER BY last_submitted_at DESC`,
      [[...assessmentIds]],
    );
    return rows.map(toSubmission);
  }

  async countUngradedSubmissionsByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>> {
    if (courseIds.length === 0) {
      return {};
    }
    const rows = await this.db.query<{ course_id: string; count: string }>(
      `SELECT a.course_id, COUNT(*) AS count
       FROM assessment_submissions s
       JOIN assessments a ON a.id = s.assessment_id
       WHERE a.course_id = ANY($1::text[])
         AND s.corrected_at IS NULL
       GROUP BY a.course_id`,
      [[...courseIds]],
    );
    // COUNT(*) arrives as a string; see EnrollmentRepository.countByCourses.
    return Object.fromEntries(
      rows.map((row) => [row.course_id, Number(row.count)]),
    );
  }

  async findSubmissionById(
    submissionId: string,
  ): Promise<StoredSubmission | null> {
    const row = await this.db.queryOne<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS} FROM assessment_submissions WHERE id = $1`,
      [submissionId],
    );
    return row ? toSubmission(row) : null;
  }

  async gradeSubmission(
    submissionId: string,
    grade: {
      score: number;
      feedback: string | null;
      annotatedFileUrl: string | undefined;
    },
  ): Promise<StoredSubmission | null> {
    // Only the correction columns are in the SET list. file_url and answer_text
    // are absent by design, not by omission - the student's submitted work is
    // immutable (CLAUDE.md §5.5).
    //
    // annotated_file_url uses COALESCE so a grading pass that supplies no
    // annotated copy leaves an earlier one in place; feedback does not, because
    // clearing feedback is a thing a teacher may legitimately want to do.
    const row = await this.db.queryOne<SubmissionRow>(
      `UPDATE assessment_submissions SET
         score              = $2,
         feedback           = $3,
         annotated_file_url = COALESCE($4::text, annotated_file_url),
         corrected_at       = now(),
         updated_at         = now()
       WHERE id = $1
       RETURNING ${SUBMISSION_COLUMNS}`,
      [
        submissionId,
        grade.score,
        grade.feedback,
        grade.annotatedFileUrl ?? null,
      ],
    );
    return row ? toSubmission(row) : null;
  }

  async createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission> {
    const row = await this.db.queryOne<SubmissionRow>(
      `INSERT INTO assessment_submissions
         (id, assessment_id, student_id, file_url, answer_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SUBMISSION_COLUMNS}`,
      [randomUUID(), assessmentId, studentId, fileUrl, answerText],
    );
    return toSubmission(row!);
  }

  async updateSubmission(
    submissionId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission | null> {
    // Archiving the old content and overwriting it must be one unit. Half of
    // this is a submission whose previous version was lost, which is exactly
    // the history CLAUDE.md §5.5 requires be reconstructable.
    return this.db.transaction(async (client) => {
      // `student_id` is the ownership predicate, not a filter. FOR UPDATE holds
      // the row for the archive-then-overwrite below, so two concurrent
      // resubmissions cannot interleave and lose a revision.
      const existing = await client.query<SubmissionRow>(
        `SELECT ${SUBMISSION_COLUMNS}
         FROM assessment_submissions
         WHERE id = $1 AND student_id = $2
         FOR UPDATE`,
        [submissionId, studentId],
      );
      const current = existing.rows[0];
      if (!current) {
        return null;
      }

      await client.query(
        `INSERT INTO submission_revisions
           (id, submission_id, file_url, answer_text, submitted_at, replaced_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          randomUUID(),
          current.id,
          current.file_url,
          current.answer_text,
          current.last_submitted_at,
        ],
      );

      // Same undefined-vs-null distinction as the student profile update: a
      // resubmission that supplies only `answerText` must not erase an
      // already-uploaded file.
      const updated = await client.query<SubmissionRow>(
        `UPDATE assessment_submissions
         SET file_url          = CASE WHEN $2::boolean THEN $3::text ELSE file_url END,
             answer_text       = CASE WHEN $4::boolean THEN $5::text ELSE answer_text END,
             last_submitted_at = now(),
             updated_at        = now()
         WHERE id = $1 AND student_id = $6
         RETURNING ${SUBMISSION_COLUMNS}`,
        [
          submissionId,
          fileUrl !== undefined,
          fileUrl ?? null,
          answerText !== undefined,
          answerText ?? null,
          studentId,
        ],
      );
      return toSubmission(updated.rows[0]!);
    });
  }

  async findRevisions(
    submissionId: string,
    studentId: string,
  ): Promise<SubmissionRevision[]> {
    // A revision row carries no studentId, so ownership is proven by joining
    // back to the submission it archives.
    const rows = await this.db.query<RevisionRow>(
      `SELECT r.id, r.submission_id, r.file_url, r.answer_text,
              r.submitted_at, r.replaced_at
       FROM submission_revisions r
       JOIN assessment_submissions s ON s.id = r.submission_id
       WHERE r.submission_id = $1 AND s.student_id = $2
       ORDER BY r.replaced_at`,
      [submissionId, studentId],
    );
    return rows.map(toRevision);
  }
}
