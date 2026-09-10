import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
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
    /** `DatabaseModule` is `@Global()`, so this needs no import edge. */
    private readonly db: DatabaseService,
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
   * **It must be called inside `DatabaseService.runInTransaction`, and it
   * throws if it is not.**
   *
   * That assertion is the point of this method. The entry used to be written on
   * its own connection *after* the action it describes had already committed,
   * so a crash in the gap left an action done and unlogged - a hole CLAUDE.md
   * §5.4 carried as known debt for weeks. The mutation and its entry now share
   * one transaction, which makes them one commit: either both happened or
   * neither did.
   *
   * Requiring it rather than merely documenting it is what turns "every TA
   * mutation is logged" from a property of today's tree into a mechanism. A new
   * audited write that forgets to wrap itself fails loudly on its first test
   * run instead of shipping a silent gap - the same job the `AuditAction` union
   * does for the action list, one layer down.
   *
   * The assertion is live under **both** drivers: `runInTransaction` enters the
   * context even with no database behind it, so the unit tests catch a missing
   * wrap rather than leaving it for production to discover.
   */
  async record(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
    if (!this.db.inTransaction) {
      throw new Error(
        `Refusing to write the audit entry for "${entry.action}" outside a ` +
          'transaction. CLAUDE.md §5.4 requires the action and its log entry to ' +
          'commit together; wrap both in `DatabaseService.runInTransaction`.',
      );
    }
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
