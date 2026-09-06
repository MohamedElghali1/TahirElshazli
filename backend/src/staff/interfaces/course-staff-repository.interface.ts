/**
 * A Teaching Assistant's assignment to one course (CLAUDE.md §6.1).
 *
 * This is the table CLAUDE.md §5.11 requires every TA-facing query to join
 * through. It is not a convenience index - a role check alone ("is this user a
 * TA?") answers a different question, and answering it instead is what turns
 * one TA's grading endpoint into every TA's students.
 */
export interface CourseStaffAssignment {
  id: string;
  /** Always a user whose role is `assistant`; the service enforces it. */
  userId: string;
  courseId: string;
  assignedAt: string;
  /** The admin who granted it. Half of the answer to "who took the action". */
  assignedBy: string;
}

export interface CourseStaffRepository {
  /**
   * The assignment, or null. Argument order mirrors
   * `EnrollmentRepository.find(courseId, studentId)` on purpose: these two are
   * the same shape of check for the two scoped roles, and a reader who has seen
   * one should not have to re-check the other's signature.
   */
  find(courseId: string, userId: string): Promise<CourseStaffAssignment | null>;
  /** Every course one TA holds - the scoped equivalent of "list courses". */
  findByStaff(userId: string): Promise<CourseStaffAssignment[]>;
  /** Every TA on one course, for the admin's course-staff panel. */
  findByCourse(courseId: string): Promise<CourseStaffAssignment[]>;
  /**
   * Idempotent: assigning an already-assigned TA returns the existing row
   * rather than creating a second one. The caller needs to know which happened
   * - a no-op must not be written to the audit log as an assignment that did
   * not occur - so the result says so.
   */
  create(
    courseId: string,
    userId: string,
    assignedBy: string,
  ): Promise<{ assignment: CourseStaffAssignment; created: boolean }>;
  /** True when a row was removed, false when there was nothing to remove. */
  remove(courseId: string, userId: string): Promise<boolean>;
}

export const COURSE_STAFF_REPOSITORY = Symbol('COURSE_STAFF_REPOSITORY');
