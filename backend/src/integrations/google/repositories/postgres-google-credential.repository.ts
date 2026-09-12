import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service.js';
import { iso, isoOrNull } from '../../../database/database.types.js';
import type {
  GoogleCredential,
  GoogleCredentialRepository,
  GoogleCredentialWithToken,
  NewGoogleCredential,
} from '../interfaces/google-credential-repository.interface.js';

interface CredentialRow {
  id: string;
  user_id: string;
  google_email: string;
  google_sub: string;
  scopes: string[];
  connected_at: Date;
  last_used_at: Date | null;
  last_error: string | null;
}

interface CredentialRowWithToken extends CredentialRow {
  refresh_token: string;
}

/**
 * The public column list - **without `refresh_token`**.
 *
 * Two SELECT constants rather than one, so the secret is absent from the
 * default read by construction instead of by being deleted afterwards. A new
 * method written by copy-and-paste gets the safe one.
 */
const SELECT_PUBLIC = `
  SELECT id, user_id, google_email, google_sub, scopes, connected_at,
         last_used_at, last_error
    FROM google_oauth_credentials`;

const SELECT_WITH_TOKEN = `
  SELECT id, user_id, google_email, google_sub, scopes, connected_at,
         last_used_at, last_error, refresh_token
    FROM google_oauth_credentials`;

/**
 * Deterministic ordering for "the active credential".
 *
 * There is one row today. The ORDER BY is here anyway because a query that
 * returns "whichever row Postgres felt like" the moment a second one exists is
 * a bug that only appears in production.
 */
const ACTIVE_ORDER = ' ORDER BY connected_at ASC, id ASC LIMIT 1';

function toCredential(row: CredentialRow): GoogleCredential {
  return {
    id: row.id,
    userId: row.user_id,
    googleEmail: row.google_email,
    googleSub: row.google_sub,
    scopes: row.scopes,
    connectedAt: iso(row.connected_at),
    lastUsedAt: isoOrNull(row.last_used_at),
    lastError: row.last_error,
  };
}

@Injectable()
export class PostgresGoogleCredentialRepository
  implements GoogleCredentialRepository
{
  constructor(private readonly db: DatabaseService) {}

  async findActive(): Promise<GoogleCredential | null> {
    const row = await this.db.queryOne<CredentialRow>(
      SELECT_PUBLIC + ACTIVE_ORDER,
    );
    return row ? toCredential(row) : null;
  }

  async findActiveWithToken(): Promise<GoogleCredentialWithToken | null> {
    const row = await this.db.queryOne<CredentialRowWithToken>(
      SELECT_WITH_TOKEN + ACTIVE_ORDER,
    );
    return row
      ? { ...toCredential(row), refreshToken: row.refresh_token }
      : null;
  }

  async upsert(input: NewGoogleCredential): Promise<GoogleCredential> {
    // ON CONFLICT on the unique user_id, so reconnecting replaces rather than
    // raising - reconnecting is the documented fix for a revoked grant, a
    // rotated encryption key and an expired testing-mode token alike, and it
    // must work the second time.
    //
    // `connected_at` is deliberately not in the UPDATE list: the account's
    // relationship with this platform began when it was first connected, and
    // moving it on every reconnect would make this column disagree with the
    // audit trail beside it. `last_used_at` and `last_error` are reset, because
    // a brand-new token has neither a history of use nor a stale failure.
    const row = await this.db.queryOne<CredentialRow>(
      `INSERT INTO google_oauth_credentials
         (id, user_id, google_email, google_sub, refresh_token, scopes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         google_email  = EXCLUDED.google_email,
         google_sub    = EXCLUDED.google_sub,
         refresh_token = EXCLUDED.refresh_token,
         scopes        = EXCLUDED.scopes,
         last_used_at  = NULL,
         last_error    = NULL
       RETURNING id, user_id, google_email, google_sub, scopes, connected_at,
                 last_used_at, last_error`,
      [
        randomUUID(),
        input.userId,
        input.googleEmail,
        input.googleSub,
        input.refreshToken,
        input.scopes,
      ],
    );
    // RETURNING on an upsert always yields a row; the non-null assertion is the
    // same one every other repository makes on an INSERT ... RETURNING.
    return toCredential(row!);
  }

  async markUsed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE google_oauth_credentials
          SET last_used_at = now(), last_error = NULL
        WHERE id = $1`,
      [id],
    );
  }

  async markError(id: string, message: string): Promise<void> {
    await this.db.query(
      'UPDATE google_oauth_credentials SET last_error = $2 WHERE id = $1',
      [id, message],
    );
  }

  async remove(id: string): Promise<boolean> {
    // RETURNING rather than a row count: `DatabaseService.query` hands back
    // rows, not the driver's `QueryResult`, so there is no `rowCount` to read.
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM google_oauth_credentials WHERE id = $1 RETURNING id',
      [id],
    );
    return rows.length > 0;
  }
}
