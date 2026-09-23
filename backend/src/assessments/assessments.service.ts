import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssessmentFilter,
  AssessmentStatus,
  AssessmentType,
  AssessmentRepository,
  Attachment,
  StoredAssessment,
  SubmissionMode,
  TaskVisibility,
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
import { ALLOWED_UPLOAD_TYPES } from '../common/storage/upload-types.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * What each file-bearing submission mode admits, as extensions.
 *
 * The two halves are derived differently **on purpose**, because they answer
 * different questions:
 *
 * - `photo_upload` is every `image` in the whitelist. "Is this an image" is a
 *   property of the file, so a new image type should widen this automatically.
 * - `pdf_upload` names its two MIME types outright, because `D-41` decided
 *   *which documents a teacher means by "pdf upload"* - a product decision, not
 *   a property of the whitelist. Deriving it from `kind: 'file'` instead would
 *   admit `text/plain` today, and would silently widen every existing task the
 *   next time any document type is added to the whitelist.
 *
 * Extensions still come from `ALLOWED_UPLOAD_TYPES`, so the MIME-to-extension
 * mapping is stated in exactly one place.
 */
/**
 * `D-43`: the ceiling on files in one submission.
 *
 * `D-40` wrote five as a property of `photo_upload`; the user generalised it to
 * every multi-file submission, so a task that states no mode cannot accept an
 * unbounded count. Stated once and used by both the DTO and the service.
 */
export const MAX_SUBMISSION_FILES = 5;

const MODE_EXTENSIONS: Record<
  Exclude<SubmissionMode, 'doc_link'>,
  ReadonlySet<string>
> = {
  pdf_upload: new Set(
    [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
      .map((mime) => ALLOWED_UPLOAD_TYPES[mime]?.extension)
      .filter((ext): ext is string => ext !== undefined),
  ),
  photo_upload: new Set(
    Object.values(ALLOWED_UPLOAD_TYPES)
      .filter((t) => t.kind === 'image')
      .map((t) => t.extension),
  ),
};

/**
 * Whether a student may see this task at all (`D-28`).
 *
 * `hidden` removes a task from **every** student read - the list, the detail,
 * the submit route, and the performance entries a report averages - and from
 * the staff read of one student's work, which exists to agree with the
 * student's own screen. `scheduled` is not a stored value: a published task
 * whose window has not opened is already `locked` with its date.
 *
 * One predicate, so the five reads cannot disagree about what "hidden" means.
 */
export function isVisibleToStudents(task: { visibility: TaskVisibility }): boolean {
  return task.visibility !== 'hidden';
}

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
  linkUrl: string | null;
  files: { fileUrl: string; displayName: string; position: number }[];
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

/** An attachment as a student receives it: the audience is implied. */
export type StudentAttachment = Omit<Attachment, 'audience'>;

export interface AssessmentDetail extends AssessmentListItem {
  instructions: string;
  /**
   * Only the `students` attachments (`D-29`). A `staff` one - a mark scheme -
   * is never in this response.
   */
  attachments: StudentAttachment[];
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
    private readonly db: DatabaseService,
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
        // A hidden task (`D-28`) falls through to the same 404 as a task that
        // does not exist - its body must not confirm there is something here.
        if (targeted && isVisibleToStudents(targeted)) {
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
    // `MARK-2`: `corrected` is what the student reads once the mark is
    // released, not once it exists - `returnedAt`, not `correctedAt`.
    if (submission?.returnedAt) {
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
    // `MARK-2`: same gate as `computeStatus` above - a mark exists the moment
    // it is corrected, but the student only sees it once it is returned.
    const score = submission?.returnedAt ? submission.score : null;
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
    const assessments = (
      await this.assessmentRepo.findByCourseForGroups(courseId, groupIds, filter)
    ).filter(isVisibleToStudents);
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

    let files: { fileUrl: string; displayName: string; position: number }[] = [];
    if (submission) {
      const submissionFiles = await this.assessmentRepo.findFilesForSubmissions([submission.id]);
      files = submissionFiles.map(f => ({
        fileUrl: f.fileUrl,
        displayName: f.displayName,
        position: f.position,
      })).sort((a, b) => a.position - b.position);
    }

    return {
      ...this.toListItem(assessment, submission, now, hasExternalResult),
      instructions: assessment.instructions,
      // Filtered here, on the only student read that carries attachments, and
      // mapped field by field so nothing else on the stored element travels.
      attachments: assessment.attachments
        .filter((a) => a.audience === 'students')
        .map((a) => ({
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      availableTo: assessment.availableTo,
      allowedFileTypes: assessment.allowedFileTypes,
      maxFileSizeBytes: assessment.maxFileSizeBytes,
      work,
      // The UI must never offer a button the server refuses: a one-shot task
      // (`allowResubmission: false`) that already has a submission is closed
      // to this student exactly as `submitAssessment` below treats it.
      // Deliberately `correctedAt`, not `returnedAt` (`MARK-2`): this guards
      // *mutation*, not visibility - once a mark exists a resubmission would
      // overwrite what the marker is working from, whether or not it has been
      // handed back yet. Same rule as `submitAssessment`'s own check below.
      canSubmit:
        this.isWithinWindow(assessment, now) &&
        submission?.correctedAt == null &&
        !(submission && !assessment.allowResubmission),
      submission: submission
        ? {
            id: submission.id,
            fileUrl: submission.fileUrl,
            answerText: submission.answerText,
            linkUrl: submission.linkUrl,
            files,
            submittedAt: submission.submittedAt,
            lastSubmittedAt: submission.lastSubmittedAt,
            updatedAt: submission.updatedAt,
            // `MARK-2`: everything the marker wrote stays hidden until
            // `returnedAt` is stamped, so a marked-but-unreturned submission
            // reads exactly as it did before it was marked.
            score: submission.returnedAt ? submission.score : null,
            correctedAt: submission.returnedAt ? submission.correctedAt : null,
            feedback: submission.returnedAt ? submission.feedback : null,
            annotatedFileUrl: submission.returnedAt
              ? submission.annotatedFileUrl
              : null,
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
   *
   * The whole thing runs in one transaction because a submission row and its
   * `submission_files` are one fact: a row that commits without its files is a
   * submission whose evidence is missing, and the student has no way to know.
   */
  async submitAssessment(
    assessmentId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
    files: { fileUrl: string; displayName: string }[] | undefined,
    linkUrl: string | undefined,
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
    if (!fileUrl && !answerText && (!files || files.length === 0) && !linkUrl) {
      throw new BadRequestException(
        'At least one of fileUrl, answerText, files, or linkUrl must be provided',
      );
    }

    // `D-43`: five, for every multi-file submission rather than only for
    // `photo_upload`, so no task can accept an unbounded upload count. The DTO
    // carries the same cap; this is the copy that matters, because the DTO
    // stops a malformed request and the service is where the invariant lives
    // (`CLAUDE.md` §5).
    if (files && files.length > MAX_SUBMISSION_FILES) {
      throw new BadRequestException(
        `A submission may carry at most ${MAX_SUBMISSION_FILES} files.`,
      );
    }

    // `D-39`: the scheme check is here and not a SQL CHECK, so there is one
    // copy of the rule rather than one per driver plus one in the schema.
    if (linkUrl && !linkUrl.toLowerCase().startsWith('https://')) {
      throw new BadRequestException('A submitted link must use https.');
    }

    /**
     * The per-file gate. Both the singular `fileUrl` and every entry in
     * `files` route through this, so the two paths cannot drift apart - which
     * they would the moment the rules were written out twice.
     *
     * `index` is present only for the plural path, and exists so a refusal
     * names *which* file failed; with five photos, "that file type" alone
     * leaves the student guessing.
     */
    const checkFile = (url: string, index?: number) => {
      // Strip any query string or fragment before reading the extension, so a
      // URL like `/uploads/hw.pdf?token=x` is not treated as having the
      // extension `pdf?token=x`.
      const cleanPath = url.split('?')[0].split('#')[0];
      const parts = cleanPath.split('.');
      // Anything after the last dot, or '' when there is no dot and when the
      // URL ends in one. This splits the whole path rather than the last
      // segment, so a dotted *directory* (`/v1.2/report`) reads as the nonsense
      // extension `2/report` - which then matches nothing and is refused. That
      // is the safe direction, and stored URLs never look like that: the
      // extension is server-minted from the validated MIME (`UploadsService`),
      // never taken from the client's filename.
      const submittedExt =
        parts.length >= 2 && parts[parts.length - 1] !== ''
          ? parts[parts.length - 1].toLowerCase()
          : '';

      const prefix = index !== undefined ? `File ${index + 1}: ` : '';

      // --- 1. allowedFileTypes enforcement ---
      // Empty allowedFileTypes means "no per-task narrowing" - accept anything
      // the global whitelist allows. A non-empty list restricts to those types.
      if (assessment.allowedFileTypes.length > 0) {
        const allowedExts = new Set(
          assessment.allowedFileTypes
            .map((mime) => ALLOWED_UPLOAD_TYPES[mime.toLowerCase()]?.extension)
            .filter((ext): ext is string => ext !== undefined),
        );
        if (!submittedExt || !allowedExts.has(submittedExt)) {
          throw new BadRequestException(
            `${prefix}This task only accepts files of type: ${assessment.allowedFileTypes.join(', ')}.`
          );
        }
      }

      // --- 2. submissionModes enforcement, file side only ---
      // Empty submissionModes means "not stated" - enforce nothing. `doc_link`
      // is excluded from the *file* modes because it governs the link, not the
      // upload: a task stating only `doc_link` still accepts a file (`D-39`),
      // so it falls through to the allowedFileTypes check above.
      const fileModes = assessment.submissionModes.filter(
        (m): m is Exclude<SubmissionMode, 'doc_link'> =>
          m === 'pdf_upload' || m === 'photo_upload',
      );
      if (fileModes.length > 0) {
        // A submission satisfies the mode check if it passes ANY stated mode.
        const passesMode = fileModes.some(
          (mode) => submittedExt !== '' && MODE_EXTENSIONS[mode].has(submittedExt),
        );
        if (!passesMode) {
          const modeNames = fileModes.join(', ');
          throw new BadRequestException(
            `${prefix}This task's submission mode (${modeNames}) does not permit that file type.`
          );
        }
      }
    };

    if (fileUrl) checkFile(fileUrl);
    if (files) {
      files.forEach((f, i) => checkFile(f.fileUrl, i));
    }

    return this.db.runInTransaction(async () => {
      const existing = await this.assessmentRepo.findSubmission(
        assessmentId,
        studentId,
      );

      // A one-shot task. A state conflict rather than a bad request (CLAUDE.md
      // §6: 409), and checked before the correction rule so a student is told
      // the rule that actually applies. With `allowResubmission: true` - the
      // default - nothing here changes: resubmission runs until window end, not
      // `dueAt` (`D-31`).
      if (existing && !assessment.allowResubmission) {
        throw new ConflictException('This task accepts one submission only.');
      }

      let submission: StoredSubmission;

      if (!existing) {
        submission = await this.assessmentRepo.createSubmission(
          assessmentId,
          studentId,
          fileUrl ?? null,
          answerText ?? null,
          linkUrl ?? null,
        );
      } else {
        if (existing.correctedAt) {
          throw new BadRequestException(
            'This submission has already been corrected and can no longer be changed',
          );
        }
        // Passed through as-is rather than coerced to null: an edit that
        // supplies only one field must leave the others standing. That is why
        // `linkUrl` is `undefined`-meaning-untouched here and `null` on create.
        const updated = await this.assessmentRepo.updateSubmission(
          existing.id,
          studentId,
          fileUrl,
          answerText,
          linkUrl,
        );
        if (!updated) {
          throw new NotFoundException('Submission not found');
        }
        submission = updated;
      }

      // `undefined` leaves an existing file set alone, for the same reason the
      // scalar fields do. An explicit empty array is a deliberate "remove them
      // all" and does reach the repository, which replaces wholesale.
      if (files) {
        await this.assessmentRepo.replaceSubmissionFiles(
          submission.id,
          files.map((f, i) => ({
            fileUrl: f.fileUrl,
            displayName: f.displayName,
            position: i,
          })),
        );
      }

      return submission;
    });
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
    // A hidden task is not work this student was set (`D-28`): a report that
    // averaged it would count "not submitted" against something they could
    // never see.
    const assessments = (
      await this.assessmentRepo.findByCourseForGroups(courseId, groupIds)
    ).filter(isVisibleToStudents);
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
        // `MARK-2`: the weekly report is a student/parent-visible read too.
        score: submission?.returnedAt ? submission.score : null,
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
