
/**
 * A class of students, studying **one** course.
 *
 * `courseId` is required, and that reverses what migration 006 and the earlier
 * CLAUDE.md §5.16 argued for. A `group_courses` join table let a group study
 * two courses and let that be undone; a column cannot be un-collapsed once the
 * pairings are dropped. The client chose one course per group anyway
 * (`PRODUCT_SPEC.md:139`, migration 013), and the trade is recorded in the
 * migration rather than re-argued here.
 *
 * A group still does **not** imply enrollment. Putting a student in a group
 * enrols nobody; `Enrollment` remains the access gate (`DOMAIN_MODEL.md:98`),
 * which is what keeps the payment question out of the group surface entirely.
 */
export interface Group {
  id: string;
  name: string;
  teacherId: string;

  /** The one course this group studies. */
  courseId: string;

  /**
   * **Display only. Never an authorization input.**
   *
   * This says who *runs* this group, for a roster header and the admin list.
   * What an assistant may **reach** is decided by `assistant_group_assignments`
   * + `assistant_scopes` (`AUTH-2`), through `StaffScopeService` and nowhere
   * else. The rule is written here as well as on the column in migration 013
   * because the two facts look interchangeable and are not: the moment a query
   * reads this field to decide access there are two disagreeing answers to
   * "may this person see this group", and the authorization one quietly stops
   * being authoritative.
   */
  assistantId: string | null;

  /** When the group meets, as free text - "Saturday 18:00". Not a schedule. */
  meets: string | null;
  room: string | null;

  createdAt: string;
}

/** `id` and `createdAt` are the repository's to assign. */
export type NewGroup = Omit<Group, 'id' | 'createdAt'>;

/**
 * A partial update. Every field optional; `undefined` means "leave alone",
 * and for the three nullable columns `null` means "clear it".
 *
 * `teacherId` is absent deliberately - reassigning a group to another teacher
 * is not a request anyone has made, and there is one teacher (§1).
 */
export interface GroupPatch {
  name?: string;
  courseId?: string;
  assistantId?: string | null;
  meets?: string | null;
  room?: string | null;
}

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
   * Partial update, returning the group as it now is, or null when there is no
   * such group. Replaces `rename`, which is now the one-field case of this.
   *
   * There is deliberately **no delete**: a group carries placement history, and
   * §6's convention is soft-delete where history matters. Removing one is a
   * decision that has not been asked for.
   */
  update(groupId: string, patch: GroupPatch): Promise<Group | null>;

  /** Every group studying this course - the course console's group tab. */
  findByCourse(courseId: string): Promise<Group[]>;

  /**
   * Idempotent for the same reason `EnrollmentRepository.create` is: two clicks
   * on Add race here, and the losing one describes the same true state.
   */
  addMember(input: NewGroupMembership): Promise<GroupMembership>;
  removeMember(groupId: string, studentId: string): Promise<boolean>;
  findMembers(groupId: string): Promise<GroupMembership[]>;
  findMembershipsForStudent(studentId: string): Promise<GroupMembership[]>;

  /**
   * The join §5.17 and the assessment window are built on: *the groups this
   * student sits in that study this course.*
   *
   * One query rather than "fetch the student's memberships, fetch each group,
   * filter in JavaScript" - the composition is a join, and doing it in the
   * service would put a filter on the client side of a decision that gates
   * what a student may read.
   *
   * **Ordered by the membership's `assigned_at`, oldest first.** That order is
   * the tie-break `StudentGroupsService` names: longest-standing placement
   * wins. It moved here from `group_courses.enrolled_at` when the join table
   * collapsed - a substitution of the sort key, not of the rule.
   *
   * Normally zero or one row. Two is possible and legal (a student placed in
   * two groups both studying the same course), so this returns a list and the
   * callers say what they do with more than one.
   */
  findStudentGroups(studentId: string, courseId: string): Promise<Group[]>;

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
