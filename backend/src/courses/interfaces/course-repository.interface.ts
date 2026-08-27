export type LearningMode = 'recorded' | 'live';

export interface Lesson {
  id: string;
  title: string;
  order: number;
  durationSeconds: number;
}

export interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface RecordedProgress {
  type: 'recorded';
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
  checkpoints: CompletionCheckpoint[];
}

export interface CompletionCheckpoint {
  lessonId: string;
  completedAt: string | null;
}

export interface LiveProgress {
  type: 'live';
  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: AttendanceEntry[];
}

export interface AttendanceEntry {
  sessionId: string;
  sessionDate: string;
  attended: boolean;
}

export type CourseProgress = RecordedProgress | LiveProgress;

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  learningMode: LearningMode;
  progress: CourseProgress;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  learningMode: LearningMode;
  sequentialLockEnabled: boolean;
  modules: CourseModule[];
  progress: CourseProgress;
}

export interface CourseRepository {
  findEnrolledCourses(studentId: string): Promise<CourseListItem[]>;
  findCourseDetail(courseId: string, studentId: string): Promise<CourseDetail | null>;
}

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');
