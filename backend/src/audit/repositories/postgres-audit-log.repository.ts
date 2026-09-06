import { Injectable } from '@nestjs/common';
import { auditLogId } from '../audit-id.js';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import { Role } from '../../auth/roles.enum.js';
import {
  decodeAuditCursor,
  encodeAuditCursor,
} from '../audit-cursor.js';
import type {
  AuditLogEntry,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRepository,
  AuditSnapshot,
  AuditAction,
  AuditTargetType,
  NewAuditLogEntry,
} from '../interfaces/audit-log-repository.interface.js';

interface AuditLogRow {
  id: string;
  actor_id: string;
  actor_role: Role;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: string;
  course_id: string | null;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  created_at: Date;
}

const COLUMNS =
  'id, actor_id, actor_role, action, target_type, target_id, course_id, before, after, created_at';

function toEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    courseId: row.course_id,
    // `jsonb` comes back already parsed; no JSON.parse here on purpose.
    before: row.before,
    after: row.after,
    createdAt: iso(row.created_at),
  };
}

/**
 * Append-and-read only, matching the interface: there is no UPDATE and no
 * DELETE in this file, and CLAUDE.md §5.4 is why.
 */
@Injectable()
export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DatabaseService) {}

  async record(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
    const row = await this.db.queryOne<AuditLogRow>(
      `INSERT INTO audit_log (id, actor_id, actor_role, action, target_type, target_id, course_id, before, after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [
        auditLogId(),
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.courseId,
        // `pg` serializes an object to jsonb; null stays SQL NULL rather than
        // becoming the JSON literal `null`, which would be a different value.
        entry.before,
        entry.after,
      ],
    );
    if (!row) {
      // INSERT ... RETURNING yields a row or throws. A null here means the
      // driver contract changed underneath us, and silently returning a
      // half-built entry would be worse than failing the write.
      throw new Error('audit_log INSERT returned no row');
    }
    return toEntry(row);
  }

  async find(query: AuditLogQuery): Promise<AuditLogPage> {
    const cursor = query.cursor ? decodeAuditCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      return { entries: [], nextCursor: null };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    // Every value goes through `bind`; the only thing interpolated into the SQL
    // is a `$n` placeholder this function produced (CLAUDE.md §8).
    if (query.actorId) conditions.push(`actor_id = ${bind(query.actorId)}`);
    if (query.courseId) conditions.push(`course_id = ${bind(query.courseId)}`);
    if (query.action) conditions.push(`action = ${bind(query.action)}`);
    if (query.targetType) conditions.push(`target_type = ${bind(query.targetType)}`);
    if (query.targetId) conditions.push(`target_id = ${bind(query.targetId)}`);
    if (cursor) {
      // Row-wise comparison, which Postgres evaluates against the composite
      // index directly. Written as two ORed predicates it would not use it.
      // The casts are load-bearing: inside a row constructor Postgres has no
      // column context to infer a parameter's type from, and an untyped pair
      // errors out rather than defaulting.
      conditions.push(
        `(created_at, id) < (${bind(cursor.createdAt)}::timestamptz, ${bind(cursor.id)}::text)`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // One row past the limit, to learn whether a next page exists without a
    // second COUNT query over a table that only grows.
    const rows = await this.db.query<AuditLogRow>(
      `SELECT ${COLUMNS} FROM audit_log ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ${bind(query.limit + 1)}`,
      params,
    );

    const page = rows.slice(0, query.limit).map(toEntry);
    const last = page[page.length - 1];
    return {
      entries: page,
      nextCursor: rows.length > query.limit && last ? encodeAuditCursor(last) : null,
    };
  }
}
