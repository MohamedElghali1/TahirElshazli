import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { markerQualifies } from './assessment-authoring.service.js';
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
    /** The group-grain gate for a submission-named route (`D-44`). */
    private readonly access: SubmissionAccessService,
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
   * The submissions a scoped caller may see on this course, read at the
   * **group grain** (`D-44`): a submission is listed when its student sits in a
   * group the caller holds on this course AND the task was set for that group -
   * `SubmissionAccessService`'s rule, so every row listed is one `/grade` and
   * `/return` accept. Restricted in the query to the held groups' students and
   * the tasks set for those groups, never filtered out of a wider read.
   */
  private async submissionsInReach(
    courseId: string,
    reach: readonly string[],
    assessmentIds: readonly string[],
  ): Promise<StoredSubmission[]> {
    const held = (await this.groupRepo.findByIds(reach))
      .filter((g) => g.courseId === courseId)
      .map((g) => g.id);
    const [targets, members] = await Promise.all([
      this.assessmentRepo.findTargetsForAssessments(assessmentIds, held),
      this.groupRepo.findMembersForGroups(held),
    ]);
    const groupsOf = new Map<string, Set<string>>();
    for (const m of members) {
      const groups = groupsOf.get(m.studentId) ?? new Set<string>();
      groups.add(m.groupId);
      groupsOf.set(m.studentId, groups);
    }
    const submissions = await this.assessmentRepo.findSubmissionsForStudents(
      [...new Set(targets.map((t) => t.assessmentId))],
      [...groupsOf.keys()],
    );
    // The pair: this student's held groups must include one this task was set
    // for. Both halves were already restricted in the reads above.
    return submissions.filter((s) =>
      targets.some((t) => t.assessmentId === s.assessmentId && groupsOf.get(s.studentId)?.has(t.groupId)),
    );
  }

  /**
   * The submissions on a course, with the per-assessment averages beside it.
   *
   * The course is scoped first (an unreachable course is the same 404 it
   * always was). **The items are at the group grain** (`D-44`, unit 7): a
   * scoped assistant sees only papers from the groups they hold, so every row
   * they can open they can also grade and return.
   *
   * **The averages stay course-wide**, recorded as the residue (`D-44`, as
   * unit 6 recorded `D-35`'s): narrowing them would make an average change with
   * the viewer (`D-23`'s denominator trap), and they carry no row-level data.
   */
  async queue(
    courseId: string,
    actor: StaffActor,
    filter?: { status?: GradingStatus },
  ): Promise<GradingQueueResponse> {
    await this.scope.assertAssigned(courseId, actor);

    const assessments = await this.assessmentRepo.findByCourse(courseId);
    const everyone = await this.assessmentRepo.findSubmissionsForAssessments(
      assessments.map((a) => a.id),
    );
    const reach = await this.scope.reachableGroupIds(actor);
    const submissions =
      reach === null
        ? everyone
        : await this.submissionsInReach(courseId, reach, assessments.map((a) => a.id));
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
      // Course-wide on purpose - see the method comment.
      assessments: assessments.map((assessment) =>
        averageFor(assessment, everyone),
      ),
    };
  }

  /**
   * Save a mark. **Saving is not returning** (`MARK-2`): the student sees
   * nothing until `/return`.
   *
   * The scope check goes through the submission's own task and student, never
   * a course id in the URL - and since `D-44` (unit 7) at the **group grain**:
   * the caller must reach a group the task was set for that the student sits
   * in. Before, holding any group on the course reached every cohort's paper.
   *
   * The first saved mark on an unclaimed task names the caller as its marker
   * (`D-43`), when they qualify under `D-32`'s rule.
   */
  async grade(
    submissionId: string,
    actor: StaffActor,
    input: GradeInput,
  ): Promise<GradingQueueItem> {
    return this.db.runInTransaction(async () => {
      // 404 rather than 403 for a submission outside the actor's scope, with a
      // body byte-identical to a missing one (`SUBMISSION_NOT_FOUND`), so a TA
      // cannot probe for which submission ids exist.
      const { submission, assessment } = await this.access.loadInScope(submissionId, actor);

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
        throw new NotFoundException(SUBMISSION_NOT_FOUND);
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

      await this.claimIfUnmarked(assessment, actor);

      const student = await this.userRepo.findById(graded.studentId);
      return toGradingQueueItem(graded, assessment, student);
    });
  }

  /**
   * `D-43`: the marker is **advisory**, and the first saved mark on a task
   * nobody is named for claims it. Never on a read (`GET` never mutates,
   * CLAUDE.md §6), and never over an existing marker.
   *
   * Only a caller who **qualifies** under `D-32` claims - the teacher, an
   * admin, or an active assistant reaching every group the task is set for.
   * An assistant holding one of three targeted groups saves the mark and the
   * task stays unclaimed: the claim writes nothing `D-32` would refuse to name
   * directly (recorded for the reviewer). Assistants may claim themselves,
   * the one exception to "an assistant may not change the marker" (`D-43`).
   *
   * Atomic (`claimMarker`'s predicate), and audited as `assessment.updated`
   * inside the caller's transaction. Public because the first annotation on a
   * paper claims too (`MarkingService.createAnnotation`): one rule, one place.
   */
  async claimIfUnmarked(
    assessment: StoredAssessment,
    actor: StaffActor,
    how: 'first saved mark' | 'first annotation' = 'first saved mark',
  ): Promise<void> {
    if (assessment.markerId !== null) {
      return;
    }
    const [user, audience] = await Promise.all([
      this.userRepo.findById(actor.id),
      this.assessmentRepo.findTargets(assessment.id),
    ]);
    if (!(await markerQualifies(this.scope, user, audience.map((t) => t.groupId)))) {
      return;
    }
    if (!(await this.assessmentRepo.claimMarker(assessment.id, actor.id))) {
      return; // Someone else's first mark won the race.
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: actorRoleOf(actor),
      action: 'assessment.updated',
      targetType: 'assessment',
      targetId: assessment.id,
      courseId: assessment.courseId,
      before: { markerId: null },
      after: { markerId: actor.id, claimedBy: how },
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
