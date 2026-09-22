import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  AssistantInvitation,
  AssistantInvitationRepository,
  NewAssistantInvitation,
} from '../interfaces/assistant-invitation-repository.interface.js';

interface InvitationRow {
  id: string;
  name: string;
  email: string;
  role: AssistantInvitation['role'];
  scope: AssistantInvitation['scope'];
  group_ids: string[];
  token: string;
  expires_at: Date;
  accepted_at: Date | null;
  invited_by: string;
  created_at: Date;
}

const SELECT = `
  SELECT id, name, email, role, scope, group_ids, token,
         expires_at, accepted_at, invited_by, created_at
  FROM assistant_invitations
`;

function toInvitation(row: InvitationRow): AssistantInvitation {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    scope: row.scope,
    groupIds: row.group_ids,
    token: row.token,
    expiresAt: iso(row.expires_at),
    acceptedAt: row.accepted_at ? iso(row.accepted_at) : null,
    invitedBy: row.invited_by,
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class PostgresAssistantInvitationRepository implements AssistantInvitationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<AssistantInvitation | null> {
    const row = await this.db.queryOne<InvitationRow>(`${SELECT} WHERE id = $1`, [id]);
    return row ? toInvitation(row) : null;
  }

  async findByToken(token: string): Promise<AssistantInvitation | null> {
    const row = await this.db.queryOne<InvitationRow>(`${SELECT} WHERE token = $1`, [token]);
    return row ? toInvitation(row) : null;
  }

  async findPending(): Promise<AssistantInvitation[]> {
    const rows = await this.db.query<InvitationRow>(
      `${SELECT} WHERE accepted_at IS NULL ORDER BY created_at DESC`,
    );
    return rows.map(toInvitation);
  }

  async findPendingByEmail(email: string): Promise<AssistantInvitation | null> {
    const row = await this.db.queryOne<InvitationRow>(
      `${SELECT} WHERE accepted_at IS NULL AND email = $1`,
      [email],
    );
    return row ? toInvitation(row) : null;
  }

  async create(invitation: NewAssistantInvitation): Promise<AssistantInvitation> {
    const row = await this.db.queryOne<InvitationRow>(
      `INSERT INTO assistant_invitations
         (id, name, email, role, scope, group_ids, token, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, scope, group_ids, token,
                 expires_at, accepted_at, invited_by, created_at`,
      [
        randomUUID(),
        invitation.name,
        invitation.email,
        invitation.role,
        invitation.scope,
        invitation.groupIds,
        invitation.token,
        invitation.expiresAt,
        invitation.invitedBy,
      ],
    );
    return toInvitation(row!);
  }

  async reissue(
    id: string,
    token: string,
    expiresAt: string,
  ): Promise<AssistantInvitation | null> {
    const row = await this.db.queryOne<InvitationRow>(
      `UPDATE assistant_invitations
       SET token = $2, expires_at = $3
       WHERE id = $1 AND accepted_at IS NULL
       RETURNING id, name, email, role, scope, group_ids, token,
                 expires_at, accepted_at, invited_by, created_at`,
      [id, token, expiresAt],
    );
    return row ? toInvitation(row) : null;
  }

  async updateDetails(
    id: string,
    update: {
      role: AssistantInvitation['role'];
      scope: AssistantInvitation['scope'];
      groupIds: string[];
    },
  ): Promise<AssistantInvitation | null> {
    const row = await this.db.queryOne<InvitationRow>(
      `UPDATE assistant_invitations
       SET role = $2, scope = $3, group_ids = $4
       WHERE id = $1 AND accepted_at IS NULL
       RETURNING id, name, email, role, scope, group_ids, token,
                 expires_at, accepted_at, invited_by, created_at`,
      [id, update.role, update.scope, update.groupIds],
    );
    return row ? toInvitation(row) : null;
  }

  async markAccepted(id: string): Promise<void> {
    await this.db.query(
      `UPDATE assistant_invitations SET accepted_at = now() WHERE id = $1`,
      [id],
    );
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.query(
      `DELETE FROM assistant_invitations WHERE id = $1 AND accepted_at IS NULL RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }
}
