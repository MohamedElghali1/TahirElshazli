import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';

export const SESSION_STATES = ['planned', 'published'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * What staff supply when scheduling a session for a group (`POST /staff/groups/:groupId/sessions`).
 *
 * Group is parented in the route path (`/staff/groups/:groupId/sessions`), so `groupId`
 * is not in the request body.
 */
export class CreateSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /**
   * Meeting link pasted by staff. Nullable because a `planned` session need not
   * have one yet (`DOMAIN_MODEL.md` §5). When non-null, validated as a public URL.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsPublicHttpUrl()
  @MaxLength(2048)
  meetingLink?: string | null;

  /** UTC ISO 8601 timestamp. */
  @IsISO8601()
  scheduledAt!: string;

  /** UTC ISO 8601 timestamp. Invariant `endsAt > scheduledAt` checked in service. */
  @IsISO8601()
  endsAt!: string;

  /** Optional co-teaching assistant; display only. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assistantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Staff-only private notes. Never serialized to students. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  /** Defaults to 'published' in service if omitted. */
  @IsOptional()
  @IsIn(SESSION_STATES)
  state?: SessionState;
}

/**
 * Partial update for a session (`PATCH /staff/sessions/:sessionId`).
 *
 * `groupId` is absent deliberately — moving a session between groups is a delete
 * and a re-create, not a PATCH (`LiveSessionUpdate`).
 */
export class UpdateSessionDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsPublicHttpUrl()
  @MaxLength(2048)
  meetingLink?: string | null;

  @IsOptionalNotNull()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptionalNotNull()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assistantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNotes?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptionalNotNull()
  @IsIn(SESSION_STATES)
  state?: SessionState;
}

/**
 * Query filter for the staff week grid (`GET /staff/sessions?from=&to=&groupId=`).
 */
export class ListSessionsQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;
}

/**
 * One student's mark within a bulk attendance write.
 */
export class AttendanceEntryDto {
  @IsString()
  @MaxLength(64)
  studentId!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;
}

/**
 * Whole-sheet bulk attendance write (`PUT /staff/sessions/:sessionId/attendance`).
 */
export class BulkMarkAttendanceDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

/**
 * One row on the staff attendance sheet (`GET /staff/sessions/:sessionId/attendance`).
 * An unmarked student has status `null` (never `absent`).
 */
export interface AttendanceSheetItem {
  studentId: string;
  status: AttendanceStatus | null;
}
