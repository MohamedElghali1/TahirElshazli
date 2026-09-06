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
      learningMode: enrollment.learningMode,
      progress: await this.getProgress(
        course.id,
        enrollment.studentId,
        enrollment.learningMode,
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
        return course ? this.toListItem(course, enrollment) : null;
      }),
    );
    return items.filter((item): item is CourseListItem => item !== null);
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
