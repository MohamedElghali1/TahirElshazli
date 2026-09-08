import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import type {
  AttendanceRecord,
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
  NewLiveSession,
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

const SESSION_COLUMNS =
  'id, course_id, title, zoom_link, scheduled_at, duration_minutes';

function toSession(row: SessionRow): LiveSession {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    zoomLink: row.zoom_link,
    scheduledAt: iso(row.scheduled_at),
    durationMinutes: row.duration_minutes,
  };
}

@Injectable()
export class PostgresLiveSessionRepository implements LiveSessionRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByCourse(courseId: string): Promise<LiveSession[]> {
    const rows = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM live_sessions
       WHERE course_id = $1
       ORDER BY scheduled_at`,
      [courseId],
    );
    return rows.map(toSession);
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

  async findById(sessionId: string): Promise<LiveSession | null> {
    const row = await this.db.queryOne<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM live_sessions WHERE id = $1`,
      [sessionId],
    );
    return row ? toSession(row) : null;
  }

  async create(input: NewLiveSession): Promise<LiveSession> {
    const row = await this.db.queryOne<SessionRow>(
      `INSERT INTO live_sessions
         (id, course_id, title, zoom_link, scheduled_at, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SESSION_COLUMNS}`,
      [
        randomUUID(),
        input.courseId,
        input.title,
        input.zoomLink,
        input.scheduledAt,
        input.durationMinutes,
      ],
    );
    if (!row) {
      // INSERT ... RETURNING yields a row or throws; a null means the driver
      // contract changed underneath us.
      throw new Error('live_sessions INSERT returned no row');
    }
    return toSession(row);
  }

  async update(
    sessionId: string,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession | null> {
    // COALESCE against the parameter leaves a column alone when the caller
    // omitted it, which keeps this one statement instead of a SET list
    // assembled by string concatenation (CLAUDE.md §8 - no string-built SQL).
    // The casts are needed because a bare NULL parameter has no type.
    const row = await this.db.queryOne<SessionRow>(
      `UPDATE live_sessions SET
         title            = COALESCE($2::text, title),
         zoom_link        = COALESCE($3::text, zoom_link),
         scheduled_at     = COALESCE($4::timestamptz, scheduled_at),
         duration_minutes = COALESCE($5::integer, duration_minutes)
       WHERE id = $1
       RETURNING ${SESSION_COLUMNS}`,
      [
        sessionId,
        patch.title ?? null,
        patch.zoomLink ?? null,
        patch.scheduledAt ?? null,
        patch.durationMinutes ?? null,
      ],
    );
    return row ? toSession(row) : null;
  }

  async remove(sessionId: string): Promise<boolean> {
    // attendance rows go with it through ON DELETE CASCADE. That is a real
    // loss of history - the same caveat `ManageRecordingsService.remove`
    // carries - and is why cancelling a session is audited with a before
    // snapshot (CLAUDE.md §5.4).
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM live_sessions WHERE id = $1 RETURNING id',
      [sessionId],
    );
    return rows.length > 0;
  }
}
