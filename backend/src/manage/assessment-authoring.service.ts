import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/roles.enum.js';
import { isUnscopedStaffRole } from '../auth/staff-roles.js';
import type {
  StoredUser,
  UserRepository,
} from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type {
  AssessmentRepository,
  AssessmentTarget,
  AssessmentType,
  AssessmentUpdate,
  Attachment,
  NewAssessmentTarget,
  StoredAssessment,
  SubmissionMode,
  TaskVisibility,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import type {
  ExternalWorkBinder,
  WorkType,
} from '../assessments/interfaces/work-repository.interface.js';
import { EXTERNAL_WORK_BINDER } from '../assessments/interfaces/work-repository.interface.js';
import type { TaskDraftRepository } from './interfaces/task-draft-repository.interface.js';
import type { WorkRepository } from '../assessments/interfaces/work-repository.interface.js';
import { WORK_REPOSITORY } from '../assessments/interfaces/work-repository.interface.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { TASK_DRAFT_NOT_FOUND } from './task-drafts.service.js';

/**
 * The message a task that does not exist **and** a task on a course the caller
 * cannot reach both get, on every `/staff/assessments/:id` route.
 *
 * Before unit 6 these differed: a missing id said `Assessment not found` and a
 * real-but-unreachable one said `Course not found or not assigned to you` -
 * both 404, but the body was an existence oracle over the assessment id space
 * (unit-6 plan, finding 2). One exported `const`, asserted `===` in the specs.
 */
export const ASSESSMENT_NOT_FOUND = 'Assessment not found';

/** An assessment as the authoring screen sees it: the task and its audience. */
export interface AuthoredAssessment extends StoredAssessment {
  targets: AssessmentTarget[];
}

/** A target on the staff task list, carrying its group's display name. */
export interface StaffTaskTarget extends AssessmentTarget {
  groupName: string;
}

/**
 * The visibility a staff screen shows (`D-28`). `scheduled` is **derived**,
 * never stored: a `published` task whose own `availableFrom` is still in the
 * future. Students already see such a task as locked-with-a-date.
 */
export type VisibilityState = TaskVisibility | 'scheduled';

/**
 * One row of `GET /staff/tasks` (`TASK-6`): every stored field, plus the
 * targets **the caller reaches** - an assistant never receives an unheld
 * group's id or name.
 */
export interface StaffTask extends StoredAssessment {
  targets: StaffTaskTarget[];
  /** Server-derived; see `VisibilityState`. */
  visibilityState: VisibilityState;
  /** Server-derived (`D-30`, `D-34`, `D-35`); never null. */
  status: StaffTaskStatus;
  /** The named marker's display name; null when `markerId` is null. */
  markerName: string | null;
  /**
   * `D-32`: true when a named marker **no longer qualifies** for this task -
   * their account or scope changed, or the audience grew past what they reach.
   * Drift is displayed, never silently repaired: `markerId` is left as it was.
   * Computed over the task's **whole** audience, so it is a fact about the task
   * rather than a number that depends on who is looking. Always false for a
   * null marker.
   */
  markerDrift: boolean;
}

/**
 * The message a named marker who does not qualify gets (`D-32`): someone who
 * is not the teacher, an admin, or an active assistant reaching every group
 * the task is set for.
 */
export const MARKER_NOT_ELIGIBLE =
  'markerId must name the teacher, an admin, or an active assistant who reaches every group this task is set for';

/** An assistant tried to choose who marks a task (`D-32`). */
export const MARKER_TEACHER_ONLY = 'Only the teacher or an admin can choose who marks a task';

/**
 * `D-33`: a scoped caller re-aiming a task that is also set for a group they
 * cannot reach. Refused rather than applied, because `setTargets` replaces the
 * whole audience and the caller cannot see - so would silently drop - the
 * groups they do not hold. A 403: the task is on their screen.
 */
export const RETARGET_UNREACHABLE_AUDIENCE =
  'This task is also set for groups you do not hold, so only the teacher or an admin can change who it is set for';

/**
 * `D-28`'s label, derived on every read - never accepted from a client.
 *
 * `D-37`: `scheduled` while `now` is before the **earliest** effective opening
 * across the targeted groups (each group's `availableFrom` override, or the
 * task's own). So the label reads *Published* as soon as any group can see
 * the task. Judged over the whole audience, so it is the same for every
 * viewer. With no audience given, the task's own `availableFrom` is used.
 */
export function visibilityStateOf(
  task: Pick<StoredAssessment, 'visibility' | 'availableFrom'>,
  now: Date,
  audience: readonly Pick<AssessmentTarget, 'availableFrom'>[] = [],
): VisibilityState {
  if (task.visibility === 'hidden') {
    return 'hidden';
  }
  const earliest = Math.min(
    ...(audience.length > 0 ? audience : [{ availableFrom: null }]).map((t) =>
      new Date(t.availableFrom ?? task.availableFrom).getTime(),
    ),
  );
  return now.getTime() < earliest ? 'scheduled' : 'published';
}

export interface StaffTaskListFilter {
  courseId?: string;
  groupId?: string;
  search?: string;
  /** `D-30`, `D-34`. */
  status?: StaffTaskStatus;
}

/**
 * The staff-side status of a task (`D-30`, completed by `D-34`/`D-35`):
 *
 * - `open`    - `now <=` the **latest** due date among the targeted groups
 *               (each group's override, or the task's own) - `D-35`;
 * - `marking` - past that, with any ungraded submission;
 * - `marked`  - past that, with every submission graded;
 * - `closed`  - past that, with **no submission at all** (`D-34`) - nothing to
 *               mark. Link and Google Form work, which has no submission rows
 *               of its own, lands here once past due.
 *
 * Total: every task has exactly one. `dueAt` is NOT NULL.
 */
export type StaffTaskStatus = 'open' | 'marking' | 'marked' | 'closed';

/**
 * `D-30`'s derivation, over the task's WHOLE audience and every submission -
 * the same answer for every viewer. Never accepted from a client.
 */
export function staffTaskStatusOf(
  task: Pick<StoredAssessment, 'dueAt'>,
  audience: readonly Pick<AssessmentTarget, 'dueAt'>[],
  submissions: { total: number; ungraded: number },
  now: Date,
): StaffTaskStatus {
  // `D-35`: the LATEST of each group's own due date (its override, or the
  // task's). A task stays open until every targeted group is past due.
  const latest = Math.max(
    ...(audience.length > 0 ? audience : [{ dueAt: null }]).map((t) =>
      new Date(t.dueAt ?? task.dueAt).getTime(),
    ),
  );
  if (now.getTime() <= latest) {
    return 'open';
  }
  if (submissions.total === 0) {
    return 'closed'; // `D-34`: past due, nothing to mark.
  }
  return submissions.ungraded > 0 ? 'marking' : 'marked';
}

export interface CreateAssessmentInput {
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  topics: string[];
  lessonId: string | null;
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  /**
   * How the work is delivered. Defaults to `file_upload` when the client omits
   * it, so every caller that predates work types keeps working unchanged.
   */
  workType?: WorkType;
  /** Required when `workType` is `link`; ignored otherwise. */
  externalUrl?: string | null;
  /**
   * A Google Form editing URL (or bare form id), required when `workType` is
   * `google_form`.
   *
   * Not stored on the assessment: it is resolved against Google and written as
   * a `GoogleFormBinding`, which is why this is an *input* field with no
   * counterpart on `StoredAssessment`.
   */
  googleForm?: string;
  targets: NewAssessmentTarget[];
  /**
   * The draft this task was started from (`TASK-3`). **Provenance only**: the
   * request body is authoritative and the server merges nothing from the draft
   * (assumption A-2) - "start from a draft prefills" is the form's job. It
   * increments the draft's `usedCount` in the same transaction.
   */
  draftId?: string;
  attachments?: Attachment[];
  /** Defaults to `true`, which is today's rule. */
  allowResubmission?: boolean;
  /**
   * `D-28`: `published` (the default) or `hidden`. A new task has no
   * submissions, so creating it hidden needs no conflict check.
   */
  visibility?: TaskVisibility;
  /**
   * `D-32`: who marks it. Null or omitted is "whoever opens it first". Only
   * the teacher and admins may name someone.
   */
  markerId?: string | null;
  /**
   * `D-31`: which modes the task accepts. Omitted is `[]`, "not stated". The
   * multi-file model behind `photo_upload` is unit 7's.
   */
  submissionModes?: SubmissionMode[];
}

/**
 * A partial edit, plus the one input that is not a column.
 *
 * `googleForm` is resolved against Google and written as a binding rather than
 * stored on the assessment, so it cannot ride along in `AssessmentUpdate` -
 * that type is the repository's contract and every field on it is a column.
 */
export type UpdateAssessmentInput = AssessmentUpdate & {
  googleForm?: string;
};

/**
 * Writing the work (CLAUDE.md §5.18, §5.16).
 *
 * **Who may use it, and how that was decided.** The client answered on
 * 2026-09-10: a teaching assistant may author both assignments and quizzes.
 * That settles the §11 question the prototype and the user-stories board
 * disagreed on - `ASG-10` and `QUZ-11` on the board grant it, §2.2's preset
 * omitted assignments - and it means these routes live on
 * `StaffManageController` with one role rule rather than a check that branches
 * on the task's `type`, which §2.2 explicitly warns against.
 *
 * **Targeting is the audience, not a copy.** §5.16's answer was *"make a task
 * then submit for one or more groups with his own selection"*, so there is one
 * assessment row and a set of target groups. At least one target is required at
 * creation: a task set for nobody is invisible to every student, and letting it
 * be created silently is how a teacher discovers on the due date that the work
 * never appeared.
 *
 * Every write here is audited (§5.4). Authoring is a TA-reachable mutation that
 * changes what students are set, which is squarely what the log exists for.
 */
@Injectable()
export class AssessmentAuthoringService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
    /**
     * Attaching whatever an external work type needs. A port, not the Google
     * sync service: this service decides *that* something must be bound and
     * never which providers exist, so a second provider changes nothing here.
     */
    @Inject(EXTERNAL_WORK_BINDER)
    private readonly binder: ExternalWorkBinder,
    /** The draft library, for `usedCount` on authoring from a draft. */
    @Inject(TASK_DRAFT_REPOSITORY)
    private readonly draftRepo: TaskDraftRepository,
    /** Who a named marker is (`D-32`). `AuthModule` exports it. */
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    /**
     * Mirrored external results (`D-36`): a synced Google Form response is a
     * student's work too. `AssessmentsModule` exports the token.
     */
    @Inject(WORK_REPOSITORY) private readonly work: WorkRepository,
  ) {}

  /**
   * `D-36`: how many synced external responses a task has, matched to a
   * student or not - each is somebody's handed-in work. A count read
   * (`tallyResults`), not the rows.
   */
  private async externalResultCount(assessmentId: string): Promise<number> {
    const tally = await this.work.tallyResults(assessmentId);
    return tally.matched + tally.unmatched;
  }

  /**
   * `D-32`: does this user qualify to mark a task set for these groups?
   *
   * The teacher and any admin always do. An assistant does when their account
   * is active and they reach **every** targeted group - otherwise they would be
   * assigned work they cannot open. `StaffScopeService` decides the reach, as
   * it does for every other staff question; a missing scope row fails closed.
   */
  private async markerQualifies(
    user: StoredUser | null,
    groupIds: readonly string[],
    reachCache?: Map<string, Promise<readonly string[] | null>>,
  ): Promise<boolean> {
    if (!user) {
      return false;
    }
    if (isUnscopedStaffRole(user.role)) {
      return true;
    }
    if (user.role !== Role.Assistant || user.status !== 'active') {
      return false;
    }
    // One scope read per marker, not per task, when judging a whole list.
    let pending = reachCache?.get(user.id);
    if (!pending) {
      pending = this.scope.reachableGroupIds({ id: user.id, role: user.role });
      reachCache?.set(user.id, pending);
    }
    const reach = await pending;
    return reach === null || groupIds.every((g) => reach.includes(g));
  }

  /**
   * `D-32`: who may name a marker, and whom.
   *
   * - An **assistant** may not set or change it. Any non-null value is a 403 -
   *   the task is on their screen, so the anti-enumeration 404 does not apply -
   *   and so is clearing a marker someone else chose. Sending `null` where it is
   *   already null changes nothing and is allowed.
   * - The teacher or an admin may name only someone who qualifies for the
   *   task's audience; anyone else is a 400.
   */
  private async assertMarker(
    actor: StaffActor,
    markerId: string | null | undefined,
    current: string | null,
    groupIds: readonly string[],
  ): Promise<void> {
    if (markerId === undefined) {
      return;
    }
    if (!isUnscopedStaffRole(actor.role)) {
      if (markerId !== null || current !== null) {
        throw new ForbiddenException(MARKER_TEACHER_ONLY);
      }
      return;
    }
    if (markerId === null) {
      return;
    }
    const user = await this.userRepo.findById(markerId);
    if (!(await this.markerQualifies(user, groupIds))) {
      throw new BadRequestException(MARKER_NOT_ELIGIBLE);
    }
  }

  /**
   * Each work type needs its own payload, and a task missing it is a task
   * students open onto nothing.
   *
   * Checked here rather than only in the DTO because the rule is *conditional*
   * - `externalUrl` is required for one work type and meaningless for the
   * others - and class-validator expresses that badly. The database backs up
   * the link half with a CHECK constraint, so the invariant does not rest on
   * this service being the only writer.
   *
   * The failure it prevents is silent: §5.10 derives everything a student sees
   * from server state, so a `link` task with no URL renders a perfectly normal
   * card with a button that goes nowhere.
   */
  private assertWorkTypePayload(
    workType: WorkType,
    input: { externalUrl?: string | null; googleForm?: string },
  ): void {
    if (workType === 'link' && !input.externalUrl?.trim()) {
      throw new BadRequestException(
        'A link task needs externalUrl - the address students should open.',
      );
    }
    if (workType === 'google_form' && !input.googleForm?.trim()) {
      throw new BadRequestException(
        'A Google Form task needs googleForm - the form\'s editing link.',
      );
    }
  }

  /**
   * The window has to make sense before it is stored, because §5.10 derives
   * every status from it and an inverted window produces an assessment that is
   * permanently `locked` with no error anywhere to explain why.
   */
  private assertWindow(from: string, to: string, due: string): void {
    const [f, t, d] = [from, to, due].map((value) => new Date(value).getTime());
    if (Number.isNaN(f) || Number.isNaN(t) || Number.isNaN(d)) {
      throw new BadRequestException('Dates must be valid ISO timestamps');
    }
    if (f >= t) {
      throw new BadRequestException('availableFrom must be before availableTo');
    }
    if (d < f || d > t) {
      // A due date outside the window is not a rule the client set; it is a
      // shape that cannot be satisfied. §11 leaves open what `due_at` *does* -
      // advisory, hard cutoff, or late-penalty trigger - and this check is
      // deliberately compatible with all three readings.
      throw new BadRequestException(
        'dueAt must fall inside the availability window',
      );
    }
  }

  /**
   * Every targeted group must exist and must study this course.
   *
   * The second half is the one that matters: without it a task could be set for
   * a cohort that does not take the subject, and it would appear on their
   * course page through a join that never checked the pairing.
   */
  private async assertTargets(
    courseId: string,
    targets: readonly NewAssessmentTarget[],
    actor: StaffActor,
  ): Promise<void> {
    if (targets.length === 0) {
      throw new BadRequestException(
        'An assessment must be set for at least one group',
      );
    }
    const groupIds = new Set(targets.map((target) => target.groupId));
    if (groupIds.size !== targets.length) {
      throw new BadRequestException('A group can be targeted only once');
    }
    const studying = new Set(
      (await this.groupRepo.findByCourse(courseId)).map((group) => group.id),
    );
    for (const groupId of groupIds) {
      // `D-33`: an assistant may not add a group they do not hold. The refusal
      // is the SAME message a group not on this course gets, byte for byte, so
      // it confirms nothing about another cohort. `mayReachGroup` is true for
      // the teacher, an admin and an `all_groups` assistant.
      if (
        !studying.has(groupId) ||
        !(await this.scope.mayReachGroup(groupId, actor))
      ) {
        throw new NotFoundException(
          `Group ${groupId} is not enrolled in this course`,
        );
      }
    }
    for (const target of targets) {
      // An override is all-or-nothing per field, but an inverted overridden
      // window is the same trap as an inverted one on the assessment.
      if (
        target.availableFrom &&
        target.availableTo &&
        new Date(target.availableFrom) >= new Date(target.availableTo)
      ) {
        throw new BadRequestException(
          'A target override must have availableFrom before availableTo',
        );
      }
    }
  }

  /**
   * `D-28` (reading iii): a task anybody has handed work in for cannot be
   * hidden - that would take a student's own work out of their sight.
   *
   * `D-36` (review F-3): "handed in" includes a **synced external result**. A
   * Google Form answered by thirty students is thirty pieces of work, and the
   * student list already reads such a task as submitted. A 409, because it is
   * a state conflict (CLAUDE.md §6).
   */
  private async assertMayHide(assessmentId: string): Promise<void> {
    const submissions = await this.assessmentRepo.findSubmissionsForAssessments([
      assessmentId,
    ]);
    if (submissions.length > 0) {
      throw new ConflictException(
        'This task has submissions and cannot be hidden. ' +
          'Close its availability window instead.',
      );
    }
    if ((await this.externalResultCount(assessmentId)) > 0) {
      throw new ConflictException(
        'Students have already answered this task on its external form, so it ' +
          'cannot be hidden. Close its availability window instead.',
      );
    }
  }

  /**
   * Loads an assessment and proves the caller may act on its course (§5.11).
   *
   * A missing id and a real task on an unreachable course both throw
   * `ASSESSMENT_NOT_FOUND`. The route names a task, not a course, so the
   * course's own message would be describing something the caller never sent -
   * and it was an existence oracle (unit-6 plan, finding 2).
   */
  private async loadInScope(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<StoredAssessment> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException(ASSESSMENT_NOT_FOUND);
    }
    // Scoped on the assessment's *own* courseId, never on one supplied by the
    // client - the same rule `AssessmentsService.loadForStudent` follows.
    try {
      await this.scope.assertAssigned(assessment.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(ASSESSMENT_NOT_FOUND);
      }
      throw error;
    }
    return assessment;
  }

  async list(courseId: string, actor: StaffActor): Promise<AuthoredAssessment[]> {
    await this.scope.assertAssigned(courseId, actor);
    // The *staff* read: every assessment on the course, targeted or not. A
    // teacher has to be able to see a task they have not finished aiming.
    const assessments = await this.assessmentRepo.findByCourse(courseId);
    const targets = await Promise.all(
      assessments.map((assessment) =>
        this.assessmentRepo.findTargets(assessment.id),
      ),
    );
    return assessments.map((assessment, index) => ({
      ...assessment,
      targets: targets[index],
    }));
  }

  /**
   * The console's task list, across courses (`TASK-6`). **Group-grain from
   * birth**: a task is listed only through a target the caller reaches, and its
   * targets are narrowed to those same groups - both restrictions in the query,
   * not a filter over a wider read.
   *
   * Every filter narrows and none addresses a resource (assumption A-4): an
   * unheld `groupId`, an unknown one and an unreachable `courseId` all answer
   * `[]`, identically.
   */
  async listForStaff(
    actor: StaffActor,
    filter: StaffTaskListFilter,
  ): Promise<StaffTask[]> {
    const groupIds = await this.scope.reachableGroupIds(actor);
    if (
      filter.groupId !== undefined &&
      groupIds !== null &&
      !groupIds.includes(filter.groupId)
    ) {
      // Outside the held set: the same empty answer an unknown group gets from
      // the query below, without asking the database to prove it.
      return [];
    }
    const assessments = await this.assessmentRepo.findForStaff({
      groupIds,
      courseId: filter.courseId,
      groupId: filter.groupId,
      search: filter.search,
    });
    // The SAME `groupIds`, so the audience shown is the audience reached.
    const targets = await this.assessmentRepo.findTargetsForAssessments(
      assessments.map((a) => a.id),
      groupIds,
    );
    // One batch read for the names (a repository does not join another
    // aggregate). Every id here already passed the reach restriction.
    const groups = await this.groupRepo.findByIds([
      ...new Set(targets.map((t) => t.groupId)),
    ]);
    const nameOf = new Map(groups.map((g) => [g.id, g.name]));
    const byTask = new Map<string, StaffTaskTarget[]>();
    for (const target of targets) {
      const list = byTask.get(target.assessmentId) ?? [];
      list.push({ ...target, groupName: nameOf.get(target.groupId) ?? '' });
      byTask.set(target.assessmentId, list);
    }
    // The task's WHOLE audience, for the two derived facts that must not
    // depend on who is looking - marker drift (`D-32`) and status (`D-30`).
    // Read unrestricted here and never returned. For an unrestricted caller
    // it is the list already read.
    const fullAudience =
      groupIds === null
        ? targets
        : await this.assessmentRepo.findTargetsForAssessments(
            assessments.map((a) => a.id),
            null,
          );
    const counts = await this.assessmentRepo.countSubmissionsByAssessments(
      assessments.map((a) => a.id),
    );

    // Marker names and drift (`D-32`): one boolean about the task.
    const marked = assessments.filter((a) => a.markerId !== null);
    const markers = await this.userRepo.findByIds([
      ...new Set(marked.map((a) => a.markerId as string)),
    ]);
    const markerById = new Map(markers.map((u) => [u.id, u]));
    const drift = new Map<string, boolean>();
    const reachCache = new Map<string, Promise<readonly string[] | null>>();
    for (const task of marked) {
      const audience = fullAudience
        .filter((t) => t.assessmentId === task.id)
        .map((t) => t.groupId);
      const marker = markerById.get(task.markerId as string) ?? null;
      drift.set(task.id, !(await this.markerQualifies(marker, audience, reachCache)));
    }

    const now = new Date();
    const rows: StaffTask[] = assessments.map((assessment) => ({
      ...assessment,
      targets: byTask.get(assessment.id) ?? [],
      visibilityState: visibilityStateOf(
        assessment,
        now,
        fullAudience.filter((t) => t.assessmentId === assessment.id),
      ),
      status: staffTaskStatusOf(
        assessment,
        fullAudience.filter((t) => t.assessmentId === assessment.id),
        counts[assessment.id] ?? { total: 0, ungraded: 0 },
        now,
      ),
      markerName: assessment.markerId
        ? (markerById.get(assessment.markerId)?.name ?? null)
        : null,
      markerDrift: drift.get(assessment.id) ?? false,
    }));
    // A derived value, so it is filtered after derivation. This narrows a list
    // already restricted to the caller's reach in the query above; it is not a
    // scope filter.
    return filter.status === undefined
      ? rows
      : rows.filter((row) => row.status === filter.status);
  }

  async create(
    courseId: string,
    actor: StaffActor,
    input: CreateAssessmentInput,
  ): Promise<AuthoredAssessment> {
    return this.db.runInTransaction(async () => {
      await this.scope.assertAssigned(courseId, actor);
      this.assertWindow(input.availableFrom, input.availableTo, input.dueAt);
      await this.assertTargets(courseId, input.targets, actor);
      await this.assertMarker(
        actor,
        input.markerId,
        null,
        input.targets.map((t) => t.groupId),
      );
      const workType = input.workType ?? 'file_upload';
      this.assertWorkTypePayload(workType, input);

      // Authoring from a draft (`TASK-3`). Incremented BEFORE the insert on
      // purpose: the UPDATE takes the draft's row lock, so a concurrent delete
      // cannot race the `draft_id` FK below, and a failure anywhere later rolls
      // the count back with everything else (proved on Postgres only - the
      // memory driver has no rollback). Scoped to this course, so a draft that
      // is missing, on another course, or unreachable is one identical 404.
      if (input.draftId !== undefined) {
        const draft = await this.draftRepo.incrementUsedCount(input.draftId, courseId);
        if (!draft) {
          throw new NotFoundException(TASK_DRAFT_NOT_FOUND);
        }
      }

      const assessment = await this.assessmentRepo.create({
        courseId,
        lessonId: input.lessonId,
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        type: input.type,
        topics: input.topics,
        availableFrom: input.availableFrom,
        availableTo: input.availableTo,
        dueAt: input.dueAt,
        maxScore: input.maxScore,
        allowedFileTypes: input.allowedFileTypes,
        maxFileSizeBytes: input.maxFileSizeBytes,
        workType,
        // Only a `link` task stores a URL here. A Google Form's address is
        // resolved against Google and written as a binding instead - see below.
        externalUrl: workType === 'link' ? (input.externalUrl ?? null) : null,
        // The unit-6 settings. Later slices thread the rest of them through.
        visibility: input.visibility ?? 'published',
        markerId: input.markerId ?? null,
        allowResubmission: input.allowResubmission ?? true,
        submissionModes: input.submissionModes ?? [],
        draftId: input.draftId ?? null,
        attachments: input.attachments ?? [],
      });

      // Binding talks to Google, so it happens *inside* the transaction on
      // purpose: a form that cannot be read must not leave a `google_form` task
      // behind with nothing attached to it - that task would render a button
      // going nowhere, and §5.18's rule is that authoring mistakes surface on
      // the form rather than on the due date.
      //
      // The cost is a network call holding a transaction open. Acceptable here
      // because it happens once per task at authoring time, by a human who is
      // waiting for the result anyway - and the alternative (bind afterwards,
      // outside) is exactly the crash-in-the-gap shape §5.4 spent a migration
      // closing for audit entries.
      await this.binder.bindExternal(
        assessment.id,
        workType,
        input.googleForm ?? input.externalUrl ?? '',
      );
      const targets = await this.assessmentRepo.setTargets(
        assessment.id,
        input.targets,
      );

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assessment.created',
        targetType: 'assessment',
        targetId: assessment.id,
        courseId,
        before: null,
        after: {
          title: assessment.title,
          type: assessment.type,
          dueAt: assessment.dueAt,
          maxScore: assessment.maxScore,
          // The audience, as a count and a list of ids joined into one scalar -
          // §5.4's snapshots are flat and scalar on purpose, and "who was this
          // set for" is the question a dispute actually turns on.
          targetGroups: targets.map((target) => target.groupId).join(','),
          draftId: assessment.draftId,
          attachmentCount: assessment.attachments.length,
          allowResubmission: assessment.allowResubmission,
          visibility: assessment.visibility,
          markerId: assessment.markerId,
          // Flat and scalar, as every snapshot here is.
          submissionModes: assessment.submissionModes.join(','),
        },
      });
      return { ...assessment, targets };
    });
  }

  async update(
    assessmentId: string,
    actor: StaffActor,
    update: UpdateAssessmentInput,
  ): Promise<AuthoredAssessment> {
    return this.db.runInTransaction(async () => {
      const before = await this.loadInScope(assessmentId, actor);
      if (update.visibility === 'hidden') {
        await this.assertMayHide(assessmentId);
      }
      // Only a CHANGED marker is checked (review F-1). Re-validating the one
      // already stored would refuse every edit to a task whose marker has
      // drifted - forcing the teacher to clear it, which is exactly what
      // `D-32` says never happens. An unchanged value is a no-op.
      if (update.markerId !== undefined && update.markerId !== before.markerId) {
        // Checked against the task's CURRENT audience; re-aiming it later does
        // not revisit this (drift is displayed, not repaired - `D-32`).
        const audience = await this.assessmentRepo.findTargets(assessmentId);
        await this.assertMarker(
          actor,
          update.markerId,
          before.markerId,
          audience.map((t) => t.groupId),
        );
      }
      this.assertWindow(
        update.availableFrom ?? before.availableFrom,
        update.availableTo ?? before.availableTo,
        update.dueAt ?? before.dueAt,
      );

      // Validated against the **merged** result, not the patch. Switching to
      // `link` without sending a URL, or to `google_form` without a form, would
      // otherwise pass - the patch alone looks fine, and it is only the
      // combination with what is already stored that is incoherent. Same merge
      // shape as the window check above.
      const workType = update.workType ?? before.workType;
      this.assertWorkTypePayload(workType, {
        externalUrl: update.externalUrl ?? before.externalUrl,
        // Deliberately *not* falling back to a stored value: there is no
        // `googleForm` on the assessment, and a form that is already bound
        // satisfies the requirement without one being resent.
        googleForm:
          update.googleForm ??
          (workType === 'google_form' && before.workType === 'google_form'
            ? 'already-bound'
            : undefined),
      });

      const { googleForm, ...columns } = update;
      const after = await this.assessmentRepo.update(assessmentId, {
        ...columns,
        // Clearing the URL when a task stops being a link: leaving it behind is
        // harmless to the read path (which selects on `work_type`) but it makes
        // the row say something untrue about itself.
        externalUrl:
          update.workType !== undefined && update.workType !== 'link'
            ? null
            : columns.externalUrl,
      });
      if (!after) {
        throw new NotFoundException(ASSESSMENT_NOT_FOUND);
      }

      // Re-bind when a form was supplied, or when the task has just become a
      // form task. Binding talks to Google and can throw, which aborts the
      // whole edit - the same deliberate choice `create` makes, and for the
      // same reason: a `google_form` task with nothing attached renders a
      // button going nowhere.
      if (googleForm) {
        await this.binder.bindExternal(assessmentId, workType, googleForm);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assessment.updated',
        targetType: 'assessment',
        targetId: assessmentId,
        courseId: before.courseId,
        // Only what a reader needs to see the change. `before` is read before the
        // write and both repositories return copies, so this pair really differs
        // (§7.1 records finding the aliasing bug twice).
        before: {
          title: before.title,
          dueAt: before.dueAt,
          availableTo: before.availableTo,
          maxScore: before.maxScore,
          attachmentCount: before.attachments.length,
          allowResubmission: before.allowResubmission,
          visibility: before.visibility,
          markerId: before.markerId,
          submissionModes: before.submissionModes.join(','),
        },
        after: {
          title: after.title,
          dueAt: after.dueAt,
          availableTo: after.availableTo,
          maxScore: after.maxScore,
          attachmentCount: after.attachments.length,
          allowResubmission: after.allowResubmission,
          visibility: after.visibility,
          markerId: after.markerId,
          submissionModes: after.submissionModes.join(','),
        },
      });
      return { ...after, targets: await this.assessmentRepo.findTargets(assessmentId) };
    });
  }

  /** Re-aims an existing task. Replaces the whole audience, never diffs it. */
  async setTargets(
    assessmentId: string,
    actor: StaffActor,
    targets: NewAssessmentTarget[],
  ): Promise<AuthoredAssessment> {
    return this.db.runInTransaction(async () => {
      const assessment = await this.loadInScope(assessmentId, actor);
      const before = await this.assessmentRepo.findTargets(assessmentId);
      // `D-33`: refuse, rather than silently drop the groups this caller
      // cannot see. Checked before the new set, so every group that is then
      // refused below is one they are trying to ADD.
      for (const target of before) {
        if (!(await this.scope.mayReachGroup(target.groupId, actor))) {
          throw new ForbiddenException(RETARGET_UNREACHABLE_AUDIENCE);
        }
      }
      await this.assertTargets(assessment.courseId, targets, actor);

      const after = await this.assessmentRepo.setTargets(assessmentId, targets);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assessment.targeted',
        targetType: 'assessment',
        targetId: assessmentId,
        courseId: assessment.courseId,
        before: { targetGroups: before.map((x) => x.groupId).join(',') },
        after: { targetGroups: after.map((x) => x.groupId).join(',') },
      });
      return { ...assessment, targets: after };
    });
  }

  /**
   * Deletes a task **only while nobody has submitted to it.**
   *
   * A submission is a student's work, and §6's convention is to keep history
   * where history matters. Once one exists the honest correction is to re-aim
   * the task or close its window, not to erase the record - so this refuses
   * rather than cascading, even though the FK would happily oblige. The
   * mistyped-task case is what it is for.
   */
  async remove(assessmentId: string, actor: StaffActor): Promise<void> {
    return this.db.runInTransaction(async () => {
      const assessment = await this.loadInScope(assessmentId, actor);
      const submissions = await this.assessmentRepo.findSubmissionsForAssessments([
        assessmentId,
      ]);
      if (submissions.length > 0) {
        throw new ConflictException(
          'This assessment has submissions and cannot be deleted. ' +
            'Close its availability window or re-target it instead.',
        );
      }
      // `D-36` (review F-3): synced external results are handed-in work too,
      // and deleting the task would cascade them away. Before unit 6's
      // remediation this path deleted them silently.
      if ((await this.externalResultCount(assessmentId)) > 0) {
        throw new ConflictException(
          'Students have already answered this task on its external form, so it ' +
            'cannot be deleted. Close its availability window instead.',
        );
      }
      await this.assessmentRepo.remove(assessmentId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assessment.deleted',
        targetType: 'assessment',
        targetId: assessmentId,
        courseId: assessment.courseId,
        before: {
          title: assessment.title,
          type: assessment.type,
          dueAt: assessment.dueAt,
        },
        after: null,
      });
    });
  }
}
