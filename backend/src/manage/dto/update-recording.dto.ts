import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';

const MAX_DURATION_SECONDS = 12 * 60 * 60;

/**
 * A partial edit. Every field is optional and an omitted one is left alone.
 *
 * `courseId`, `moduleId` and `lessonId` are absent deliberately: moving a
 * recording to another course would move it out from under the enrollment
 * check that gates every read of it, so a move is a delete and a re-create.
 */
export class UpdateRecordingDto {
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(120)
  chapter?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  topics?: string[];

  @IsOptionalNotNull()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  videoUrl?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_SECONDS)
  durationSeconds?: number;

  @IsOptionalNotNull()
  @IsISO8601()
  lessonDate?: string;

  /**
   * `thumbnail_url` is a nullable column, unlike its siblings above - so this
   * uses `@IsOptional()`, not `@IsOptionalNotNull()`: `null` is a real value
   * here, meaning "clear the thumbnail", and undefined still means "leave it
   * alone" (`common/validators/is-optional-not-null.ts`).
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  thumbnailUrl?: string | null;
}
