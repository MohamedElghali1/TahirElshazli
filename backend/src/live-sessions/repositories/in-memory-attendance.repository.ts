import { Injectable } from '@nestjs/common';
import type {
  Attendance,
  AttendanceRepository,
  NewAttendance,
} from '../interfaces/attendance-repository.interface.js';

/**
 * Mirrors `InMemoryLiveSessionRepository`'s seed sessions and
 * `InMemoryGroupRepository`'s seed groups: both seeded groups are
 * `teacher-1`'s, matching migration 019's own `marked_by` backfill rule.
 */
const STUB_ATTENDANCE: Attendance[] = [
  {
    sessionId: 'sess-1',
    studentId: 'student-1',
    status: 'present',
    markedBy: 'teacher-1',
    markedAt: '2026-08-20T18:02:00Z',
  },
  {
    sessionId: 'sess-5',
    studentId: 'student-1',
    status: 'present',
    markedBy: 'teacher-1',
    markedAt: '2026-08-15T16:01:00Z',
  },
  {
    sessionId: 'sess-6',
    studentId: 'student-1',
    status: 'absent',
    markedBy: 'teacher-1',
    markedAt: '2026-08-08T16:05:00Z',
  },
];

@Injectable()
export class InMemoryAttendanceRepository implements AttendanceRepository {
  /** A per-instance copy of the seed, and a copy of each row - see the sibling session repository's comment. */
  private readonly marks: Attendance[] = STUB_ATTENDANCE.map((a) => ({ ...a }));

  async findBySession(sessionId: string): Promise<Attendance[]> {
    return this.marks.filter((a) => a.sessionId === sessionId).map((a) => ({ ...a }));
  }

  async findForStudent(
    studentId: string,
    sessionIds: readonly string[],
  ): Promise<Attendance[]> {
    const wanted = new Set(sessionIds);
    return this.marks
      .filter((a) => a.studentId === studentId && wanted.has(a.sessionId))
      .map((a) => ({ ...a }));
  }

  async upsert(mark: NewAttendance): Promise<Attendance> {
    const existing = this.marks.find(
      (a) => a.sessionId === mark.sessionId && a.studentId === mark.studentId,
    );
    if (existing) {
      existing.status = mark.status;
      existing.markedBy = mark.markedBy;
      existing.markedAt = mark.markedAt;
      return { ...existing };
    }
    const stored: Attendance = { ...mark };
    this.marks.push(stored);
    return { ...stored };
  }

  async removeForSession(sessionId: string): Promise<number> {
    let removed = 0;
    for (let i = this.marks.length - 1; i >= 0; i -= 1) {
      if (this.marks[i]!.sessionId === sessionId) {
        this.marks.splice(i, 1);
        removed += 1;
      }
    }
    return removed;
  }
}
