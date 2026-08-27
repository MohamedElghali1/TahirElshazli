export type AssessmentType = 'homework' | 'assignment' | 'quiz';

export type AssessmentStatus = 'locked' | 'available' | 'submitted' | 'corrected';

export interface StoredAssessment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: AssessmentType;
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  createdAt: string;
}

export interface StoredSubmission {
  id: string;
  assessmentId: string;
  studentId: string;
  fileUrl: string | null;
  answerText: string | null;
  submittedAt: string;
  score: number | null;
  correctedAt: string | null;
  feedback: string | null;
}

export interface AssessmentRepository {
  findByCourse(courseId: string): Promise<StoredAssessment[]>;
  findById(assessmentId: string): Promise<StoredAssessment | null>;
  findSubmission(assessmentId: string, studentId: string): Promise<StoredSubmission | null>;
  createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission>;
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY');
