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
  let courseRepo: InMemoryCourseRepository;

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
    courseRepo = module.get(COURSE_REPOSITORY);
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

  describe('catalog and self-enrollment', () => {
    const STUDENT_2 = {
      user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
    };

    it('should list every course, not only the enrolled ones', async () => {
      // student-2 holds course-1 only, but the catalog is unscoped.
      const catalog = await controller.listCatalog(STUDENT_2);
      expect(catalog.map((c) => c.id).sort()).toEqual(['course-1', 'course-2']);
    });

    it('should flag which catalog courses the caller already holds', async () => {
      const catalog = await controller.listCatalog(STUDENT_2);
      const byId = new Map(catalog.map((c) => [c.id, c]));
      expect(byId.get('course-1')?.enrolled).toBe(true);
      expect(byId.get('course-2')?.enrolled).toBe(false);
    });

    it('should report outline sizes but no lesson content', async () => {
      const catalog = await controller.listCatalog(STUDENT_2);
      const chemistry = catalog.find((c) => c.id === 'course-1');
      expect(chemistry).toMatchObject({ moduleCount: 3, lessonCount: 12 });
      // The catalog advertises a course; it does not serve it. Anything that
      // would let an unenrolled student read the syllabus itself belongs
      // behind `assertEnrolled`.
      expect(chemistry).not.toHaveProperty('modules');
      expect(chemistry).not.toHaveProperty('progress');
    });

    it('should enroll the caller and open the course to them', async () => {
      // Before: student-2 cannot see course-2 at all.
      await expect(
        controller.getCourseDetail('course-2', STUDENT_2),
      ).rejects.toThrow();

      const enrolled = await controller.enroll('course-2', STUDENT_2);
      expect(enrolled.id).toBe('course-2');

      // After: the same read succeeds, and the course is on the dashboard.
      const detail = await controller.getCourseDetail('course-2', STUDENT_2);
      expect(detail.id).toBe('course-2');
      const mine = await controller.listCourses(STUDENT_2);
      expect(mine.map((c) => c.id).sort()).toEqual(['course-1', 'course-2']);
    });

    it('should take the learning mode from the course, not the request', async () => {
      // course-2 is taught live, so the enrollment must land in live mode and
      // render an attendance timeline rather than a completion bar
      // (CLAUDE.md §5.2). Nothing in the request could have said so.
      const enrolled = await controller.enroll('course-2', STUDENT_2);
      expect(enrolled.learningMode).toBe('live');
      expect(enrolled.progress.type).toBe('live');
    });

    it('should treat a repeated enrollment as success without resetting it', async () => {
      const first = await controller.enroll('course-1', STUDENT_2);
      // student-2 was already enrolled on course-1 in March; a second click
      // must not restamp that date or change the mode.
      expect(first.learningMode).toBe('recorded');

      const second = await controller.enroll('course-1', STUDENT_2);
      expect(second.id).toBe('course-1');

      const mine = await controller.listCourses(STUDENT_2);
      expect(mine.filter((c) => c.id === 'course-1')).toHaveLength(1);
    });

    it('should 404 an enrollment on a course that does not exist', async () => {
      await expect(controller.enroll('course-nope', STUDENT_2)).rejects.toThrow();
    });

    it('should read the catalog from the published courses, not from every row', async () => {
      // §7.2 opened self-enrollment to any signed-in student, so what the
      // catalog lists is one POST away from being fully readable. A course Dr.
      // Tahir has not published is a draft, and listing it would hand its
      // recordings and materials to anyone with an account.
      const published = vi.spyOn(courseRepo, 'findPublished');
      const everything = vi.spyOn(courseRepo, 'findAll');

      await controller.listCatalog(STUDENT_2);

      expect(published).toHaveBeenCalled();
      expect(everything).not.toHaveBeenCalled();
    });

    it('should refuse enrollment on an unpublished course, as if it did not exist', async () => {
      const real = await courseRepo.findById('course-2');
      vi.spyOn(courseRepo, 'findById').mockResolvedValue({
        ...real!,
        isPublished: false,
      });

      await expect(controller.enroll('course-2', STUDENT_2)).rejects.toThrow(
        'Course not found',
      );
    });

    it('should enroll the caller from the token, never a supplied id', async () => {
      await controller.enroll('course-2', STUDENT_2);
      // The other student's roster is untouched - there is no parameter on
      // the route that could have named them.
      const other = await controller.listCourses({
        user: { sub: 'student-3', email: 's3@example.com', role: 'student', jti: 'j3' },
      });
      expect(other).toEqual([]);
    });
  });
});
