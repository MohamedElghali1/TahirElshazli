/**
 * What a mark on a paper is (`D-2`, assumption A-10).
 *
 * `comment`, `tick` and `cross` are pins at a point; `pen` and `highlight` are
 * freehand strokes carrying a `path`. The eraser is **not** a kind: erasing is
 * deleting the annotation the eraser touched.
 */
export type AnnotationKind = 'comment' | 'tick' | 'cross' | 'pen' | 'highlight';

/** The stroke kinds - the ones that carry a `path` and nothing else does. */
export const STROKE_KINDS: readonly AnnotationKind[] = ['pen', 'highlight'];

/** `[x%, y%]` from the page box's physical top-left, each 0-100. */
export type AnnotationPoint = [number, number];

/**
 * One mark on one page of one file of a submission (`MARK-1`).
 *
 * **Data, never a flattened file** (`D-2`): the student's original stays
 * untouched and this renders over it. Coordinates are percentages of the page
 * box so a mark lands on the same spot of the paper at any zoom.
 */
export interface StoredAnnotation {
  id: string;
  submissionId: string;
  /** Which file of the submission it was drawn on (A-11). */
  fileUrl: string;
  /** 1-based. An image is page 1. */
  page: number;
  kind: AnnotationKind;
  /** A pin's point, or a stroke's first point. */
  xPercent: number;
  yPercent: number;
  /** A comment's words. Empty for every other kind. */
  text: string;
  /** Present exactly for `pen`/`highlight`; null for a pin. */
  path: AnnotationPoint[] | null;
  /** The staff member who drew it. Only they may change or erase it (`D-42` (a)). */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** `id`, `createdAt` and `updatedAt` are the repository's to assign. */
export type NewAnnotation = Omit<StoredAnnotation, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * A partial edit. `kind`, `fileUrl` and `submissionId` are absent on purpose:
 * turning a tick into a stroke, or moving a mark to another paper, is a delete
 * and a create, not an edit.
 */
export interface AnnotationPatch {
  page?: number;
  xPercent?: number;
  yPercent?: number;
  text?: string;
  path?: AnnotationPoint[];
}

/** How many annotations one submission has on one file. */
export interface AnnotationFileCount {
  submissionId: string;
  fileUrl: string;
  count: number;
}

export interface SubmissionAnnotationRepository {
  /** One paper's marks, ordered `(page, createdAt, id)`. */
  findBySubmission(submissionId: string): Promise<StoredAnnotation[]>;
  /**
   * One annotation, or null. **A copy on the memory driver**: this read feeds
   * the audit `before` of an edit, and handing out the stored object would make
   * `before` alias `after` (CLAUDE.md §9 - shipped twice).
   */
  findById(annotationId: string): Promise<StoredAnnotation | null>;
  create(input: NewAnnotation): Promise<StoredAnnotation>;
  /** Stamps `updatedAt`. Null when there is no such annotation. */
  update(annotationId: string, patch: AnnotationPatch): Promise<StoredAnnotation | null>;
  /** A hard delete - the eraser (`D-2`: "editable and deletable"). False when absent. */
  remove(annotationId: string): Promise<boolean>;
  /** For the per-submission cap (A-11). */
  countBySubmission(submissionId: string): Promise<number>;
  /**
   * Counts per `(submission, file)` for many submissions in one read - the
   * per-task queue's "N marks" and "N on a previous version" without a read per
   * row. Deliberately raw: which files are *current* is a fact about the
   * submission, another aggregate, so the service classifies (CLAUDE.md §5: a
   * repository never calls another, and holds no rule).
   */
  countBySubmissionFiles(submissionIds: readonly string[]): Promise<AnnotationFileCount[]>;
}

export const SUBMISSION_ANNOTATION_REPOSITORY = Symbol('SUBMISSION_ANNOTATION_REPOSITORY');
