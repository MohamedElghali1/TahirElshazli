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
  /**
   * The batch read behind "My Courses". Awaiting `findById` once per enrollment
   * is free against an array and a round trip per course against Postgres, so
   * the loop belongs in one query rather than in the service.
   *
   * Order is not guaranteed - callers hold the enrollments and join by id.
   * Missing ids are simply absent from the result rather than yielding nulls.
   */
  findByIds(courseIds: readonly string[]): Promise<StoredCourse[]>;
  /**
   * Every course, paged. The unscoped read - only an admin may reach it
   * (CLAUDE.md §5.11: admin queries never join through `CourseStaffAssignment`,
   * and this is the method that expresses that).
   *
   * Offset paging, not the keyset the audit feed uses. The difference is the
   * data: a course catalog is small, edited rarely, and read with a stable
   * `ORDER BY title`, so the row-shifting that makes offsets wrong on an
   * append-only log does not arise here. §7.1 notes the interfaces had nowhere
   * to attach pagination; this is the first place one is attached.
   */
  findAll(limit: number, offset: number): Promise<StoredCourse[]>;
}

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');
