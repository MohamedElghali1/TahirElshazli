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
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';

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
        // Group data is still wired in: the assessment window resolves through
        // it. Real implementations rather than stubs.
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        StudentGroupsService,
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

  // `D-9` collapsed the `{type:'recorded'} | {type:'live'}` union into one
  // shape. The two tests below are the replacements for the two that asserted
  // each branch: a course with **both** halves populated (course-1), and a
  // course with sessions and no recordings (course-2), each carrying all four
  // completion fields and all four attendance ones.
  //
  // The third direction - recordings and no sessions - is **not** covered, and
  // cannot be with these fixtures: `InMemoryLiveSessionRepository` seeds
  // sessions on both courses (deviation `D-3`, review F2A-6). A second fixture
  // course is on `IMPLEMENTATION_PLAN.md` as the follow-up that closes it.
  it('should carry completion and attendance together for a course that has both', async () => {
    const courses = await controller.listCourses(STUDENT);
    const progress = courses.find((c) => c.id === 'course-1')?.progress;
    expect(progress).toMatchObject({
      completedLessons: 5,
      totalLessons: 12,
      completionPercentage: 42,
      attendedSessions: 1,
      totalSessions: 1,
      attendancePercentage: 100,
    });
    expect(progress).toHaveProperty('checkpoints');
    expect(progress).toHaveProperty('timeline');
    // Nothing discriminates the shape any more.
    expect(progress).not.toHaveProperty('type');
  });

  // The half-empty direction: course-2 has sessions but no recordings, so the
  // completion half must still be PRESENT and zeroed rather than absent. An
  // absent half would force every caller to branch again, which is the thing
  // `D-9` removed.
  it('should carry a present, zeroed completion half for a course with no recordings', async () => {
    const courses = await controller.listCourses(STUDENT);
    const progress = courses.find((c) => c.id === 'course-2')?.progress;
    expect(progress).toMatchObject({
      attendedSessions: 1,
      totalSessions: 2,
      attendancePercentage: 50,
      completedLessons: 0,
      totalLessons: 0,
      completionPercentage: 0,
    });
    expect(progress).toHaveProperty('checkpoints');
    expect(progress).toHaveProperty('timeline');
    expect(progress).not.toHaveProperty('type');
  });

  it('should never average completion and attendance into one number', async () => {
    // CLAUDE.md §11.1 non-negotiable 2. course-2 is 0% complete and 50%
    // attended; a blended figure would be 25 and would say neither.
    const courses = await controller.listCourses(STUDENT);
    const progress = courses.find((c) => c.id === 'course-2')!.progress;
    expect(Object.keys(progress)).not.toContain('overallPercentage');
    expect(Object.keys(progress).filter((k) => k.endsWith('Percentage'))).toEqual([
      'completionPercentage',
      'attendancePercentage',
    ]);
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

    it('should report zeroed progress on a course just enrolled on', async () => {
      // A fresh enrollment has watched nothing and attended nothing, and both
      // halves say so rather than one of them being absent.
      const enrolled = await controller.enroll('course-2', STUDENT_2);
      expect(enrolled.progress).toMatchObject({
        completedLessons: 0,
        attendedSessions: 0,
      });
    });

    it('should treat a repeated enrollment as success without resetting it', async () => {
      const first = await controller.enroll('course-1', STUDENT_2);
      // student-2 was already enrolled on course-1 in March; a second click
      // must not restamp that date.
      expect(first.id).toBe('course-1');

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
