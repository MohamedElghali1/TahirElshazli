import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  MAX_DIRECTORY_PAGE_SIZE,
} from '../directory.service.js';

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
