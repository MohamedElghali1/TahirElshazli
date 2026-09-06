import { Inject, Injectable } from '@nestjs/common';
import type {
  AuditLogEntry,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRepository,
  NewAuditLogEntry,
} from './interfaces/audit-log-repository.interface.js';
import { AUDIT_LOG_REPOSITORY } from './interfaces/audit-log-repository.interface.js';

/** Hard ceiling on a page, so a client cannot ask for the whole table. */
export const MAX_AUDIT_PAGE_SIZE = 100;
export const DEFAULT_AUDIT_PAGE_SIZE = 50;

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: AuditLogRepository,
  ) {}

  /**
   * Writes one entry, and **throws if the write fails**.
   *
   * That is the whole contract, and it is deliberate: CLAUDE.md §5.4 says every
   * TA mutation is logged, so a caller that swallows this error would turn a
   * logging outage into a stream of unrecorded actions - exactly the state the
   * requirement exists to prevent. Callers must `await` it and let it
   * propagate.
   *
   * **Known gap, and it is a real one.** The entry is written on its own
   * connection, after the action it describes has already committed. A crash in
   * the gap leaves the action done and unlogged. Closing it means the mutation
   * and its audit row sharing one transaction, which this architecture cannot
   * express today - repositories own their own connections and
   * `DatabaseService.transaction` hands out a client no repository accepts.
   * Recorded rather than papered over; the fix is a transaction-scoped
   * repository handle, and it should land before the payments surface (§5.12),
   * where an unlogged refund is a money-trail hole rather than a missing line.
   */
  async record(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
    return this.auditRepo.record(entry);
  }

  /**
   * The admin feed. Filters are applied in the repository, not here - CLAUDE.md
   * §5.11's rule that scoping is a query filter applies to reads of the log
   * just as much as to reads of the data it describes.
   */
  async find(query: AuditLogQuery): Promise<AuditLogPage> {
    return this.auditRepo.find({
      ...query,
      limit: Math.min(Math.max(query.limit, 1), MAX_AUDIT_PAGE_SIZE),
    });
  }
}
