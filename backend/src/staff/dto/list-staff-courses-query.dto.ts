import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_COURSE_PAGE_SIZE,
  MAX_COURSE_PAGE_SIZE,
} from '../staff.service.js';

/**
 * Paging for the admin branch of `GET /staff/courses`. The TA branch is bounded
 * by the assignment table itself, so these are ignored there.
 *
 * `enableImplicitConversion` is off globally (`main.ts`), so query strings stay
 * strings unless a `@Transform` converts them - which is why these are explicit
 * rather than relying on `@Type(() => Number)`.
 */
export class ListStaffCoursesQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(MAX_COURSE_PAGE_SIZE)
  limit?: number = DEFAULT_COURSE_PAGE_SIZE;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
