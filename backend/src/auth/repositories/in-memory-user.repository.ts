import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role } from '../roles.enum.js';
import type {
  PasswordResetToken,
  StoredUser,
  StudentEmailIdentity,
  UserRepository,
} from '../interfaces/user-repository.interface.js';

/**
 * bcrypt hash of "password123" - the shared seed credential for every stub account.
 * Precomputed so the seed does not need an async bootstrap step.
 */
const SEED_PASSWORD_HASH =
  '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private users: StoredUser[] = [
    {
      id: 'student-1',
      email: 'student@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Student,
      name: 'Ali Esam',
      createdAt: '2026-01-15T10:00:00Z',
      googleEmail: null,
    },
    {
      id: 'student-2',
      email: 'student2@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Student,
      name: 'Sara Ahmed',
      createdAt: '2026-03-10T08:00:00Z',
      googleEmail: null,
    },
    {
      id: 'teacher-1',
      email: 'teacher@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Teacher,
      name: 'Dr. Tahir Elshazli',
      createdAt: '2025-11-01T09:00:00Z',
      googleEmail: null,
    },
    // Two assistants, because one cannot demonstrate scoping: assistant-1 is
    // assigned to course-1, assistant-2 to nothing. Mirrors
    // `database/seeds/002_staff_fixtures.sql`.
    {
      id: 'assistant-1',
      email: 'assistant@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Assistant,
      name: 'Nour Hassan',
      createdAt: '2026-01-25T09:00:00Z',
      googleEmail: null,
    },
    {
      id: 'assistant-2',
      email: 'assistant2@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Assistant,
      name: 'Omar Fathy',
      createdAt: '2026-02-10T09:00:00Z',
      googleEmail: null,
    },
  ];

  private resetTokens: PasswordResetToken[] = [];

  async findByEmail(email: string): Promise<StoredUser | null> {
    const normalized = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  async findById(userId: string): Promise<StoredUser | null> {
    return this.users.find((u) => u.id === userId) ?? null;
  }

  async findByIds(userIds: readonly string[]): Promise<StoredUser[]> {
    const wanted = new Set(userIds);
    return this.users.filter((u) => wanted.has(u.id));
  }

  async findByRole(
    role: Role,
    options: { search?: string; limit: number; offset: number },
  ): Promise<StoredUser[]> {
    const needle = options.search?.trim().toLowerCase();
    return this.users
      .filter((u) => u.role === role)
      .filter(
        (u) =>
          !needle ||
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(options.offset, options.offset + options.limit);
  }

  async findIdsByRole(role: Role): Promise<string[]> {
    return this.users.filter((u) => u.role === role).map((u) => u.id);
  }

  async findStudentsByEmails(
    emails: readonly string[],
  ): Promise<StudentEmailIdentity[]> {
    // Lowercased on both sides: email addresses are case-insensitive, and an
    // unmatched response caused by capitalisation would be indistinguishable
    // from a student who simply never answered.
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()));
    return this.users
      .filter(
        (u) =>
          // Role-scoped here rather than at the call site: a form response
          // matching a staff address is not a submission.
          u.role === Role.Student &&
          (wanted.has(u.email.toLowerCase()) ||
            (u.googleEmail !== null &&
              wanted.has(u.googleEmail.toLowerCase()))),
      )
      .map((u) => ({
        id: u.id,
        email: u.email,
        googleEmail: u.googleEmail,
      }));
  }

  async setGoogleEmail(
    userId: string,
    googleEmail: string | null,
  ): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.googleEmail = googleEmail?.trim().toLowerCase() ?? null;
    }
  }

  async create(user: {
    email: string;
    passwordHash: string;
    name: string;
    role: Role;
  }): Promise<StoredUser> {
    const created: StoredUser = {
      id: randomUUID(),
      email: user.email.trim().toLowerCase(),
      passwordHash: user.passwordHash,
      role: user.role,
      name: user.name,
      createdAt: new Date().toISOString(),
      // Nobody registers with one; it is recorded later, by the student or by
      // staff resolving an unmatched response.
      googleEmail: null,
    };
    this.users.push(created);
    return created;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
    }
  }

  async createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: string,
  ): Promise<PasswordResetToken> {
    const created: PasswordResetToken = {
      token,
      userId,
      expiresAt,
      usedAt: null,
    };
    this.resetTokens.push(created);
    return created;
  }

  async findPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
    return this.resetTokens.find((t) => t.token === token) ?? null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const stored = this.resetTokens.find((t) => t.token === token);
    if (stored) {
      stored.usedAt = new Date().toISOString();
    }
  }
}
