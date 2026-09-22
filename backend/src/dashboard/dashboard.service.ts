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
import { ReportsService } from '../reports/reports.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { LiveSession } from '../live-sessions/interfaces/live-session-repository.interface.js';

export interface DashboardStats {
  /** Homework the student still owes: type homework, open, nothing submitted. */
  homeworkPending: number;
  /** Marked work whose score and feedback have been released back to them. */
  answersAvailable: number;
  /** Recordings in the course the student has not started watching. */
  newRecordings: number;
  /** Grade average across marked work - performance, not completion. */
  overallReportPercentage: number | null;
}

/**
 * The four headline numbers, derived from a list the caller already holds.
 *
 * A free function rather than a method because two screens need it - the
 * per-course dashboard and the aggregated Home screen - and a second
 * implementation is precisely how the two would come to disagree. `status` is
 * read as the server derived it and never recomputed (§5.10); this only counts.
 */
export function deriveStats(
  assessments: readonly AssessmentListItem[],
  newRecordings: number,
  overallReportPercentage: number | null,
): DashboardStats {
  return {
    homeworkPending: assessments.filter(
      (a) => a.type === 'homework' && a.status === 'available',
    ).length,
    answersAvailable: assessments.filter((a) => a.status === 'corrected').length,
    newRecordings,
    overallReportPercentage,
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
  nextLiveSession: LiveSession | null;
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
    private readonly reportsService: ReportsService,
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
      newRecordings,
      quickAccess,
      nextLiveSession,
      performance,
      unreadNotifications,
    ] = await Promise.all([
      this.studentsService.getProfile(studentId),
      this.coursesService.getProgress(courseId, studentId),
      this.assessmentsService.getAssessmentsForCourse(courseId, studentId),
      this.recordingsService.countUnwatched(courseId, studentId),
      this.materialsService.getCounts(courseId, studentId),
      this.liveSessionsService.getNextSession(courseId, studentId),
      // `getPerformanceFor`, not `getSummary`: the dashboard reads one number
      // off it, and `getSummary` would re-assert this enrollment and rebuild a
      // `CourseProgress` - two recording reads - that `progress` above already
      // holds. Same arithmetic either way; `ReportsService.buildPerformance` is
      // the single implementation, so the figure cannot drift from the one the
      // Report screen shows.
      this.reportsService.getPerformanceFor(courseId, studentId),
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
      stats: deriveStats(
        assessments,
        newRecordings,
        performance.overallPercentage,
      ),
      nextLiveSession,
      quickAccess,
      unreadNotifications,
    };
  }
}

