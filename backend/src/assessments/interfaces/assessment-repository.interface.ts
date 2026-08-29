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
   */
  updateSubmission(
    submissionId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission | null>;
  findRevisions(submissionId: string): Promise<SubmissionRevision[]>;
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY');
