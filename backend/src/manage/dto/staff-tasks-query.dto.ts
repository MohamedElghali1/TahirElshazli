import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * `GET /staff/tasks` (`TASK-6`). Every filter narrows; none addresses a
 * resource, so an unreachable course or group answers `200 []` rather than a
 * 404 (assumption A-4).
 */
export class StaffTasksQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  courseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  groupId?: string;

  /** A title substring. Matched literally: `%` and `_` are not wildcards. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
