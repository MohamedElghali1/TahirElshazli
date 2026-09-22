import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { IsMediaUrl } from '../../common/validators/is-media-url.validator.js';
import {
  BLOG_CATEGORIES,
  BLOG_MEDIA_KINDS,
  BLOG_POST_STATUSES,
  type BlogCategory,
  type BlogMediaKind,
  type BlogPostStatus,
} from '../interfaces/blog-repository.interface.js';
import {
  DEFAULT_BLOG_PAGE_SIZE,
  MAX_BLOG_PAGE_SIZE,
} from '../blog.service.js';

/**
 * One gallery item, as sent by the authoring form.
 *
 * No `position`: order is the array's own, assigned by the service. A client
 * that supplied it could hand over two items at position 0 and the gallery
 * would then order by id - a stable answer to a question nobody asked. Sending
 * the list in the order it should read is both simpler and unambiguous.
 */
export class BlogMediaInputDto {
  @IsIn(BLOG_MEDIA_KINDS)
  kind!: BlogMediaKind;

  /**
   * Either a public http(s) URL or a `/uploads/<name>` path this server minted
   * through `POST /staff/uploads`. `IsMediaUrl` is the only thing that decides
   * which shapes are acceptable.
   */
  @IsMediaUrl()
  @MaxLength(2048)
  url!: string;

  /** The client's per-item "description". */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  /**
   * Both optional and both only meaningful for a file we stored ourselves -
   * the upload response carries them, and the form passes them straight back.
   * For an externally-hosted URL they are absent, because a value invented
   * here would be a guess a later reader would trust.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

/**
 * The shared body of a post. `slug` is deliberately absent from every DTO
 * here - the service derives it from the title on create and never changes it
 * afterwards, because a slug that moves breaks every link already shared.
 */
export class CreateBlogPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /**
   * The standfirst. Optional, and falling back to the opening of `body` on
   * read rather than being copied at write time - a copy would drift the first
   * time the body was edited.
   */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  /**
   * The client's "description", and the substance of the post. 20 000
   * characters, which is generous by design: unlike an announcement (capped at
   * 2 000 because it travels as a notification message with nowhere to click
   * through to) this has a page of its own to be read on.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @IsOptionalNotNull()
  @IsIn(BLOG_CATEGORIES)
  category?: BlogCategory = 'achievement';

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /**
   * Defaults to `draft`, so a half-written post cannot be published by
   * forgetting a field. Publishing is something the author does on purpose.
   */
  @IsOptionalNotNull()
  @IsIn(BLOG_POST_STATUSES)
  status?: BlogPostStatus = 'draft';

  /**
   * When it goes live. Only consulted for `scheduled`; the service fills in
   * "now" for anything else rather than making the form send a timestamp it
   * has no opinion about.
   */
  @IsOptionalNotNull()
  @IsISO8601()
  publishAt?: string;

  /**
   * The gallery, in reading order. Optional and allowed to be empty - a post
   * that is only words is a legitimate post, unlike an assessment with no
   * target group, which is invisible to everyone (§5.18).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BlogMediaInputDto)
  media?: BlogMediaInputDto[];
}

/**
 * A partial edit. Every field optional, and no `media` key.
 *
 * Media is replaced through its own route rather than through this one, because
 * the two have different failure modes: a `PATCH` that omitted `media` would
 * either have to mean "leave it alone" or "delete it all", and whichever was
 * chosen the other reading would eventually delete somebody's gallery.
 */
export class UpdateBlogPostDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body?: string;

  @IsOptionalNotNull()
  @IsIn(BLOG_CATEGORIES)
  category?: BlogCategory;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptionalNotNull()
  @IsIn(BLOG_POST_STATUSES)
  status?: BlogPostStatus;

  @IsOptionalNotNull()
  @IsISO8601()
  publishAt?: string;
}

/** Replaces the whole gallery. It is a set, not a diff - the same shape as
 *  `POST /staff/assessments/:id/targets`. */
export class SetBlogMediaDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BlogMediaInputDto)
  media!: BlogMediaInputDto[];
}

/** `enableImplicitConversion` is off globally, so query numbers need a transform. */
const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListBlogQueryDto {
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_BLOG_PAGE_SIZE)
  limit?: number = DEFAULT_BLOG_PAGE_SIZE;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
