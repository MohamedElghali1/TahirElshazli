import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseModule,
  CourseRepository,
  StoredCourse,
} from './interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import type {
  Enrollment,
  LearningMode,
} from '../enrollments/interfaces/enrollment-repository.interface.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { LearningModeService } from '../groups/learning-mode.service.js';

export interface CompletionCheckpoint {
  lessonId: string;
  title: string;
  completedAt: string | null;
}

export interface RecordedProgress {
  type: 'recorded';
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
  checkpoints: CompletionCheckpoint[];
}

export interface AttendanceEntry {
  sessionId: string;
  title: string;
  sessionDate: string;
  attended: boolean;
}

export interface LiveProgress {
  type: 'live';
  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: AttendanceEntry[];
}

/**
 * Course *progress* only. Grades never appear here - performance lives in the
 * reports summary, and the two are deliberately never blended into one number.
 */
export type CourseProgress = RecordedProgress | LiveProgress;

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  learningMode: LearningMode;
  progress: CourseProgress;
}

export interface CourseDetail extends CourseListItem {
  sequentialLockEnabled: boolean;
  modules: CourseModule[];
}

/**
 * A course as it appears in the catalog, before the student holds it.
 *
 * Deliberately not a `CourseListItem`: that type carries `progress`, and there
 * is no progress to report on a course nobody is enrolled on. Reusing it would
 * force a zeroed `progress` object that reads as "0% complete" rather than as
 * "not started", which is exactly the progress/performance blurring
 * CLAUDE.md §5.1 rules out.
 */
export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  /** The mode this course is taught in, and the mode enrolling would use. */
  learningMode: LearningMode;
  moduleCount: number;
  lessonCount: number;
  /** Whether the caller already holds this course. */
  enrolled: boolean;
}

/**
 * The catalog is small and edited rarely (§6.1 notes the same about the admin
 * course list), so one page is the whole thing today. The cap exists so that
 * stops being true quietly - a catalog that outgrows it truncates rather than
 * serving an unbounded list, and the truncation is what prompts real paging.
 */
const CATALOG_PAGE_SIZE = 100;

@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly recordingsService: RecordingsService,
    private readonly liveSessionsService: LiveSessionsService,
    // Global (`GroupDataModule`), so there is no import edge back to
    // `GroupsModule` - which imports this one. See that file for the cycle.
    private readonly learningMode: LearningModeService,
  ) {}

  /**
   * Derived on every read from watch progress (recorded) or attendance (live),
   * so the completion bar can never drift from the underlying records.
   */
  async getProgress(
    courseId: string,
    studentId: string,
    learningMode: LearningMode,
  ): Promise<CourseProgress> {
    if (learningMode === 'live') {
      const summary = await this.liveSessionsService.getAttendanceSummary(
        courseId,
        studentId,
      );
      return { type: 'live', ...summary };
    }
    const [completion, { recordings }] = await Promise.all([
      this.recordingsService.getCourseCompletion(courseId, studentId),
      this.recordingsService.getRecordingsForCourse(courseId, studentId),
    ]);
    return {
      type: 'recorded',
      ...completion,
      checkpoints: recordings.map((r) => ({
        lessonId: r.lessonId,
        title: r.title,
        completedAt: r.completedAt,
      })),
    };
  }

  /**
   * `learningMode` is passed in rather than read off the enrollment: it lives
   * on the student's group now (CLAUDE.md §5.2), and the caller has usually
   * just resolved it for a whole list.
   */
  private async toListItem(
    course: StoredCourse,
    enrollment: Enrollment,
    learningMode: LearningMode,
  ): Promise<CourseListItem> {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      teacherName: course.teacherName,
      learningMode,
      progress: await this.getProgress(
        course.id,
        enrollment.studentId,
        learningMode,
      ),
    };
  }

  async getEnrolledCourses(studentId: string): Promise<CourseListItem[]> {
    const enrollments = await this.enrollmentsService.findForStudent(studentId);
    // One batch read, then an in-memory join by id. Awaiting `findById` inside
    // the map was free against an array and a round trip per course against
    // Postgres - the N+1 CLAUDE.md §7.1 catalogues.
    const courses = await this.courseRepo.findByIds(
      enrollments.map((enrollment) => enrollment.courseId),
    );
    const byId = new Map(courses.map((course) => [course.id, course]));

    const items = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = byId.get(enrollment.courseId);
        // An enrollment whose course has been deleted is dropped rather than
        // rendered as a broken card.
        if (!course) {
          return null;
        }
        // One resolution per course the student holds - one to three of them
        // (§7.3), and each is a group lookup that usually answers from the
        // membership index. Not batched, because a batch keyed on the student
        // would still be one query per course to find the pairings.
        const mode = await this.learningMode.resolve(course.id, studentId);
        return this.toListItem(course, enrollment, mode);
      }),
    );
    return items.filter((item): item is CourseListItem => item !== null);
  }

  /**
   * Every course on the platform, flagged with whether this student already
   * holds it.
   *
   * Unscoped by design and safe to be: it returns titles, descriptions and
   * outline sizes - the same things the public marketing pages advertise. It
   * returns no lesson content, no materials and no recordings. The enrollment
   * gate (§5.11's student equivalent, `assertEnrolled`) still stands in front
   * of every one of those, and this endpoint does not weaken it.
   *
   * Published courses only, and `findPublished` rather than a filter for the
   * reason the interface gives. §7.2 leaves open whether `is_published` should
   * also gate *enrollment*, but it cannot be right for a draft to be listed to
   * a student: self-enrollment is one POST away from it, and past that
   * `assertEnrolled` passes and the draft's recordings, materials and
   * assessments are all readable. A course Dr. Tahir has not published is not
   * finished being written.
   */
  async getCatalog(studentId: string): Promise<CatalogItem[]> {
    const [courses, enrollments] = await Promise.all([
      this.courseRepo.findPublished(CATALOG_PAGE_SIZE, 0),
      this.enrollmentsService.findForStudent(studentId),
    ]);
    const enrolledIds = new Set(enrollments.map((e) => e.courseId));

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      teacherName: course.teacherName,
      learningMode: course.defaultLearningMode,
      moduleCount: course.modules.length,
      lessonCount: course.modules.reduce((n, m) => n + m.lessons.length, 0),
      enrolled: enrolledIds.has(course.id),
    }));
  }

  /**
   * Self-enrollment. Free for now - CLAUDE.md §7 puts the payment gateway in a
   * later phase, and when it arrives it gates this method rather than
   * replacing it: the enrollment write stays here, and the payment becomes a
   * precondition in front of it.
   *
   * The mode comes from the course, not the request body. A student has no way
   * to know whether a course is taught live or from recordings, and letting
   * the client choose would let it pick the wrong dashboard for itself
   * (§5.2).
   */
  async enroll(courseId: string, studentId: string): Promise<CourseListItem> {
    const course = await this.courseRepo.findById(courseId);
    // An unpublished course answers exactly as a nonexistent one does, so the
    // id of a draft cannot be confirmed by trying to enroll on it - the same
    // 404-not-403 posture §5.11 sets for a TA and an unassigned course.
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found');
    }
    const enrollment = await this.enrollmentsService.enroll(courseId, studentId);
    // A self-enrolled student has no group yet (§7.2), so this resolves to the
    // course default - which is exactly what the enrollment used to store, now
    // computed rather than copied. Staff placing them in a group later changes
    // the answer without anything having to be migrated.
    return this.toListItem(
      course,
      enrollment,
      await this.learningMode.resolve(courseId, studentId),
    );
  }

  /** Returns the course only if the caller is enrolled in it. */
  async getCourse(courseId: string, studentId: string): Promise<StoredCourse> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found or student not enrolled');
    }
    return course;
  }

  async getCourseDetail(
    courseId: string,
    studentId: string,
  ): Promise<CourseDetail> {
    const enrollment = await this.enrollmentsService.assertEnrolled(
      courseId,
      studentId,
    );
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found or student not enrolled');
    }
    return {
      ...(await this.toListItem(
        course,
        enrollment,
        await this.learningMode.resolve(courseId, studentId),
      )),
      sequentialLockEnabled: course.sequentialLockEnabled,
      modules: course.modules,
    };
  }
}
