import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service.js';
import {
  GoogleIdentityConflictError,
  type GoogleIdentity,
  type GoogleIdentityRepository,
  type NewGoogleIdentity,
} from '../interfaces/google-identity-repository.interface.js';

interface GoogleIdentityRow {
  user_id: string;
  google_sub: string;
  email: string;
  hd: string | null;
  linked_at: Date;
}

const COLUMNS = 'user_id, google_sub, email, hd, linked_at';

const toIdentity = (row: GoogleIdentityRow): GoogleIdentity => ({
  userId: row.user_id,
  googleSub: row.google_sub,
  email: row.email,
  hd: row.hd,
  linkedAt: row.linked_at.toISOString(),
});

/** Postgres's `unique_violation`, and the two constraint names migration 023 gets by default. */
const UNIQUE_VIOLATION = '23505';
const CONFLICT_BY_CONSTRAINT: Record<string, 'user' | 'google_sub'> = {
  user_google_identities_pkey: 'user',
  user_google_identities_google_sub_key: 'google_sub',
};

@Injectable()
export class PostgresGoogleIdentityRepository implements GoogleIdentityRepository {
  constructor(private readonly db: DatabaseService) {}

  async findBySub(googleSub: string): Promise<GoogleIdentity | null> {
    const row = await this.db.queryOne<GoogleIdentityRow>(
      `SELECT ${COLUMNS} FROM user_google_identities WHERE google_sub = $1`,
      [googleSub],
    );
    return row ? toIdentity(row) : null;
  }

  async findByUser(userId: string): Promise<GoogleIdentity | null> {
    const row = await this.db.queryOne<GoogleIdentityRow>(
      `SELECT ${COLUMNS} FROM user_google_identities WHERE user_id = $1`,
      [userId],
    );
    return row ? toIdentity(row) : null;
  }

  async create(input: NewGoogleIdentity): Promise<GoogleIdentity> {
    try {
      const row = await this.db.queryOne<GoogleIdentityRow>(
        `INSERT INTO user_google_identities (user_id, google_sub, email, hd)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [input.userId, input.googleSub, input.email, input.hd],
      );
      return toIdentity(row!);
    } catch (error) {
      const { code, constraint } = error as { code?: string; constraint?: string };
      const which = constraint ? CONFLICT_BY_CONSTRAINT[constraint] : undefined;
      if (code === UNIQUE_VIOLATION && which) {
        throw new GoogleIdentityConflictError(which);
      }
      throw error;
    }
  }

  async removeForUser(userId: string): Promise<GoogleIdentity | null> {
    const row = await this.db.queryOne<GoogleIdentityRow>(
      `DELETE FROM user_google_identities WHERE user_id = $1 RETURNING ${COLUMNS}`,
      [userId],
    );
    return row ? toIdentity(row) : null;
  }
}
