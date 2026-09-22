import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';

/**
 * The public URL segment. Lowercase, digits and hyphens only - it is what the
 * marketing site links, so it has to survive being typed, copied and printed.
 */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

const SLUG_MESSAGE =
  'slug must contain only lowercase letters, digits and hyphens';

/**
 * Creating a course (`DOM-5`).
 *
 * `thumbnailUrl`, `sequentialLockEnabled` and `isPublished` are optional
 * because the table has a sensible answer for each: no image, no lock, and
 * **not published**. The default on the last one is the one worth stating -
 * a course that went live the moment it was created would put a draft on the
 * public site, and "publish it" is a separate, deliberate `PATCH`.
 */
export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  teacherName!: string;

  /**
   * `@IsOptional`, not `@IsOptionalNotNull`: the column is nullable and `null`
   * genuinely means "no image".
   *
   * `@IsUrl` with an explicit protocol list, because this string is rendered
   * as an image source - `javascript:` and `data:` are both valid "URLs" to a
   * permissive validator and neither belongs in an `src`.
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  thumbnailUrl?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  sequentialLockEnabled?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  isPublished?: boolean;
}

/**
 * Updating one. Every field optional.
 *
 * `@IsOptionalNotNull()` on all of them but `thumbnailUrl`, because those
 * columns are `NOT NULL` - plain `@IsOptional()` skips validation for `null`
 * as well as `undefined`, which let a `null` through to the drivers, where
 * Postgres `COALESCE`d it to a no-op and the memory driver wrote it. The
 * answer is 400 at the boundary, before either driver sees it.
 *
 * `modules` is absent: the outline is authored through the assessment and
 * material surfaces, not by overwriting it wholesale here.
 */
export class UpdateCourseDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  teacherName?: string;

  /** Nullable column, so `@IsOptional`: `null` clears the image. */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  thumbnailUrl?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  sequentialLockEnabled?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  isPublished?: boolean;
}
