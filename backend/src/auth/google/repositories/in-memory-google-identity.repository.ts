import { Injectable } from '@nestjs/common';
import {
  GoogleIdentityConflictError,
  type GoogleIdentity,
  type GoogleIdentityRepository,
  type NewGoogleIdentity,
} from '../interfaces/google-identity-repository.interface.js';

/**
 * Starts empty: no fixture account is linked to Google, so no published
 * fixture can be used to sign in through it.
 *
 * Reads return copies, so a `before` snapshot never aliases the stored row
 * (CLAUDE.md §9).
 */
@Injectable()
export class InMemoryGoogleIdentityRepository implements GoogleIdentityRepository {
  private readonly rows: GoogleIdentity[] = [];

  async findBySub(googleSub: string): Promise<GoogleIdentity | null> {
    const row = this.rows.find((r) => r.googleSub === googleSub);
    return row ? { ...row } : null;
  }

  async findByUser(userId: string): Promise<GoogleIdentity | null> {
    const row = this.rows.find((r) => r.userId === userId);
    return row ? { ...row } : null;
  }

  async create(input: NewGoogleIdentity): Promise<GoogleIdentity> {
    if (this.rows.some((r) => r.userId === input.userId)) {
      throw new GoogleIdentityConflictError('user');
    }
    if (this.rows.some((r) => r.googleSub === input.googleSub)) {
      throw new GoogleIdentityConflictError('google_sub');
    }
    const row: GoogleIdentity = { ...input, linkedAt: new Date().toISOString() };
    this.rows.push(row);
    return { ...row };
  }

  async removeForUser(userId: string): Promise<GoogleIdentity | null> {
    const index = this.rows.findIndex((r) => r.userId === userId);
    if (index === -1) return null;
    const [removed] = this.rows.splice(index, 1);
    return { ...removed };
  }
}
