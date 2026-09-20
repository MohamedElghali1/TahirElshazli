import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import { Role } from '../roles.enum.js';
import type {
  PasswordResetToken,
  StoredUser,
  StudentEmailIdentity,
  UserRepository,
} from '../interfaces/user-repository.interface.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  name: string;
  created_at: Date;
  google_email: string | null;
}

interface ResetTokenRow {
  token: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

const USER_COLUMNS =
  'id, email, password_hash, role, name, created_at, google_email';

/**
 * An empty role list is a bug, never "every account". Same refusal as the
 * memory driver, for the same reason: `= ANY('{}')` is false for every row, so
 * an empty list would return a silently empty page rather than announcing that
 * the caller built the filter wrong.
 */
function requireRoles(roles: readonly Role[]): void {
  if (roles.length === 0) {
    throw new Error('a role filter requires at least one role');
  }
}

function toUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    name: row.name,
    createdAt: iso(row.created_at),
    googleEmail: row.google_email,
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

  async findByRole(
    roles: readonly Role[],
    options: { search?: string; limit: number; offset: number },
  ): Promise<StoredUser[]> {
    requireRoles(roles);
    // Both the role list and the search term are parameters, not interpolated
    // text: `%` and `_` inside the search are matched literally by ILIKE only
    // because they arrive as data. Never build this predicate by concatenation
    // (CLAUDE.md §8). `= ANY($1::text[])` keeps that true for the list too.
    const search = options.search?.trim();
    const rows = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
       WHERE role = ANY($1::text[])
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%'
                               OR email ILIKE '%' || $2 || '%')
       ORDER BY name
       LIMIT $3 OFFSET $4`,
      [
        [...roles],
        search && search.length > 0 ? search : null,
        options.limit,
        options.offset,
      ],
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

  async findIdsByRole(roles: readonly Role[]): Promise<string[]> {
    requireRoles(roles);
    // Ordered, so a fan-out writes its rows in a stable sequence and two runs
    // of the same send are comparable.
    const rows = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE role = ANY($1::text[]) ORDER BY id',
      [[...roles]],
    );
    return rows.map((row) => row.id);
  }

  async findStudentsByEmails(
    emails: readonly string[],
  ): Promise<StudentEmailIdentity[]> {
    if (emails.length === 0) {
      return [];
    }
    // Lowercased on both sides of both comparisons, matching
    // `users_google_email_idx` (which is on `lower(google_email)`) so the index
    // is actually used rather than bypassed by the function call.
    //
    // Only the three columns the caller needs: this runs over a whole cohort,
    // and `USER_COLUMNS` would drag a bcrypt hash per student into a sync loop.
    const normalized = emails.map((e) => e.trim().toLowerCase());
    const rows = await this.db.query<{
      id: string;
      email: string;
      google_email: string | null;
    }>(
      `SELECT id, email, google_email
         FROM users
        WHERE role = $2
          AND (lower(email) = ANY($1)
               OR (google_email IS NOT NULL AND lower(google_email) = ANY($1)))`,
      [normalized, Role.Student],
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      googleEmail: row.google_email,
    }));
  }

  async setGoogleEmail(
    userId: string,
    googleEmail: string | null,
  ): Promise<void> {
    await this.db.query(
      'UPDATE users SET google_email = $2 WHERE id = $1',
      [userId, googleEmail?.trim().toLowerCase() ?? null],
    );
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
