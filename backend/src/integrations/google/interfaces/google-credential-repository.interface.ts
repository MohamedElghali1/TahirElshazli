/**
 * A connected Google account.
 *
 * The refresh token is **not** on this shape, and that absence is the point.
 * Every read that renders a status screen, writes an audit entry or serialises
 * a response works from this interface, so the credential itself cannot travel
 * into any of them by accident - the same rule `StoredUser`'s password hash
 * follows, expressed as a type rather than as care.
 *
 * `GoogleCredentialWithToken` below is the one shape that carries it, returned
 * by exactly one method, used by exactly one caller.
 */
export interface GoogleCredential {
  id: string;
  userId: string;
  /** The connected account, for the admin screen to display. */
  googleEmail: string;
  /**
   * The stable Google account id (OIDC `sub`). An email can be renamed on the
   * Google side; this cannot, so it is what actually identifies the account.
   */
  googleSub: string;
  /**
   * What Google says was granted, not what was asked for. A consent screen
   * where the user unticks a box returns a narrower grant, and the resulting
   * 403 on a later call has nothing to explain it - so this is stored and the
   * status screen reads it.
   */
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
  /** The last refresh failure, or null when the last attempt succeeded. */
  lastError: string | null;
}

/** The credential plus the secret. One method returns this; one caller uses it. */
export interface GoogleCredentialWithToken extends GoogleCredential {
  /** Still encrypted. `TokenCipher` is the only thing that opens it. */
  refreshToken: string;
}

export interface NewGoogleCredential {
  userId: string;
  googleEmail: string;
  googleSub: string;
  /** Encrypted by the caller before it arrives here. */
  refreshToken: string;
  scopes: string[];
}

export interface GoogleCredentialRepository {
  /**
   * The active credential, or null when no account is connected.
   *
   * Takes no argument because there is one connected account today (Dr. Tahir
   * owns the forms, and reading a form's responses requires access to it). The
   * table is keyed by user so a second one costs a migration of zero, but until
   * something asks for that, a method that takes a user id would imply a choice
   * the caller does not have.
   */
  findActive(): Promise<GoogleCredential | null>;
  /**
   * The same row including the encrypted refresh token.
   *
   * Separate from `findActive` so that reaching the secret is a deliberate act
   * with a different name, rather than a field that happens to be on the object
   * every status endpoint already holds.
   */
  findActiveWithToken(): Promise<GoogleCredentialWithToken | null>;
  /**
   * Connects an account, replacing any existing one for that user.
   *
   * Upsert rather than insert: reconnecting is the documented fix for half the
   * failure modes in this integration (a revoked grant, a rotated encryption
   * key, an expired testing-mode token), and it must not fail on the unique
   * constraint the second time.
   */
  upsert(input: NewGoogleCredential): Promise<GoogleCredential>;
  /**
   * Records a successful use, clearing `lastError`.
   *
   * One method for both because they are one event: a refresh that works proves
   * the stored error is stale, and leaving it behind would make the status
   * screen warn about a connection that is working.
   */
  markUsed(id: string): Promise<void>;
  /** Records a refresh failure, so the status screen can say to reconnect. */
  markError(id: string, message: string): Promise<void>;
  /**
   * Deletes the credential. There is no soft delete here on purpose - the
   * history worth keeping is the audit entry (`google.disconnected`), and
   * retaining a revoked bearer token is a liability rather than a record.
   *
   * False when there was nothing to remove, so a double-disconnect is not a lie.
   */
  remove(id: string): Promise<boolean>;
}

export const GOOGLE_CREDENTIAL_REPOSITORY = Symbol(
  'GOOGLE_CREDENTIAL_REPOSITORY',
);
