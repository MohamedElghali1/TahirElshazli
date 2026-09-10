export type LearningMode = 'recorded' | 'live';

export interface Enrollment {
  studentId: string;
  courseId: string;
  learningMode: LearningMode;
  enrolledAt: string;
}

export interface EnrollmentRepository {
  findByStudent(studentId: string): Promise<Enrollment[]>;
  find(courseId: string, studentId: string): Promise<Enrollment | null>;
  /**
   * Every enrollment on one course - the staff roster read (CLAUDE.md §2.2:
   * read-only for a TA, who reaches it only for a course they are assigned to).
   *
   * The scoping is the caller's job, not this method's: a repository that took
   * an actor would have to re-derive the admin bypass, and `StaffScopeService`
   * already owns that decision for every surface.
   */
  findByCourse(courseId: string): Promise<Enrollment[]>;
  /**
   * Enrollment counts for many courses at once, keyed by course id.
   *
   * A count-only read, because the staff overview wants six integers and
   * `findByCourse` per course would fetch every row of every roster to length
   * them - the exact shape CLAUDE.md §7.1 lists as outstanding scaling debt.
   * Courses with no enrollments are absent from the map rather than present
   * with 0; callers default.
   */
  countByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>>;
  /**
   * The same count from the other side: how many courses each of these
   * students holds, for the admin directory. Absent means zero.
   */
  countByStudents(
    studentIds: readonly string[],
  ): Promise<Record<string, number>>;
  /**
   * How many *distinct people* hold these courses.
   *
   * Not the sum of `countByCourses`: a student in two of the teacher's groups
   * is one person, and a dashboard figure that double-counts them is one
   * nobody re-checks. The staff overview built this by pulling every
   * enrollment row of every course into a `Set` just to read its size - about
   * 300 rows a login at the numbers this platform actually runs at, for one
   * integer.
   */
  countDistinctStudents(courseIds: readonly string[]): Promise<number>;
  /**
   * Enrolls a student, returning the enrollment that now exists.
   *
   * Idempotent by contract: a second call for the same pair returns the
   * existing row rather than raising or overwriting it. Two clicks on Enroll
   * race here, and the losing one should read as success - it describes the
   * same true state - not as a 409 the student cannot act on. Overwriting is
   * equally wrong: it would silently move a student the admin had placed in
   * the live cohort back to the recorded default.
   */
  create(enrollment: Enrollment): Promise<Enrollment>;
}

export const ENROLLMENT_REPOSITORY = Symbol('ENROLLMENT_REPOSITORY');
