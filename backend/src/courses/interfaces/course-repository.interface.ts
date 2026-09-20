
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
  modules: CourseModule[];
}

/**
 * A course as it is created (`DOM-5`).
 *
 * `id` is the repository's to assign, and `modules` is deliberately absent: a
 * course is created empty and its outline is authored afterwards. Accepting a
 * whole module tree on create would be a second, unreviewed way to write
 * `course_modules` and `lessons`.
 */
export type NewCourse = Omit<StoredCourse, 'id' | 'modules'>;

/**
 * A partial update. Every field optional; `undefined` means "leave alone".
 *
 * Only `thumbnailUrl` is nullable, so it is the only member where `null` is a
 * value rather than a 400 - see `IsOptionalNotNull`. `modules` is absent for
 * the same reason it is absent from `NewCourse`.
 */
export interface CoursePatch {
  slug?: string;
  isPublished?: boolean;
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  teacherName?: string;
  sequentialLockEnabled?: boolean;
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
  /**
   * Creates a course, with no modules. The caller has already established that
   * the slug is free - the 409 is a service decision, not a driver error, and
   * the two drivers must agree on it (`courses_slug_key` is the backstop, not
   * the check).
   */
  create(course: NewCourse): Promise<StoredCourse>;
  /**
   * Partial update, returning the course as it now is, or null when there is
   * no such course. Same shape as `GroupRepository.update`.
   */
  update(courseId: string, patch: CoursePatch): Promise<StoredCourse | null>;
}

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');
