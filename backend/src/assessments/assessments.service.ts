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
import { StudentGroupsService } from '../groups/student-groups.service.js';
import type {
  WorkRepository,
  WorkType,
} from './interfaces/work-repository.interface.js';
import { WORK_REPOSITORY } from './interfaces/work-repository.interface.js';

export interface AssessmentListItem {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  type: AssessmentType;
  /** How it is delivered, so the list can show the right badge and verb. */
  workType: WorkType;
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
  /**
   * What the student is actually expected to do.
   *
   * The client's requirement was explicit that "the student should not be
   * forced to upload a file when the assignment is actually a Google Form", and
   * this is the field the UI branches on. `canSubmit` above still governs
   * *whether* the window is open; this governs *what the control is*.
   */
  work: WorkExpectation;
}

/**
 * How this task is delivered, and where the student stands on it.
 *
 * A discriminated union rather than a bag of nullable fields, so a client
 * cannot render an upload box for a form task by forgetting a check - the
 * fields simply are not there on the other members.
 */
export type WorkExpectation =
  | {
      kind: 'file_upload';
      allowedFileTypes: string[];
      maxFileSizeBytes: number;
    }
  | { kind: 'link'; url: string }
  | {
      kind: 'google_form';
      /**
       * Google's own published link - the one students fill in. Read from the
       * binding, never constructed: it uses a different identifier from the
       * editing URL, so a constructed one 404s for every student.
       */
      formUrl: string;
      /**
       * Whether this platform has seen a response from this student.
       *
       * Mirrored from Google on the last sync, so it can legitimately lag a
       * submission by minutes. The UI should say when it was last checked
       * rather than presenting it as live - a student who has just submitted
       * and sees "not completed" will otherwise submit again.
       */
      completed: boolean;
      score: number | null;
      maxScore: number | null;
      lastSyncedAt: string | null;
    };

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
    /**
     * Global (`GroupDataModule`). Work is set per group now (CLAUDE.md §5.16),
     * so enrollment alone stopped being enough to decide what a student may
     * read here - it says they hold the course, not that this task was set for
     * them.
     */
    private readonly studentGroups: StudentGroupsService,
    /**
     * Work types and the mirrored external results. Read-only from here - the
     * student surface never syncs (that would put a third-party call on a page
     * load) and never writes a result.
     */
    @Inject(WORK_REPOSITORY) private readonly work: WorkRepository,
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
    if (assessment) {
      const enrollment = await this.enrollmentsService.find(
        assessment.courseId,
        studentId,
      );
      if (enrollment) {
        // Enrolled is necessary and, since 2026-09-10, no longer sufficient:
        // the task also has to have been *set for* a group this student is in
        // (§5.16). Without this second check an assessment id is enough to read
        // - and submit against - another cohort's work, which is the same class
        // of hole §5.11 guards on the staff side.
        const groupIds = await this.studentGroups.groupIdsFor(
          assessment.courseId,
          studentId,
        );
        const targeted = await this.assessmentRepo.findByIdForGroups(
          assessmentId,
          groupIds,
        );
        if (targeted) {
          // The targeted row, not the raw one: its window carries this group's
          // overrides, so every downstream status and deadline decision
          // (§5.10) is made on the terms this student was actually set.
          return targeted;
        }
      }
    }
    // One message and one status for both branches. Letting `assertEnrolled`
    // throw its own "Course not found or student not enrolled" here would make
    // the *body* differ between an id that exists in someone else's course and
    // an id that does not exist at all - an existence oracle over the whole
    // assessment id space, even though both are 404. ReportsService.getDocument
    // already collapses the two the same way.
    throw new NotFoundException('Assessment not found');
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
    hasExternalResult = false,
  ): AssessmentStatus {
    if (submission?.correctedAt) {
      return 'corrected';
    }
    if (submission) {
      return 'submitted';
    }
    // External work has no submission row of ours - the evidence is a mirrored
    // result. Without this a student who completed a Google Form would see the
    // task sitting at `available` indefinitely and would quite reasonably fill
    // it in again.
    //
    // It reports `submitted` rather than `corrected` even when Google returned
    // a score, because `corrected` means a human marked it here, and
    // `SubmissionView.feedback` would be empty next to a word promising
    // otherwise. The score still travels, on `WorkExpectation`.
    if (hasExternalResult) {
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
    hasExternalResult = false,
  ): AssessmentListItem {
    const status = this.computeStatus(
      assessment,
      submission,
      now,
      hasExternalResult,
    );
    const score = submission?.correctedAt ? submission.score : null;
    return {
      id: assessment.id,
      courseId: assessment.courseId,
      lessonId: assessment.lessonId,
      title: assessment.title,
      description: assessment.description,
      type: assessment.type,
      workType: assessment.workType,
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

  /**
   * Builds the student-facing description of how this task is delivered.
   *
   * The `google_form` branch reads the *mirror*, never Google - a student
   * opening a task must not trigger an outbound API call, both because it would
   * put third-party latency and quota on the critical path of a page load, and
   * because thirty students opening the same task would sync it thirty times.
   * Freshness is the sync's job; `lastSyncedAt` is how this admits to it.
   */
  private async describeWork(
    assessment: StoredAssessment,
    studentId: string,
  ): Promise<WorkExpectation> {
    if (assessment.workType === 'link') {
      return {
        kind: 'link',
        // The CHECK constraint guarantees a link task has one; the fallback is
        // for rows written before it existed rather than a real state.
        url: assessment.externalUrl ?? '',
      };
    }
    if (assessment.workType === 'google_form') {
      const [binding, results] = await Promise.all([
        this.work.findBinding(assessment.id),
        this.work.findResultsForStudent([assessment.id], studentId),
      ]);
      const mine = results[0] ?? null;
      return {
        kind: 'google_form',
        formUrl: binding?.responderUri ?? '',
        completed: mine !== null,
        score: mine?.score ?? null,
        maxScore: mine?.maxScore ?? null,
        lastSyncedAt: binding?.lastSyncedAt ?? null,
      };
    }
    return {
      kind: 'file_upload',
      allowedFileTypes: assessment.allowedFileTypes,
      maxFileSizeBytes: assessment.maxFileSizeBytes,
    };
  }

  async getAssessmentsForCourse(
    courseId: string,
    studentId: string,
    filter?: AssessmentFilter,
  ): Promise<AssessmentListItem[]> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const now = new Date();
    // Only what was set for a group this student is in (§5.16). An unplaced
    // student gets an empty list rather than an error - §7.2's state, and what
    // §5.16 warns will look like a working course that happens to be empty.
    const groupIds = await this.studentGroups.groupIdsFor(courseId, studentId);
    const assessments = await this.assessmentRepo.findByCourseForGroups(
      courseId,
      groupIds,
      filter,
    );
    const submissions = await this.submissionsByAssessment(assessments, studentId);
    // One batched count for the whole list rather than a lookup per row -
    // external work has no submission of ours, so without this every completed
    // form in the list would read as still outstanding.
    const externals = await this.work.countResultsByAssessments(
      assessments.map((a) => a.id),
      studentId,
    );
    return assessments.map((assessment) =>
      this.toListItem(
        assessment,
        submissions.get(assessment.id) ?? null,
        now,
        (externals[assessment.id] ?? 0) > 0,
      ),
    );
  }

  /**
   * One read for the whole list, keyed by assessment id. The per-assessment
   * `findSubmission` this replaces cost nothing against an in-memory array and
   * one round trip each against Postgres (CLAUDE.md §7.1).
   */
  private async submissionsByAssessment(
    assessments: readonly StoredAssessment[],
    studentId: string,
  ): Promise<Map<string, StoredSubmission>> {
    const submissions = await this.assessmentRepo.findSubmissionsForStudent(
      assessments.map((assessment) => assessment.id),
      studentId,
    );
    return new Map(submissions.map((s) => [s.assessmentId, s]));
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
    // `describeWork` already reads this student's results for form work, so
    // the completion flag is taken from it rather than counted a second time -
    // two reads of the same fact are two chances for them to disagree.
    const work = await this.describeWork(assessment, studentId);
    const hasExternalResult =
      work.kind === 'google_form' ? work.completed : false;
    return {
      ...this.toListItem(assessment, submission, now, hasExternalResult),
      instructions: assessment.instructions,
      availableTo: assessment.availableTo,
      allowedFileTypes: assessment.allowedFileTypes,
      maxFileSizeBytes: assessment.maxFileSizeBytes,
      work,
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
            revisions: await this.assessmentRepo.findRevisions(
              submission.id,
              studentId,
            ),
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
    // Only file-upload work is submitted through this platform. A form is
    // submitted to Google and arrives by sync; a link task is done elsewhere.
    // Accepting a file against either would create a submission that no staff
    // screen shows and no analytics count - work a student believes they have
    // handed in and which is, to everyone else, invisible.
    if (assessment.workType !== 'file_upload') {
      throw new BadRequestException(
        assessment.workType === 'google_form'
          ? 'This task is completed on its Google Form, not by uploading here. ' +
            'Open the form from the task page.'
          : 'This task is completed at the link on the task page, not by ' +
            'uploading here.',
      );
    }
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
      studentId,
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
    // Targeted, like the list - a report that averaged work the student was
    // never set would be a lower mark than they earned, on a number §5.6 says
    // the teacher reads as authoritative.
    const groupIds = await this.studentGroups.groupIdsFor(courseId, studentId);
    const assessments = await this.assessmentRepo.findByCourseForGroups(
      courseId,
      groupIds,
    );
    const submissions = await this.submissionsByAssessment(assessments, studentId);
    const externals = await this.work.countResultsByAssessments(
      assessments.map((a) => a.id),
      studentId,
    );
    return assessments.map((assessment) => {
      const submission = submissions.get(assessment.id) ?? null;
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        type: assessment.type,
        topics: assessment.topics,
        maxScore: assessment.maxScore,
        score: submission?.correctedAt ? submission.score : null,
        status: this.computeStatus(
          assessment,
          submission,
          now,
          (externals[assessment.id] ?? 0) > 0,
        ),
      };
    });
  }
}
