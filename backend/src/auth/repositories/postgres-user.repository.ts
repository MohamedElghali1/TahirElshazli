import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import { Role } from '../roles.enum.js';
import type {
  PasswordResetToken,
  StoredUser,
  UserRepository,
} from '../interfaces/user-repository.interface.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  name: string;
  created_at: Date;
}

interface ResetTokenRow {
  token: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

const USER_COLUMNS = 'id, email, password_hash, role, name, created_at';

function toUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    name: row.name,
    createdAt: iso(row.created_at),
  };
}

function toResetToken(row: ResetTokenRow): PasswordResetToken {
  return {
    token: row.token,
    userId: row.user_id,
    expiresAt: iso(row.expires_at),
    usedAt: isoOrNull(row.used_at),
  };
}

@Injectable()
export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByIds(userIds: readonly string[]): Promise<StoredUser[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ANY($1::text[])`,
      [[...userIds]],
    );
    return rows.map(toUser);
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    // Matches the unique index `users_email_lower_key`, so this is an index
    // lookup rather than a sequential scan with a function applied per row.
    const row = await this.db.queryOne<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email.trim()],
    );
    return row ? toUser(row) : null;
  }

  async findById(userId: string): Promise<StoredUser | null> {
    const row = await this.db.queryOne<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [userId],
    );
    return row ? toUser(row) : null;
  }

  async create(user: {
    email: string;
    passwordHash: string;
    name: string;
    role: Role;
  }): Promise<StoredUser> {
    const row = await this.db.queryOne<UserRow>(
      `INSERT INTO users (id, email, password_hash, role, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [
        randomUUID(),
        user.email.trim().toLowerCase(),
        user.passwordHash,
        user.role,
        user.name,
      ],
    );
    // The INSERT ... RETURNING either produced a row or threw; a null here
    // would mean the driver contract changed underneath us.
    return toUser(row!);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      userId,
      passwordHash,
    ]);
  }

  async createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: string,
  ): Promise<PasswordResetToken> {
    const row = await this.db.queryOne<ResetTokenRow>(
      `INSERT INTO password_reset_tokens (token, user_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token, user_id, expires_at, used_at`,
      [token, userId, expiresAt],
    );
    return toResetToken(row!);
  }

  async findPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
    const row = await this.db.queryOne<ResetTokenRow>(
      `SELECT token, user_id, expires_at, used_at
       FROM password_reset_tokens WHERE token = $1`,
      [token],
    );
    return row ? toResetToken(row) : null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    // `AND used_at IS NULL` makes redemption single-use even if two requests
    // arrive with the same token at the same moment: the second UPDATE matches
    // no row. The service still checks `usedAt` first; this is the check that
    // holds under concurrency.
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE token = $1 AND used_at IS NULL',
      [token],
    );
  }
}
