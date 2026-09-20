import { Role } from '../../auth/roles.enum.js';

/**
 * The actions this codebase can record.
 *
 * A union rather than a free string, and deliberately short: it starts with the
 * two writes that exist. CLAUDE.md §5.4 requires *every* TA mutation to be
 * logged, and the cheapest way to keep that true is to make adding a mutating
 * endpoint force a decision here - a new grading route cannot log
 * `'submission.graded'` until someone adds it to this list, which is a compile
 * error rather than a silently unaudited action.
 *
 * Names are `<subject>.<past-tense verb>` so the admin feed reads as history.
 */
export type AuditAction =
  // ---------------------------------------------------------------------
  // RETAINED, UNUSED. `course_staff_assignments` is retired by `AUTH-2`, but
  // **retiring a table does not retire its audit history.** The log has no
  // foreign keys precisely so it outlives what it describes, and
  // `ListAuditLogQueryDto`'s `AUDIT_ACTION_VALUES` is built from this union -
  // so deleting a member here makes every historical row of that action
  // unfilterable with a 400. Do not tidy these away.
  | 'course_staff.assigned'
  | 'course_staff.unassigned'
  // The first TA mutation the log covers. §5.4 names grading explicitly, and
  // it is the action a student is most likely to dispute.
  | 'submission.graded'
  // Teacher-only writes (§2.2 grants a TA materials, not recordings), but
  // logged on the same terms: an admin action that changes what students can
  // see is history worth keeping.
  | 'recording.created'
  | 'recording.updated'
  | 'recording.deleted'
  // Scheduling, also teacher-only for now (§2.2's preset omits it; the
  // user-stories board's CRS-11 disagrees, which §11 records as unresolved).
  // A session carries a Zoom link students are told to click, so who changed
  // it and when is exactly the history §5.4 exists for.
  | 'live_session.scheduled'
  | 'live_session.updated'
  | 'live_session.cancelled'
  // The first TA mutation outside grading. Announcements fan out to real
  // people's notification feeds and cannot be recalled, so the entry is the
  // only record of who sent what to whom.
  | 'announcement.posted'
  // Groups (CLAUDE.md §5.16). Placement is the one here that §5.4 reaches
  // squarely: a TA decides which cohort a student sits in, which decides -
  // after 2026-09-10 - what work that student is set and how their dashboard
  // renders. "Which assistant moved this student out of the Saturday group"
  // is exactly the question the log exists to answer.
  | 'group.created'
  // The widened PATCH (`DOM-2`). One action covering name, course, assistant,
  // meets and room, rather than five: the `before`/`after` pair already says
  // which field moved, and five actions would make "what happened to this
  // group" five filters instead of one.
  | 'group.updated'
  // RETAINED, UNUSED, for the reason given at the top of this union. `renamed`
  // is superseded by `group.updated`; `course_added`/`course_removed` describe
  // `group_courses`, which migration 013 dropped when a group's course became
  // a column. Historical rows of all three still exist and must stay readable.
  | 'group.renamed'
  | 'group.course_added'
  | 'group.course_removed'
  | 'group.student_assigned'
  | 'group.student_removed'
  // Authoring (§5.18). Reachable by an assistant as of 2026-09-10 - the client
  // settled §11's open question in the wide direction - so these are TA
  // mutations of the kind §5.4 was written for: they decide what students are
  // set and when it is due.
  | 'assessment.created'
  | 'assessment.updated'
  | 'assessment.targeted'
  | 'assessment.deleted'
  // Attributing an external response to a student. A staff decision that
  // changes whose record carries a mark, which is squarely what §5.4 exists
  // for - and unlike grading, the *evidence* lives in someone else's system,
  // so this entry is the only durable record of who decided it was Ahmed's.
  | 'external_result.attached'
  // The Google integration. Teacher-only, and the only actions in this list
  // that change what a *third party* may be asked for on Dr. Tahir's behalf:
  // connecting stores a long-lived credential that can read every form his
  // Google account owns. "Who connected this, when, and as which account" is
  // the question §5.4 exists for, and it is also the entire history of the
  // credential - the row itself is deleted on disconnect rather than
  // soft-deleted, precisely because these two entries are the record.
  | 'google.connected'
  | 'google.disconnected'
  // The blog (CLAUDE.md §5.19). Reachable by an assistant - the client named
  // both actors on 2026-09-10 - and the only TA-writable surface whose output
  // is read by *anonymous visitors* rather than by enrolled students. That is
  // what earns it an entry here even though a post carries no student data:
  // "which assistant published this under Dr. Tahir's byline" is precisely the
  // question §5.4 exists to answer.
  | 'blog_post.created'
  | 'blog_post.updated'
  // The gallery, replaced as a set. Its own action rather than folded into
  // `updated`, because losing a post's images and rewording its title are
  // different mistakes and the log should distinguish them.
  | 'blog_post.media_set'
  | 'blog_post.deleted';

/** What the action happened *to*. Grows with `AuditAction`, for the same reason. */
export type AuditTargetType =
  // RETAINED, UNUSED - `course_staff_assignments` is retired by `AUTH-2`. Same
  // reason as the retained `AuditAction` members: historical rows name it.
  | 'course_staff_assignment'
  | 'assessment_submission'
  | 'recording'
  | 'live_session'
  | 'announcement'
  | 'group'
  // The placement is its own target rather than being filed under `group`:
  // "everything that happened to group-1" and "everything that happened to
  // this student's placement" are different questions, and
  // `audit_log (target_type, target_id, ...)` is indexed to answer either.
  //
  // `group_course` is RETAINED, UNUSED - the table it named was dropped by
  // migration 013, and its historical rows must stay filterable.
  | 'group_course'
  | 'group_membership'
  // The task itself. Its *audience* is not a separate target type: re-aiming a
  // task is a change to that task, and filing it elsewhere would split one
  // question - "what happened to this assignment?" - across two reads.
  | 'assessment'
  // The post. Its media is not a separate target type, for the same reason an
  // assessment's audience is not: replacing a gallery is a change to that
  // post, and filing it elsewhere would split "what happened to this post?"
  // across two reads.
  | 'blog_post'
  // The connected Google account. Its own target type rather than being filed
  // under the user who connected it: the thing acted on is the *grant*, and it
  // outlives any particular connect/disconnect cycle in a way that makes
  // "everything that happened to this integration" the useful question.
  | 'google_credential'
  // A mirrored external response. Its own target type rather than the
  // assessment's, because "what happened to this response" and "what happened
  // to this task" are different questions.
  | 'external_result';

/**
 * One side of a before/after pair.
 *
 * Flat and scalar on purpose. An audit entry has to stay readable years after
 * the code that wrote it changed shape, and a nested snapshot of a live entity
 * drags that entity's schema into the log - rename a field and the history
 * becomes ambiguous. Record the handful of values that actually changed.
 */
export type AuditSnapshot = Readonly<Record<string, string | number | boolean | null>>;

export interface AuditLogEntry {
  id: string;
  actorId: string;
  /**
   * The actor's role *at the time of the action*, not their role now. A TA who
   * is later promoted must not retroactively appear to have acted as an admin.
   */
  actorRole: Role;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /**
   * The course the action happened in, where there is one. This is what makes
   * "show me everything that happened in course-2" a single indexed read rather
   * than a scan plus a join per row.
   */
  courseId: string | null;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  createdAt: string;
}

/** What to record. `id` and `createdAt` are the repository's to assign. */
export type NewAuditLogEntry = Omit<AuditLogEntry, 'id' | 'createdAt'>;

export interface AuditLogFilter {
  actorId?: string;
  courseId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  /**
   * Pass back as `AuditLogQuery.cursor` for the next page, or null at the end.
   *
   * Keyset, not offset: this table only ever grows, and an offset page-2 read
   * silently repeats rows once anything is written between the two requests -
   * which for an append-only log is not an edge case but the normal state.
   * `audit-cursor.ts` explains why the cursor is a pair and not a timestamp.
   */
  nextCursor: string | null;
}

export interface AuditLogQuery extends AuditLogFilter {
  limit: number;
  /** An encoded `(createdAt, id)` pair from a previous page's `nextCursor`. */
  cursor?: string;
}

/**
 * Deliberately append-and-read only: there is no update and no delete.
 *
 * That is the whole point of the table (CLAUDE.md §5.4) and the interface is
 * where it is enforced - a method that does not exist cannot be called by
 * mistake, whereas a database trigger would also block the redaction path GDPR
 * (§8) may eventually need. If erasure becomes a requirement it should arrive
 * as its own named, itself-audited operation, not as a general `delete`.
 */
export interface AuditLogRepository {
  record(entry: NewAuditLogEntry): Promise<AuditLogEntry>;
  find(query: AuditLogQuery): Promise<AuditLogPage>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
