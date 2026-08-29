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

export interface LiveSessionRepository {
  findByCourse(courseId: string): Promise<LiveSession[]>;
  findAttendanceForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceRecord[]>;
}

export const LIVE_SESSION_REPOSITORY = Symbol('LIVE_SESSION_REPOSITORY');
