import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull, num } from '../../database/database.types.js';
import type {
  AssessmentFilter,
  AssessmentRepository,
  AssessmentType,
  StoredAssessment,
  StoredSubmission,
  SubmissionRevision,
} from '../interfaces/assessment-repository.interface.js';

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
  created_at: Date;
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
  max_file_size_bytes, created_at
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
    createdAt: iso(row.created_at),
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

  async findById(assessmentId: string): Promise<StoredAssessment | null> {
    const row = await this.db.queryOne<AssessmentRow>(
      `SELECT ${ASSESSMENT_COLUMNS} FROM assessments WHERE id = $1`,
      [assessmentId],
    );
    return row ? toAssessment(row) : null;
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
