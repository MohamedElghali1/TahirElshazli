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
