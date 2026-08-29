import { Injectable } from '@nestjs/common';

/**
 * How long a revocation cutoff is kept. Deliberately far longer than any
 * sane JWT_EXPIRY rather than derived from it: if the two ever disagreed, the
 * cheap failure is holding a dead entry, and the expensive one is dropping a
 * cutoff while tokens it should reject are still valid. One entry per user, so
 * the memory cost of being generous is negligible.
 */
const CUTOFF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Stateless JWTs cannot be invalidated by the client alone, so logout records the
 * token id here and the JWT strategy rejects any payload whose `jti` is listed.
 * In-memory for now, alongside the other stubbed persistence - a Redis-backed
 * implementation drops in behind the same two methods.
 */
@Injectable()
export class TokenDenylistService {
  private readonly revoked = new Map<string, number>();

  /**
   * Per-user cutoff in epoch *milliseconds*: any token minted at or before it
   * is rejected. Used by password change and reset, which must invalidate every
   * existing session rather than only the one making the request - otherwise a
   * stolen token outlives the password it was issued against.
   *
   * Millisecond resolution matters. The standard `iat` claim counts whole
   * seconds, so a second-resolution cutoff also kills the token minted when the
   * user logs back in moments later - which is the one flow guaranteed to
   * follow a password change. Tokens therefore carry their own `iatMs`.
   */
  private readonly userCutoffs = new Map<string, number>();

  revoke(jti: string, expiresAtEpochSeconds: number): void {
    this.revoked.set(jti, expiresAtEpochSeconds);
    this.pruneExpired();
  }

  isRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }

  revokeAllForUser(userId: string): void {
    this.userCutoffs.set(userId, Date.now());
    this.pruneExpiredCutoffs();
  }

  /**
   * A token with no `iatMs` predates this mechanism and is treated as revoked -
   * failing closed, since the whole point is ending sessions we cannot vouch for.
   */
  isIssuedBeforeCutoff(userId: string, issuedAtEpochMs?: number): boolean {
    const cutoff = this.userCutoffs.get(userId);
    if (cutoff === undefined) {
      return false;
    }
    return issuedAtEpochMs === undefined || issuedAtEpochMs <= cutoff;
  }

  /**
   * A cutoff this old can no longer reject anything - every token it could
   * match expired on its own long ago.
   */
  private pruneExpiredCutoffs(): void {
    const oldest = Date.now() - CUTOFF_RETENTION_MS;
    for (const [userId, cutoff] of this.userCutoffs) {
      if (cutoff < oldest) {
        this.userCutoffs.delete(userId);
      }
    }
  }

  private pruneExpired(): void {
    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const [jti, expiresAt] of this.revoked) {
      if (expiresAt <= nowSeconds) {
        this.revoked.delete(jti);
      }
    }
  }
}
