import { Controller, Get, Query } from '@nestjs/common';
import { AuditService, DEFAULT_AUDIT_PAGE_SIZE } from './audit.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto.js';
import type { AuditLogPage } from './interfaces/audit-log-repository.interface.js';

/**
 * Admin only, and deliberately with no TA equivalent: CLAUDE.md §2.2 puts
 * audit-log access under admin, and a log a TA can read is a log that tells
 * them which of their colleagues reported them.
 *
 * The whole point of §5.4 is that Dr. Tahir can see which assistant did what,
 * so the useful query here is `?actorId=assistant-1`.
 */
@Controller('admin/audit-log')
@Roles(...STAFF_ADMIN)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: ListAuditLogQueryDto): Promise<AuditLogPage> {
    return this.auditService.find({
      actorId: query.actorId,
      courseId: query.courseId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_AUDIT_PAGE_SIZE,
    });
  }
}
