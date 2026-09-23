/**
 * One student's mark for one session (migration 019, `SESS-3`).
 *
 * The composite `(sessionId, studentId)` is the whole key - same shape as the
 * old `attended` row, just a three-state `status` instead of a boolean and an
 * actor attached to it. `DOMAIN_MODEL.md` §5: "the boolean becomes an enum."
 *
 * `markedBy` and `markedAt` are never optional on a stored row - a mark that
 * exists was placed by somebody at some time. The **absence** of a row (not a
 * null status) is what "unmarked" means (`PHASE_PLAN.md` §3.1: "a missing
 * mark is not `absent`") - callers read that from a session's roster not
 * having an entry for a student, never from a field on this type.
 */
export interface Attendance {
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late';
  markedBy: string;
  markedAt: string;
}

/**
 * What a mark-attendance write supplies. Every field the caller's to give -
 * there is nothing the repository defaults, unlike `NewLiveSession`'s id.
 */
export type NewAttendance = Attendance;

export interface AttendanceRepository {
  /** Every mark for one session - the sheet a bulk write reads before it overwrites. */
  findBySession(sessionId: string): Promise<Attendance[]>;
  /**
   * One student's marks across a set of sessions. What the student's own
   * history, and the legacy per-course attendance summary
   * (`LiveSessionsService.getAttendanceSummary`), both need.
   */
  findForStudent(
    studentId: string,
    sessionIds: readonly string[],
  ): Promise<Attendance[]>;
  /**
   * Set one student's mark for one session, replacing whatever was there.
   * Idempotent by construction on the composite key, the same reason
   * `GroupRepository.addMember`'s `ON CONFLICT` is.
   */
  upsert(mark: NewAttendance): Promise<Attendance>;
  /**
   * Attendance has no FK-cascade partner in the memory driver the way
   * Postgres's `ON DELETE CASCADE` gives it for free - a session's remover
   * calls this itself, inside the same transaction, before removing the
   * session. Returns the count removed, for the cancellation's audit
   * `before` snapshot.
   */
  removeForSession(sessionId: string): Promise<number>;
}

export const ATTENDANCE_REPOSITORY = Symbol('ATTENDANCE_REPOSITORY');
