import { IsIn, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { IsPointList } from '../../common/validators/is-point-list.validator.js';
import type {
  AnnotationKind,
  AnnotationPoint,
} from '../../assessments/interfaces/submission-annotation-repository.interface.js';

export const ANNOTATION_KINDS: readonly AnnotationKind[] = ['comment', 'tick', 'cross', 'pen', 'highlight'];

/**
 * A new mark on a paper (`MARK-1`). Shape and bounds here; coherence - a stroke
 * has a path, a pin has none, a comment has words, the file is this
 * submission's and platform-stored - is the service's, because it depends on
 * the kind and on the submission (CLAUDE.md §5: two layers, non-overlapping).
 *
 * The eraser is not a kind: `kind: 'eraser'` is a 400 here. Erasing is `DELETE`.
 */
export class AnnotationWriteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  fileUrl!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  page!: number;

  @IsIn(ANNOTATION_KINDS as AnnotationKind[])
  kind!: AnnotationKind;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  xPercent!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  yPercent!: number;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptionalNotNull()
  @IsPointList()
  path?: AnnotationPoint[];
}

/**
 * An edit. Every field optional and **none nullable** (the columns are NOT
 * NULL). `kind` and `fileUrl` are absent on purpose: a tick turned into a
 * stroke, or a mark moved to another file, is a delete and a create. With the
 * global `whitelist: true` pipe, a `kind` sent here is stripped, never applied.
 */
export class AnnotationPatchDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;

  @IsOptionalNotNull()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  xPercent?: number;

  @IsOptionalNotNull()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  yPercent?: number;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptionalNotNull()
  @IsPointList()
  path?: AnnotationPoint[];
}
