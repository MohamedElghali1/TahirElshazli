import { Test, TestingModule } from '@nestjs/testing';
import { SUBMISSION_ANNOTATION_REPOSITORY } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import { InMemorySubmissionAnnotationRepository } from '../assessments/repositories/in-memory-submission-annotation.repository.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { WeeklyReportsService } from './weekly-reports.service.js';
import { REPORT_REPOSITORY } from './interfaces/report-repository.interface.js';
import { InMemoryReportRepository } from './repositories/in-memory-report.repository.js';
import { WEEKLY_REPORT_REPOSITORY } from './interfaces/weekly-report-repository.interface.js';
import { InMemoryWeeklyReportRepository } from './repositories/in-memory-weekly-report.repository.js';
import { StudentSessionsService } from '../live-sessions/student-sessions.service.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NOTIFICATION_REPOSITORY } from '../notifications/interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from '../notifications/repositories/in-memory-notification.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { CoursesService } from '../courses/courses.service.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from '../recordings/repositories/in-memory-recording.repository.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { ATTENDANCE_REPOSITORY } from '../live-sessions/interfaces/attendance-repository.interface.js';
import { InMemoryAttendanceRepository } from '../live-sessions/repositories/in-memory-attendance.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { FileUrls } from '../common/storage/file-urls.service.js';
import { FILE_STORAGE } from '../common/storage/file-storage.interface.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};
const OTHER_STUDENT = {
  user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
};

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        // The learning mode lives on the group now (CLAUDE.md §5.2), so every
        // module that renders a student's course needs these two. Real
        // implementations rather than stubs: the resolution order (group,
        // then course default) is the part worth exercising.
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        StudentGroupsService,
        ReportsService,
        WeeklyReportsService,
        StudentSessionsService,
        AssessmentsService,
        CoursesService,
        RecordingsService,
        LiveSessionsService,
        NotificationsService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: REPORT_REPOSITORY, useClass: InMemoryReportRepository },
        { provide: WEEKLY_REPORT_REPOSITORY, useClass: InMemoryWeeklyReportRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: NOTIFICATION_REPOSITORY, useClass: InMemoryNotificationRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: SUBMISSION_ANNOTATION_REPOSITORY, useClass: InMemorySubmissionAnnotationRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: ATTENDANCE_REPOSITORY, useClass: InMemoryAttendanceRepository },
        { provide: FILE_STORAGE, useValue: null },
        FileUrls,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should compute the performance snapshot from graded submissions', async () => {
    const summary = await controller.getSummary('course-1', STUDENT);
    expect(summary.performance).toMatchObject({
      quizAverage: 75, // (18/20 + 12/20) / 2
      assignmentAverage: 86.3, // (35/40 + 34/40) / 2
      homeworkSubmissionRate: 67, // 2 of 3 homework tasks handed in
      overallPercentage: 80.5,
      gradedCount: 5,
    });
  });

  it('should keep progress and performance as separate, unblended blocks', async () => {
    const summary = await controller.getSummary('course-1', STUDENT);
    expect(summary.progress).toMatchObject({
      completedLessons: 5,
      totalLessons: 12,
      completionPercentage: 42,
    });
    // Completion (42%) and grade average (80.5%) must not be conflated.
    expect(summary.performance.overallPercentage).not.toBe(
      summary.progress.completionPercentage,
    );
    expect(summary.progress).not.toHaveProperty('overallPercentage');
  });

  it('should split topics into strong areas and areas needing improvement', async () => {
    const summary = await controller.getSummary('course-1', STUDENT);
    // Moles and Organic Chemistry both average 87.5, so the tie breaks by name.
    expect(summary.strongAreas.map((t) => t.topic)).toEqual([
      'Moles',
      'Organic Chemistry',
      'Atomic Structure',
    ]);
    expect(summary.needsImprovement).toEqual([
      { topic: 'Physical Chemistry', percentage: 73.8, gradedCount: 2 },
    ]);
  });

  it('should ignore ungraded work when averaging topics', async () => {
    const summary = await controller.getSummary('course-1', STUDENT);
    const atomic = summary.strongAreas.find((t) => t.topic === 'Atomic Structure');
    // Two Atomic Structure assessments exist, but only one is marked.
    expect(atomic).toMatchObject({ percentage: 80, gradedCount: 1 });
  });

  it('should report null averages and zero completion for a student with no work', async () => {
    const summary = await controller.getSummary('course-1', OTHER_STUDENT);
    expect(summary.performance).toMatchObject({
      quizAverage: null,
      assignmentAverage: null,
      overallPercentage: null,
      homeworkSubmissionRate: 0,
      gradedCount: 0,
    });
    expect(summary.strongAreas).toEqual([]);
  });

  it('should refuse a summary for a course the student is not enrolled in', async () => {
    await expect(controller.getSummary('course-2', OTHER_STUDENT)).rejects.toThrow();
  });

  it('should list report documents newest first, separate from the live summary', async () => {
    const documents = await controller.listDocuments('course-1', STUDENT);
    expect(documents.map((d) => d.id)).toEqual(['rpt-1', 'rpt-3', 'rpt-2']);
    expect(documents[0]).toMatchObject({
      title: 'Term Performance Report',
      period: 'Term 1 2026',
      overallPercentage: 80,
    });
  });

  it('should return a single report document to its owner', async () => {
    const document = await controller.getDocument('rpt-1', STUDENT);
    expect(document.fileUrl).toContain('term1-2026.pdf');
  });

  it('should not serve another student report document', async () => {
    await expect(controller.getDocument('rpt-1', OTHER_STUDENT)).rejects.toThrow();
  });

  it('should 404 an unknown report document', async () => {
    await expect(controller.getDocument('rpt-nope', STUDENT)).rejects.toThrow();
  });
});
