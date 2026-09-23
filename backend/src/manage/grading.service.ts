import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  AssessmentRepository,
  AssessmentType,
  StoredAssessment,
  StoredSubmission,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';

/** A submission is awaiting marking exactly while nobody has corrected it. */
export type GradingStatus = 'awaiting' | 'graded';

export interface GradingQueueItem {
  submissionId: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: AssessmentType;
  maxScore: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  submittedAt: string;
  lastSubmittedAt: string;
  fileUrl: string | null;
  answerText: string | null;
  annotatedFileUrl: string | null;
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  /**
   * When the mark was handed back to the student (`MARK-2`); null while it is
   * saved but unseen. `status` stays `awaiting | graded` - saved is graded.
   */
  returnedAt: string | null;
  status: GradingStatus;
  /** Judged on the content actually being marked, not the first placeholder. */
  isLate: boolean;
}

/**
 * One submission as a grading row. Shared by the course queue, `/grade` and
 * `/return` so the three answer one shape (`API_SPEC.yaml` `GradingQueueItem`).
 */
export function toGradingQueueItem(
  submission: StoredSubmission,
  assessment: StoredAssessment,
  student: { name: string; email: string } | null,
): GradingQueueItem {
  return {
    submissionId: submission.id,
    assessmentId: assessment.id,
    assessmentTitle: assessment.title,
    assessmentType: assessment.type,
    maxScore: assessment.maxScore,
    studentId: submission.studentId,
    studentName: student?.name ?? 'Unknown',
    studentEmail: student?.email ?? '',
    submittedAt: submission.submittedAt,
    lastSubmittedAt: submission.lastSubmittedAt,
    fileUrl: submission.fileUrl,
    answerText: submission.answerText,
    annotatedFileUrl: submission.annotatedFileUrl,
    score: submission.score,
    feedback: submission.feedback,
    correctedAt: submission.correctedAt,
    returnedAt: submission.returnedAt,
    status: submission.correctedAt === null ? 'awaiting' : 'graded',
    // Server-derived, like every other status on this platform (§5.10).
    // Measured against lastSubmittedAt so a placeholder filed before the
    // deadline and swapped afterwards still reads as late.
    isLate:
      new Date(submission.lastSubmittedAt).getTime() >
      new Date(assessment.dueAt).getTime(),
  };
}

/**
 * Per-assessment averages across every student (CLAUDE.md §5.6) - the number
 * that tells the teacher whether a task was hard or easy.
 */
export interface AssessmentAverage {
  assessmentId: string;
  title: string;
  type: AssessmentType;
  maxScore: number;
  submissionCount: number;
  gradedCount: number;
  /** Percent of max, so assessments with different maxima are comparable. */
  averageScorePercent: number | null;
}

export interface GradingQueueResponse {
  courseId: string;
  items: GradingQueueItem[];
  assessments: AssessmentAverage[];
}

export interface GradeInput {
  score: number;
  feedback?: string;
  annotatedFileUrl?: string;
}

@Injectable()
export class GradingService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * Every submission on a course, with the per-assessment averages beside it.
   *
   * The course is scoped first and the assessment ids are derived from it, so
   * the unscoped `findSubmissionsForAssessments` read can only ever see work
   * belonging to a course this actor holds (§5.11).
   */
  async queue(
    courseId: string,
    actor: StaffActor,
    filter?: { status?: GradingStatus },
  ): Promise<GradingQueueResponse> {
    await this.scope.assertAssigned(courseId, actor);

    const assessments = await this.assessmentRepo.findByCourse(courseId);
    const submissions = await this.assessmentRepo.findSubmissionsForAssessments(
      assessments.map((a) => a.id),
    );
    const students = await this.userRepo.findByIds([
      ...new Set(submissions.map((s) => s.studentId)),
    ]);

    const assessmentById = new Map(assessments.map((a) => [a.id, a]));
    const studentById = new Map(students.map((u) => [u.id, u]));

    const items = submissions.flatMap((submission): GradingQueueItem[] => {
      const assessment = assessmentById.get(submission.assessmentId);
      const student = studentById.get(submission.studentId);
      if (!assessment || !student) return [];

      const item = toGradingQueueItem(submission, assessment, student);
      if (filter?.status && filter.status !== item.status) return [];
      return [item];
    });

    return {
      courseId,
      // Newest work first - the queue is worked from the top.
      items: items.sort(
        (a, b) =>
          new Date(b.lastSubmittedAt).getTime() - new Date(a.lastSubmittedAt).getTime(),
      ),
      assessments: assessments.map((assessment) =>
        averageFor(assessment, submissions),
      ),
    };
  }

  /**
   * Record a mark.
   *
   * The scope check goes through the submission's own assessment, not through
   * a course id in the URL. A TA holding a submission id for a course they are
   * not assigned to is the exact attack §5.11 describes, and the only thing
   * that stops it is resolving the course from the data rather than from the
   * request.
   */
  async grade(
    submissionId: string,
    actor: StaffActor,
    input: GradeInput,
  ): Promise<GradingQueueItem> {
    return this.db.runInTransaction(async () => {
      const submission = await this.assessmentRepo.findSubmissionById(submissionId);
      // 404 rather than 403 for a submission outside the actor's scope, so a TA
      // cannot probe for which submission ids exist. Same posture as
      // `assertAssigned`, and the reason both branches say the same thing.
      if (!submission) {
        throw new NotFoundException('Submission not found');
      }
      const assessment = await this.assessmentRepo.findById(submission.assessmentId);
      if (!assessment) {
        throw new NotFoundException('Submission not found');
      }
      // Rethrown under the submission's own wording rather than passed through.
      // `assertAssigned` says "Course not found or not assigned to you", which on
      // this route is a different sentence from the "Submission not found" two
      // lines up - and two different 404 bodies is exactly the existence oracle
      // the status code was chosen to avoid: a real id on someone else's course
      // would read differently from a made-up one.
      try {
        await this.scope.assertAssigned(assessment.courseId, actor);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new NotFoundException('Submission not found');
        }
        throw error;
      }

      if (input.score < 0 || input.score > assessment.maxScore) {
        // Checked here rather than in the DTO because the ceiling is per
        // assessment - a validator cannot know it from the request alone.
        throw new BadRequestException(
          `Score must be between 0 and ${assessment.maxScore}`,
        );
      }

      // The prior values are copied out *before* the write, not read off
      // `submission` afterwards. The in-memory driver updates the stored object
      // in place and both reads can hand back the same reference, so holding the
      // object and reading `.score` after the update yields the new mark - and
      // the audit entry silently records before === after, which is worse than
      // no entry because it looks like a mark that never moved.
      const previous = { score: submission.score, correctedAt: submission.correctedAt };

      const graded = await this.assessmentRepo.gradeSubmission(submissionId, {
        score: input.score,
        feedback: input.feedback ?? null,
        annotatedFileUrl: input.annotatedFileUrl,
      });
      if (!graded) {
        // Deleted between the read and the write.
        throw new NotFoundException('Submission not found');
      }

      // CLAUDE.md §5.4: every TA mutation is logged. This is the first one that
      // is not an admin action, and grading is the one a student is most likely
      // to dispute - before/after carries the marks, not the whole submission.
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'submission.graded',
        targetType: 'assessment_submission',
        targetId: submissionId,
        courseId: assessment.courseId,
        before: previous,
        after: { score: graded.score, correctedAt: graded.correctedAt },
      });

      const student = await this.userRepo.findById(graded.studentId);
      return toGradingQueueItem(graded, assessment, student);
    });
  }
}

/** One assessment's cohort-wide average, as a share of its own max (§5.6). */
function averageFor(
  assessment: StoredAssessment,
  allSubmissions: readonly StoredSubmission[],
): AssessmentAverage {
  const mine = allSubmissions.filter((s) => s.assessmentId === assessment.id);
  const graded = mine.filter((s) => s.score !== null && s.correctedAt !== null);
  const average =
    graded.length > 0 && assessment.maxScore > 0
      ? Math.round(
          (graded.reduce((sum, s) => sum + (s.score as number), 0) /
            graded.length /
            assessment.maxScore) *
            100,
        )
      : null;

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    type: assessment.type,
    maxScore: assessment.maxScore,
    submissionCount: mine.length,
    gradedCount: graded.length,
    averageScorePercent: average,
  };
}
