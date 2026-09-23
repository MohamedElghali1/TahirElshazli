import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
  NewLiveSession,
} from '../interfaces/live-session-repository.interface.js';

interface SessionRow {
  id: string;
  group_id: string;
  title: string;
  meeting_link: string | null;
  scheduled_at: Date;
  ends_at: Date;
  assistant_id: string | null;
  description: string | null;
  private_notes: string | null;
  is_visible: boolean;
  state: 'planned' | 'published';
}

const SESSION_COLUMNS =
  'id, group_id, title, meeting_link, scheduled_at, ends_at, assistant_id, description, private_notes, is_visible, state';

function toSession(row: SessionRow): LiveSession {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    meetingLink: row.meeting_link,
    scheduledAt: iso(row.scheduled_at),
    endsAt: iso(row.ends_at),
    assistantId: row.assistant_id,
    description: row.description,
    privateNotes: row.private_notes,
    isVisible: row.is_visible,
    state: row.state,
  };
}

@Injectable()
export class PostgresLiveSessionRepository implements LiveSessionRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByGroups(groupIds: readonly string[]): Promise<LiveSession[]> {
    if (groupIds.length === 0) {
      return [];
    }
    const rows = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM live_sessions
       WHERE group_id = ANY($1::text[])
       ORDER BY scheduled_at, id`,
      [groupIds],
    );
    return rows.map(toSession);
  }

  async findById(sessionId: string): Promise<LiveSession | null> {
    const row = await this.db.queryOne<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM live_sessions WHERE id = $1`,
      [sessionId],
    );
    return row ? toSession(row) : null;
  }

  async create(input: NewLiveSession): Promise<LiveSession> {
    const row = await this.db.queryOne<SessionRow>(
      `INSERT INTO live_sessions
         (id, group_id, title, meeting_link, scheduled_at, ends_at, assistant_id, description, private_notes, is_visible, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SESSION_COLUMNS}`,
      [
        randomUUID(),
        input.groupId,
        input.title,
        input.meetingLink,
        input.scheduledAt,
        input.endsAt,
        input.assistantId,
        input.description,
        input.privateNotes,
        input.isVisible,
        input.state,
      ],
    );
    if (!row) {
      // INSERT ... RETURNING yields a row or throws; a null means the driver
      // contract changed underneath us.
      throw new Error('live_sessions INSERT returned no row');
    }
    return toSession(row);
  }

  async update(
    sessionId: string,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession | null> {
    // COALESCE against the parameter leaves a column alone when the caller
    // omitted it, which keeps this one statement instead of a SET list
    // assembled by string concatenation (CLAUDE.md §8 - no string-built SQL).
    // The casts are needed because a bare NULL parameter has no type.
    //
    // `meetingLink`, `assistantId`, `description` and `privateNotes` are
    // nullable columns, so COALESCE cannot tell "leave alone" from "set to
    // NULL" - both arrive as NULL. Each gets a `!== undefined` boolean
    // alongside it that says which was meant, the same pattern
    // `PostgresGroupRepository.update` uses for `GroupPatch`'s nullable trio.
    const row = await this.db.queryOne<SessionRow>(
      `UPDATE live_sessions SET
         title          = COALESCE($2::text, title),
         meeting_link   = CASE WHEN $3 THEN $4::text ELSE meeting_link END,
         scheduled_at   = COALESCE($5::timestamptz, scheduled_at),
         ends_at        = COALESCE($6::timestamptz, ends_at),
         assistant_id   = CASE WHEN $7 THEN $8::text ELSE assistant_id END,
         description    = CASE WHEN $9 THEN $10::text ELSE description END,
         private_notes  = CASE WHEN $11 THEN $12::text ELSE private_notes END,
         is_visible     = COALESCE($13::boolean, is_visible),
         state          = COALESCE($14::text, state)
       WHERE id = $1
       RETURNING ${SESSION_COLUMNS}`,
      [
        sessionId,
        patch.title ?? null,
        patch.meetingLink !== undefined,
        patch.meetingLink ?? null,
        patch.scheduledAt ?? null,
        patch.endsAt ?? null,
        patch.assistantId !== undefined,
        patch.assistantId ?? null,
        patch.description !== undefined,
        patch.description ?? null,
        patch.privateNotes !== undefined,
        patch.privateNotes ?? null,
        patch.isVisible ?? null,
        patch.state ?? null,
      ],
    );
    return row ? toSession(row) : null;
  }

  async remove(sessionId: string): Promise<boolean> {
    // No FK-cascade side effect to describe here any more: attendance is a
    // separate repository behind its own interface, and Postgres's
    // `ON DELETE CASCADE` still removes those rows at the database level, but
    // the caller is responsible for including that in its own before/after
    // audit snapshot (`AttendanceRepository.removeForSession`).
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM live_sessions WHERE id = $1 RETURNING id',
      [sessionId],
    );
    return rows.length > 0;
  }
}
