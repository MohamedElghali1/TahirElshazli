import { Role } from '../roles.enum.js';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  name: string;
  createdAt: string;
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
