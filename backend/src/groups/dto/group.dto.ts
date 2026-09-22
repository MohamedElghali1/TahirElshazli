import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
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

/**
 * The whole of a group, as a request body. `API_SPEC.yaml`'s `GroupWrite`.
 *
 * Both required fields are required for the same reason: a group now *is* a
 * cohort studying one named course (migration 013), so neither half of that
 * sentence can be left out and have a row still mean anything.
 */
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

  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'courseId must contain only letters, digits, hyphens and underscores',
  })
  courseId!: string;

  /**
   * Who runs this group. **Display only** - it grants nothing. What an
   * assistant may reach is `assistant_group_assignments` (`AUTH-2`), decided by
   * `StaffScopeService`. `null` clears the field.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'assistantId must contain only letters, digits, hyphens and underscores',
  })
  assistantId?: string | null;

  /** When the group meets, as free text - "Saturday 18:00". */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  meets?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  room?: string | null;
}

/**
 * The PATCH body: every field optional, including `name` and `courseId`.
 *
 * Not `PartialType(CreateGroupDto)` - `@nestjs/mapped-types` is not a
 * dependency here, and repeating five decorators is cheaper than adding one.
 */
export class UpdateGroupDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'courseId must contain only letters, digits, hyphens and underscores',
  })
  courseId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'assistantId must contain only letters, digits, hyphens and underscores',
  })
  assistantId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  meets?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  room?: string | null;
}

export class AddGroupMemberDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'studentId must contain only letters, digits, hyphens and underscores',
  })
  studentId!: string;
}

/**
 * `POST /admin/groups/:groupId/members/bulk` (`GROUP-3`) - backs the roster's
 * "Move N to group". `API_SPEC.yaml`'s bounds: 1-100 at once.
 */
export class BulkMoveMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(ID_PATTERN, {
    each: true,
    message: 'studentIds must contain only letters, digits, hyphens and underscores',
  })
  studentIds!: string[];
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
