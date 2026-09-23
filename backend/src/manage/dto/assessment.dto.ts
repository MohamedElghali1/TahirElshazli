import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { AttachmentDto, MAX_ATTACHMENTS } from './attachment.dto.js';

/** The id alphabet this schema uses, matching `AssignStaffDto.userId`. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * A file size ceiling the API will accept, separate from whatever any one
 * assessment allows. CLAUDE.md §5.8 makes the allowed types configurable *per
 * assessment* and never a global whitelist - but "configurable" is not
 * "unbounded", and a task advertising a 4 GB limit is a denial-of-service
 * waiting for a student to accept the invitation.
 */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** `D-28`. `scheduled` is derived, never accepted. */
const TASK_VISIBILITIES = ['published', 'hidden'] as const;

/** `D-31`. PDF upload, a Google Doc link, a photo of written work. */
const SUBMISSION_MODES = ['pdf_upload', 'doc_link', 'photo_upload'] as const;

/**
 * One targeted group, with an optional window override.
 *
 * The three timestamps are **overrides**, not copies: omitted means inherit
 * from the assessment, so a teacher setting one deadline for everyone sends
 * only `groupId` (CLAUDE.md §5.16).
 */
export class AssessmentTargetDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'groupId must contain only letters, digits, hyphens and underscores',
  })
  groupId!: string;

  @IsOptional()
  @IsISO8601()
  availableFrom?: string;

  @IsOptional()
  @IsISO8601()
  availableTo?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}

export class CreateAssessmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(1000)
  description = '';

  @IsString()
  @MaxLength(5000)
  instructions = '';

  /**
   * `quiz` is accepted and behaves exactly like an assignment today: a
   * submission with a mark. The question engine §9 describes - MCQ, short
   * answer, timers, question banks - is unbuilt, and §11 still has "how rich
   * must the quiz engine be at launch" open. Accepting the type now means the
   * data is already labelled correctly when that lands.
   */
  @IsIn(['homework', 'assignment', 'quiz'], {
    message: 'type must be homework, assignment or quiz',
  })
  type!: 'homework' | 'assignment' | 'quiz';

  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  topics: string[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  lessonId?: string;

  @IsISO8601()
  availableFrom!: string;

  @IsISO8601()
  availableTo!: string;

  /** §11 leaves open what this *does*; the service only checks it is coherent. */
  @IsISO8601()
  dueAt!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore!: number;

  /** §5.8: per assessment, never a global hardcoded whitelist. */
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  allowedFileTypes!: string[];

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  maxFileSizeBytes!: number;

  /**
   * How the work is delivered - a different axis from `type` above, which says
   * what it is *for*. Optional, defaulting to `file_upload`, so a client that
   * predates work types keeps working unchanged.
   *
   * The conditional requirements (`link` needs a URL, `google_form` needs a
   * form) are enforced in the service, not here: class-validator expresses
   * "required only when another field has this value" badly, and the rule needs
   * to hold for any writer rather than only for this DTO.
   */
  @IsOptionalNotNull()
  @IsIn(['file_upload', 'link', 'google_form'], {
    message: 'workType must be file_upload, link or google_form',
  })
  workType?: 'file_upload' | 'link' | 'google_form';

  /** Where a `link` task points. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;

  /**
   * A Google Form **editing** link, or a bare form id.
   *
   * Not `@IsUrl()` on purpose. `GoogleFormsClient.parseFormId` accepts both
   * shapes and returns a specific message for each of the three wrong-but-
   * plausible things a teacher pastes - the responder link, a forms.gle short
   * link, and something that is not a form. An `@IsUrl()` here would replace all
   * of that with "externalUrl must be a URL", which is exactly the unhelpful
   * failure this feature goes out of its way to avoid.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  googleForm?: string;

  /**
   * Who the task is for (§5.16). Required and non-empty: an assessment set for
   * nobody is invisible to every student, and a teacher should find that out
   * when they submit the form rather than on the due date.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AssessmentTargetDto)
  targets!: AssessmentTargetDto[];

  /**
   * The draft this task was started from (`TASK-3`). Provenance only - the
   * body above is authoritative and nothing is merged from the draft. A draft
   * that is missing, on another course or unreachable is one identical 404.
   */
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  draftId?: string;

  /** A passage, an audio file, a mark scheme (`TASK-4`). At most ten. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  /**
   * `false` makes the task one-shot: a second submission is a 409. Omitted is
   * `true`, today's rule - resubmission until the window ends (`D-31`).
   */
  @IsOptionalNotNull()
  @IsBoolean()
  allowResubmission?: boolean;

  /**
   * `D-28`: two stored values. `scheduled` is refused - it is derived from a
   * future `availableFrom`, never stored or sent.
   */
  @IsOptionalNotNull()
  @IsIn(TASK_VISIBILITIES, { message: 'visibility must be published or hidden' })
  visibility?: (typeof TASK_VISIBILITIES)[number];

  /**
   * `D-32`: who marks it. Null or omitted is "whoever opens it first". An
   * assistant sending a non-null value is a 403; a user who does not qualify
   * for the audience is a 400. `@IsOptional`, because null is meaningful here.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  markerId?: string | null;

  /**
   * `D-31`: which modes the task accepts, each at most once. Omitted is `[]`
   * ("not stated"): the task's `allowedFileTypes` govern the upload as before.
   */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(SUBMISSION_MODES.length)
  @ArrayUnique()
  @IsIn(SUBMISSION_MODES, {
    each: true,
    message: 'each submission mode must be pdf_upload, doc_link or photo_upload',
  })
  submissionModes?: (typeof SUBMISSION_MODES)[number][];
}

/** Every field optional; `undefined` leaves it alone. */
export class UpdateAssessmentDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsOptionalNotNull()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  topics?: string[];

  @IsOptionalNotNull()
  @IsISO8601()
  availableFrom?: string;

  @IsOptionalNotNull()
  @IsISO8601()
  availableTo?: string;

  @IsOptionalNotNull()
  @IsISO8601()
  dueAt?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @IsOptionalNotNull()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  allowedFileTypes?: string[];

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  maxFileSizeBytes?: number;

  /**
   * Switching how the work is delivered.
   *
   * Allowed - unlike `type` below - because the realistic case is a teacher who
   * picked the wrong kind on the form and noticed immediately, and because
   * §5.18 already refuses to *delete* a task once anything has been submitted,
   * so "delete and re-create" is not always available as the alternative.
   *
   * The service re-checks the payload rule (a link needs a URL, a form needs a
   * form) on the merged result rather than on the patch alone, so switching to
   * `link` without supplying `externalUrl` is refused instead of producing a
   * task with a button that goes nowhere.
   */
  @IsOptionalNotNull()
  @IsIn(['file_upload', 'link', 'google_form'], {
    message: 'workType must be file_upload, link or google_form',
  })
  workType?: 'file_upload' | 'link' | 'google_form';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;

  /** A Google Form editing link - see `CreateAssessmentDto.googleForm`. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  googleForm?: string;

  /** Replaces the whole list, like `allowedFileTypes`. `[]` clears it. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptionalNotNull()
  @IsBoolean()
  allowResubmission?: boolean;

  /** Hiding a task that has any submission is a 409 (`D-28`, reading iii). */
  @IsOptionalNotNull()
  @IsIn(TASK_VISIBILITIES, { message: 'visibility must be published or hidden' })
  visibility?: (typeof TASK_VISIBILITIES)[number];

  /**
   * `D-32`. `null` clears it back to "whoever opens it first". Only the
   * teacher or an admin may change it (an assistant gets 403); the named user
   * must qualify for the task's current audience (400 otherwise).
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN)
  markerId?: string | null;

  /** `D-31`. Replaces the whole set; `[]` is "not stated". */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(SUBMISSION_MODES.length)
  @ArrayUnique()
  @IsIn(SUBMISSION_MODES, {
    each: true,
    message: 'each submission mode must be pdf_upload, doc_link or photo_upload',
  })
  submissionModes?: (typeof SUBMISSION_MODES)[number][];

  /**
   * `type`, `courseId` and `draftId` are deliberately absent. `draftId` is
   * provenance, set once at creation.
   *
   * Changing the course would move the task out from under the scoping check
   * that let the caller edit it and strand its targets and submissions - the
   * same reasoning `LiveSessionUpdate` gives for omitting `courseId`. Changing
   * the type would silently reclassify marks that §5.6 averages separately by
   * type. Both are a delete and a re-create, not a PATCH.
   *
   * `workType` above is the deliberate exception: it changes how a task is
   * *handed in*, not what kind of work it is, so no average is reclassified by
   * it.
   */
}

/** Re-aiming an existing task: the whole audience, replaced. */
export class SetAssessmentTargetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AssessmentTargetDto)
  targets!: AssessmentTargetDto[];
}
