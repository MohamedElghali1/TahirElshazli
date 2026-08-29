import { Inject, Injectable } from '@nestjs/common';
import type {
  LiveSession,
  LiveSessionRepository,
  LiveSessionWithAttendance,
} from './interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';

export interface LiveSessionListResponse {
  upcoming: LiveSession[];
  past: LiveSessionWithAttendance[];
}

/** Attendance timeline for a live-mode course - the live counterpart to watch progress. */
export interface AttendanceSummary {
  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: {
    sessionId: string;
    title: string;
    sessionDate: string;
    attended: boolean;
  }[];
}

@Injectable()
export class LiveSessionsService {
  constructor(
    @Inject(LIVE_SESSION_REPOSITORY)
    private readonly liveSessionRepo: LiveSessionRepository,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  private hasEnded(session: LiveSession, now: Date): boolean {
    const endsAt =
      new Date(session.scheduledAt).getTime() + session.durationMinutes * 60_000;
    return endsAt <= now.getTime();
  }

  async getSessionsForCourse(
    courseId: string,
    studentId: string,
  ): Promise<LiveSessionListResponse> {
    // Zoom links are private to enrolled students.
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const now = new Date();
    const [sessions, attendance] = await Promise.all([
      this.liveSessionRepo.findByCourse(courseId),
      this.liveSessionRepo.findAttendanceForCourse(courseId, studentId),
    ]);
    const upcoming: LiveSession[] = [];
    const past: LiveSessionWithAttendance[] = [];
    for (const session of sessions) {
      if (this.hasEnded(session, now)) {
        const record = attendance.find((a) => a.sessionId === session.id);
        past.push({
          ...session,
          attended: record?.attended ?? false,
          attendedAt: record?.attendedAt ?? null,
        });
      } else {
        upcoming.push(session);
      }
    }
    return { upcoming, past };
  }

  /** The session the Home banner points at: the next one that has not ended yet. */
  async getNextSession(
    courseId: string,
    studentId: string,
  ): Promise<LiveSession | null> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const now = new Date();
    const sessions = await this.liveSessionRepo.findByCourse(courseId);
    return sessions.find((s) => !this.hasEnded(s, now)) ?? null;
  }

  /** Internal: callers (CoursesService.getProgress) assert enrollment first. */
  async getAttendanceSummary(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceSummary> {
    const now = new Date();
    const [sessions, attendance] = await Promise.all([
      this.liveSessionRepo.findByCourse(courseId),
      this.liveSessionRepo.findAttendanceForCourse(courseId, studentId),
    ]);
    // Only sessions that have already happened can count against attendance.
    const heldSessions = sessions.filter((s) => this.hasEnded(s, now));
    const timeline = heldSessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      sessionDate: s.scheduledAt,
      attended: attendance.find((a) => a.sessionId === s.id)?.attended ?? false,
    }));
    const attendedSessions = timeline.filter((t) => t.attended).length;
    return {
      attendedSessions,
      totalSessions: heldSessions.length,
      attendancePercentage:
        heldSessions.length === 0
          ? 0
          : Math.round((attendedSessions / heldSessions.length) * 100),
      timeline,
    };
  }
}
