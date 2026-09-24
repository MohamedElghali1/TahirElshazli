/**
 * Which Google account may sign in as which user (`GAUTH-1`, migration 023).
 *
 * Not `users.google_email`: that column is unverified and belongs to Forms
 * matching. A row here exists only because the link flow proved control of
 * both the account and the Google identity.
 */
export interface GoogleIdentity {
  userId: string;
  /** The OIDC subject - stable across a change of Google address. */
  googleSub: string;
  /** The verified address at link time. Display only. */
  email: string;
  /** The Workspace domain at link time, if any. Display only. */
  hd: string | null;
  linkedAt: string;
}

export type NewGoogleIdentity = Omit<GoogleIdentity, 'linkedAt'>;

/** Thrown by `create` when either uniqueness rule would be broken. */
export class GoogleIdentityConflictError extends Error {
  constructor(readonly which: 'user' | 'google_sub') {
    super(`A Google identity already exists for this ${which}`);
  }
}

export interface GoogleIdentityRepository {
  findBySub(googleSub: string): Promise<GoogleIdentity | null>;
  findByUser(userId: string): Promise<GoogleIdentity | null>;
  /**
   * Inserts the link. Throws `GoogleIdentityConflictError` if the user already
   * has one or the Google account is linked to someone else - on Postgres from
   * the constraint itself, so a race cannot slip past a pre-check.
   */
  create(input: NewGoogleIdentity): Promise<GoogleIdentity>;
  /** The removed row, for the audit `before`, or null if there was none. */
  removeForUser(userId: string): Promise<GoogleIdentity | null>;
}

export const GOOGLE_IDENTITY_REPOSITORY = Symbol('GOOGLE_IDENTITY_REPOSITORY');
