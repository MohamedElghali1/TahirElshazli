import { Role } from '../roles.enum.js';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  name: string;
  createdAt: string;
  /**
   * The Google address this person fills forms in with, when it differs from
   * the address they registered under.
   *
   * Nullable and usually null. It exists because a Google Form response
   * identifies its respondent by Google account email and nothing else, and
   * students routinely fill school forms in with a personal address - without
   * this there is no way to attribute those responses to anybody.
   */
  googleEmail: string | null;
}

/**
 * A student, reduced to the fields needed to attribute an external response.
 *
 * Deliberately **not** `StoredUser`. Matching runs over a whole cohort at once,
 * and `StoredUser` carries a password hash - dragging one per student through a
 * sync loop is exactly the kind of casual over-fetch that puts a credential
 * somewhere it has no business being (CLAUDE.md §8). The same reasoning
 * `findIdsByRole` gives for returning ids only.
 */
export interface StudentEmailIdentity {
  id: string;
  email: string;
  googleEmail: string | null;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(userId: string): Promise<StoredUser | null>;
  /**
   * The batch read behind any list that shows people by name - the admin's
   * course-staff panel is the first. Order is not guaranteed and missing ids
   * are simply absent; callers hold the ids and join by them.
   *
   * Exists so those lists do not `await findById` once per row. A course has a
   * handful of TAs, so the N+1 would be small today and invisible until the
   * same pattern is copied onto the student roster (CLAUDE.md §7.1).
   */
  findByIds(userIds: readonly string[]): Promise<StoredUser[]>;
  /**
   * The admin directory read: accounts of one role, paged and optionally
   * name/email searched.
   *
   * `role` is required rather than optional, and that is the safety property -
   * there is no call shape here that returns "every account on the platform",
   * so the student directory cannot accidentally list teachers and the TA
   * picker cannot accidentally list students. Admin-only either way
   * (CLAUDE.md §2.2); the controller enforces that.
   */
  findByRole(
    role: Role,
    options: { search?: string; limit: number; offset: number },
  ): Promise<StoredUser[]>;
  /**
   * Every account id holding a role, resolved *now*.
   *
   * This is what CLAUDE.md §5.14 requires: an announcement's `all_tas` audience
   * resolves from `role = 'assistant'` at the moment of sending, never from a
   * list of ids frozen when it was drafted - which would silently miss a TA
   * hired in between.
   *
   * Ids only, and unpaged. Ids only because the caller writes one notification
   * row per recipient and needs nothing else - `findByRole` would drag a name,
   * an email and a password hash across for each. Unpaged because a partial
   * audience is a wrong audience: an announcement that reached the first fifty
   * students is worse than one that failed. That makes it the one read here
   * with no ceiling, and it is why a platform-wide send belongs in a background
   * job once the roll is in the thousands (§1) rather than in a request.
   */
  findIdsByRole(role: Role): Promise<string[]>;
  /**
   * Students whose LMS address *or* recorded Google address is in this list.
   *
   * The batch read behind attributing a form's responses. One query for a whole
   * cohort rather than one per response - the N+1 CLAUDE.md §7.1 asks new code
   * not to add, and here N is every student who answered.
   *
   * **Scoped to students by role**, not merely filtered by the caller. A form
   * response matching a teacher's or an assistant's address is not a
   * submission, and attributing one would put a staff member in a completion
   * count; making that impossible here is cheaper than remembering it at each
   * call site.
   *
   * Matching is case-insensitive on both columns, because an email address is,
   * and because the one thing worse than an unmatched response is one that
   * failed to match over capitalisation.
   */
  findStudentsByEmails(
    emails: readonly string[],
  ): Promise<StudentEmailIdentity[]>;
  /**
   * Records (or clears, with null) the Google address for one account.
   *
   * Written from two places: the student's own profile, and staff resolving an
   * unmatched response - which is the flow that matters, since the student who
   * used an unrecognised address is the least likely person to notice.
   */
  setGoogleEmail(userId: string, googleEmail: string | null): Promise<void>;
  create(user: {
    email: string;
    passwordHash: string;
    name: string;
    role: Role;
  }): Promise<StoredUser>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: string,
  ): Promise<PasswordResetToken>;
  findPasswordResetToken(token: string): Promise<PasswordResetToken | null>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
