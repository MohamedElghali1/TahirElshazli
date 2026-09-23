import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  AnnotationKind,
  AnnotationPoint,
  AssessmentRepository,
  SubmissionAnnotation,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';

/** `020_marking.sql`'s column default; applied here when the caller omits it. */
const DEFAULT_COLOUR = '#E5484D';

export interface CreateAnnotationInput {
  fileId: string | null;
  page?: number;
  kind: AnnotationKind;
  x?: number | null;
  y?: number | null;
  path?: AnnotationPoint[] | null;
  colour?: string;
  width?: number | null;
  body?: string;
}

export interface UpdateAnnotationInput {
  page?: number;
  x?: number | null;
  y?: number | null;
  path?: AnnotationPoint[] | null;
  colour?: string;
  width?: number | null;
  body?: string;
}

/**
 * The teacher's overlay (`MARK-1`, `D-2`): a rendered annotation, never a
 * flattened file. `D-44`: annotations are audited per *save*, not per
 * mutation - a freehand pass writes 50-200 strokes, and auditing each would
 * make the audit log mostly brush strokes. That entry belongs to the save
 * action (slice 7d); this service writes none.
 */
@Injectable()
export class AnnotationsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
  ) {}

  /**
   * Resolves and scopes the course from the submission's own assessment - the
   * same shape as `GradingService.grade`, and for the same reason (§5.11): a
   * submission id from a course the caller does not hold must 404 before any
   * annotation is read or written, never trust a course id from the URL.
   */
  private async scopeToSubmission(
    submissionId: string,
    actor: StaffActor,
  ): Promise<void> {
    const submission = await this.assessmentRepo.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    const assessment = await this.assessmentRepo.findById(submission.assessmentId);
    if (!assessment) {
      throw new NotFoundException('Submission not found');
    }
    // Rethrown under the submission's own wording, same anti-enumeration
    // reasoning as `GradingService.grade`: two different 404 bodies for
    // "out of scope" and "never existed" is the existence oracle §7 forbids.
    try {
      await this.scope.assertAssigned(assessment.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Submission not found');
      }
      throw error;
    }
  }

  /**
   * Same resolve-and-scope, starting from an annotation id instead of a
   * submission id - a TA holding an annotation id for a course they are not
   * assigned to is the same §5.11 attack one hop further in.
   */
  private async scopeToAnnotation(
    annotationId: string,
    actor: StaffActor,
  ): Promise<SubmissionAnnotation> {
    const annotation = await this.assessmentRepo.findAnnotationById(annotationId);
    if (!annotation) {
      throw new NotFoundException('Annotation not found');
    }
    const submission = await this.assessmentRepo.findSubmissionById(
      annotation.submissionId,
    );
    if (!submission) {
      throw new NotFoundException('Annotation not found');
    }
    const assessment = await this.assessmentRepo.findById(submission.assessmentId);
    if (!assessment) {
      throw new NotFoundException('Annotation not found');
    }
    try {
      await this.scope.assertAssigned(assessment.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Annotation not found');
      }
      throw error;
    }
    return annotation;
  }

  async list(
    submissionId: string,
    actor: StaffActor,
  ): Promise<SubmissionAnnotation[]> {
    await this.scopeToSubmission(submissionId, actor);
    return this.assessmentRepo.findAnnotations(submissionId);
  }

  async create(
    submissionId: string,
    actor: StaffActor,
    input: CreateAnnotationInput,
  ): Promise<SubmissionAnnotation> {
    await this.scopeToSubmission(submissionId, actor);

    const x = input.x ?? null;
    const y = input.y ?? null;
    const path = input.path ?? null;
    assertShape(input.kind, { x, y, path });

    // A `fileId` must name a file on *this* submission. The foreign key only
    // proves the file exists somewhere, so without this an annotation can be
    // pinned to another submission's photo - drawn on one student's work and
    // stored against another's. The marking view would then render it over the
    // wrong file, and scope would not catch it: the caller legitimately holds
    // the submission they named. `null` is the pre-`020` single-file case and
    // stays allowed.
    if (input.fileId !== null) {
      const files = await this.assessmentRepo.findFilesForSubmissions([
        submissionId,
      ]);
      if (!files.some((f) => f.id === input.fileId)) {
        throw new NotFoundException('File not found on this submission');
      }
    }

    return this.assessmentRepo.createAnnotation({
      submissionId,
      fileId: input.fileId,
      page: input.page ?? 0,
      kind: input.kind,
      x,
      y,
      path,
      colour: input.colour ?? DEFAULT_COLOUR,
      width: input.width ?? null,
      body: input.body ?? '',
      authorId: actor.id,
    });
  }

  /**
   * `D-45`: an annotation may be edited only by its own author. No teacher or
   * admin override - attribution is the point, so this check applies even to
   * an actor whom `scopeToAnnotation` already lets through.
   */
  async update(
    annotationId: string,
    actor: StaffActor,
    input: UpdateAnnotationInput,
  ): Promise<SubmissionAnnotation> {
    const existing = await this.scopeToAnnotation(annotationId, actor);
    // The resource is on the caller's own list (it showed up in `list()`), so
    // this is a 403, not a 404 - hiding it would make the marking screen lie
    // about a row it is showing (CLAUDE.md §7).
    if (existing.authorId !== actor.id) {
      throw new ForbiddenException(
        'You may only edit your own annotations.',
      );
    }

    // `kind` cannot change (D-2), so the merged shape is validated against the
    // kind the annotation was created with - the same invariant `create`
    // enforces, now applied to whatever this edit leaves behind.
    assertShape(existing.kind, {
      x: input.x !== undefined ? input.x : existing.x,
      y: input.y !== undefined ? input.y : existing.y,
      path: input.path !== undefined ? input.path : existing.path,
    });

    const updated = await this.assessmentRepo.updateAnnotation(annotationId, input);
    if (!updated) {
      // Deleted between the read above and this write.
      throw new NotFoundException('Annotation not found');
    }
    return updated;
  }

  /** `D-45`: the same author-only rule as `update`. */
  async remove(annotationId: string, actor: StaffActor): Promise<void> {
    const existing = await this.scopeToAnnotation(annotationId, actor);
    if (existing.authorId !== actor.id) {
      throw new ForbiddenException(
        'You may only delete your own annotations.',
      );
    }
    await this.assessmentRepo.deleteAnnotation(annotationId);
  }
}

/**
 * The invariant `020_marking.sql`'s CHECK constraints enforce at the row: a
 * stroke carries a non-empty `path` and no point; a pin or text carries
 * `x`/`y` and no path. Checked here too so a violation comes back as a clean
 * 400 rather than a raw constraint error from the database (CLAUDE.md §6 -
 * errors leak nothing).
 */
function assertShape(
  kind: AnnotationKind,
  shape: { x: number | null; y: number | null; path: AnnotationPoint[] | null },
): void {
  if (kind === 'stroke') {
    if (!shape.path || shape.path.length === 0) {
      throw new BadRequestException('A stroke requires a non-empty path.');
    }
    if (shape.x !== null || shape.y !== null) {
      throw new BadRequestException('A stroke does not take x or y.');
    }
  } else {
    if (shape.x === null || shape.y === null) {
      throw new BadRequestException(`A ${kind} annotation requires x and y.`);
    }
    if (shape.path !== null) {
      throw new BadRequestException(`A ${kind} annotation does not take a path.`);
    }
  }
}
