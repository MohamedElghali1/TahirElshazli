import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A mark and its feedback.
 *
 * There is no upper bound on `score` here, and that is not an oversight: the
 * ceiling is the assessment's own `maxScore`, which a validator cannot see from
 * the request. `GradingService.grade` enforces it once the assessment is loaded.
 */
export class GradeSubmissionDto {
  @IsInt()
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;

  /**
   * The annotated copy of the student's work (CLAUDE.md §5.5). A separate
   * artifact beside the original, which stays immutable - this never replaces
   * the submitted file.
   *
   * Until Cloudflare R2 upload lands this is a URL the teacher supplies. It is
   * URL-validated rather than free text so the field cannot become a
   * javascript: link rendered into an anchor.
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  annotatedFileUrl?: string;
}
