import {
  IsInt,
  IsISO8601,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';

/** Eight hours. A session longer than this is a typo, not a lesson. */
export const MAX_SESSION_MINUTES = 8 * 60;

export class CreateLiveSessionDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  /**
   * The meeting link the teacher pastes. No Zoom API automation in this phase
   * (CLAUDE.md §11), so this is user-supplied text that ends up as an `href` in
   * a student's browser.
   *
   * `IsPublicHttpUrl` rather than `@IsUrl`: it also rejects `javascript:`,
   * loopback and private/link-local hosts, so the field cannot be turned into a
   * pointer at our own infrastructure. Its own doc comment is honest that a
   * hostname *resolving* to a private address still passes - nothing here
   * fetches the URL, so that residual risk is not exercised.
   */
  @IsPublicHttpUrl()
  @MaxLength(2048)
  zoomLink!: string;

  /** UTC, per the §6 convention; the client renders it in the user's timezone. */
  @IsISO8601()
  scheduledAt!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_MINUTES)
  durationMinutes!: number;
}
