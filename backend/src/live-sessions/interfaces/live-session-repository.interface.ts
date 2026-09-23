/**
 * A live session, keyed to the group that meets in it (migration 019, `SESS-1`).
 *
 * `groupId` replaces `courseId` - re-parenting is the point (`DOMAIN_MODEL.md`
 * §5): two groups on the same course meet at different times, and "which
 * group does this session belong to" was previously unanswerable from the
 * row itself.
 *
 * No `mode`, no `location`. `D-9` (`CHANGELOG.md`) settled a session's
 * "room or meeting link" to the link, and there is exactly one - `meetingLink`
 * - nullable because a `planned` session need not have one yet.
 */
export interface LiveSession {
  id: string;
  groupId: string;
  title: string;
  meetingLink: string | null;
  scheduledAt: string;
  endsAt: string;
  /**
   * Display-only pairing with a co-teaching assistant, never an authorization
   * input - the same rule `groups.assistant_id` carries (migration 013).
   */
  assistantId: string | null;
  description: string | null;
  /** Staff-only. The student serializer must never carry this (`PHASE_PLAN.md` §3.5). */
  privateNotes: string | null;
  isVisible: boolean;
  /** `planned` is the draft timetable, locked until its date; `published` is live. */
  state: 'planned' | 'published';
}

/**
 * Attendance summary on a past session — the bare minimum `LiveSessionsService`
 * needs to project the legacy course-keyed view (`getSessionsForCourse`,
 * `getAttendanceSummary`). Only status and markedAt survive migration 019;
 * the pre-migration boolean `attended` is gone.
 *
 * This type is _not_ `Attendance` from `AttendanceRepository`: that carries the
 * actor (`markedBy`) too, and is owned by the attendance half of the split. This
 * lighter shape is what the course-keyed service can compute without leaking the
 * actor to the legacy student surface.
 */
export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late';
  markedAt: string;
}

/**
 * A past session with the student's own mark attached, for the legacy
 * `GET /courses/:id/live-sessions` response (`LiveSessionsService`).
 *
 * `attended` is the boolean projection (`status === 'present'`) that the old
 * API shape requires; `late` collapses to `false` there, which the field
 * comment states. S4 (`/students/me/attendance`) is where the full three-state
 * shape belongs.
 */
export interface LiveSessionWithAttendance extends LiveSession {
  /** `true` when `status === 'present'`, `false` for `absent` or `late`. */
  attended: boolean;
  /** `null` when this session has no mark for the student. */
  attendedAt: string | null;
}

/**
 * What the caller supplies when scheduling a session.
 *
 * `id` is the repository's to assign. The meeting link is whatever the
 * teacher pastes - there is no Zoom API automation in this phase
 * (CLAUDE.md §11), so this table stores a link rather than provisioning one.
 */
export interface NewLiveSession {
  groupId: string;
  title: string;
  meetingLink: string | null;
  scheduledAt: string;
  endsAt: string;
  assistantId: string | null;
  description: string | null;
  privateNotes: string | null;
  isVisible: boolean;
  state: 'planned' | 'published';
}

/**
 * A partial edit; `undefined` leaves a field alone, matching
 * `RecordingUpdate` and `AssessmentRepository.updateSubmission`.
 *
 * `groupId` is absent on purpose. Moving a session to another group would
 * move it out from under the scope check that gates every read of it - and
 * would strand the attendance rows that key on the session - so a move is a
 * delete and a re-create, not a PATCH.
 */
export interface LiveSessionUpdate {
  title?: string;
  meetingLink?: string | null;
  scheduledAt?: string;
  endsAt?: string;
  assistantId?: string | null;
  description?: string | null;
  privateNotes?: string | null;
  isVisible?: boolean;
  state?: 'planned' | 'published';
}

export interface LiveSessionRepository {
  /**
   * Every session of every named group, unordered guarantee aside from the
   * sort applied here - by `scheduledAt`, matching `findByCourse`'s old
   * contract. Empty array in, empty array out, the same as
   * `GroupRepository.findByIds`.
   */
  findByGroups(groupIds: readonly string[]): Promise<LiveSession[]>;
  /** Null when there is no such session; the caller turns that into a 404. */
  findById(sessionId: string): Promise<LiveSession | null>;
  create(input: NewLiveSession): Promise<LiveSession>;
  update(
    sessionId: string,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession | null>;
  /** False when there was nothing to remove, so a double-delete is not a lie. */
  remove(sessionId: string): Promise<boolean>;
}

export const LIVE_SESSION_REPOSITORY = Symbol('LIVE_SESSION_REPOSITORY');
