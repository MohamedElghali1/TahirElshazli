import type {
  AssessmentType,
  Attachment,
} from '../../assessments/interfaces/assessment-repository.interface.js';
import type { WorkType } from '../../assessments/interfaces/work-repository.interface.js';

/**
 * A reusable task template in the draft library (`TASK-2`, `DOMAIN_MODEL.md`
 * §4).
 *
 * A draft carries **content only** - title, text, attachments - and no window,
 * audience or submission settings: those belong to a task being set for real
 * people. Authoring from a draft **copies** its content into the form; the task
 * records `draftId` as provenance and is never linked live.
 *
 * A draft carries no group, so its authorization grain is the finest one
 * available to it: the caller reaches the draft's course through a held group
 * (`AUTHORIZATION_MODEL.md` §4). It exposes no roster, submission or
 * cohort-dependent number, so that is not the `D-23` leak.
 */
export interface StoredTaskDraft {
  id: string;
  courseId: string;
  type: AssessmentType;
  workType: WorkType;
  title: string;
  description: string;
  instructions: string;
  attachments: Attachment[];
  /**
   * How many tasks were authored from this draft. Server-owned, incremented
   * atomically by `incrementUsedCount`; a global fact about the draft rather
   * than a number that depends on who is looking.
   */
  usedCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NewTaskDraft = Omit<
  StoredTaskDraft,
  'id' | 'usedCount' | 'createdAt' | 'updatedAt'
>;

/**
 * A partial edit; `undefined` leaves a field alone. `courseId` is absent on
 * purpose (assumption A-1): moving a draft between courses would need a
 * two-course scope check for no product reason.
 */
export interface TaskDraftUpdate {
  type?: AssessmentType;
  workType?: WorkType;
  title?: string;
  description?: string;
  instructions?: string;
  attachments?: Attachment[];
}

export interface TaskDraftFilter {
  /**
   * The courses the caller reaches. `null` is unrestricted; `[]` is nothing,
   * answered without a round trip. The restriction is in the query.
   */
  courseIds: readonly string[] | null;
  courseId?: string;
  type?: AssessmentType;
}

export interface TaskDraftRepository {
  /** Most recently edited first: `updated_at DESC, id`. */
  findMany(filter: TaskDraftFilter): Promise<StoredTaskDraft[]>;
  /** A **copy** - it feeds the `before` of an audited edit (CLAUDE.md §9). */
  findById(id: string): Promise<StoredTaskDraft | null>;
  create(input: NewTaskDraft): Promise<StoredTaskDraft>;
  /** Stamps `updated_at`. Null when there is no such draft. */
  update(id: string, patch: TaskDraftUpdate): Promise<StoredTaskDraft | null>;
  /** True when a row was removed. Tasks authored from it keep their content. */
  remove(id: string): Promise<boolean>;
  /**
   * Adds exactly one to `used_count` **on this course only**, and returns the
   * draft - or null when there is no such draft on that course. One atomic,
   * row-locking statement: it also holds the row so a concurrent delete cannot
   * race the task's `draft_id` insert that follows it.
   */
  incrementUsedCount(id: string, courseId: string): Promise<StoredTaskDraft | null>;
}

export const TASK_DRAFT_REPOSITORY = Symbol('TASK_DRAFT_REPOSITORY');
