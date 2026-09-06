import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import type {
  AttendanceRecord,
  LiveSession,
  LiveSessionRepository,
} from '../interfaces/live-session-repository.interface.js';

interface SessionRow {
  id: string;
  course_id: string;
  title: string;
  zoom_link: string;
  scheduled_at: Date;
  duration_minutes: number;
}

interface AttendanceRow {
  session_id: string;
  student_id: string;
  attended: boolean;
  attended_at: Date | null;
}

@Injectable()
export class PostgresLiveSessionRepository implements LiveSessionRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByCourse(courseId: string): Promise<LiveSession[]> {
    const rows = await this.db.query<SessionRow>(
      `SELECT id, course_id, title, zoom_link, scheduled_at, duration_minutes
       FROM live_sessions
       WHERE course_id = $1
       ORDER BY scheduled_at`,
      [courseId],
    );
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      zoomLink: row.zoom_link,
      scheduledAt: iso(row.scheduled_at),
      durationMinutes: row.duration_minutes,
    }));
  }

  async findAttendanceForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceRecord[]> {
    // Attendance keys on the session (CLAUDE.md §6.1), so scoping it to a
    // course means joining through live_sessions rather than storing a
    // redundant course_id on the attendance row.
    const rows = await this.db.query<AttendanceRow>(
      `SELECT a.session_id, a.student_id, a.attended, a.attended_at
       FROM attendance a
       JOIN live_sessions s ON s.id = a.session_id
       WHERE s.course_id = $1 AND a.student_id = $2`,
      [courseId, studentId],
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      studentId: row.student_id,
      attended: row.attended,
      attendedAt: isoOrNull(row.attended_at),
    }));
  }
}
