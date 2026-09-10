import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE } from '../audit.service.js';
import type {
  AuditAction,
  AuditTargetType,
} from '../interfaces/audit-log-repository.interface.js';

/**
 * The two unions repeated as runtime values, because `@IsIn` needs values and a
 * TypeScript union has none.
 *
 * Written as an **exhaustive `Record`** rather than as a plain array, and that
 * shape is the whole point: `Record<AuditAction, true>` will not compile with a
 * union member missing, so adding an action to `AuditAction` and forgetting it
 * here is a build failure rather than a filter that silently rejects the new
 * action at runtime.
 *
 * That was not previously true. The arrays were literals and the spec's
 * "keep the DTO filter lists in step" test iterates over the array itself - so
 * it could only prove that what was listed worked, never that anything was
 * missing. The six `group.*` actions added on 2026-09-10 went in without it,
 * and it took an e2e request to `/admin/audit-log?action=group.student_assigned`
 * coming back 400 to find out. The compiler does that job now.
 */
const AUDIT_ACTION_VALUES: Record<AuditAction, true> = {
  'course_staff.assigned': true,
  'course_staff.unassigned': true,
  'submission.graded': true,
  'recording.created': true,
  'recording.updated': true,
  'recording.deleted': true,
  'live_session.scheduled': true,
  'live_session.updated': true,
  'live_session.cancelled': true,
  'announcement.posted': true,
  'group.created': true,
  'group.renamed': true,
  'group.course_added': true,
  'group.course_removed': true,
  'group.student_assigned': true,
  'group.student_removed': true,
  'assessment.created': true,
  'assessment.updated': true,
  'assessment.targeted': true,
  'assessment.deleted': true,
};

const AUDIT_TARGET_TYPE_VALUES: Record<AuditTargetType, true> = {
  course_staff_assignment: true,
  assessment_submission: true,
  recording: true,
  live_session: true,
  announcement: true,
  group: true,
  group_course: true,
  group_membership: true,
  assessment: true,
};

export const AUDIT_ACTIONS = Object.keys(
  AUDIT_ACTION_VALUES,
) as readonly AuditAction[];

export const AUDIT_TARGET_TYPES = Object.keys(
  AUDIT_TARGET_TYPE_VALUES,
) as readonly AuditTargetType[];

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
