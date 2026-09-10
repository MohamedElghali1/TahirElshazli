import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DEFAULT_GROUP_PAGE_SIZE,
  MAX_GROUP_PAGE_SIZE,
} from '../groups.service.js';

/**
 * The id alphabet this schema uses (`student-1`, or a UUID), matching
 * `AssignStaffDto.userId`. Values are parameterized everywhere they are used,
 * so this is not what stops injection - it is what keeps an audit entry read a
 * year from now unambiguous.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreateGroupDto {
  /**
   * The group's name, and it is the whole identity of the row - "IGCSE
   * Chemistry — Saturday 18:00" is how Dr. Tahir tells one cohort from another.
   * Long enough for a subject, a day and a time; short enough to render in a
   * list without wrapping.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class RenameGroupDto extends CreateGroupDto {}

export class AddGroupCourseDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'courseId must contain only letters, digits, hyphens and underscores',
  })
  courseId!: string;

  /**
   * How this group is taught this course (CLAUDE.md §5.2, moved off the
   * enrollment on 2026-09-10).
   *
   * Required rather than defaulted. The mode decides which dashboard a student
   * sees - completion checkpoints or an attendance timeline - and a default
   * here would silently pick one for a live cohort whose staff simply did not
   * think about the field.
   */
  @IsIn(['recorded', 'live'], {
    message: 'learningMode must be "recorded" or "live"',
  })
  learningMode!: 'recorded' | 'live';
}

export class AddGroupMemberDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'studentId must contain only letters, digits, hyphens and underscores',
  })
  studentId!: string;
}

/** `enableImplicitConversion` is off globally, so query numbers need a transform. */
const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListGroupsQueryDto {
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_PAGE_SIZE)
  limit?: number = DEFAULT_GROUP_PAGE_SIZE;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
