import { Global, Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller.js';
import { AuditService } from './audit.service.js';
import type { AuditLogRepository } from './interfaces/audit-log-repository.interface.js';
import { AUDIT_LOG_REPOSITORY } from './interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from './repositories/in-memory-audit-log.repository.js';
import { PostgresAuditLogRepository } from './repositories/postgres-audit-log.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

/**
 * Global, for the same reason `DatabaseModule` is: CLAUDE.md §5.4 requires
 * *every* mutating TA and admin action to write an entry, and that will
 * eventually mean most feature modules. An import line repeated in fifteen
 * modules is an import line one of them forgets - and the failure there is a
 * silently unaudited action, which is precisely what the requirement exists to
 * prevent.
 */
@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [
    AuditService,
    InMemoryAuditLogRepository,
    PostgresAuditLogRepository,
    repositoryProvider<AuditLogRepository>(AUDIT_LOG_REPOSITORY, InMemoryAuditLogRepository, PostgresAuditLogRepository),
  ],
  exports: [AuditService],
})
export class AuditModule {}
