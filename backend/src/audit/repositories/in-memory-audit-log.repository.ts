import { Injectable } from '@nestjs/common';
import { auditLogId } from '../audit-id.js';
import {
  decodeAuditCursor,
  encodeAuditCursor,
  sortsAfter,
} from '../audit-cursor.js';
import type {
  AuditLogEntry,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRepository,
  NewAuditLogEntry,
} from '../interfaces/audit-log-repository.interface.js';

/**
 * Process-local and unbounded, like every other `InMemory*Repository` here.
 *
 * Worth stating plainly for this one: an audit log that disappears on restart
 * is not an audit log. `PERSISTENCE_DRIVER=memory` is refused in production
 * (`common/config/env.ts`), which is what keeps that from mattering.
 *
 * Starts empty rather than with fixtures - a seeded "history" that never
 * happened is worse than no history.
 */
@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  /** Newest first, so `find` can slice without sorting on every read. */
  private entries: AuditLogEntry[] = [];

  async record(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
    const now = new Date();
    const stored: AuditLogEntry = {
      ...entry,
      id: auditLogId(now),
      createdAt: now.toISOString(),
    };
    this.entries.unshift(stored);
    return stored;
  }

  async find(query: AuditLogQuery): Promise<AuditLogPage> {
    // A cursor the codec rejects pages from the start rather than being
    // ignored: silently returning page one for a malformed cursor makes a
    // paging bug look like duplicated history.
    const cursor = query.cursor ? decodeAuditCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      return { entries: [], nextCursor: null };
    }

    const matches = this.entries.filter((entry) => {
      if (query.actorId && entry.actorId !== query.actorId) return false;
      if (query.courseId && entry.courseId !== query.courseId) return false;
      if (query.action && entry.action !== query.action) return false;
      if (query.targetType && entry.targetType !== query.targetType) return false;
      if (query.targetId && entry.targetId !== query.targetId) return false;
      if (cursor && !sortsAfter(entry, cursor)) return false;
      return true;
    });

    // Insertion order is *not* the sort order, even though `auditLogId` makes
    // the two agree in practice. Sorting explicitly is what keeps this driver
    // and the Postgres one paging identically; an array that merely has the
    // newest at the front would rely on a coincidence.
    matches.sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.id.localeCompare(a.id)
        : b.createdAt.localeCompare(a.createdAt),
    );

    // Slice one past the limit to decide whether a next page exists, then drop
    // it. Comparing `matches.length` to the limit instead would advertise a
    // next page on an exactly-full final one, and the client would fetch an
    // empty page to find out.
    const page = matches.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      entries: page,
      nextCursor:
        matches.length > query.limit && last ? encodeAuditCursor(last) : null,
    };
  }
}
