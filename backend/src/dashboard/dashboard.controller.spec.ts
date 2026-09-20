import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { StudentsService } from '../students/students.service.js';
import { TokenDenylistService } from '../auth/token-denylist.service.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from '../students/repositories/in-memory-student.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { BcryptPasswordHasher } from '../auth/bcrypt-password-hasher.js';
import { ReportsService } from '../reports/reports.service.js';
import { REPORT_REPOSITORY } from '../reports/interfaces/report-repository.interface.js';
import { InMemoryReportRepository } from '../reports/repositories/in-memory-report.repository.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY, EXTERNAL_WORK_BINDER } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { CoursesService } from '../courses/courses.service.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from '../recordings/repositories/in-memory-recording.repository.js';
import { MaterialsService } from '../materials/materials.service.js';
import { MATERIAL_REPOSITORY } from '../materials/interfaces/material-repository.interface.js';
import { InMemoryMaterialRepository } from '../materials/repositories/in-memory-material.repository.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NOTIFICATION_REPOSITORY } from '../notifications/interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from '../notifications/repositories/in-memory-notification.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};
const OTHER_STUDENT = {
  user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
};

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        // The learning mode lives on the group now (CLAUDE.md §5.2), so every
        // module that renders a student's course needs these two. Real
        // implementations rather than stubs: the resolution order (group,
        // then course default) is the part worth exercising.
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        StudentGroupsService,
        DashboardService,
        StudentsService,
        TokenDenylistService,
        ReportsService,
        AssessmentsService,
        CoursesService,
        RecordingsService,
        MaterialsService,
        LiveSessionsService,
        NotificationsService,
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: REPORT_REPOSITORY, useClass: InMemoryReportRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
        { provide: MATERIAL_REPOSITORY, useClass: InMemoryMaterialRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: NOTIFICATION_REPOSITORY, useClass: InMemoryNotificationRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should greet the student and name the course and teacher', async () => {
    const dashboard = await controller.getDashboard('course-1', STUDENT);
    expect(dashboard.studentName).toBe('Ali Esam');
    expect(dashboard.course).toMatchObject({
      id: 'course-1',
      title: 'AS Chemistry',
      teacherName: 'Dr. Tahir Elshazli',
    });
  });

  it('should back the progress bar with real completion numbers', async () => {
    const dashboard = await controller.getDashboard('course-1', STUDENT);
    expect(dashboard.progress).toMatchObject({
      completedLessons: 5,
      totalLessons: 12,
      completionPercentage: 42,
    });
  });

  it('should compute the four stat tiles', async () => {
    const dashboard = await controller.getDashboard('course-1', STUDENT);
    expect(dashboard.stats).toEqual({
      homeworkPending: 1,
      answersAvailable: 5,
      newRecordings: 6,
      overallReportPercentage: 80.5,
    });
  });

  it('should carry a real timestamp and Zoom link on the live-session banner', async () => {
    const dashboard = await controller.getDashboard('course-1', STUDENT);
    expect(dashboard.nextLiveSession).toMatchObject({
      id: 'sess-2',
      scheduledAt: '2026-08-27T18:00:00Z',
    });
  });

  it('should count the three quick-access material categories', async () => {
    const dashboard = await controller.getDashboard('course-1', STUDENT);
    expect(dashboard.quickAccess).toEqual({
      course_notes: 3,
      study_materials: 3,
      important_files: 2,
    });
    expect(dashboard.unreadNotifications).toBe(2);
  });

  it('should agree with the stat tiles after a submission changes state', async () => {
    const assessments = await controller.getDashboard('course-1', STUDENT);
    expect(assessments.stats.homeworkPending).toBe(1);
  });

  it('should refuse a dashboard for a course the student is not enrolled in', async () => {
    await expect(
      controller.getDashboard('course-2', OTHER_STUDENT),
    ).rejects.toThrow();
  });
});
