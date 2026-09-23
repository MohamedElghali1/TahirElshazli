import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';

const ANNOTATION_KINDS = ['stroke', 'pin', 'text'] as const;

/** `020_marking.sql`'s column default, and the fallback when `colour` is omitted. */
const COLOUR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * One point of a freehand stroke, in page-percentage space (`MARK-1`) - so the
 * overlay survives any zoom or viewport rather than pinning to pixels.
 */
export class AnnotationPointDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;
}

/**
 * A new overlay mark (`MARK-1`, `D-2`). Shape and type only - *which* fields a
 * given `kind` requires (`stroke` takes `path`; `pin`/`text` take `x`/`y`) is
 * a cross-field rule a DTO cannot express and belongs in the service
 * (CLAUDE.md §5's non-overlapping validation split; `020_marking.sql`'s own
 * CHECK constraints are the same rule at the row).
 */
export class CreateAnnotationDto {
  /** Omitted means the submission's pre-`020` legacy single file. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fileId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  page?: number;

  @IsIn(ANNOTATION_KINDS)
  kind!: (typeof ANNOTATION_KINDS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  x?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  y?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => AnnotationPointDto)
  path?: AnnotationPointDto[] | null;

  @IsOptional()
  @IsString()
  @Matches(COLOUR_PATTERN, {
    message: 'colour must be a 6-digit hex code, e.g. #E5484D',
  })
  colour?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  width?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

/**
 * A partial edit. `undefined` leaves a field alone; `null` is a real value on
 * `x`, `y`, `path` and `width` (their columns are nullable) and a 400 on
 * `page`, `colour` and `body` (theirs are not) - mirrors
 * `SubmissionAnnotationUpdate` and the same split `IsOptionalNotNull`
 * documents. `kind` is absent on purpose: it never changes after creation.
 */
export class UpdateAnnotationDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  x?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  y?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => AnnotationPointDto)
  path?: AnnotationPointDto[] | null;

  @IsOptionalNotNull()
  @IsString()
  @Matches(COLOUR_PATTERN, {
    message: 'colour must be a 6-digit hex code, e.g. #E5484D',
  })
  colour?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  width?: number | null;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(4000)
  body?: string;
}
