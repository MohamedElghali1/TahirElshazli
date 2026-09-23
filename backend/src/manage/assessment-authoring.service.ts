import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
}

/**
 * A partial edit, plus the one input that is not a column.
 *
 * `googleForm` is resolved against Google and written as a binding rather than
 * stored on the assessment, so it cannot ride along in `AssessmentUpdate` -
 * that type is the repository's contract and every field on it is a column.
 */
export type UpdateAssessmentInput = Omit<
  AssessmentUpdate,
  // Each of these has a rule of its own and is admitted by the slice that
  // enforces it - never passed through unchecked.
  'visibility' | 'markerId' | 'submissionModes'
> & {
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
  ) {}

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
      if (!studying.has(groupId)) {
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

  async create(
    courseId: string,
    actor: StaffActor,
    input: CreateAssessmentInput,
  ): Promise<AuthoredAssessment> {
    return this.db.runInTransaction(async () => {
      await this.scope.assertAssigned(courseId, actor);
      this.assertWindow(input.availableFrom, input.availableTo, input.dueAt);
      await this.assertTargets(courseId, input.targets);
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
        visibility: 'published',
        markerId: null,
        allowResubmission: input.allowResubmission ?? true,
        submissionModes: [],
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
        },
        after: {
          title: after.title,
          dueAt: after.dueAt,
          availableTo: after.availableTo,
          maxScore: after.maxScore,
          attachmentCount: after.attachments.length,
          allowResubmission: after.allowResubmission,
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
      await this.assertTargets(assessment.courseId, targets);

      const before = await this.assessmentRepo.findTargets(assessmentId);
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
        throw new BadRequestException(
          'This assessment has submissions and cannot be deleted. ' +
            'Close its availability window or re-target it instead.',
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
