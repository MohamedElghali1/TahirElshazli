import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseModule,
  CourseRepository,
  StoredCourse,
} from './interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import type { Enrollment } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';

export interface CompletionCheckpoint {
  lessonId: string;
  title: string;
  completedAt: string | null;
}

export interface AttendanceEntry {
  sessionId: string;
  title: string;
  sessionDate: string;
  attended: boolean;
}

/**
 * Course *progress* only - one shape, carrying **both** halves.
 *
 * This was a discriminated union, `{type:'recorded'} | {type:'live'}`, branched
 * on the student's learning mode. `D-9` (2026-09-20) retired that axis: every
 * course is now taught the same way, with recordings to watch *and* live
 * sessions to attend, so both halves are always present and both sub-queries
 * always run. A student with no sessions reports `0 of 0` attendance rather
 * than being served a different response shape.
 *
 * **The two halves must never be averaged into one number** (`CLAUDE.md` §11.1
 * non-negotiable 2). `completionPercentage` and `attendancePercentage` are
 * separate figures about separate things - watching the material and turning
 * up - and a single blended "progress" figure would say neither. They are
 * rendered as two `Meter`s, never one.
 *
 * Grades never appear here either: performance lives in the reports summary,
 * and progress and performance are the other pair that never merge.
 */
export interface CourseProgress {
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
  checkpoints: CompletionCheckpoint[];

  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: AttendanceEntry[];
}

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
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
  ) {}

  /**
   * Derived on every read from watch progress **and** attendance, so neither
   * bar can drift from the records underneath it.
   *
   * Three reads where the branched version did one or two. At the size this
   * runs at (§7.3) that is the same fraction of a millisecond, and it buys a
   * response shape that does not depend on a mode nobody sets any more.
   */
  async getProgress(
    courseId: string,
    studentId: string,
  ): Promise<CourseProgress> {
    const [completion, { recordings }, attendance] = await Promise.all([
      this.recordingsService.getCourseCompletion(courseId, studentId),
      this.recordingsService.getRecordingsForCourse(courseId, studentId),
      this.liveSessionsService.getAttendanceSummary(courseId, studentId),
    ]);
    return {
      ...completion,
      checkpoints: recordings.map((r) => ({
        lessonId: r.lessonId,
        title: r.title,
        completedAt: r.completedAt,
      })),
      ...attendance,
    };
  }

  private async toListItem(
    course: StoredCourse,
    enrollment: Enrollment,
  ): Promise<CourseListItem> {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      teacherName: course.teacherName,
      progress: await this.getProgress(course.id, enrollment.studentId),
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
        return this.toListItem(course, enrollment);
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
    return this.toListItem(course, enrollment);
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
      ...(await this.toListItem(course, enrollment)),
      sequentialLockEnabled: course.sequentialLockEnabled,
      modules: course.modules,
    };
  }
}
