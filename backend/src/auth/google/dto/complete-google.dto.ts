import { IsString, Length } from 'class-validator';

/**
 * What the web app's callback page posts back: Google's one-time `code`, the
 * signed `state` it came with, and the `browserKey` the starting page kept.
 * Lengths are generous caps, not formats - all three are opaque here and
 * verified in the service.
 */
export class CompleteGoogleDto {
  @IsString()
  @Length(1, 2048)
  code: string;

  @IsString()
  @Length(1, 4096)
  state: string;

  @IsString()
  @Length(16, 256)
  browserKey: string;
}
