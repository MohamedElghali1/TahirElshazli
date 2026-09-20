import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  MAX_DIRECTORY_PAGE_SIZE,
} from '../directory.service.js';
import type { UserStatus } from '../../auth/interfaces/user-repository.interface.js';

/**
 * `enableImplicitConversion` is off globally (`main.ts`), so query strings stay
 * strings unless a `@Transform` converts them. Same shape as
 * `ListStaffCoursesQueryDto`, which is the convention here.
 */
const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /**
   * Narrows the student directory to one queue (`DOM-4`). Absent means every
   * status, not `active` - hiding the waiting accounts by default would hide
   * the queue from the only person who can clear it.
   *
   * Applies to `GET /admin/students` only; a staff account is always `active`.
   */
  @IsOptional()
  @IsIn(['waiting', 'active', 'rejected'])
  status?: UserStatus;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_DIRECTORY_PAGE_SIZE)
  limit?: number = DEFAULT_DIRECTORY_PAGE_SIZE;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class ListGradingQueueQueryDto {
  /**
   * Filtering by a *server-derived* status, not by one the client supplies for
   * storage - the queue still computes `awaiting`/`graded` from `correctedAt`
   * and only narrows the result (CLAUDE.md §5.10).
   */
  @IsOptional()
  @IsIn(['awaiting', 'graded'])
  status?: 'awaiting' | 'graded';
}
