export type AssessmentType = 'homework' | 'assignment' | 'quiz';

export type AssessmentStatus = 'locked' | 'available' | 'submitted' | 'corrected';

export interface StoredAssessment {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  topics: string[];
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  /** Per-assessment upload rules - never a global hardcoded whitelist. */
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  createdAt: string;
}

export interface StoredSubmission {
  id: string;
  assessmentId: string;
  studentId: string;
  fileUrl: string | null;
  answerText: string | null;
  /** First submission. Never moves - it is the start of the history. */
  submittedAt: string;
  /**
   * When the *current* content arrived. Advances on every resubmission, so
   * lateness is judged on the work actually being graded rather than on a
   * placeholder submitted before the deadline and swapped out afterwards.
   */
  lastSubmittedAt: string;
  updatedAt: string;
  score: number | null;
  correctedAt: string | null;
  feedback: string | null;
  /** Teacher's annotated copy; the original submission stays immutable. */
  annotatedFileUrl: string | null;
}

/**
 * A superseded version of a submission's content, kept so the correction
 * history required by the brief can be reconstructed. Written on every
 * resubmission; never mutated afterwards.
 */
export interface SubmissionRevision {
  id: string;
  submissionId: string;
  fileUrl: string | null;
  answerText: string | null;
  /** When this content was submitted. */
  submittedAt: string;
  /** When the student replaced it. */
  replacedAt: string;
}

export interface AssessmentFilter {
  type?: AssessmentType;
}

export interface AssessmentRepository {
  findByCourse(
    courseId: string,
    filter?: AssessmentFilter,
  ): Promise<StoredAssessment[]>;
  findById(assessmentId: string): Promise<StoredAssessment | null>;
  findSubmission(
    assessmentId: string,
    studentId: string,
  ): Promise<StoredSubmission | null>;
  /**
   * One student's submissions across many assessments, for the course
   * assessment list and the performance report. Both used to await
   * `findSubmission` once per assessment - free against an array, a round trip
   * each against Postgres, and a course has ten to twenty assessments.
   *
   * Scoped to `studentId` for the same reason `findSubmission` is: a batch read
   * is exactly where an unscoped query would leak a whole cohort's marks.
   */
  findSubmissionsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<StoredSubmission[]>;
  createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission>;
  /**
   * Replaces the student's answer, archiving the previous content as a revision.
   * `undefined` leaves a field untouched - a resubmission that supplies only
   * `answerText` must not silently erase an already-uploaded file.
   *
   * `studentId` is part of the predicate, not a convenience argument: a
   * submission id is otherwise all it takes to overwrite someone else's work.
   * It sits in the signature so no implementor can omit it and no future caller
   * has to remember it - today's single call site derives the id from
   * `findSubmission(assessmentId, studentId)` two lines earlier, which is a
   * property of that one call site and invisible here. The next caller is a TA
   * grading endpoint holding a submission id for a course it may not be
   * assigned to (CLAUDE.md §5.11).
   */
  updateSubmission(
    submissionId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission | null>;
  findRevisions(
    submissionId: string,
    studentId: string,
  ): Promise<SubmissionRevision[]>;
  /**
   * Every student's submissions across a set of assessments - the grading
   * queue's read, and the deliberate opposite of
   * `findSubmissionsForStudent` above.
   *
   * Unscoped by student *because that is the point*: a TA marking an
   * assignment needs the whole cohort. The scoping that keeps it safe is a
   * different one - the caller resolves `assessmentIds` from a course it has
   * already put through `StaffScopeService.assertAssigned` (CLAUDE.md §5.11).
   * Passing assessment ids rather than a course id is what makes that
   * impossible to skip: there is no course id here to be trusted unchecked.
   */
  findSubmissionsForAssessments(
    assessmentIds: readonly string[],
  ): Promise<StoredSubmission[]>;
  /**
   * How many submissions are still waiting to be graded, per course. Absent
   * means zero.
   *
   * Ungraded is derived from `corrected_at IS NULL`, never stored (§5.10) -
   * the same rule the read side applies, expressed once in SQL.
   *
   * Unlike `findSubmissionsForAssessments` this takes *course* ids, because
   * the caller wants a figure per course and resolving assessments first would
   * put the fan-out back. That difference matters for scoping: the caller must
   * have put every id through `StaffScopeService.assertAssigned` before
   * calling, since there is no assessment-id indirection here to enforce it.
   * `ManageService.overview` does, via `coursesInScope`.
   */
  countUngradedSubmissionsByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>>;
  /** One submission by id, for the grading screen. Null when it is gone. */
  findSubmissionById(submissionId: string): Promise<StoredSubmission | null>;
  /**
   * Records a mark and feedback against a submission.
   *
   * Writes only the correction columns. The student's own `fileUrl` and
   * `answerText` are never touched here - CLAUDE.md §5.5 keeps the original
   * submission immutable, and the annotated copy is a separate artifact
   * beside it (`annotatedFileUrl`), not an overwrite.
   *
   * `correctedAt` is stamped by the repository, not passed in, for the same
   * reason `submittedAt` is: a client-supplied correction time is a client
   * rewriting history.
   */
  gradeSubmission(
    submissionId: string,
    grade: {
      score: number;
      feedback: string | null;
      annotatedFileUrl: string | undefined;
    },
  ): Promise<StoredSubmission | null>;
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY');
