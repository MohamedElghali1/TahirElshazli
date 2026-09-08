import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';
import { MAX_SESSION_MINUTES } from './create-live-session.dto.js';

/**
 * A partial edit. Every field is optional and an omitted one is left alone.
 *
 * `courseId` is absent deliberately: moving a session to another course would
 * move it out from under the enrollment check that gates every read of it, and
 * would strand the attendance rows keyed on the session. A move is a cancel
 * and a re-schedule.
 */
export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsPublicHttpUrl()
  @MaxLength(2048)
  zoomLink?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_MINUTES)
  durationMinutes?: number;
}
