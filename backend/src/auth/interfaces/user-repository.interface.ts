import { Role } from '../roles.enum.js';

/**
 * Where an account sits in the registration queue (`DOM-4`).
 *
 * - `waiting` - registered, approved by nobody yet. **May not authenticate.**
 * - `active` - the only value that may sign in.
 * - `rejected` - refused by staff. Kept rather than deleted, so the same
 *   address cannot quietly re-register into a clean slate and so the audit
 *   entry that rejected them still names a row.
 *
 * `DOMAIN_MODEL.md:23`. The rule is enforced in **two** places, and both are
 * load-bearing: `AuthService.login` refuses to mint a token, and
 * `JwtStrategy.validate` refuses a token already minted - without the second,
 * every token issued before a rejection keeps working until it expires.
 */
export type UserStatus = 'waiting' | 'active' | 'rejected';

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
  status: UserStatus;
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
   * The admin directory read: accounts of the given roles, paged and optionally
   * name/email searched.
   *
   * `roles` is required **and must be non-empty**, and that is the safety
   * property - there is no call shape here that returns "every account on the
   * platform", so the student directory cannot accidentally list teachers and
   * the TA picker cannot accidentally list students. Admin-only either way
   * (CLAUDE.md §2.2); the controller enforces that.
   *
   * It takes a list rather than one role because the staff directory has to
   * show the Full admin beside the assistants (AUTH-1, `API_SPEC.yaml:210-221`
   * - the `Assistant` schema's `role` is `[assistant, admin]`). Both
   * implementations **throw on an empty array**: read as "no filter" it would
   * hand the caller every account, which is exactly the shape the single-role
   * parameter existed to make unwritable.
   */
  findByRole(
    roles: readonly Role[],
    options: {
      search?: string;
      /**
       * Optional, and its absence means **every status**, not `active`.
       *
       * The opposite default was tempting and is wrong: the admin directory is
       * the only screen from which a waiting registration can be seen at all,
       * so a filter that silently hid them would hide the queue from the one
       * person who can clear it.
       */
      status?: UserStatus;
      limit: number;
      offset: number;
    },
  ): Promise<StoredUser[]>;
  /**
   * Every account id holding a role, resolved *now*.
   *
   * This is what CLAUDE.md §5.14 requires: an announcement's `all_tas` audience
   * resolves from the role at the moment of sending, never from a list of ids
   * frozen when it was drafted - which would silently miss a TA hired in
   * between.
   *
   * A list of roles, for the same reason `findByRole` takes one, and **empty
   * throws** rather than meaning "everyone": an audience bug here does not
   * return too little, it mails the whole platform.
   *
   * Ids only, and unpaged. Ids only because the caller writes one notification
   * row per recipient and needs nothing else - `findByRole` would drag a name,
   * an email and a password hash across for each. Unpaged because a partial
   * audience is a wrong audience: an announcement that reached the first fifty
   * students is worse than one that failed. That makes it the one read here
   * with no ceiling, and it is why a platform-wide send belongs in a background
   * job once the roll is in the thousands (§1) rather than in a request.
   */
  findIdsByRole(roles: readonly Role[]): Promise<string[]>;
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
  /**
   * `status` is **required**, with no default here and none defaulted in the
   * service either.
   *
   * The column carries `DEFAULT 'active'` (migration 014) because every row
   * that predates the queue must keep working. That default is exactly wrong
   * for a new registration, and an optional parameter here would let one
   * caller forget - which would not fail, it would simply make the waiting
   * queue permanently empty. Requiring the argument makes forgetting a compile
   * error instead.
   */
  create(user: {
    email: string;
    passwordHash: string;
    name: string;
    role: Role;
    status: UserStatus;
  }): Promise<StoredUser>;
  /**
   * Moves an account through the queue. Written only from
   * `RegistrationApprovalService`, inside the transaction that also enrols and
   * places the student - so an activation cannot commit without the rest.
   */
  setStatus(userId: string, status: UserStatus): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateName(userId: string, name: string): Promise<void>;
  createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: string,
  ): Promise<PasswordResetToken>;
  findPasswordResetToken(token: string): Promise<PasswordResetToken | null>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
