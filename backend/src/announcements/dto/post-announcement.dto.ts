import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AUDIENCE_PATTERN } from '../announcement-audience.js';
import {
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
  MAX_ANNOUNCEMENT_PAGE_SIZE,
} from '../announcements.service.js';

/**
 * The message itself, shared by both post routes.
 *
 * `body` is capped at 2000 characters because it travels intact as the
 * notification message - there is no announcement detail page to click
 * through to, so anything longer would be text with nowhere to be read.
 */
export class PostCourseAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

/**
 * The admin form: the same message plus an explicit audience.
 *
 * There is deliberately no `audience` field on `PostCourseAnnouncementDto`.
 * The `/staff` route takes its audience from the URL, so a TA has no way to
 * name `all_students` even by sending it - and with `whitelist: true` on the
 * global pipe, an audience they do send is stripped before the service ever
 * sees the body rather than being rejected with a hint that the field exists.
 */
export class PostAnnouncementDto extends PostCourseAnnouncementDto {
  /**
   * CLAUDE.md §6.1's spelling: `all_students`, `all_tas` or `course:<id>`.
   * The pattern is built from the same parts `parseAudience` uses, so the
   * validator and the parser cannot drift apart.
   */
  @IsString()
  @MaxLength(80)
  @Matches(AUDIENCE_PATTERN, {
    message: 'audience must be all_students, all_tas, or course:<courseId>',
  })
  audience!: string;
}

/** `enableImplicitConversion` is off globally, so query numbers need a transform. */
const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_ANNOUNCEMENT_PAGE_SIZE)
  limit?: number = DEFAULT_ANNOUNCEMENT_PAGE_SIZE;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
