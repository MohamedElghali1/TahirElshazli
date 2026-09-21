import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AssistantInvitation,
  AssistantInvitationRepository,
  NewAssistantInvitation,
} from '../interfaces/assistant-invitation-repository.interface.js';

@Injectable()
export class InMemoryAssistantInvitationRepository implements AssistantInvitationRepository {
  private invitations: AssistantInvitation[] = [];

  async findById(id: string): Promise<AssistantInvitation | null> {
    return this.invitations.find((i) => i.id === id) ?? null;
  }

  async findByToken(token: string): Promise<AssistantInvitation | null> {
    return this.invitations.find((i) => i.token === token) ?? null;
  }

  async findPending(): Promise<AssistantInvitation[]> {
    return this.invitations.filter((i) => i.acceptedAt === null);
  }

  async findPendingByEmail(email: string): Promise<AssistantInvitation | null> {
    return (
      this.invitations.find((i) => i.acceptedAt === null && i.email === email) ?? null
    );
  }

  async create(invitation: NewAssistantInvitation): Promise<AssistantInvitation> {
    const row: AssistantInvitation = {
      id: randomUUID(),
      ...invitation,
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.invitations.push(row);
    return row;
  }

  async reissue(
    id: string,
    token: string,
    expiresAt: string,
  ): Promise<AssistantInvitation | null> {
    const row = this.invitations.find((i) => i.id === id);
    if (!row || row.acceptedAt !== null) {
      return null;
    }
    row.token = token;
    row.expiresAt = expiresAt;
    return row;
  }

  async updateDetails(
    id: string,
    update: {
      role: AssistantInvitation['role'];
      scope: AssistantInvitation['scope'];
      groupIds: string[];
    },
  ): Promise<AssistantInvitation | null> {
    const row = this.invitations.find((i) => i.id === id);
    if (!row || row.acceptedAt !== null) {
      return null;
    }
    row.role = update.role;
    row.scope = update.scope;
    row.groupIds = update.groupIds;
    return row;
  }

  async markAccepted(id: string): Promise<void> {
    const row = this.invitations.find((i) => i.id === id);
    if (row) {
      row.acceptedAt = new Date().toISOString();
    }
  }

  async remove(id: string): Promise<boolean> {
    const before = this.invitations.length;
    this.invitations = this.invitations.filter(
      (i) => !(i.id === id && i.acceptedAt === null),
    );
    return this.invitations.length < before;
  }
}
