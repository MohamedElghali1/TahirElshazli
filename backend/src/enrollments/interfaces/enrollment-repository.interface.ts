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
