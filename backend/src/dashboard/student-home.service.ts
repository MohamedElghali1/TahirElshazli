import { Injectable } from '@nestjs/common';
import { CoursesService } from '../courses/courses.service.js';
import type { CourseListItem } from '../courses/courses.service.js';
import { StudentsService } from '../students/students.service.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import type { AssessmentListItem } from '../assessments/assessments.service.js';
import { MaterialsService } from '../materials/materials.service.js';
import type { MaterialCounts } from '../materials/materials.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import type { RecordingWithProgress } from '../recordings/interfaces/recording-repository.interface.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { StudentSessionsService } from '../live-sessions/student-sessions.service.js';
import type { StudentAttendanceSummary } from '../live-sessions/student-sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { NotificationListResponse } from '../notifications/notifications.service.js';
import type { StudentSessionView } from '../live-sessions/student-session-view.js';
import { deriveStats } from './dashboard.service.js';
import type { DashboardStats } from './dashboard.service.js';

/**
 * One enrolled course, with everything the Home screen draws for it.
 *
 * Deliberately NOT a `DashboardResponse`. That shape is the per-course
 * endpoint's, and it repeats three things this one must not:
 *
 *  - `progress`, which `course.progress` already carries. Computing it twice
 *    means two extra recording reads per course for a number the screen reads
 *    once.
 *  - `studentName` and `unreadNotifications`, which belong to the student, not
 *    the course. Repeating them per course invites a UI that reads the third
 *    copy and a backend that could disagree with itself.
 */
export interface StudentHomeEntry {
  course: CourseListItem;
  stats: DashboardStats;
  quickAccess: MaterialCounts;
  /** The student allow-list view, never the row - see `LiveSessionsService.getNextSession`. */
  nextLiveSession: StudentSessionView | null;
  assessments: AssessmentListItem[];
  /**
   * The continue-watching card's recording (`STU-1`), or `null` when the course
   * has none left to watch. From the same read `quickAccess`'s unwatched count
   * comes from - see `RecordingsService.getWatchState`.
   */
  continueWatching: RecordingWithProgress | null;
}

export interface StudentHomeResponse {
  studentName: string;
  entries: StudentHomeEntry[];
  notifications: NotificationListResponse;
  /**
   * The student's attendance across every group they sit in (`STU-1`) - one
   * figure for the student, not one per course, because `getAttendanceSummary`
   * is keyed on group membership and a group studies exactly one course
   * (migration `013`). Counts only; the history belongs to `/attendance`.
   */
  attendance: StudentAttendanceSummary;
}

/**
 * The whole student Home screen in one request.
 *
 * WHY THIS EXISTS. The screen is per-student but the data behind it was all
 * per-course, so the browser fanned out: `GET /courses`, then a dashboard and
 * an assessment list *per enrolled course*, then `/notifications` - `2N + 2`
 * requests, each one a fresh TLS write, JWT verification and user lookup before
 * it reads a row. The client asked to keep the dense layout, so the fan-out is
 * what had to go, not the screen.
 *
 * This moves the same fan-out to the server, where the hops are a process away
 * from the database instead of an internet away from the student. The query
 * count is roughly unchanged; the round trips the student waits on go to one.
 *
 * Composition only, through the same public services the per-course screens
 * use - so every enrollment check still runs at every call site, and no number
 * here is computed by a second implementation that could drift from the screen
 * it links to.
 */
@Injectable()
export class StudentHomeService {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly studentsService: StudentsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly materialsService: MaterialsService,
    private readonly recordingsService: RecordingsService,
    private readonly liveSessionsService: LiveSessionsService,
    private readonly studentSessionsService: StudentSessionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getHome(studentId: string): Promise<StudentHomeResponse> {
    // The three reads that are per-student rather than per-course. A student
    // with no enrollments still gets a name and a mailbox, which is the empty
    // state the screen draws rather than an error.
    const [profile, courses, notifications, attendance] = await Promise.all([
      this.studentsService.getProfile(studentId),
      this.coursesService.getEnrolledCourses(studentId),
      this.notificationsService.list(studentId, false),
      this.studentSessionsService.getAttendanceSummary(studentId),
    ]);

    const entries = await Promise.all(
      courses.map((course) => this.entryFor(course, studentId)),
    );

    return { studentName: profile.name, entries, notifications, attendance };
  }

  /**
   * `course` comes from `getEnrolledCourses`, which reads the student's own
   * enrollment rows - so the list itself is the authorization, and there is no
   * id here the caller chose. The four scoped services below still assert
   * enrollment independently; only `getPerformanceFor` trusts that, and it
   * documents why at its definition.
   */
  private async entryFor(
    course: CourseListItem,
    studentId: string,
  ): Promise<StudentHomeEntry> {
    const [assessments, watch, quickAccess, nextLiveSession] = await Promise.all([
      this.assessmentsService.getAssessmentsForCourse(course.id, studentId),
      this.recordingsService.getWatchState(course.id, studentId),
      this.materialsService.getCounts(course.id, studentId),
      this.liveSessionsService.getNextSession(course.id, studentId),
    ]);

    return {
      course,
      // Shared with the per-course dashboard rather than re-derived, so the
      // two screens cannot report different counts for the same course.
      stats: deriveStats(assessments, watch.unwatched),
      quickAccess,
      nextLiveSession,
      assessments,
      continueWatching: watch.resume,
    };
  }
}
