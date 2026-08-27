import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type {
  AssessmentRepository,
  StoredAssessment,
  StoredSubmission,
  AssessmentStatus,
} from './interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';

export interface AssessmentListItem {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: string;
  status: AssessmentStatus;
  dueAt: string;
  maxScore: number;
  score: number | null;
}

export interface AssessmentDetail {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: string;
  status: AssessmentStatus;
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  submission: {
    id: string;
    fileUrl: string | null;
    answerText: string | null;
    submittedAt: string;
    score: number | null;
    correctedAt: string | null;
    feedback: string | null;
  } | null;
}

@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
  ) {}

  private computeStatus(
    assessment: StoredAssessment,
    submission: StoredSubmission | null,
  ): AssessmentStatus {
    const now = new Date();
    const availableFrom = new Date(assessment.availableFrom);
    const availableTo = new Date(assessment.availableTo);

    if (submission?.correctedAt) {
      return 'corrected';
    }
    if (submission) {
      return 'submitted';
    }
    if (now < availableFrom || now > availableTo) {
      return 'locked';
    }
    return 'available';
  }

  async getAssessmentsForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AssessmentListItem[]> {
    const assessments = await this.assessmentRepo.findByCourse(courseId);
    const results: AssessmentListItem[] = [];
    for (const assessment of assessments) {
      const submission = await this.assessmentRepo.findSubmission(
        assessment.id,
        studentId,
      );
      const status = this.computeStatus(assessment, submission);
      results.push({
        id: assessment.id,
        courseId: assessment.courseId,
        title: assessment.title,
        description: assessment.description,
        type: assessment.type,
        status,
        dueAt: assessment.dueAt,
        maxScore: assessment.maxScore,
        score: submission?.score ?? null,
      });
    }
    return results;
  }

  async getAssessmentDetail(
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentDetail> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    const submission = await this.assessmentRepo.findSubmission(
      assessmentId,
      studentId,
    );
    const status = this.computeStatus(assessment, submission);
    return {
      id: assessment.id,
      courseId: assessment.courseId,
      title: assessment.title,
      description: assessment.description,
      type: assessment.type,
      status,
      availableFrom: assessment.availableFrom,
      availableTo: assessment.availableTo,
      dueAt: assessment.dueAt,
      maxScore: assessment.maxScore,
      submission: submission
        ? {
            id: submission.id,
            fileUrl: submission.fileUrl,
            answerText: submission.answerText,
            submittedAt: submission.submittedAt,
            score: submission.score,
            correctedAt: submission.correctedAt,
            feedback: submission.feedback,
          }
        : null,
    };
  }

  async submitAssessment(
    assessmentId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const now = new Date();
    const availableFrom = new Date(assessment.availableFrom);
    const availableTo = new Date(assessment.availableTo);

    if (now < availableFrom || now > availableTo) {
      throw new BadRequestException(
        'Assessment is not currently available for submission',
      );
    }

    if (!fileUrl && !answerText) {
      throw new BadRequestException(
        'At least one of fileUrl or answerText must be provided',
      );
    }

    const existingSubmission = await this.assessmentRepo.findSubmission(
      assessmentId,
      studentId,
    );
    if (existingSubmission) {
      throw new BadRequestException(
        'A submission already exists for this assessment',
      );
    }

    return this.assessmentRepo.createSubmission(
      assessmentId,
      studentId,
      fileUrl ?? null,
      answerText ?? null,
    );
  }
}
