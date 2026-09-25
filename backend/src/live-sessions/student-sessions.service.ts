import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  LiveSession,
  LiveSessionRepository,
} from './interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import type {
  Attendance,
  AttendanceRepository,
} from './interfaces/attendance-repository.interface.js';
import { ATTENDANCE_REPOSITORY } from './interfaces/attendance-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { TimetableQueryDto } from './dto/student-sessions.dto.js';
import {
  isStudentVisible,
  toStudentSessionView,
  type StudentSessionView,
} from './student-session-view.js';

export type { StudentSessionView } from './student-session-view.js';

/** One row of the student's own attendance history. `null` when never marked. */
export interface StudentAttendanceHistoryItem {
  sessionId: string;
  groupId: string;
  title: string;
  scheduledAt: string;
  status: 'present' | 'late' | 'absent' | null;
  markedAt: string | null;
}

/**
 * The projection (`PHASE_PLAN.md` §3.3): `present / expected`, where `expected`
 * is the published sessions of the student's groups that have already ended.
 * `late` is its own count, folded into neither `present` nor `absent`, so the
 * number on screen stays explainable (`CLAUDE.md` §11.1.2 - this is attendance,
 * never progress and never performance).
 *
 * Split from the response for `STU-1`: the Overview shows the counts and never
 * the history, and shipping a term of session rows to draw one figure is the
 * field minimisation `CLAUDE.md` §8 asks for. Same arithmetic either way -
 * `collect` below is the single implementation.
 */
export interface StudentAttendanceSummary {
  present: number;
  late: number;
  absent: number;
  expected: number;
  /** `present / expected`, rounded; `0` when `expected` is `0`. */
  percentage: number;
}

export interface StudentAttendanceResponse extends StudentAttendanceSummary {
  history: StudentAttendanceHistoryItem[];
}

/**
 * The student's own session surface (`SESS-6`, `SESS-7`).
 *
 * Both routes start from `GroupRepository.findMembershipsForStudent` - a
 * student's reach is "every group they sit in", the same membership join
 * `StudentGroupsService` uses, never a course id taken from the client
 * (`PHASE_PLAN.md` §3.2: "never accept a studentId from the client on these
 * routes").
 */
@Injectable()
export class StudentSessionsService {
  constructor(
    @Inject(LIVE_SESSION_REPOSITORY)
    private readonly sessionRepo: LiveSessionRepository,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepo: GroupRepository,
  ) {}

  private hasEnded(session: LiveSession, now: Date): boolean {
    return new Date(session.endsAt).getTime() <= now.getTime();
  }

  private async groupIdsFor(studentId: string): Promise<string[]> {
    const memberships = await this.groupRepo.findMembershipsForStudent(studentId);
    return memberships.map((m) => m.groupId);
  }

  /**
   * `GET /students/me/timetable?from=&to=` (`SESS-6`).
   *
   * `state = 'published'` and `isVisible = true` only - a `planned` draft or a
   * hidden session is never sent to a student (`PHASE_PLAN.md` §3.2, the leak
   * this slice closes). A student in no groups gets `[]`, not a 404.
   */
  async getTimetable(
    studentId: string,
    query: TimetableQueryDto,
  ): Promise<StudentSessionView[]> {
    if (new Date(query.from).getTime() > new Date(query.to).getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const groupIds = await this.groupIdsFor(studentId);
    if (groupIds.length === 0) {
      return [];
    }

    const sessions = await this.sessionRepo.findByGroups(groupIds);
    const now = new Date();
    const fromTime = new Date(query.from).getTime();
    // Same bare-date widening as `ManageLiveSessionsService.list` (`PHASE_PLAN.md`
    // §4 note to S5): a bare `YYYY-MM-DD` `to` means "through the end of that day".
    const toTime = /^\d{4}-\d{2}-\d{2}$/.test(query.to)
      ? new Date(`${query.to}T23:59:59.999Z`).getTime()
      : new Date(query.to).getTime();

    return sessions
      .filter(isStudentVisible)
      .filter((s) => {
        const t = new Date(s.scheduledAt).getTime();
        return t >= fromTime && t <= toTime;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((s) => toStudentSessionView(s, now));
  }

  /**
   * The sessions that count towards attendance, with this student's marks.
   *
   * `expected` is `published` sessions of the student's groups that have
   * already ended - `isVisible` plays no part here (`PHASE_PLAN.md` §3.3
   * names only `state = published`, deliberately not the visibility flag that
   * gates the *upcoming* timetable): a session that happened is a fact of
   * record whether or not it is still shown on the timetable.
   */
  private async collect(studentId: string): Promise<{
    expectedSessions: LiveSession[];
    markBySession: Map<string, Attendance>;
    summary: StudentAttendanceSummary;
  }> {
    const groupIds = await this.groupIdsFor(studentId);
    const empty = { present: 0, late: 0, absent: 0, expected: 0, percentage: 0 };
    if (groupIds.length === 0) {
      return { expectedSessions: [], markBySession: new Map(), summary: empty };
    }

    const sessions = await this.sessionRepo.findByGroups(groupIds);
    const now = new Date();
    const expectedSessions = sessions.filter(
      (s) => s.state === 'published' && this.hasEnded(s, now),
    );

    const marks = await this.attendanceRepo.findForStudent(
      studentId,
      expectedSessions.map((s) => s.id),
    );

    const present = marks.filter((m) => m.status === 'present').length;
    const expected = expectedSessions.length;

    return {
      expectedSessions,
      markBySession: new Map(marks.map((m) => [m.sessionId, m])),
      summary: {
        present,
        late: marks.filter((m) => m.status === 'late').length,
        absent: marks.filter((m) => m.status === 'absent').length,
        expected,
        percentage: expected === 0 ? 0 : Math.round((present / expected) * 100),
      },
    };
  }

  /**
   * The counts alone, for the Overview's attendance figure (`STU-1`). Same
   * numbers `getAttendance` returns, from the same reads - a second
   * implementation is how the two screens would come to disagree.
   */
  async getAttendanceSummary(studentId: string): Promise<StudentAttendanceSummary> {
    const { summary } = await this.collect(studentId);
    return summary;
  }

  /**
   * `GET /students/me/attendance` (`SESS-7`).
   *
   * `history` lists every expected session with the student's mark, or `null`
   * when never marked - the same "absence is not absent" rule the staff sheet
   * uses (`AttendanceSheetItem`), read from the student's own side.
   */
  async getAttendance(studentId: string): Promise<StudentAttendanceResponse> {
    const { expectedSessions, markBySession, summary } = await this.collect(studentId);

    const history = expectedSessions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime() ||
          b.id.localeCompare(a.id),
      )
      .map((s) => {
        const mark = markBySession.get(s.id);
        return {
          sessionId: s.id,
          groupId: s.groupId,
          title: s.title,
          scheduledAt: s.scheduledAt,
          status: mark?.status ?? null,
          markedAt: mark?.markedAt ?? null,
        };
      });

    return { ...summary, history };
  }
}
