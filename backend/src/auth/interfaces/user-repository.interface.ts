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
