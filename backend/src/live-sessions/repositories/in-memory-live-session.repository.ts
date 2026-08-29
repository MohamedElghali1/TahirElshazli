import { Injectable } from '@nestjs/common';
import type {
  AttendanceRecord,
  LiveSession,
  LiveSessionRepository,
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
  async findByCourse(courseId: string): Promise<LiveSession[]> {
    return STUB_SESSIONS.filter((s) => s.courseId === courseId).sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  async findAttendanceForCourse(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceRecord[]> {
    const sessionIds = new Set(
      STUB_SESSIONS.filter((s) => s.courseId === courseId).map((s) => s.id),
    );
    return STUB_ATTENDANCE.filter(
      (a) => a.studentId === studentId && sessionIds.has(a.sessionId),
    );
  }
}
