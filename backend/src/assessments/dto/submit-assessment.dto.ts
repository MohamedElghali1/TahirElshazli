import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';
import { MAX_SUBMISSION_FILES } from '../assessments.service.js';

/** Roughly 20 pages of prose - generous for a typed answer, bounded for storage. */
const MAX_ANSWER_LENGTH = 50_000;
/**
 * `display_name` is `TEXT` in the schema, so this is the only bound on it -
 * which is the right place for one, since it is a label rather than a path
 * (`D-42`). Generous enough for any real filename.
 */
const MAX_DISPLAY_NAME_LENGTH = 255;

export class SubmittedFileDto {
  @IsString()
  @IsPublicHttpUrl()
  @MaxLength(2048)
  fileUrl: string;

  @IsString()
  @MaxLength(MAX_DISPLAY_NAME_LENGTH)
  displayName: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmittedFileDto)
  // The service enforces this too, and that copy is the one that matters
  // (`CLAUDE.md` §5). This one rejects a malformed request at the boundary.
  @ArrayMaxSize(MAX_SUBMISSION_FILES)
  files?: SubmittedFileDto[];

  @IsOptional()
  @IsString()
  @IsPublicHttpUrl()
  @MaxLength(2048)
  linkUrl?: string;
}
