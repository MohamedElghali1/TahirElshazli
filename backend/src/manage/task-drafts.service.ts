import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type {
  AssessmentType,
  Attachment,
} from '../assessments/interfaces/assessment-repository.interface.js';
import type { WorkType } from '../assessments/interfaces/work-repository.interface.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import type {
  StoredTaskDraft,
  TaskDraftRepository,
  TaskDraftUpdate,
} from './interfaces/task-draft-repository.interface.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';

/**
 * The message a draft that does not exist **and** a draft on a course the
 * caller cannot reach both get. One exported `const`, asserted `===` between
 * the two paths in the specs: the anti-enumeration property (CLAUDE.md §7)
 * dies silently if the two strings drift by a byte.
 *
 * A draft is never listed on a screen the caller cannot reach, so the 403
 * exception for "a resource on the caller's own screen" does not apply.
 */
export const TASK_DRAFT_NOT_FOUND = 'Task draft not found';

export interface CreateTaskDraftInput {
  courseId: string;
  type: AssessmentType;
  workType?: WorkType;
  title: string;
  description?: string;
  instructions?: string;
  attachments?: Attachment[];
}

/**
 * The draft library (`TASK-2`).
 *
 * **Authorization grain.** A draft carries no group, so the finest grain
 * available is "the caller reaches this draft's course through a held group" -
 * exactly what `StaffScopeService.assertAssigned` and `scopeFor` compute since
 * `AUTH-2`. A draft exposes no roster, submission or cohort-dependent number,
 * so that is the group-grain answer for drafts rather than the `D-23` leak
 * (`AUTHORIZATION_MODEL.md` §4).
 *
 * **Who may edit whose draft.** Any staff member in scope may edit or delete
 * any draft in scope. `AUTHORIZATION_MODEL.md` §3 gives the assistant "Manage
 * the draft library" **without** the "own only" qualifier the blog row
 * carries, so there is no creator check here - stated so nobody adds one by
 * analogy with the blog.
 *
 * Every mutation commits with its audit entry in one `runInTransaction`.
 */
@Injectable()
export class TaskDraftsService {
  constructor(
    @Inject(TASK_DRAFT_REPOSITORY) private readonly drafts: TaskDraftRepository,
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * The courses this actor reaches, or `null` for unrestricted. A
   * never-configured assistant is `[]` - `scopeFor` fails closed.
   */
  private async reachableCourseIds(actor: StaffActor): Promise<string[] | null> {
    const scope = await this.scope.scopeFor(actor);
    return scope.unscoped ? null : scope.assignments.map((a) => a.courseId);
  }

  /**
   * Loads a draft the caller may act on, or throws `TASK_DRAFT_NOT_FOUND` -
   * identically for a missing id and for a draft on a course they cannot reach.
   *
   * Uses the non-throwing `scopeFor` rather than catching `assertAssigned`, so
   * `COURSE_NOT_IN_SCOPE` can never escape a draft-id route: there is no
   * course in the caller's request for that message to describe.
   */
  private async loadInScope(id: string, actor: StaffActor): Promise<StoredTaskDraft> {
    const draft = await this.drafts.findById(id);
    if (draft) {
      const courses = await this.reachableCourseIds(actor);
      if (courses === null || courses.includes(draft.courseId)) {
        return draft;
      }
    }
    throw new NotFoundException(TASK_DRAFT_NOT_FOUND);
  }

  /** The audit snapshot: flat and scalar, per `AuditSnapshot`. */
  private snapshot(draft: StoredTaskDraft) {
    return {
      title: draft.title,
      type: draft.type,
      workType: draft.workType,
      attachmentCount: draft.attachments.length,
    };
  }

  /**
   * Every draft the caller reaches. The filters narrow: a `courseId` outside
   * the reach intersects to nothing in the query (assumption A-4).
   */
  async list(
    actor: StaffActor,
    filter: { courseId?: string; type?: AssessmentType },
  ): Promise<StoredTaskDraft[]> {
    return this.drafts.findMany({
      courseIds: await this.reachableCourseIds(actor),
      courseId: filter.courseId,
      type: filter.type,
    });
  }

  async create(actor: StaffActor, input: CreateTaskDraftInput): Promise<StoredTaskDraft> {
    return this.db.runInTransaction(async () => {
      // An unreachable course and a nonexistent one are the same 404
      // (`COURSE_NOT_IN_SCOPE`) by construction - the course is named in the
      // request, so that is the honest message.
      await this.scope.assertAssigned(input.courseId, actor);
      const created = await this.drafts.create({
        courseId: input.courseId,
        type: input.type,
        workType: input.workType ?? 'file_upload',
        title: input.title,
        description: input.description ?? '',
        instructions: input.instructions ?? '',
        attachments: input.attachments ?? [],
        createdBy: actor.id,
      });
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'task_draft.created',
        targetType: 'task_draft',
        targetId: created.id,
        courseId: created.courseId,
        before: null,
        after: this.snapshot(created),
      });
      return created;
    });
  }

  async update(
    id: string,
    actor: StaffActor,
    patch: TaskDraftUpdate,
  ): Promise<StoredTaskDraft> {
    return this.db.runInTransaction(async () => {
      // A copy from both drivers, so `before` cannot alias `after`.
      const before = await this.loadInScope(id, actor);
      const after = await this.drafts.update(id, patch);
      if (!after) {
        throw new NotFoundException(TASK_DRAFT_NOT_FOUND);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'task_draft.updated',
        targetType: 'task_draft',
        targetId: id,
        courseId: before.courseId,
        before: this.snapshot(before),
        after: this.snapshot(after),
      });
      return after;
    });
  }

  /**
   * Tasks authored from this draft keep every word: they were copied, and
   * `assessments.draft_id` goes to NULL with the draft.
   */
  async remove(id: string, actor: StaffActor): Promise<void> {
    return this.db.runInTransaction(async () => {
      const before = await this.loadInScope(id, actor);
      await this.drafts.remove(id);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'task_draft.deleted',
        targetType: 'task_draft',
        targetId: id,
        courseId: before.courseId,
        before: { title: before.title, type: before.type },
        after: null,
      });
    });
  }
}
