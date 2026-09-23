import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { AttachmentDto, MAX_ATTACHMENTS } from './attachment.dto.js';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const TYPES = ['homework', 'assignment', 'quiz'] as const;
const WORK_TYPES = ['file_upload', 'link', 'google_form'] as const;

/**
 * `GET /staff/task-drafts`. Both filters **narrow**; neither addresses a
 * resource, so a `courseId` the caller cannot reach answers `200 []` exactly as
 * an unknown one does (assumption A-4).
 */
export class ListTaskDraftsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  courseId?: string;

  @IsOptional()
  @IsIn(TYPES, { message: 'type must be homework, assignment or quiz' })
  type?: (typeof TYPES)[number];
}

/**
 * `POST /staff/task-drafts` - the `TaskDraftWrite` schema. `usedCount`,
 * `createdBy` and the timestamps are the server's; a client cannot send them.
 * The text caps reuse `CreateAssessmentDto`'s, because a draft's content is
 * copied into a task and must fit there.
 */
export class CreateTaskDraftDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  courseId!: string;

  @IsIn(TYPES, { message: 'type must be homework, assignment or quiz' })
  type!: (typeof TYPES)[number];

  @IsOptionalNotNull()
  @IsIn(WORK_TYPES, { message: 'workType must be file_upload, link or google_form' })
  workType?: (typeof WORK_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  // The column refuses a blank title (018's CHECK). Refused here too, as a
  // 400, so it never arrives there as a 500.
  @Matches(/\S/, { message: 'title must not be blank' })
  title!: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

/**
 * `PATCH /staff/task-drafts/:id` - the `TaskDraftUpdate` schema. Every field
 * optional and **never null** (`D-11`): each maps to a NOT NULL column.
 * `courseId` is absent on purpose (assumption A-1); an undeclared field is
 * stripped by the whitelist rather than honoured.
 */
export class UpdateTaskDraftDto {
  @IsOptionalNotNull()
  @IsIn(TYPES, { message: 'type must be homework, assignment or quiz' })
  type?: (typeof TYPES)[number];

  @IsOptionalNotNull()
  @IsIn(WORK_TYPES, { message: 'workType must be file_upload, link or google_form' })
  workType?: (typeof WORK_TYPES)[number];

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  // The column refuses a blank title (018's CHECK). Refused here too, as a
  // 400, so it never arrives there as a 500.
  @Matches(/\S/, { message: 'title must not be blank' })
  title?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
