import type { WorkType } from './work-repository.interface.js';

export type AssessmentType = 'homework' | 'assignment' | 'quiz';

export type AssessmentStatus = 'locked' | 'available' | 'submitted' | 'corrected';

/**
 * Whether students can see a task at all (`D-28`). Two stored values only.
 *
 * `scheduled` is deliberately **not** a member: it is the derived label for
 * `published` with `now < availableFrom`, which the student read already
 * renders as locked-with-a-date. Storing it would give two sources for one
 * fact. `hidden` removes the task from every student read.
 */
export type TaskVisibility = 'published' | 'hidden';

/**
 * How a student may hand the work in (`D-31`). Recorded per task; the
 * multi-file model behind `photo_upload` (up to five photos) is unit 7's.
 */
export type SubmissionMode = 'pdf_upload' | 'doc_link' | 'photo_upload';

/**
 * A file or link that travels with a task or a draft - a passage, an audio
 * file, a mark scheme (`PRODUCT_SPEC.md` §2.1). A value object stored as a
 * JSONB array element, never a row of its own.
 *
 * `mimeType` and `sizeBytes` are display-only. Nothing decides anything on
 * them: they come from the client, and a client-declared MIME type is a label,
 * not a fact.
 */
export interface Attachment {
  url: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface StoredAssessment {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  /**
   * How the work is delivered and how it comes back - a **different axis** from
   * `type`, which says what the work is *for*. A Google Form quiz and a PDF
   * assignment differ here and agree there.
   *
   * Defaults to `file_upload` in both drivers and in the migration, so every
   * row that predates work types is correct without a backfill.
   */
  workType: WorkType;
  /**
   * Where a `link` task points; null for every other work type.
   *
   * A Google Form's URL deliberately does **not** live here - it needs an id, a
   * responder URI, a quiz flag and sync state, which is `GoogleFormBinding`.
   */
  externalUrl: string | null;
  topics: string[];
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  /** Per-assessment upload rules - never a global hardcoded whitelist. */
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  /** `D-28`. Defaults to `published` in both drivers and the migration. */
  visibility: TaskVisibility;
  /**
   * Who marks this (`D-32`). Null is "whoever opens it first"; the
   * claim-on-open is unit 7's. Never cleared when targets or scope later
   * drift - drift is displayed, not silently repaired.
   */
  markerId: string | null;
  /** `true` (the default) is today's rule: resubmission until window end. */
  allowResubmission: boolean;
  /** `D-31`. Empty is "not stated" - every row that predates the column. */
  submissionModes: SubmissionMode[];
  /**
   * The draft this task was authored from. Provenance only: the task's
   * content was **copied**, never linked live (`DOMAIN_MODEL.md` §4), and the
   * FK goes to NULL when the draft is deleted. Set once, at creation.
   */
  draftId: string | null;
  attachments: Attachment[];
  createdAt: string;
}

export interface StoredSubmission {
  id: string;
  assessmentId: string;
  studentId: string;
  fileUrl: string | null;
  answerText: string | null;
  /** First submission. Never moves - it is the start of the history. */
  submittedAt: string;
  /**
   * When the *current* content arrived. Advances on every resubmission, so
   * lateness is judged on the work actually being graded rather than on a
   * placeholder submitted before the deadline and swapped out afterwards.
   */
  lastSubmittedAt: string;
  updatedAt: string;
  score: number | null;
  correctedAt: string | null;
  feedback: string | null;
  /** Teacher's annotated copy; the original submission stays immutable. */
  annotatedFileUrl: string | null;
}

/**
 * A superseded version of a submission's content, kept so the correction
 * history required by the brief can be reconstructed. Written on every
 * resubmission; never mutated afterwards.
 */
export interface SubmissionRevision {
  id: string;
  submissionId: string;
  fileUrl: string | null;
  answerText: string | null;
  /** When this content was submitted. */
  submittedAt: string;
  /** When the student replaced it. */
  replacedAt: string;
}

export interface AssessmentFilter {
  type?: AssessmentType;
}

/**
 * What a teacher supplies when writing a task. `id` and `createdAt` are the
 * repository's to assign.
 */
export type NewAssessment = Omit<StoredAssessment, 'id' | 'createdAt'>;

/** A partial edit; `undefined` leaves a field alone, matching `RecordingUpdate`. */
export interface AssessmentUpdate {
  title?: string;
  description?: string;
  instructions?: string;
  topics?: string[];
  availableFrom?: string;
  availableTo?: string;
  dueAt?: string;
  maxScore?: number;
  allowedFileTypes?: string[];
  maxFileSizeBytes?: number;
  lessonId?: string | null;
  /**
   * Switching a task's delivery. Allowed rather than forbidden because the
   * realistic case is a teacher who picked the wrong kind on the form and
   * noticed immediately - the alternative is delete-and-recreate, which §5.18
   * already refuses once anything has been submitted.
   *
   * The service is what keeps the pair coherent (a `link` needs a URL, a
   * `google_form` needs a binding); the database enforces the first of those
   * as a CHECK so the invariant does not depend on the service being the only
   * writer.
   */
  workType?: WorkType;
  externalUrl?: string | null;
  visibility?: TaskVisibility;
  /** Nullable and clearing it is meaningful, so it takes `lesson_id`'s sentinel. */
  markerId?: string | null;
  allowResubmission?: boolean;
  submissionModes?: SubmissionMode[];
  /** Replaced as a whole, like `allowedFileTypes`. */
  attachments?: Attachment[];
  // `draftId` is absent on purpose: provenance is set once, at creation.
}

/**
 * The staff task list's filter (`TASK-6`). `groupIds` is the caller's reach,
 * resolved by `StaffScopeService.reachableGroupIds`: `null` is unrestricted
 * and `[]` is nothing. The restriction is applied **in the query**, never as a
 * filter over a wider read.
 */
export interface StaffTaskFilter {
  groupIds: readonly string[] | null;
  courseId?: string;
  groupId?: string;
  /** A case-insensitive title substring. Matched literally - `%` is a `%`. */
  search?: string;
}


/**
 * "This task was set for this group" (CLAUDE.md §5.16, answered 2026-09-10:
 * *"he could make a task then to submit for one or more groups with his own
 * selection."*).
 *
 * Read that carefully, because it is what this table is and is not. "Per group"
 * means the **audience** is chosen per group - it does *not* mean the task is
 * duplicated per group. So there is one `Assessment` row and one row here per
 * targeted group, `assessments.course_id` stays where it always was, and §5.6's
 * "average across all students" remains one average over one assessment rather
 * than ten averages that cannot honestly be combined.
 */
export interface AssessmentTarget {
  id: string;
  assessmentId: string;
  groupId: string;
  /**
   * **Overrides** of the assessment's own window, not copies of it. `null`
   * means inherit, which is why they are nullable rather than defaulted - a
   * default would freeze the inherited value at targeting time and silently
   * stop tracking later edits to the assessment itself.
   */
  availableFrom: string | null;
  availableTo: string | null;
  dueAt: string | null;
}

/** One group's targeting, as the authoring surface supplies it. */
export interface NewAssessmentTarget {
  groupId: string;
  availableFrom?: string | null;
  availableTo?: string | null;
  dueAt?: string | null;
}

/**
 * An assessment as one student sees it: the row, plus the window that actually
 * applies to them.
 *
 * The three timestamps on this shape are **already resolved** - the target's
 * override where there is one, the assessment's own otherwise - so
 * `computeStatus` (§5.10) needs no knowledge of targeting and there is exactly
 * one place that does the coalescing. `targetGroupId` is carried so a reader
 * can tell *why* they can see it, and so a support question about a wrong due
 * date has an answer.
 */
export interface TargetedAssessment extends StoredAssessment {
  targetGroupId: string;
  /** True when the window above came from the target rather than the assessment. */
  windowOverridden: boolean;
}

export interface AssessmentRepository {
  /**
   * Every assessment on a course, targeted or not.
   *
   * **This is the staff read.** It is deliberately *not* what a student sees:
   * after targeting landed (§5.16) a student sees only what was set for a group
   * they are in, which is `findByCourseForGroups` below. Keeping the two as
   * separate methods rather than one with an optional filter is the point - an
   * optional filter left off defaults to "show everything", and the failure
   * mode of getting this wrong is one cohort reading another's work.
   */
  findByCourse(
    courseId: string,
    filter?: AssessmentFilter,
  ): Promise<StoredAssessment[]>;
  /**
   * What a student sees: the assessments of this course that were targeted at
   * any of these groups, with each one's window already resolved against the
   * target's overrides.
   *
   * An empty `groupIds` returns nothing, and that is correct rather than
   * defensive - a student who is enrolled but not yet placed (§7.2) has been
   * set no work, and an empty course is what §5.16 says that state looks like.
   *
   * A student in two groups both given the same task sees it **once**, on the
   * longest-standing placement's terms - the same tie-break
   * `StudentGroupsService` names, so a due date and a classmate list cannot
   * resolve through different groups.
   */
  findByCourseForGroups(
    courseId: string,
    groupIds: readonly string[],
    filter?: AssessmentFilter,
  ): Promise<TargetedAssessment[]>;
  /**
   * One assessment as a student sees it, or null when it was not set for any
   * of their groups.
   *
   * Null rather than the untargeted row, because the caller turns it into the
   * same 404 an unenrolled student gets. Without this an assessment id would be
   * enough to read another cohort's task - enrollment alone stopped being
   * sufficient the moment work was set per group.
   */
  findByIdForGroups(
    assessmentId: string,
    groupIds: readonly string[],
  ): Promise<TargetedAssessment | null>;
  findById(assessmentId: string): Promise<StoredAssessment | null>;
  create(input: NewAssessment): Promise<StoredAssessment>;
  /** Null when there is no such assessment; the caller turns that into a 404. */
  update(
    assessmentId: string,
    update: AssessmentUpdate,
  ): Promise<StoredAssessment | null>;
  /**
   * Removes an assessment and everything targeted or submitted against it.
   *
   * Guarded by the caller, not here: `AssessmentAuthoringService` refuses to
   * delete anything with a submission, because a submission is a student's
   * work and §6 keeps history where history matters. This method exists for
   * the mistyped-task case and returns false when there was nothing to remove.
   */
  remove(assessmentId: string): Promise<boolean>;
  /**
   * Replaces the whole target set in one call - the audience is chosen as a
   * set, so setting it is one operation and not add/remove bookkeeping the
   * caller has to diff.
   *
   * Returns what the targeting now is.
   */
  setTargets(
    assessmentId: string,
    targets: readonly NewAssessmentTarget[],
  ): Promise<AssessmentTarget[]>;
  /** The staff read: who this task was set for. */
  findTargets(assessmentId: string): Promise<AssessmentTarget[]>;
  /**
   * Every task visible to a staff caller, across courses (`TASK-6`).
   *
   * A task is visible through a **target** the caller reaches - the group
   * grain from birth, not the course grain `AUTH-6` is narrowing. Ordered
   * `due_at DESC, id`. Not paged: two courses of ~20 tasks (CLAUDE.md §1).
   */
  findForStaff(filter: StaffTaskFilter): Promise<StoredAssessment[]>;
  /**
   * The targets of many tasks in one read, restricted to `groupIds` (`null` is
   * unrestricted) **in the query** - so a scoped caller never receives an
   * unheld group's id. Replaces a per-task `findTargets` fan-out.
   *
   * Group *names* are not joined here: the in-memory driver would have to reach
   * into another aggregate's repository to match, and a repository never calls
   * another (CLAUDE.md §5). The service resolves names in one batch read.
   */
  findTargetsForAssessments(
    assessmentIds: readonly string[],
    groupIds: readonly string[] | null,
  ): Promise<AssessmentTarget[]>;
  findSubmission(
    assessmentId: string,
    studentId: string,
  ): Promise<StoredSubmission | null>;
  /**
   * One student's submissions across many assessments, for the course
   * assessment list and the performance report. Both used to await
   * `findSubmission` once per assessment - free against an array, a round trip
   * each against Postgres, and a course has ten to twenty assessments.
   *
   * Scoped to `studentId` for the same reason `findSubmission` is: a batch read
   * is exactly where an unscoped query would leak a whole cohort's marks.
   */
  findSubmissionsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<StoredSubmission[]>;
  createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission>;
  /**
   * Replaces the student's answer, archiving the previous content as a revision.
   * `undefined` leaves a field untouched - a resubmission that supplies only
   * `answerText` must not silently erase an already-uploaded file.
   *
   * `studentId` is part of the predicate, not a convenience argument: a
   * submission id is otherwise all it takes to overwrite someone else's work.
   * It sits in the signature so no implementor can omit it and no future caller
   * has to remember it - today's single call site derives the id from
   * `findSubmission(assessmentId, studentId)` two lines earlier, which is a
   * property of that one call site and invisible here. The next caller is a TA
   * grading endpoint holding a submission id for a course it may not be
   * assigned to (CLAUDE.md §5.11).
   */
  updateSubmission(
    submissionId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission | null>;
  findRevisions(
    submissionId: string,
    studentId: string,
  ): Promise<SubmissionRevision[]>;
  /**
   * Every student's submissions across a set of assessments - the grading
   * queue's read, and the deliberate opposite of
   * `findSubmissionsForStudent` above.
   *
   * Unscoped by student *because that is the point*: a TA marking an
   * assignment needs the whole cohort. The scoping that keeps it safe is a
   * different one - the caller resolves `assessmentIds` from a course it has
   * already put through `StaffScopeService.assertAssigned` (CLAUDE.md §5.11).
   * Passing assessment ids rather than a course id is what makes that
   * impossible to skip: there is no course id here to be trusted unchecked.
   */
  findSubmissionsForAssessments(
    assessmentIds: readonly string[],
  ): Promise<StoredSubmission[]>;
  /**
   * How many submissions are still waiting to be graded, per course. Absent
   * means zero.
   *
   * Ungraded is derived from `corrected_at IS NULL`, never stored (§5.10) -
   * the same rule the read side applies, expressed once in SQL.
   *
   * Unlike `findSubmissionsForAssessments` this takes *course* ids, because
   * the caller wants a figure per course and resolving assessments first would
   * put the fan-out back. That difference matters for scoping: the caller must
   * have put every id through `StaffScopeService.assertAssigned` before
   * calling, since there is no assessment-id indirection here to enforce it.
   * `ManageService.overview` does, via `coursesInScope`.
   */
  countUngradedSubmissionsByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>>;
  /** One submission by id, for the grading screen. Null when it is gone. */
  findSubmissionById(submissionId: string): Promise<StoredSubmission | null>;
  /**
   * Records a mark and feedback against a submission.
   *
   * Writes only the correction columns. The student's own `fileUrl` and
   * `answerText` are never touched here - CLAUDE.md §5.5 keeps the original
   * submission immutable, and the annotated copy is a separate artifact
   * beside it (`annotatedFileUrl`), not an overwrite.
   *
   * `correctedAt` is stamped by the repository, not passed in, for the same
   * reason `submittedAt` is: a client-supplied correction time is a client
   * rewriting history.
   */
  gradeSubmission(
    submissionId: string,
    grade: {
      score: number;
      feedback: string | null;
      annotatedFileUrl: string | undefined;
    },
  ): Promise<StoredSubmission | null>;
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY');
