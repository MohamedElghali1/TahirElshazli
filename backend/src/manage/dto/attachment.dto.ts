import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsMediaUrl } from '../../common/validators/is-media-url.validator.js';

/**
 * At most this many attachments on one task or draft (assumption A-3). A
 * storage bound, not a product rule: a task carries a passage, a recording and
 * a mark scheme, not a library.
 */
export const MAX_ATTACHMENTS = 10;

/**
 * One attachment on a task or a draft (`TASK-4`).
 *
 * `url` goes through `IsMediaUrl`: an uploaded `/uploads/<uuid>.<ext>` path or
 * a public `http(s)` URL, and nothing else - so `javascript:` and `data:` are
 * refused at the boundary and an attachment link is not an XSS sink. The URL is
 * never fetched server-side, so the SSRF surface is unchanged.
 *
 * `mimeType` and `sizeBytes` are **display-only** and nullable (a pasted link
 * has neither). Nothing decides anything on them.
 */
export class AttachmentDto {
  @IsString()
  @MaxLength(2048)
  @IsMediaUrl()
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType: string | null = null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1024 * 1024 * 1024)
  sizeBytes: number | null = null;
}
