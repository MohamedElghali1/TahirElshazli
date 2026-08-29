import { Test, TestingModule } from '@nestjs/testing';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from '../recordings/repositories/in-memory-recording.repository.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('CoursesController', () => {
  let controller: CoursesController;

  beforeEach(async () => {
    // Progress depends on "now", so pin the clock to keep assertions exact.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        CoursesService,
        RecordingsService,
        LiveSessionsService,
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CoursesController>(CoursesController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list only the courses the student is enrolled in', async () => {
    const courses = await controller.listCourses(STUDENT);
    expect(courses.map((c) => c.id)).toEqual(['course-1', 'course-2']);
  });

  it('should derive recorded progress from actual watch progress', async () => {
    const courses = await controller.listCourses(STUDENT);
    const recorded = courses.find((c) => c.id === 'course-1');
    expect(recorded?.learningMode).toBe('recorded');
    expect(recorded?.progress).toMatchObject({
      type: 'recorded',
      completedLessons: 5,
      totalLessons: 12,
      completionPercentage: 42,
    });
  });

  it('should expose an attendance timeline for a live course, not completion', async () => {
    const courses = await controller.listCourses(STUDENT);
    const live = courses.find((c) => c.id === 'course-2');
    expect(live?.learningMode).toBe('live');
    expect(live?.progress).toMatchObject({
      type: 'live',
      attendedSessions: 1,
      totalSessions: 2,
      attendancePercentage: 50,
    });
    // A live course must not carry recorded-mode completion fields.
    expect(live?.progress).not.toHaveProperty('completedLessons');
  });

  it('should never blend grades into the progress block', async () => {
    const detail = await controller.getCourseDetail('course-1', STUDENT);
    expect(JSON.stringify(detail.progress)).not.toMatch(/score|grade|average/i);
  });

  it('should return course detail with modules and the sequential-lock setting', async () => {
    const detail = await controller.getCourseDetail('course-1', STUDENT);
    expect(detail.modules).toHaveLength(3);
    expect(detail.sequentialLockEnabled).toBe(true);
    expect(detail.progress).toHaveProperty('checkpoints');
  });

  it('should 404 a course the student is not enrolled in', async () => {
    await expect(
      controller.getCourseDetail('course-2', {
        user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
      }),
    ).rejects.toThrow();
  });
});
