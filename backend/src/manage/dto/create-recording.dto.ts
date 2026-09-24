import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';

/** Twelve hours. A duration past this is a typo, not a lesson. */
const MAX_DURATION_SECONDS = 12 * 60 * 60;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreateRecordingDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'moduleId must contain only letters, digits, hyphens and underscores',
  })
  moduleId!: string;

  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'lessonId must contain only letters, digits, hyphens and underscores',
  })
  lessonId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  /** Defaults to the module's chapter when omitted, so the student filter works. */
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

  /**
   * Where the video lives. A Bunny Stream id or URL today (CLAUDE.md §3);
   * §8 requires the *playback* URL to be signed and minted per request, which
   * is a delivery concern and not stored here.
   *
   * URL-validated so this cannot become a `javascript:` string that a player or
   * an anchor would happily accept.
   */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  videoUrl!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_SECONDS)
  durationSeconds!: number;

  /** When the lesson was taught. Defaults to now. */
  @IsOptionalNotNull()
  @IsISO8601()
  lessonDate?: string;

  /**
   * URL-validated for the same reason `videoUrl` is: without it the value can
   * become a `javascript:` string that an `<img src>` or an anchor would
   * happily accept.
   *
   * `@IsOptional()`, not `@IsOptionalNotNull()`, matching the PATCH DTO and the
   * rule in `common/validators/is-optional-not-null.ts`: the decorator tracks
   * whether the *column* is nullable, and `thumbnail_url` is. Rejecting an
   * explicit `null` here would have made the two verbs disagree about one
   * field — a client that read a recording back (`thumbnailUrl: null`) and
   * posted it as a new one would have got a 400 for sending the value the API
   * had just handed it.
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  thumbnailUrl?: string | null;
}
