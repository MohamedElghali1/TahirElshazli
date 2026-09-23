/**
 * Work types, external bindings, and the results pulled back from them.
 *
 * A separate interface from `AssessmentRepository` rather than more methods on
 * it. The split follows the data: `AssessmentRepository` owns the task and the
 * submissions this platform witnessed, and this owns the *mirror* of records
 * owned by somebody else's system. They have different write cadences (a task
 * is edited by a human, a mirror is rewritten by a sync), different
 * immutability rules (§5.5 keeps a submission immutable; a re-sync legitimately
 * overwrites a result), and different failure modes.
 */

/**
 * How work is delivered and how it comes back.
 *
 * A **different axis** from `AssessmentType` (homework/assignment/quiz), which
 * says what the work is *for*. A Google Form quiz and a PDF assignment differ
 * here and can agree there, which is why these are two fields and not one
 * union of nine members.
 *
 * Adding a member is the extensibility path the client asked for: a value here,
 * a CHECK in the migration, a `WorkTypeDescriptor` below, and - only if it
 * pulls results back - a provider. Nothing else in the system branches on it.
 */
export type WorkType = 'file_upload' | 'link' | 'google_form';

/**
 * Which external system a result came from.
 *
 * Deliberately broader than the one value it currently holds. `external_results`
 * names no vendor, so a second provider is this union, a CHECK constraint and a
 * client class - never a schema change and never a second analytics path.
 */
export type ResultProvider = 'google_form';

/** The Google Form bound to an assessment, plus its sync state. */
export interface GoogleFormBinding {
  assessmentId: string;
  /** The API's form id, from the `/edit` URL - not the student-facing one. */
  formId: string;
  /** Google's own published link. Never constructed from `formId`. */
  responderUri: string;
  title: string;
  isQuiz: boolean;
  /** Re-read on each sync: a question added mid-term changes the denominator. */
  totalPoints: number | null;
  /**
   * Three states. `null` is *could not determine*, not "no" - the setting is
   * not exposed consistently across API revisions, and a warning that fires on
   * correctly-configured forms is one people learn to ignore.
   */
  collectsEmail: boolean | null;
  boundAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface NewGoogleFormBinding {
  assessmentId: string;
  formId: string;
  responderUri: string;
  title: string;
  isQuiz: boolean;
  totalPoints: number | null;
  collectsEmail: boolean | null;
}

/**
 * One response mirrored from an external system.
 *
 * `studentId` is nullable and that is the most important thing about this
 * shape. A response that matches no known student is real data - it is a
 * student who used a different email, or a form that collects none - and
 * dropping it would make the completion count quietly wrong. It goes to a
 * reconciliation queue instead.
 */
export interface ExternalResult {
  id: string;
  assessmentId: string;
  provider: ResultProvider;
  externalId: string;
  studentId: string | null;
  /** What the provider said identifies the respondent; an email, for Google. */
  respondentId: string | null;
  score: number | null;
  /** The denominator at the time of this response, stored per row. */
  maxScore: number | null;
  submittedAt: string;
  /** The provider's payload, for the per-question "View" detail. */
  raw: unknown;
  syncedAt: string;
}

export type NewExternalResult = Omit<ExternalResult, 'id' | 'syncedAt'>;

/**
 * One student's latest mirrored score on one form - the mark book's cell
 * (unit 7, `D-46`). No payload and no respondent: the grid shows a number.
 */
export interface LatestResultScore {
  assessmentId: string;
  studentId: string;
  score: number | null;
  /** The denominator stored with THIS response. */
  maxScore: number | null;
  submittedAt: string;
}

/** Counts for one assessment, computed in SQL rather than by loading rows. */
export interface ResultTally {
  /** Responses attributed to a known student. */
  matched: number;
  /** Responses that matched nobody - the reconciliation queue's size. */
  unmatched: number;
  /** Mean score over matched, scored responses. Null when none carry a score. */
  averageScore: number | null;
  averageMaxScore: number | null;
}

export interface WorkRepository {
  // -- Google Form bindings -------------------------------------------------

  findBinding(assessmentId: string): Promise<GoogleFormBinding | null>;
  /**
   * Many bindings at once, for the staff assessment list - which renders a
   * badge per row and would otherwise be one query per assessment. Missing ids
   * are absent rather than null.
   */
  findBindings(
    assessmentIds: readonly string[],
  ): Promise<Record<string, GoogleFormBinding>>;
  /** Idempotent: re-binding the same form updates the cached metadata. */
  upsertBinding(input: NewGoogleFormBinding): Promise<GoogleFormBinding>;
  /** False when there was no binding, so switching work type twice is not a lie. */
  removeBinding(assessmentId: string): Promise<boolean>;
  /**
   * Records the outcome of a sync attempt. One method for both outcomes,
   * because success must clear a stale error - leaving it behind would make
   * the screen warn about a sync that just worked.
   */
  markSynced(assessmentId: string, error: string | null): Promise<void>;

  // -- External results -----------------------------------------------------

  /**
   * Replaces the mirrored results for one assessment in a single call.
   *
   * A set operation rather than per-row upserts, because that is what a sync
   * *is*: the provider's current truth, wholesale. Doing it row by row would
   * also leave no way to notice a response that was deleted upstream.
   *
   * Returns what is now stored. Implementations must preserve the identity of
   * rows that already existed (matched by `externalId`) so a re-sync does not
   * renumber anything a reader might be holding.
   */
  replaceResults(
    assessmentId: string,
    provider: ResultProvider,
    results: readonly NewExternalResult[],
  ): Promise<ExternalResult[]>;
  findResults(assessmentId: string): Promise<ExternalResult[]>;
  /**
   * One result by its own id, for the routes addressed by result rather than by
   * assessment.
   *
   * Exists so reconciliation can resolve a result to its assessment - and from
   * there to its course - *before* deciding whether the caller may touch it.
   * Without it there is no way to scope `POST /staff/results/:id/attach`, and an
   * unscoped attach lets a TA write into another cohort's marks (CLAUDE.md
   * §5.11).
   */
  findResultById(resultId: string): Promise<ExternalResult | null>;
  /**
   * Only the responses that matched nobody - the reconciliation queue.
   *
   * Its own method rather than a filter on `findResults`, for the same reason
   * `AssessmentRepository` splits the staff and student reads: an optional
   * filter left off defaults to "everything", and here that would mean a
   * teacher's queue silently listing every response as needing attention.
   */
  findUnmatchedResults(assessmentId: string): Promise<ExternalResult[]>;
  /**
   * One student's results across many assessments - the per-student analytics
   * table. Scoped to `studentId` for the same reason
   * `findSubmissionsForStudent` is: a batch read is exactly where an unscoped
   * query leaks a cohort's marks.
   */
  findResultsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<ExternalResult[]>;
  /**
   * Attributes a previously unmatched response to a student.
   *
   * The staff half of reconciliation. Returns null when the result is gone or
   * was already attributed - re-attributing an already-matched row would be a
   * silent reassignment of somebody's mark, so it is refused rather than
   * accepted.
   */
  attachResultToStudent(
    resultId: string,
    studentId: string,
  ): Promise<ExternalResult | null>;
  /**
   * Per-assessment counts, computed in SQL.
   *
   * A count-only read, following the four CLAUDE.md §7.1 names: the analytics
   * screen wants five integers, and materialising every response row to reduce
   * them in JavaScript is the shape §7.3 says to avoid even at 300 students.
   */
  tallyResults(assessmentId: string): Promise<ResultTally>;
  /**
   * How many of these assessments the student has a result for, keyed by
   * assessment id. Absent means none.
   *
   * Exists so the student's assessment list can resolve "submitted" for
   * form-based work without loading payloads it will not render.
   */
  countResultsByAssessments(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<Record<string, number>>;
  /**
   * The **latest** matched response per (form, student), for many students at
   * once - the mark book's Google Form columns (unit 7, `D-46`).
   *
   * One read for a whole roster, never one per student (CLAUDE.md §1).
   * "Latest" is decided HERE, by `(submitted_at, id)` descending, so both
   * drivers agree on which of two responses a student's cell shows. Restricted
   * to the students named in the query - the batch-read leak
   * `findResultsForStudent` warns about. Unmatched responses (no student) are
   * never returned.
   */
  findLatestScoresForStudents(
    assessmentIds: readonly string[],
    studentIds: readonly string[],
  ): Promise<LatestResultScore[]>;
}

export const WORK_REPOSITORY = Symbol('WORK_REPOSITORY');

/**
 * Attaches whatever an external work type needs, at authoring time.
 *
 * A port rather than a direct dependency on the Google sync service, for two
 * reasons that point the same way.
 *
 * The first is the extensibility the client asked for: a second provider
 * implements this and the authoring service does not change. The discriminator
 * is passed in rather than baked into the implementation, so the *authoring*
 * service never learns which providers exist.
 *
 * The second is that the alternative was visibly wrong. Injecting the sync
 * service directly dragged an OAuth client, a credential repository and an HTTP
 * client into the dependency graph of every test that creates an assignment -
 * and a test for "the availability window must be coherent" that has to stub
 * Google is a test whose setup is lying about what the code depends on.
 */
export interface ExternalWorkBinder {
  /**
   * Called inside the authoring transaction. A no-op for work types with
   * nothing external to attach, so the caller does not branch.
   *
   * Throwing aborts the write, which is the point: a `google_form` task whose
   * form could not be read must not be left behind pointing at nothing.
   */
  bindExternal(
    assessmentId: string,
    workType: WorkType,
    payload: string,
  ): Promise<void>;
}

export const EXTERNAL_WORK_BINDER = Symbol('EXTERNAL_WORK_BINDER');
