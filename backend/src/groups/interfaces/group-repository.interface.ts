
/**
 * A class of students, standing on its own.
 *
 * CLAUDE.md §5.16: **no `courseId`**. A group exists before any course is
 * attached to it and may be enrolled in more than one - the client's answer
 * was *"no, I mean group of students"* - so what a group studies lives in
 * `GroupCourse` and not as a column here.
 */
export interface Group {
  id: string;
  name: string;
  teacherId: string;
  createdAt: string;
}

/** `id` and `createdAt` are the repository's to assign. */
export type NewGroup = Omit<Group, 'id' | 'createdAt'>;

/**
 * "This group is enrolled in this course" - the client's own verb.
 *
 * It does **not** imply enrollment. Adding a group to a course enrolls nobody
 * (§5.16); `Enrollment` remains the access gate, which is what keeps the
 * payment question (§5.12) out of the group surface entirely.
 */
export interface GroupCourse {
  id: string;
  groupId: string;
  courseId: string;
  enrolledAt: string;
  enrolledBy: string;
}

export type NewGroupCourse = Omit<GroupCourse, 'id' | 'enrolledAt'>;

/**
 * "This student is in this group", placed by staff.
 *
 * `assignedBy` is not decoration. Placement is a teacher's or an assistant's
 * action and never the student's (§5.16), which makes it a mutation §5.4
 * requires to be auditable - `group.student_assigned` exists in `AuditAction`
 * because of this field.
 */
export interface GroupMembership {
  id: string;
  groupId: string;
  studentId: string;
  assignedBy: string;
  assignedAt: string;
}

export type NewGroupMembership = Omit<GroupMembership, 'id' | 'assignedAt'>;

export interface GroupRepository {
  findById(groupId: string): Promise<Group | null>;
  /**
   * Paginated, matching `CourseRepository.findAll` and the admin directory
   * rather than the audit feed's keyset cursor. Groups are created a handful of
   * times a term, so the row-shifting that makes an offset wrong on a
   * constantly-written feed does not arise here.
   */
  findAll(limit: number, offset: number): Promise<Group[]>;
  /**
   * Many groups by id, for the reads that resolve a set of memberships into the
   * groups behind them. Order is not guaranteed; missing ids are absent rather
   * than null.
   */
  findByIds(groupIds: readonly string[]): Promise<Group[]>;
  create(input: NewGroup): Promise<Group>;
  /**
   * Renames, returning the group as it now is, or null when there is no such
   * group. There is deliberately **no delete**: a group carries placement
   * history, and §6's convention is soft-delete where history matters. Removing
   * one is a decision that has not been asked for, and a rename covers the
   * mistyped-name case that would otherwise motivate it.
   */
  rename(groupId: string, name: string): Promise<Group | null>;

  /** Idempotent: adding a course a group already studies returns the existing row. */
  addCourse(input: NewGroupCourse): Promise<GroupCourse>;
  /** False when the pairing did not exist; callers turn that into a 404. */
  removeCourse(groupId: string, courseId: string): Promise<boolean>;
  findCourses(groupId: string): Promise<GroupCourse[]>;
  /** Every group studying this course - the course console's group tab. */
  findGroupCoursesByCourse(courseId: string): Promise<GroupCourse[]>;

  /**
   * Idempotent for the same reason `EnrollmentRepository.create` is: two clicks
   * on Add race here, and the losing one describes the same true state.
   */
  addMember(input: NewGroupMembership): Promise<GroupMembership>;
  removeMember(groupId: string, studentId: string): Promise<boolean>;
  findMembers(groupId: string): Promise<GroupMembership[]>;
  findMembershipsForStudent(studentId: string): Promise<GroupMembership[]>;

  /**
   * The join both §5.2 and §5.17 are built on: *the groups this student sits in
   * that study this course.*
   *
   * One query rather than "fetch the student's memberships, fetch each group's
   * courses, intersect in JavaScript" - the composition is a join, and doing it
   * in the service would put a filter on the client side of a decision that
   * gates what a student may read.
   *
   * Normally zero or one row. Two is possible and legal (a student placed in
   * two groups both studying the same course), so this returns a list and the
   * callers say what they do with more than one.
   */
  findStudentGroupCourses(
    studentId: string,
    courseId: string,
  ): Promise<GroupCourse[]>;

  /**
   * Member counts for many groups at once, keyed by group id. A count-only
   * read, for the same reason `EnrollmentRepository.countByCourses` is one: the
   * admin group list wants a number per row, and fetching every roster to
   * `.length` it is the shape CLAUDE.md §7.3 says to avoid even at 300
   * students. Groups with no members are absent rather than 0; callers default.
   */
  countMembersByGroups(
    groupIds: readonly string[],
  ): Promise<Record<string, number>>;
}

export const GROUP_REPOSITORY = Symbol('GROUP_REPOSITORY');
