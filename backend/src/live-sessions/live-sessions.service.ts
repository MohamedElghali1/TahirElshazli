import { Inject, Injectable } from '@nestjs/common';
import type {
  LiveSession,
  LiveSessionRepository,
} from './interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import type { AttendanceRepository } from './interfaces/attendance-repository.interface.js';
import { ATTENDANCE_REPOSITORY } from './interfaces/attendance-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import {
  isStudentVisible,
  toStudentSessionView,
  type StudentSessionView,
} from './student-session-view.js';

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

/**
 * **This whole service is course-keyed and superseded.** `PHASE_PLAN.md`
 * (unit 8) `[REPLACE]`s `GET /courses/:id/live-sessions` and `.../next` with
 * `GET /students/me/timetable` (§3.2, slice S4 - not yet built in this
 * checkout), because a session no longer belongs to a course at all: it
 * belongs to a group (migration 019, `SESS-1`), and a course can hold more
 * than one group.
 *
 * Kept compiling and working for the courses/dashboard callers that still use
 * it (`CoursesService.getProgress`, `DashboardService.getNextSession`) by
 * resolving the course to its groups first (`GroupRepository.findByCourse`,
 * unmodified) and unioning their sessions - the same translation a course
 * with exactly one group always resolved to before this reshape, and the
 * fixtures are exactly that shape. A course with several groups now shows the
 * union of all of them rather than an arbitrary one, which is a strict
 * improvement over what course-keying could ever represent, not a regression
 * S4 needs to fix.
 *
 * "Late" has no representation in this legacy boolean shape; `attended` here
 * means `status === 'present'` specifically, the same reading `AttendanceSummary`
 * used before `status` existed. S4's `GET /students/me/attendance` is where
 * the three-state projection described in `PHASE_PLAN.md` §3.3 belongs.
 */
@Injectable()
export class LiveSessionsService {
  constructor(
    @Inject(LIVE_SESSION_REPOSITORY)
    private readonly liveSessionRepo: LiveSessionRepository,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepo: GroupRepository,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  private hasEnded(session: LiveSession, now: Date): boolean {
    return new Date(session.endsAt).getTime() <= now.getTime();
  }

  private async sessionsForCourse(courseId: string): Promise<LiveSession[]> {
    const groups = await this.groupRepo.findByCourse(courseId);
    return this.liveSessionRepo.findByGroups(groups.map((g) => g.id));
  }

  /**
   * The session the Home banner points at: the next one that has not ended yet.
   *
   * **Returns the student allow-list view, never the row.** Both dashboards
   * (`GET /courses/:id/dashboard` and `GET /dashboard`) hand this straight to a
   * student, so returning a `LiveSession` here leaked `privateNotes` and an
   * unwithheld `meetingLink` through two routes that S4 never named - the same
   * leak the student timetable was rebuilt to close, surviving in a sibling
   * caller. Serialising at the source is what stops the next caller
   * reintroducing it.
   *
   * Unpublished and hidden sessions are filtered out for the same reason: a
   * draft-timetable date must not surface on the Home banner.
   */
  async getNextSession(
    courseId: string,
    studentId: string,
  ): Promise<StudentSessionView | null> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const now = new Date();
    const sessions = await this.sessionsForCourse(courseId);
    const next = sessions
      .filter(isStudentVisible)
      .find((s) => !this.hasEnded(s, now));
    return next ? toStudentSessionView(next, now) : null;
  }

  /** Internal: callers (CoursesService.getProgress) assert enrollment first. */
  async getAttendanceSummary(
    courseId: string,
    studentId: string,
  ): Promise<AttendanceSummary> {
    const now = new Date();
    const sessions = await this.sessionsForCourse(courseId);
    // Only sessions that have already happened can count against attendance.
    const heldSessions = sessions.filter((s) => this.hasEnded(s, now));
    const attendance = await this.attendanceRepo.findForStudent(
      studentId,
      heldSessions.map((s) => s.id),
    );
    const timeline = heldSessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      sessionDate: s.scheduledAt,
      attended:
        attendance.find((a) => a.sessionId === s.id)?.status === 'present',
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
