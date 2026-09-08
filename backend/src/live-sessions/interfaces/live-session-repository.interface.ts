export interface LiveSession {
  id: string;
  courseId: string;
  title: string;
  zoomLink: string;
  scheduledAt: string;
  durationMinutes: number;
}

export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  attended: boolean;
  attendedAt: string | null;
}

export interface LiveSessionWithAttendance extends LiveSession {
  attended: boolean;
  attendedAt: string | null;
}

/**
 * What the teacher supplies when scheduling a session.
 *
 * `id` is the repository's to assign. The Zoom link is whatever the teacher
 * pastes - there is no Zoom API automation in this phase (CLAUDE.md §11), so
 * this table stores a link rather than provisioning a meeting.
 */
export interface NewLiveSession {
  courseId: string;
  title: string;
  zoomLink: string;
  scheduledAt: string;
  durationMinutes: number;
}

/**
 * A partial edit; `undefined` leaves a field alone, matching
 * `RecordingUpdate` and `AssessmentRepository.updateSubmission`.
 *
 * `courseId` is absent on purpose. Moving a session to another course would
 * move it out from under the enrollment check that gates every read of it -
 * and would strand the attendance rows that key on the session - so a move is
 * a delete and a re-create, not a PATCH.
 */
export interface LiveSessionUpdate {
  title?: string;
  zoomLink?: string;
  scheduledAt?: string;
  durationMinutes?: number;
}

export interface LiveSessionRepository {
  findByCourse(courseId: string): Promise<LiveSession[]>;
  findAttendanceForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceRecord[]>;
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
