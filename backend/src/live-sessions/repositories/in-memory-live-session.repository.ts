import { Injectable } from '@nestjs/common';
import type {
  AttendanceRecord,
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
  NewLiveSession,
} from '../interfaces/live-session-repository.interface.js';

const STUB_SESSIONS: LiveSession[] = [
  {
    id: 'sess-1',
    courseId: 'course-1',
    title: 'Revision: Moles & Titrations',
    zoomLink: 'https://zoom.us/j/98765432101',
    scheduledAt: '2026-08-20T18:00:00Z',
    durationMinutes: 90,
  },
  {
    id: 'sess-2',
    courseId: 'course-1',
    title: 'Organic Chemistry Q&A',
    zoomLink: 'https://zoom.us/j/98765432102',
    scheduledAt: '2026-08-27T18:00:00Z',
    durationMinutes: 90,
  },
  {
    id: 'sess-3',
    courseId: 'course-1',
    title: 'Past Paper Walkthrough - Paper 1',
    zoomLink: 'https://zoom.us/j/98765432103',
    scheduledAt: '2026-09-03T18:00:00Z',
    durationMinutes: 120,
  },
  {
    id: 'sess-4',
    courseId: 'course-2',
    title: 'IELTS Speaking Practice',
    zoomLink: 'https://zoom.us/j/12345678901',
    scheduledAt: '2026-08-29T16:00:00Z',
    durationMinutes: 60,
  },
  {
    id: 'sess-5',
    courseId: 'course-2',
    title: 'IELTS Writing Task 2 Clinic',
    zoomLink: 'https://zoom.us/j/12345678902',
    scheduledAt: '2026-08-15T16:00:00Z',
    durationMinutes: 60,
  },
  {
    id: 'sess-6',
    courseId: 'course-2',
    title: 'IELTS Listening Strategies',
    zoomLink: 'https://zoom.us/j/12345678903',
    scheduledAt: '2026-08-08T16:00:00Z',
    durationMinutes: 60,
  },
];

const STUB_ATTENDANCE: AttendanceRecord[] = [
  {
    sessionId: 'sess-1',
    studentId: 'student-1',
    attended: true,
    attendedAt: '2026-08-20T18:02:00Z',
  },
  {
    sessionId: 'sess-5',
    studentId: 'student-1',
    attended: true,
    attendedAt: '2026-08-15T16:01:00Z',
  },
  {
    sessionId: 'sess-6',
    studentId: 'student-1',
    attended: false,
    attendedAt: null,
  },
];

@Injectable()
export class InMemoryLiveSessionRepository implements LiveSessionRepository {
  /**
   * A per-instance copy of the seed, and a copy of each row rather than a
   * shallow clone of the array.
   *
   * Both halves matter now that this repository has writes. A shared array
   * would leak a session scheduled in one test into the next; a shallow copy
   * would leave `update` mutating the module-level seed object through a
   * shared reference, which is the same class of bug the grading audit entry
   * hit when `findSubmissionById` handed back the stored object.
   */
  private readonly sessions: LiveSession[] = STUB_SESSIONS.map((s) => ({ ...s }));

  private readonly attendance: AttendanceRecord[] = STUB_ATTENDANCE.map((a) => ({
    ...a,
  }));

  /** Sequence for generated ids, so two writes in one millisecond differ. */
  private nextId = 1;

  private byDate(sessions: LiveSession[]): LiveSession[] {
    return sessions.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  async findByCourse(courseId: string): Promise<LiveSession[]> {
    return this.byDate(
      this.sessions.filter((s) => s.courseId === courseId).map((s) => ({ ...s })),
    );
  }

  async findAttendanceForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceRecord[]> {
    const sessionIds = new Set(
      this.sessions.filter((s) => s.courseId === courseId).map((s) => s.id),
    );
    return this.attendance
      .filter((a) => a.studentId === studentId && sessionIds.has(a.sessionId))
      .map((a) => ({ ...a }));
  }

  async findById(sessionId: string): Promise<LiveSession | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    // A copy, so a caller holding a "before" snapshot cannot watch it change
    // underneath them when `update` writes.
    return session ? { ...session } : null;
  }

  async create(input: NewLiveSession): Promise<LiveSession> {
    const session: LiveSession = {
      id: `sess-${Date.now()}-${this.nextId++}`,
      courseId: input.courseId,
      title: input.title,
      zoomLink: input.zoomLink,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
    };
    this.sessions.push(session);
    return { ...session };
  }

  async update(
    sessionId: string,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession | null> {
    const existing = this.sessions.find((s) => s.id === sessionId);
    if (!existing) {
      return null;
    }
    // Field by field rather than a spread of `patch`, so an explicit
    // `undefined` on the wire cannot blank a column.
    if (patch.title !== undefined) existing.title = patch.title;
    if (patch.zoomLink !== undefined) existing.zoomLink = patch.zoomLink;
    if (patch.scheduledAt !== undefined) existing.scheduledAt = patch.scheduledAt;
    if (patch.durationMinutes !== undefined) {
      existing.durationMinutes = patch.durationMinutes;
    }
    return { ...existing };
  }

  async remove(sessionId: string): Promise<boolean> {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      return false;
    }
    this.sessions.splice(index, 1);
    // Postgres does this through ON DELETE CASCADE on attendance; the memory
    // driver has to do it by hand or a later attendance read joins onto rows
    // for a session that no longer exists.
    for (let i = this.attendance.length - 1; i >= 0; i -= 1) {
      if (this.attendance[i]!.sessionId === sessionId) {
        this.attendance.splice(i, 1);
      }
    }
    return true;
  }
}
