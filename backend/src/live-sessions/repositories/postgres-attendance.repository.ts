import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  Attendance,
  AttendanceRepository,
  NewAttendance,
} from '../interfaces/attendance-repository.interface.js';

interface AttendanceRow {
  session_id: string;
  student_id: string;
  status: 'present' | 'absent' | 'late';
  marked_by: string;
  marked_at: Date;
}

const ATTENDANCE_COLUMNS = 'session_id, student_id, status, marked_by, marked_at';

function toAttendance(row: AttendanceRow): Attendance {
  return {
    sessionId: row.session_id,
    studentId: row.student_id,
    status: row.status,
    markedBy: row.marked_by,
    markedAt: iso(row.marked_at),
  };
}

@Injectable()
export class PostgresAttendanceRepository implements AttendanceRepository {
  constructor(private readonly db: DatabaseService) {}

  async findBySession(sessionId: string): Promise<Attendance[]> {
    const rows = await this.db.query<AttendanceRow>(
      `SELECT ${ATTENDANCE_COLUMNS} FROM attendance WHERE session_id = $1`,
      [sessionId],
    );
    return rows.map(toAttendance);
  }

  async findForStudent(
    studentId: string,
    sessionIds: readonly string[],
  ): Promise<Attendance[]> {
    if (sessionIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<AttendanceRow>(
      `SELECT ${ATTENDANCE_COLUMNS}
       FROM attendance
       WHERE student_id = $1 AND session_id = ANY($2::text[])`,
      [studentId, sessionIds],
    );
    return rows.map(toAttendance);
  }

  async upsert(mark: NewAttendance): Promise<Attendance> {
    // `(session_id, student_id)` is the primary key (migration 001), so this
    // is the same idempotent-write shape `GroupRepository.addMember` uses -
    // except here a repeat write is meant to actually change the mark
    // (correcting a mis-tap), not just describe a state that is already true.
    const row = await this.db.queryOne<AttendanceRow>(
      `INSERT INTO attendance (session_id, student_id, status, marked_by, marked_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, student_id) DO UPDATE
         SET status = EXCLUDED.status,
             marked_by = EXCLUDED.marked_by,
             marked_at = EXCLUDED.marked_at
       RETURNING ${ATTENDANCE_COLUMNS}`,
      [mark.sessionId, mark.studentId, mark.status, mark.markedBy, mark.markedAt],
    );
    return toAttendance(row as AttendanceRow);
  }

  async removeForSession(sessionId: string): Promise<number> {
    // `ON DELETE CASCADE` (migration 001) already removes these rows when the
    // session itself is deleted; this exists for the caller that needs the
    // count *before* that cascade fires, for an audit `before` snapshot.
    const rows = await this.db.query<{ session_id: string }>(
      'DELETE FROM attendance WHERE session_id = $1 RETURNING session_id',
      [sessionId],
    );
    return rows.length;
  }
}
