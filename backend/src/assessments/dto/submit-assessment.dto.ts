import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';

/** Roughly 20 pages of prose - generous for a typed answer, bounded for storage. */
const MAX_ANSWER_LENGTH = 50_000;

export class SubmitAssessmentDto {
  @IsOptional()
  @IsString()
  // Blocks loopback, RFC1918 and link-local literals as well as non-http
  // schemes. Read the validator's doc comment before relying on it: a hostname
  // that resolves to a private address still gets through.
  @IsPublicHttpUrl()
  @MaxLength(2048)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ANSWER_LENGTH)
  answerText?: string;
}
