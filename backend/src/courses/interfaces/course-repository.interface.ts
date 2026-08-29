export interface Lesson {
  id: string;
  title: string;
  order: number;
  durationSeconds: number;
}

export interface CourseModule {
  id: string;
  title: string;
  chapter: string;
  order: number;
  lessons: Lesson[];
}

export interface StoredCourse {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  sequentialLockEnabled: boolean;
  modules: CourseModule[];
}

export interface CourseRepository {
  findById(courseId: string): Promise<StoredCourse | null>;
}

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');
