import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role } from '../roles.enum.js';
import type {
  PasswordResetToken,
  StoredUser,
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
    },
    {
      id: 'student-2',
      email: 'student2@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Student,
      name: 'Sara Ahmed',
      createdAt: '2026-03-10T08:00:00Z',
    },
    {
      id: 'teacher-1',
      email: 'teacher@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Teacher,
      name: 'Dr. Tahir Elshazli',
      createdAt: '2025-11-01T09:00:00Z',
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
    },
    {
      id: 'assistant-2',
      email: 'assistant2@example.com',
      passwordHash: SEED_PASSWORD_HASH,
      role: Role.Assistant,
      name: 'Omar Fathy',
      createdAt: '2026-02-10T09:00:00Z',
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
