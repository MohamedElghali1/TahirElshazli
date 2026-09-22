import type { AssistantScope } from '../../staff/interfaces/assistant-scope-repository.interface.js';
import type { Role } from '../../auth/roles.enum.js';

export interface AssistantInvitation {
  id: string;
  name: string;
  email: string;
  role: Role.Assistant | Role.Admin;
  scope: AssistantScope;
  groupIds: string[];
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: string;
  createdAt: string;
}

export interface NewAssistantInvitation {
  name: string;
  email: string;
  role: Role.Assistant | Role.Admin;
  scope: AssistantScope;
  groupIds: string[];
  token: string;
  expiresAt: string;
  invitedBy: string;
}

export interface AssistantInvitationRepository {
  findById(id: string): Promise<AssistantInvitation | null>;
  findByToken(token: string): Promise<AssistantInvitation | null>;
  /** Every invitation still `accepted_at IS NULL` - the admin screen's list. */
  findPending(): Promise<AssistantInvitation[]>;
  /** `null` when no pending (unaccepted) invitation exists for this email. */
  findPendingByEmail(email: string): Promise<AssistantInvitation | null>;
  create(invitation: NewAssistantInvitation): Promise<AssistantInvitation>;
  /** Resend: a fresh token and expiry on the same row. */
  reissue(id: string, token: string, expiresAt: string): Promise<AssistantInvitation | null>;
  /** Edits role/scope/groupIds on a still-pending invitation. */
  updateDetails(
    id: string,
    update: { role: Role.Assistant | Role.Admin; scope: AssistantScope; groupIds: string[] },
  ): Promise<AssistantInvitation | null>;
  /** Single-use: marks the token spent, in the same transaction as the account it creates. */
  markAccepted(id: string): Promise<void>;
  /** Cancels a still-pending invitation. True when a row was removed. */
  remove(id: string): Promise<boolean>;
}

export const ASSISTANT_INVITATION_REPOSITORY = Symbol('ASSISTANT_INVITATION_REPOSITORY');
