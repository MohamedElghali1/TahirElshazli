import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  GoogleCredential,
  GoogleCredentialRepository,
  GoogleCredentialWithToken,
  NewGoogleCredential,
} from '../interfaces/google-credential-repository.interface.js';

/**
 * The development driver, selected by `PERSISTENCE_DRIVER=memory`.
 *
 * Worth saying plainly: connecting a Google account against this driver stores
 * a **real** refresh token for a **real** Google account in a process-local
 * array, and loses it on restart. That is fine and is what the local setup
 * walkthrough assumes - reconnecting is one click - but it is the reason the
 * encryption key is required in development too rather than defaulted
 * (`resolveGoogleTokenKey`): the token here is not a fixture.
 */
@Injectable()
export class InMemoryGoogleCredentialRepository
  implements GoogleCredentialRepository
{
  /** Keyed by user id, matching the table's UNIQUE constraint. */
  private readonly credentials = new Map<string, GoogleCredentialWithToken>();

  /**
   * Copies on the way out, never the stored object.
   *
   * CLAUDE.md §7.1 records this being got wrong twice - an in-memory read
   * handing back a reference that a later `update` mutated, so an audit
   * entry's `before` and `after` came out identical. Every read here returns a
   * fresh object for that reason.
   */
  private copy<T extends GoogleCredential>(credential: T): T {
    return { ...credential, scopes: [...credential.scopes] };
  }

  private active(): GoogleCredentialWithToken | null {
    // First by connection time, so the answer is stable rather than
    // insertion-order-dependent if a second row ever exists.
    const all = [...this.credentials.values()].sort((a, b) =>
      a.connectedAt.localeCompare(b.connectedAt),
    );
    return all[0] ?? null;
  }

  async findActive(): Promise<GoogleCredential | null> {
    const credential = this.active();
    if (!credential) {
      return null;
    }
    // The token is stripped rather than simply not selected, because this
    // driver has no projection: without this line the secret would ride along
    // on every status response.
    const { refreshToken: _refreshToken, ...rest } = this.copy(credential);
    return rest;
  }

  async findActiveWithToken(): Promise<GoogleCredentialWithToken | null> {
    const credential = this.active();
    return credential ? this.copy(credential) : null;
  }

  async upsert(input: NewGoogleCredential): Promise<GoogleCredential> {
    const existing = this.credentials.get(input.userId);
    const stored: GoogleCredentialWithToken = {
      id: existing?.id ?? randomUUID(),
      userId: input.userId,
      googleEmail: input.googleEmail,
      googleSub: input.googleSub,
      refreshToken: input.refreshToken,
      scopes: [...input.scopes],
      // Preserved across a reconnect: the account's relationship with this
      // platform started when it was first connected, and resetting it would
      // make the audit trail and this column disagree.
      connectedAt: existing?.connectedAt ?? new Date().toISOString(),
      lastUsedAt: null,
      // Cleared on reconnect - reconnecting is the documented fix for every
      // error this field holds, so carrying the old one forward would leave
      // the status screen warning about a connection that was just repaired.
      lastError: null,
    };
    this.credentials.set(input.userId, stored);
    const { refreshToken: _refreshToken, ...rest } = this.copy(stored);
    return rest;
  }

  async markUsed(id: string): Promise<void> {
    const credential = [...this.credentials.values()].find((c) => c.id === id);
    if (credential) {
      credential.lastUsedAt = new Date().toISOString();
      credential.lastError = null;
    }
  }

  async markError(id: string, message: string): Promise<void> {
    const credential = [...this.credentials.values()].find((c) => c.id === id);
    if (credential) {
      credential.lastError = message;
    }
  }

  async remove(id: string): Promise<boolean> {
    for (const [userId, credential] of this.credentials) {
      if (credential.id === id) {
        this.credentials.delete(userId);
        return true;
      }
    }
    return false;
  }
}
