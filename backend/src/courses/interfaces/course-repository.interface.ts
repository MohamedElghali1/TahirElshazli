import type { LearningMode } from '../../enrollments/interfaces/enrollment-repository.interface.js';

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
  /**
   * The course's public URL segment - unique, stable, and what the marketing
   * site links. Ids stay internal; a visitor never sees `course-1`.
   */
  slug: string;
  /**
   * Whether the course appears on the public site. CLAUDE.md §11 left this
   * open until the catalog went public; it is the answer to "can Dr. Tahir
   * draft a course without the world seeing it".
   *
   * It gates the *public* surface only. The student catalog (§7.2) and every
   * enrolled read are unaffected - un-publishing a course must never strand a
   * student who already holds it.
   */
  isPublished: boolean;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  sequentialLockEnabled: boolean;
  /**
   * The mode a self-enrollment lands in. The enrollment still owns the mode
   * per student (CLAUDE.md §5.2) - this is only the default applied when a
   * student enrolls themselves and has no way to know how a course is taught.
   */
  defaultLearningMode: LearningMode;
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
  /**
   * The public catalog: published courses only, paged the same way `findAll`
   * is and for the same reason.
   *
   * A separate method rather than a flag on `findAll` because the two have
   * different callers and different risks - `findAll` is the admin's list and
   * must show drafts, this one is anonymous and must never show them. A
   * boolean parameter is one wrong argument away from leaking the drafts.
   */
  findPublished(limit: number, offset: number): Promise<StoredCourse[]>;
  /**
   * Resolve a public URL. Returns the course whatever its publish state - the
   * caller decides what an unpublished course means, because the answer
   * differs by surface (the public page 404s; an admin preview would not).
   */
  findBySlug(slug: string): Promise<StoredCourse | null>;
}

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');
