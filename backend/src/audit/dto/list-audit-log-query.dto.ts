import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE } from '../audit.service.js';
import type {
  AuditAction,
  AuditTargetType,
} from '../interfaces/audit-log-repository.interface.js';

/**
 * The two unions are repeated here as literal arrays because `@IsIn` needs
 * runtime values and a TypeScript union has none. Adding an action without
 * adding it here means the filter silently rejects it, so they are declared
 * next to each other and the module's spec asserts they agree.
 */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'course_staff.assigned',
  'course_staff.unassigned',
];

export const AUDIT_TARGET_TYPES: readonly AuditTargetType[] = [
  'course_staff_assignment',
];

export class ListAuditLogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  courseId?: string;

  @IsOptional()
  @IsIn(AUDIT_ACTIONS as string[])
  action?: AuditAction;

  @IsOptional()
  @IsIn(AUDIT_TARGET_TYPES as string[])
  targetType?: AuditTargetType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_PAGE_SIZE)
  limit?: number = DEFAULT_AUDIT_PAGE_SIZE;

  /** Opaque; from a previous page's `nextCursor`. Malformed values page empty. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
