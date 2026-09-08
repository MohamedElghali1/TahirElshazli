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

const MAX_DURATION_SECONDS = 12 * 60 * 60;

/**
 * A partial edit. Every field is optional and an omitted one is left alone.
 *
 * `courseId`, `moduleId` and `lessonId` are absent deliberately: moving a
 * recording to another course would move it out from under the enrollment
 * check that gates every read of it, so a move is a delete and a re-create.
 */
export class UpdateRecordingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chapter?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  topics?: string[];

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  videoUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_SECONDS)
  durationSeconds?: number;

  @IsOptional()
  @IsISO8601()
  lessonDate?: string;
}
