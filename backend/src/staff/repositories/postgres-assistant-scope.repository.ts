import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  AssistantGroupAssignment,
  AssistantScope,
  AssistantScopeRepository,
} from '../interfaces/assistant-scope-repository.interface.js';

interface AssignmentRow {
  id: string;
  user_id: string;
  group_id: string;
  assigned_at: Date;
  assigned_by: string;
}

const SELECT =
  'SELECT id, user_id, group_id, assigned_at, assigned_by FROM assistant_group_assignments';

function toAssignment(row: AssignmentRow): AssistantGroupAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    assignedAt: iso(row.assigned_at),
    assignedBy: row.assigned_by,
  };
}

/**
 * The two reads here are the gate every assistant-facing query now passes
 * through, so both are index lookups: `assistant_scopes` is keyed on `user_id`
 * and `assistant_group_assignments` carries an index on it.
 *
 * **Neither query joins `groups`.** The group-to-course mapping is composed in
 * `StaffScopeService`, because a repository must not reach into another
 * aggregate (`CLAUDE.md` §5) and because a join written twice is a join that
 * can disagree twice.
 */
@Injectable()
export class PostgresAssistantScopeRepository
  implements AssistantScopeRepository
{
  constructor(private readonly db: DatabaseService) {}

  async findScope(userId: string): Promise<AssistantScope | null> {
    const row = await this.db.queryOne<{ scope: AssistantScope }>(
      'SELECT scope FROM assistant_scopes WHERE user_id = $1',
      [userId],
    );
    return row ? row.scope : null;
  }

  async setScope(userId: string, scope: AssistantScope): Promise<void> {
    await this.db.query(
      `INSERT INTO assistant_scopes (user_id, scope)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET scope = EXCLUDED.scope, updated_at = now()`,
      [userId, scope],
    );
  }

  async findAssignments(userId: string): Promise<AssistantGroupAssignment[]> {
    const rows = await this.db.query<AssignmentRow>(
      `${SELECT} WHERE user_id = $1 ORDER BY assigned_at, id`,
      [userId],
    );
    return rows.map(toAssignment);
  }

  async assignGroup(
    userId: string,
    groupId: string,
    assignedBy: string,
  ): Promise<{ assignment: AssistantGroupAssignment; created: boolean }> {
    // ON CONFLICT DO NOTHING rather than a SELECT-then-INSERT: two admins
    // granting the same group at once would both see "not there" and one would
    // hit the unique violation. The database arbitrates; an empty result is how
    // we learn we lost.
    const inserted = await this.db.queryOne<AssignmentRow>(
      `INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, group_id) DO NOTHING
       RETURNING id, user_id, group_id, assigned_at, assigned_by`,
      [randomUUID(), userId, groupId, assignedBy],
    );
    if (inserted) {
      return { assignment: toAssignment(inserted), created: true };
    }

    const existing = await this.db.queryOne<AssignmentRow>(
      `${SELECT} WHERE user_id = $1 AND group_id = $2`,
      [userId, groupId],
    );
    if (!existing) {
      // The conflicting row was deleted between the INSERT and this read.
      // Rare, and not worth a retry loop: the caller can ask again.
      throw new Error(
        'Assistant group assignment conflicted on insert but was gone on re-read; retry',
      );
    }
    return { assignment: toAssignment(existing), created: false };
  }

  async unassignGroup(userId: string, groupId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM assistant_group_assignments
       WHERE user_id = $1 AND group_id = $2
       RETURNING id`,
      [userId, groupId],
    );
    return rows.length > 0;
  }
}
