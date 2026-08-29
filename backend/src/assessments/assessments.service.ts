import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssessmentFilter,
  AssessmentStatus,
  AssessmentType,
  AssessmentRepository,
  StoredAssessment,
  StoredSubmission,
  SubmissionRevision,
} from './interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';

export interface AssessmentListItem {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  type: AssessmentType;
  topics: string[];
  status: AssessmentStatus;
  availableFrom: string;
  dueAt: string;
  isOverdue: boolean;
  maxScore: number;
  score: number | null;
  scorePercentage: number | null;
}

export interface SubmissionView {
  id: string;
  fileUrl: string | null;
  answerText: string | null;
  submittedAt: string;
  lastSubmittedAt: string;
  updatedAt: string;
  score: number | null;
  correctedAt: string | null;
  feedback: string | null;
  annotatedFileUrl: string | null;
  /** Superseded versions, oldest first - the submission history. */
  revisions: SubmissionRevision[];
}

export interface AssessmentDetail extends AssessmentListItem {
  instructions: string;
  availableTo: string;
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  canSubmit: boolean;
  submission: SubmissionView | null;
}

/** Raw grade rows the reports module aggregates - not a client-facing shape. */
export interface AssessmentPerformanceEntry {
  assessmentId: string;
  title: string;
  type: AssessmentType;
  topics: string[];
  maxScore: number;
  score: number | null;
  status: AssessmentStatus;
}

@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  /**
   * Loads an assessment and proves the caller is enrolled in the course that
   * owns it. Enrollment is checked against the assessment's own courseId, never
   * against a course id supplied by the client.
   */
  private async loadForStudent(
    assessmentId: string,
    studentId: string,
  ): Promise<StoredAssessment> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    await this.enrollmentsService.assertEnrolled(assessment.courseId, studentId);
    return assessment;
  }

  /**
   * The single source of truth for an item's status. Derived from the stored
   * timestamps and the submission row on every read - a client-supplied status
   * is never read anywhere in this module.
   */
  private computeStatus(
    assessment: StoredAssessment,
    submission: StoredSubmission | null,
    now: Date,
  ): AssessmentStatus {
    if (submission?.correctedAt) {
      return 'corrected';
    }
    if (submission) {
      return 'submitted';
    }
    const availableFrom = new Date(assessment.availableFrom);
    const availableTo = new Date(assessment.availableTo);
    if (now < availableFrom || now > availableTo) {
      return 'locked';
    }
    return 'available';
  }

  private isWithinWindow(assessment: StoredAssessment, now: Date): boolean {
    return (
      now >= new Date(assessment.availableFrom) &&
      now <= new Date(assessment.availableTo)
    );
  }

  private toListItem(
    assessment: StoredAssessment,
    submission: StoredSubmission | null,
    now: Date,
  ): AssessmentListItem {
    const status = this.computeStatus(assessment, submission, now);
    const score = submission?.correctedAt ? submission.score : null;
    return {
      id: assessment.id,
      courseId: assessment.courseId,
      lessonId: assessment.lessonId,
      title: assessment.title,
      description: assessment.description,
      type: assessment.type,
      topics: assessment.topics,
      status,
      availableFrom: assessment.availableFrom,
      dueAt: assessment.dueAt,
      // Judged on when the current content arrived, so swapping a placeholder
      // for real work after the deadline still reads as late.
      isOverdue: submission
        ? new Date(submission.lastSubmittedAt) > new Date(assessment.dueAt)
        : now > new Date(assessment.dueAt),
      maxScore: assessment.maxScore,
      score,
      scorePercentage:
        score === null || assessment.maxScore === 0
          ? null
          : Math.round((score / assessment.maxScore) * 100),
    };
  }

  async getAssessmentsForCourse(
    courseId: string,
    studentId: string,
    filter?: AssessmentFilter,
  ): Promise<AssessmentListItem[]> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const now = new Date();
    const assessments = await this.assessmentRepo.findByCourse(courseId, filter);
    return Promise.all(
      assessments.map(async (assessment) =>
        this.toListItem(
          assessment,
          await this.assessmentRepo.findSubmission(assessment.id, studentId),
          now,
        ),
      ),
    );
  }

  async getAssessmentDetail(
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentDetail> {
    const now = new Date();
    const assessment = await this.loadForStudent(assessmentId, studentId);
    const submission = await this.assessmentRepo.findSubmission(
      assessmentId,
      studentId,
    );
    return {
      ...this.toListItem(assessment, submission, now),
      instructions: assessment.instructions,
      availableTo: assessment.availableTo,
      allowedFileTypes: assessment.allowedFileTypes,
      maxFileSizeBytes: assessment.maxFileSizeBytes,
      canSubmit:
        this.isWithinWindow(assessment, now) && submission?.correctedAt == null,
      submission: submission
        ? {
            id: submission.id,
            fileUrl: submission.fileUrl,
            answerText: submission.answerText,
            submittedAt: submission.submittedAt,
            lastSubmittedAt: submission.lastSubmittedAt,
            updatedAt: submission.updatedAt,
            score: submission.correctedAt ? submission.score : null,
            correctedAt: submission.correctedAt,
            feedback: submission.feedback,
            annotatedFileUrl: submission.annotatedFileUrl,
            revisions: await this.assessmentRepo.findRevisions(submission.id),
          }
        : null,
    };
  }

  /**
   * Creates a submission, or replaces the student's existing one while the
   * availability window is still open and nothing has been marked yet - the
   * "edit before the deadline" case. Once corrected, the submission is frozen.
   */
  async submitAssessment(
    assessmentId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission> {
    const assessment = await this.loadForStudent(assessmentId, studentId);
    if (!this.isWithinWindow(assessment, new Date())) {
      throw new BadRequestException(
        'Assessment is not currently available for submission',
      );
    }
    if (!fileUrl && !answerText) {
      throw new BadRequestException(
        'At least one of fileUrl or answerText must be provided',
      );
    }

    const existing = await this.assessmentRepo.findSubmission(
      assessmentId,
      studentId,
    );
    if (!existing) {
      return this.assessmentRepo.createSubmission(
        assessmentId,
        studentId,
        fileUrl ?? null,
        answerText ?? null,
      );
    }
    if (existing.correctedAt) {
      throw new BadRequestException(
        'This submission has already been corrected and can no longer be changed',
      );
    }
    // Passed through as-is rather than coerced to null: an edit that supplies
    // only one field must leave the other one standing.
    const updated = await this.assessmentRepo.updateSubmission(
      existing.id,
      fileUrl,
      answerText,
    );
    if (!updated) {
      throw new NotFoundException('Submission not found');
    }
    return updated;
  }

  /** Internal: callers (ReportsService) assert enrollment first. */
  async getPerformanceEntries(
    courseId: string,
    studentId: string,
  ): Promise<AssessmentPerformanceEntry[]> {
    const now = new Date();
    const assessments = await this.assessmentRepo.findByCourse(courseId);
    return Promise.all(
      assessments.map(async (assessment) => {
        const submission = await this.assessmentRepo.findSubmission(
          assessment.id,
          studentId,
        );
        return {
          assessmentId: assessment.id,
          title: assessment.title,
          type: assessment.type,
          topics: assessment.topics,
          maxScore: assessment.maxScore,
          score: submission?.correctedAt ? submission.score : null,
          status: this.computeStatus(assessment, submission, now),
        };
      }),
    );
  }
}
