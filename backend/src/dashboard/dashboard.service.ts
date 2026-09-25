import { Injectable } from '@nestjs/common';
import { CoursesService } from '../courses/courses.service.js';
import type { CourseProgress } from '../courses/courses.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { StudentsService } from '../students/students.service.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import type { AssessmentListItem } from '../assessments/assessments.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { MaterialsService } from '../materials/materials.service.js';
import type { MaterialCounts } from '../materials/materials.service.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { StudentSessionView } from '../live-sessions/student-session-view.js';

export interface DashboardStats {
  /** Homework the student still owes: type homework, open, nothing submitted. */
  homeworkPending: number;
  /** Marked work whose score and feedback have been released back to them. */
  answersAvailable: number;
  /** Recordings in the course the student has not started watching. */
  newRecordings: number;
}

/**
 * The three headline numbers, derived from a list the caller already holds.
 *
 * A free function rather than a method because two screens need it - the
 * per-course dashboard and the aggregated Home screen - and a second
 * implementation is precisely how the two would come to disagree. `status` is
 * read as the server derived it and never recomputed (§5.10); this only counts.
 *
 * It carried a fourth number until `STU-1`: `overallReportPercentage`, a grade
 * average. `PRODUCT_SPEC.md` §6 forbids a mark anywhere on the Overview and
 * `CLAUDE.md` §11.1.2 forbids progress and performance sharing a figure, so it
 * was removed from the response rather than merely left unrendered - a number
 * the screen may not show has no business travelling to the browser.
 */
export function deriveStats(
  assessments: readonly AssessmentListItem[],
  newRecordings: number,
): DashboardStats {
  return {
    homeworkPending: assessments.filter(
      (a) => a.type === 'homework' && a.status === 'available',
    ).length,
    answersAvailable: assessments.filter((a) => a.status === 'corrected').length,
    newRecordings,
  };
}

export interface DashboardResponse {
  studentName: string;
  course: {
    id: string;
    title: string;
    teacherName: string;
  };
  progress: CourseProgress;
  stats: DashboardStats;
  /** The student allow-list view, never the row - see `LiveSessionsService.getNextSession`. */
  nextLiveSession: StudentSessionView | null;
  quickAccess: MaterialCounts;
  unreadNotifications: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly studentsService: StudentsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly recordingsService: RecordingsService,
    private readonly materialsService: MaterialsService,
    private readonly liveSessionsService: LiveSessionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Composition only - every number here is read from the owning service so the
   * Home screen can never disagree with the screen it links to.
   */
  async getDashboard(
    courseId: string,
    studentId: string,
  ): Promise<DashboardResponse> {
    // The enrollment is the gate. There is no mode to resolve any more (`D-9`):
    // `progress` below carries completion *and* attendance for every student.
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const course = await this.coursesService.getCourse(courseId, studentId);

    const [
      profile,
      progress,
      assessments,
      watch,
      quickAccess,
      nextLiveSession,
      unreadNotifications,
    ] = await Promise.all([
      this.studentsService.getProfile(studentId),
      this.coursesService.getProgress(courseId, studentId),
      this.assessmentsService.getAssessmentsForCourse(courseId, studentId),
      this.recordingsService.getWatchState(courseId, studentId),
      this.materialsService.getCounts(courseId, studentId),
      this.liveSessionsService.getNextSession(courseId, studentId),
      // The `getPerformanceFor` read that used to sit here went with
      // `overallReportPercentage` (`STU-1`): the grade average is the Report
      // screen's, and this screen may not show it. `/marks` reads it from
      // `ReportsService` directly.
      this.notificationsService.countUnread(studentId),
    ]);

    return {
      studentName: profile.name,
      course: {
        id: course.id,
        title: course.title,
        teacherName: course.teacherName,
      },
      progress,
      stats: deriveStats(assessments, watch.unwatched),
      nextLiveSession,
      quickAccess,
      unreadNotifications,
    };
  }
}

