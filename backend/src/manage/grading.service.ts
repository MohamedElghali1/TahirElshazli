import {
  BadRequestException,
  ConflictException,
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
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';

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
  linkUrl: string | null;
  files: { fileUrl: string; displayName: string; position: number }[];
  annotatedFileUrl: string | null;
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  status: GradingStatus;
  /** Judged on the content actually being marked, not the first placeholder. */
  isLate: boolean;
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

/** `awaiting`/`graded` plus the third state a queue row can never carry: no submission at all. */
export type RosterStatus = GradingStatus | 'missing';

/**
 * `MARK-3`: one targeted student, whether or not they submitted.
 *
 * Deliberately not `GradingQueueItem` with optional fields bolted on - a
 * non-submitter has no `submissionId`, and every submission-only field is
 * `null` rather than absent, so a caller cannot mistake "field omitted" for
 * "field checked and empty".
 */
export interface AssessmentRosterItem {
  studentId: string;
  studentName: string;
  studentEmail: string;
  /** The row's own fact, ahead of `status` - the one field a UI checks first. */
  submitted: boolean;
  submissionId: string | null;
  submittedAt: string | null;
  lastSubmittedAt: string | null;
  fileUrl: string | null;
  answerText: string | null;
  linkUrl: string | null;
  files: { fileUrl: string; displayName: string; position: number }[];
  annotatedFileUrl: string | null;
  /** Never `0` for a non-submitter (CLAUDE.md §11.1) - `null`, the same as an unmarked one. */
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  returnedAt: string | null;
  status: RosterStatus;
  /** `false` for a non-submitter - there is no submitted work to judge as late. */
  isLate: boolean;
}

export interface AssessmentRosterResponse {
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: AssessmentType;
  maxScore: number;
  items: AssessmentRosterItem[];
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
    /** `GroupDataModule` is `@Global()`; this needs no import edge. */
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
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

    const filesBySubmissionId = new Map<string, { fileUrl: string; displayName: string; position: number }[]>();
    if (submissions.length > 0) {
      const allFiles = await this.assessmentRepo.findFilesForSubmissions(submissions.map((s) => s.id));
      for (const f of allFiles) {
        if (!filesBySubmissionId.has(f.submissionId)) {
          filesBySubmissionId.set(f.submissionId, []);
        }
        filesBySubmissionId.get(f.submissionId)!.push({
          fileUrl: f.fileUrl,
          displayName: f.displayName,
          position: f.position,
        });
      }
      for (const files of filesBySubmissionId.values()) {
        files.sort((a, b) => a.position - b.position);
      }
    }

    const items = submissions.flatMap((submission): GradingQueueItem[] => {
      const assessment = assessmentById.get(submission.assessmentId);
      const student = studentById.get(submission.studentId);
      if (!assessment || !student) return [];

      const status: GradingStatus =
        submission.correctedAt === null ? 'awaiting' : 'graded';
      if (filter?.status && filter.status !== status) return [];

      return [
        {
          submissionId: submission.id,
          assessmentId: assessment.id,
          assessmentTitle: assessment.title,
          assessmentType: assessment.type,
          maxScore: assessment.maxScore,
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          submittedAt: submission.submittedAt,
          lastSubmittedAt: submission.lastSubmittedAt,
          fileUrl: submission.fileUrl,
          answerText: submission.answerText,
          linkUrl: submission.linkUrl,
          files: filesBySubmissionId.get(submission.id) ?? [],
          annotatedFileUrl: submission.annotatedFileUrl,
          score: submission.score,
          feedback: submission.feedback,
          correctedAt: submission.correctedAt,
          status,
          // Server-derived, like every other status on this platform (§5.10).
          // Measured against lastSubmittedAt so a placeholder filed before the
          // deadline and swapped afterwards still reads as late.
          isLate:
            new Date(submission.lastSubmittedAt).getTime() >
            new Date(assessment.dueAt).getTime(),
        },
      ];
    });

    return {
      courseId,
      // Newest work first - the queue is worked from the top.
      items: items.sort(
        (a, b) =>
          new Date(b.lastSubmittedAt).getTime() -
          new Date(a.lastSubmittedAt).getTime(),
      ),
      assessments: assessments.map((assessment) =>
        averageFor(assessment, submissions),
      ),
    };
  }

  /**
   * `MARK-3`: one task's whole targeted cohort, non-submitters included.
   *
   * The gap `queue` above cannot close: a row only exists once a student has
   * handed something in, so a student who submitted nothing produces no row
   * and is invisible to a marker working from `queue`. This builds the roster
   * from the **targets**, not the submissions, and left-joins what exists.
   *
   * **Group grain, by decision** (CLAUDE.md §7): the course-level scope check
   * below is the same "does the actor hold anything on this course at all"
   * gate `grade` uses, so a genuinely out-of-scope course still 404s. But an
   * assistant holding only *some* of the task's targeted groups must see only
   * those groups' students, even though the course check above passed - the
   * same narrowing `listForStaff` applies to the task list, and for the same
   * reason `D-33` gave it: a course-grained read here would hand back every
   * cohort the task was set for, which is the exact leak `AUTH-2` closed.
   */
  async rosterForAssessment(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<AssessmentRosterResponse> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException(ASSESSMENT_NOT_FOUND);
    }
    // Rethrown under the assessment's own wording, same reasoning as
    // `resolveScoped` below: two different 404 bodies for one route is the
    // existence oracle the status code exists to avoid.
    try {
      await this.scope.assertAssigned(assessment.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(ASSESSMENT_NOT_FOUND);
      }
      throw error;
    }

    const targets = await this.assessmentRepo.findTargets(assessmentId);
    // `null` means unrestricted (admin, or an `all_groups` assistant); an
    // array is the actual held set, and only THOSE targeted groups count -
    // narrowed here, not filtered out of a wider read after the fact.
    const reachable = await this.scope.reachableGroupIds(actor);
    const reachableSet = reachable === null ? null : new Set(reachable);
    const groupIds = [
      ...new Set(
        targets
          .filter((t) => reachableSet === null || reachableSet.has(t.groupId))
          .map((t) => t.groupId),
      ),
    ];

    if (groupIds.length === 0) {
      // No held target - a task set for nobody the actor reaches, or a task
      // with no targets at all. Empty, not an error (§6: a filter that
      // matches nothing is not a failure).
      return {
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
        assessmentType: assessment.type,
        maxScore: assessment.maxScore,
        items: [],
      };
    }

    // One read per held+targeted group (bounded by ~10 groups, §1) - no
    // batch `findMembers` exists, and a 3-group task issues 3 of these, not
    // one per student.
    const memberships = await Promise.all(
      groupIds.map((groupId) => this.groupRepo.findMembers(groupId)),
    );
    // A student in two targeted, held groups appears once.
    const studentIds = [...new Set(memberships.flat().map((m) => m.studentId))];

    const [students, submissions] = await Promise.all([
      this.userRepo.findByIds(studentIds),
      this.assessmentRepo.findSubmissionsForAssessments([assessmentId]),
    ]);
    const studentById = new Map(students.map((u) => [u.id, u]));
    const submissionByStudent = new Map(submissions.map((s) => [s.studentId, s]));

    const inScopeSubmissionIds = studentIds
      .map((id) => submissionByStudent.get(id)?.id)
      .filter((id): id is string => id !== undefined);
    const filesBySubmissionId = new Map<string, { fileUrl: string; displayName: string; position: number }[]>();
    if (inScopeSubmissionIds.length > 0) {
      const allFiles = await this.assessmentRepo.findFilesForSubmissions(inScopeSubmissionIds);
      for (const f of allFiles) {
        if (!filesBySubmissionId.has(f.submissionId)) {
          filesBySubmissionId.set(f.submissionId, []);
        }
        filesBySubmissionId.get(f.submissionId)!.push({
          fileUrl: f.fileUrl,
          displayName: f.displayName,
          position: f.position,
        });
      }
      for (const files of filesBySubmissionId.values()) {
        files.sort((a, b) => a.position - b.position);
      }
    }

    const items: AssessmentRosterItem[] = studentIds.flatMap((studentId) => {
      const student = studentById.get(studentId);
      if (!student) return [];
      const submission = submissionByStudent.get(studentId) ?? null;
      const status: RosterStatus = !submission
        ? 'missing'
        : submission.correctedAt === null
          ? 'awaiting'
          : 'graded';
      return [
        {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          submitted: submission !== null,
          submissionId: submission?.id ?? null,
          submittedAt: submission?.submittedAt ?? null,
          lastSubmittedAt: submission?.lastSubmittedAt ?? null,
          fileUrl: submission?.fileUrl ?? null,
          answerText: submission?.answerText ?? null,
          linkUrl: submission?.linkUrl ?? null,
          files: submission ? filesBySubmissionId.get(submission.id) ?? [] : [],
          annotatedFileUrl: submission?.annotatedFileUrl ?? null,
          score: submission?.score ?? null,
          feedback: submission?.feedback ?? null,
          correctedAt: submission?.correctedAt ?? null,
          returnedAt: submission?.returnedAt ?? null,
          status,
          isLate: submission
            ? new Date(submission.lastSubmittedAt).getTime() >
              new Date(assessment.dueAt).getTime()
            : false,
        },
      ];
    });

    // Alphabetical - this is a roster, not a worklist worked top-down like
    // `queue`, so the ordering a marker expects is the class list's.
    items.sort((a, b) => a.studentName.localeCompare(b.studentName));

    return {
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      assessmentType: assessment.type,
      maxScore: assessment.maxScore,
      items,
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
      const { submission, assessment } = await this.resolveScoped(
        submissionId,
        actor,
      );

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

      return this.toQueueItem(assessment, graded);
    });
  }

  /**
   * `MARK-2`: hand marked work back to the student. Separate from `grade`
   * because saving a mark and releasing it are two decisions - a marker can
   * put a task down half-marked without the student seeing it.
   *
   * Same authorization shape as `grade`: the course is resolved from the
   * submission's own assessment, never from a URL parameter, and an
   * out-of-scope submission 404s under the submission's own wording.
   */
  async returnToStudent(
    submissionId: string,
    actor: StaffActor,
  ): Promise<GradingQueueItem> {
    return this.db.runInTransaction(async () => {
      const { submission, assessment } = await this.resolveScoped(
        submissionId,
        actor,
      );

      // Releasing nothing is not a meaningful action - a state conflict
      // (§6: 409), not a 400, because the submission id is fine and the
      // problem is what state it is in.
      if (submission.correctedAt === null) {
        throw new ConflictException('This submission has not been marked yet');
      }

      const before = { returnedAt: submission.returnedAt };

      const returned = await this.assessmentRepo.returnSubmission(submissionId);
      if (!returned) {
        // Deleted between the read and the write.
        throw new NotFoundException('Submission not found');
      }

      // §5.4: the point at which a student may see their mark is a staff
      // mutation with a student-visible consequence, same posture as grading.
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'submission.returned',
        targetType: 'assessment_submission',
        targetId: submissionId,
        courseId: assessment.courseId,
        before,
        after: { returnedAt: returned.returnedAt },
      });

      return this.toQueueItem(assessment, returned);
    });
  }

  /**
   * Resolves and scope-checks a submission by id, for `grade` and
   * `returnToStudent` alike - the course comes from the submission's own
   * assessment, never from a URL parameter (§5.11), and both routes give an
   * out-of-scope submission the same body as a nonexistent one.
   */
  private async resolveScoped(
    submissionId: string,
    actor: StaffActor,
  ): Promise<{ submission: StoredSubmission; assessment: StoredAssessment }> {
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
    return { submission, assessment };
  }

  /** The shared response shape for `grade` and `returnToStudent`. */
  private async toQueueItem(
    assessment: StoredAssessment,
    submission: StoredSubmission,
  ): Promise<GradingQueueItem> {
    const student = await this.userRepo.findById(submission.studentId);
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
      linkUrl: submission.linkUrl,
      files: (await this.assessmentRepo.findFilesForSubmissions([submission.id])).map(f => ({
        fileUrl: f.fileUrl,
        displayName: f.displayName,
        position: f.position,
      })).sort((a, b) => a.position - b.position),
      annotatedFileUrl: submission.annotatedFileUrl,
      score: submission.score,
      feedback: submission.feedback,
      correctedAt: submission.correctedAt,
      status: submission.correctedAt === null ? 'awaiting' : 'graded',
      isLate:
        new Date(submission.lastSubmittedAt).getTime() >
        new Date(assessment.dueAt).getTime(),
    };
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
