import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssessmentRepository,
  StoredSubmission,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { WorkType } from '../assessments/interfaces/work-repository.interface.js';
import type {
  AnnotationKind,
  AnnotationPatch,
  AnnotationPoint,
  StoredAnnotation,
  SubmissionAnnotationRepository,
} from '../assessments/interfaces/submission-annotation-repository.interface.js';
import {
  STROKE_KINDS,
  SUBMISSION_ANNOTATION_REPOSITORY,
} from '../assessments/interfaces/submission-annotation-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditSnapshot } from '../audit/interfaces/audit-log-repository.interface.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import { isPlatformStored, storedMimeTypeOf } from '../common/storage/upload-types.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { GradingService, toGradingQueueItem, type GradingQueueItem } from './grading.service.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';

/** A return with no mark to hand back (assumption A-3). */
export const RETURN_NEEDS_MARK = 'Enter a mark before returning this work.';

/** The per-task queue asked of work that is not handed in here (A-6). */
export const QUEUE_NOT_HANDED_IN_HERE =
  "This task is not handed in here. Its results are on the task's results page.";

/**
 * Where one student stands on one task, derived on every read (CLAUDE.md §6):
 * no row, a row with no mark, a saved mark, a returned mark.
 */
export type SubmissionStatus = 'not_submitted' | 'submitted' | 'marked' | 'returned';

export function submissionStatusOf(s: StoredSubmission | null): SubmissionStatus {
  if (!s) return 'not_submitted';
  if (s.correctedAt === null) return 'submitted';
  return s.returnedAt === null ? 'marked' : 'returned';
}

/**
 * One file of a submission as the marking view renders it - server-derived,
 * so the client never decides what may be drawn on (`D-41`).
 *
 * `image` and `pdf` are platform-stored files the overlay can sit on; `file`
 * is a platform-stored file of another type; `link` is a pasted URL (a
 * `doc_link` submission, or any legacy one), shown as "Open original" and
 * graded with a mark and feedback only.
 */
export interface SubmissionDocument {
  url: string;
  kind: 'image' | 'pdf' | 'file' | 'link';
  annotatable: boolean;
}

/**
 * The file this submission currently carries, as the marking view renders it.
 * Zero or one today - a submission is one `fileUrl` - and a list because
 * `MARK-6` (open, B-1/B-2) may make it several; the anchor on `fileUrl`
 * (A-11) already allows that.
 */
export function documentsOf(s: Pick<StoredSubmission, 'fileUrl'>): SubmissionDocument[] {
  const urls = s.fileUrl ? [s.fileUrl] : [];
  return urls.map((url) => {
    if (!isPlatformStored(url)) {
      return { url, kind: 'link', annotatable: false };
    }
    const mime = storedMimeTypeOf(url);
    const kind = mime === 'application/pdf' ? 'pdf' : mime?.startsWith('image/') ? 'image' : 'file';
    return { url, kind, annotatable: kind !== 'file' };
  });
}

/** A mark id that is missing, or belongs to another paper: one 404 for both. */
export const ANNOTATION_NOT_FOUND = 'Annotation not found';

/**
 * `D-42` (a): only the person who drew a mark may change or erase it. A 403 -
 * the mark is on the caller's own screen, so a 404 would make the UI lie.
 */
export const ANNOTATION_NOT_YOURS = 'You can only change or erase your own marks.';

export const ANNOTATION_FILE_MISMATCH = 'That file is not part of this submission.';
export const ANNOTATION_FILE_NOT_STORED =
  'This file is not stored by the platform and cannot be marked up here. Grade it with a mark and feedback.';
export const ANNOTATION_FILE_NOT_RENDERABLE =
  'This file cannot be marked up here. Grade it with a mark and feedback.';

/** Storage bound per paper (assumption A-11), not a product rule. */
export const MAX_ANNOTATIONS_PER_SUBMISSION = 500;

/** A mark as staff see it: who drew it, by name. */
export interface AnnotationView extends StoredAnnotation {
  createdByName: string;
}

export interface AnnotationInput {
  fileUrl: string;
  page: number;
  kind: AnnotationKind;
  xPercent: number;
  yPercent: number;
  text?: string;
  path?: AnnotationPoint[];
}

/**
 * A mark must be one coherent thing (`019`'s CHECKs, restated here so the
 * caller gets a 400 with a sentence rather than a constraint name): a stroke
 * carries a path and a pin does not; a comment has words.
 */
function assertCoherent(kind: AnnotationKind, path: AnnotationPoint[] | null, text: string): void {
  const stroke = STROKE_KINDS.includes(kind);
  if (stroke && path === null) {
    throw new BadRequestException(`A ${kind} mark needs a path of points.`);
  }
  if (!stroke && path !== null) {
    throw new BadRequestException(`A ${kind} mark is a single point and takes no path.`);
  }
  if (kind === 'comment' && text.trim().length === 0) {
    throw new BadRequestException('A comment needs some text.');
  }
}

/** The flat, scalar audit snapshot of a mark (A-12). The path is not logged. */
function snapshot(a: StoredAnnotation): AuditSnapshot {
  return {
    annotationId: a.id,
    kind: a.kind,
    page: a.page,
    fileUrl: a.fileUrl,
    xPercent: a.xPercent,
    yPercent: a.yPercent,
    text: a.text,
    pathPoints: a.path?.length ?? 0,
  };
}

/** One targeted student on the per-task queue (`MARK-3`). */
export interface TaskSubmissionRow {
  studentId: string;
  studentName: string;
  /** Their earliest placement among the caller's reachable targeted groups (A-7). */
  groupId: string;
  groupName: string;
  submissionId: string | null;
  status: SubmissionStatus;
  /** The deadline this student was set: their own resolving group's (A-7). */
  dueAt: string;
  isLate: boolean;
  isOverdue: boolean;
  fileUrl: string | null;
  documents: SubmissionDocument[];
  answerText: string | null;
  lastSubmittedAt: string | null;
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  returnedAt: string | null;
  /** Marks on the file this submission carries now. */
  annotationCount: number;
  /** Marks on a file a resubmission replaced (`D-42` (c)): kept, never deleted. */
  staleAnnotationCount: number;
}

/**
 * One reachable targeted group's counts. A fact about THAT group, identical for
 * every viewer who can see it - there is deliberately no cross-group total, so
 * `D-23`'s viewer-dependent denominator cannot arise.
 */
export interface TaskSubmissionGroup {
  groupId: string;
  groupName: string;
  memberCount: number;
  notSubmitted: number;
  submitted: number;
  marked: number;
  returned: number;
}

export interface TaskSubmissions {
  assessmentId: string;
  courseId: string;
  title: string;
  maxScore: number;
  dueAt: string;
  workType: WorkType;
  /** `D-43`: advisory. Null until the first saved mark claims the task. */
  markerId: string | null;
  markerName: string | null;
  groups: TaskSubmissionGroup[];
  rows: TaskSubmissionRow[];
}

/**
 * Marking (unit 7): handing work back, the per-task queue, and the marks on
 * the paper.
 *
 * Every route that names a submission goes through
 * `SubmissionAccessService.loadInScope` first - the group grain (`D-23`) - so
 * an out-of-scope paper is the same 404 as a missing one before any 403 or 409
 * can speak.
 */
@Injectable()
export class MarkingService {
  constructor(
    private readonly access: SubmissionAccessService,
    /** The `D-43` claim lives there; a first annotation claims like a first mark. */
    private readonly grading: GradingService,
    private readonly scope: StaffScopeService,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    /** `GroupDataModule` is `@Global()`; this needs no import edge. */
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    /** Provided by `AssessmentsModule` (A-13), never re-provided here. */
    @Inject(SUBMISSION_ANNOTATION_REPOSITORY)
    private readonly annotationRepo: SubmissionAnnotationRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * Every targeted student on one task - submitted or not (`MARK-3`) - at the
   * **group grain**: only the caller's reachable targeted groups, restricted in
   * the reads, never filtered out of a wider one.
   *
   * "Not submitted" is the absence of a row computed against the targeted
   * groups' membership, not a stored state (`API_SPEC.yaml`).
   *
   * A task the caller reaches through no target is `ASSESSMENT_NOT_FOUND`,
   * byte-identical to a missing id. Link and Google Form work is a 409 (A-6):
   * it has no submissions here to mark.
   */
  async queue(assessmentId: string, actor: StaffActor): Promise<TaskSubmissions> {
    const assessment = await this.assessmentRepo.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException(ASSESSMENT_NOT_FOUND);
    }
    const reach = await this.scope.reachableGroupIds(actor);
    const reachable = await this.assessmentRepo.findTargetsForAssessments([assessmentId], reach);
    if (reach !== null && reachable.length === 0) {
      throw new NotFoundException(ASSESSMENT_NOT_FOUND);
    }
    if (assessment.workType !== 'file_upload') {
      throw new ConflictException(QUEUE_NOT_HANDED_IN_HERE);
    }

    // The WHOLE audience and its memberships, read to resolve each visible
    // student's own deadline (A-7) - the same tie-break the student read uses,
    // so staff and student agree on a due date. Never returned: only students
    // of the reachable groups become rows.
    const allTargets =
      reach === null
        ? reachable
        : await this.assessmentRepo.findTargetsForAssessments([assessmentId], null);
    const allMembers = await this.groupRepo.findMembersForGroups(allTargets.map((t) => t.groupId));
    const reachableIds = new Set(reachable.map((t) => t.groupId));
    const dueOf = new Map(allTargets.map((t) => [t.groupId, t.dueAt ?? assessment.dueAt]));

    // `findMembersForGroups` is ordered by `assigned_at`, so the first
    // membership seen per student is their earliest placement.
    const rowGroup = new Map<string, string>();
    const dueGroup = new Map<string, string>();
    for (const m of allMembers) {
      if (!dueGroup.has(m.studentId)) dueGroup.set(m.studentId, m.groupId);
      if (reachableIds.has(m.groupId) && !rowGroup.has(m.studentId)) {
        rowGroup.set(m.studentId, m.groupId);
      }
    }
    const studentIds = [...rowGroup.keys()];

    const [submissions, users, groups, marker] = await Promise.all([
      this.assessmentRepo.findSubmissionsForStudents([assessmentId], studentIds),
      this.userRepo.findByIds(studentIds),
      this.groupRepo.findByIds([...reachableIds]),
      assessment.markerId ? this.userRepo.findById(assessment.markerId) : Promise.resolve(null),
    ]);
    const counts = await this.annotationRepo.countBySubmissionFiles(submissions.map((s) => s.id));
    const submissionOf = new Map(submissions.map((s) => [s.studentId, s]));
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const groupNameOf = new Map(groups.map((g) => [g.id, g.name]));
    const now = Date.now();

    const rows: TaskSubmissionRow[] = studentIds.map((studentId) => {
      const submission = submissionOf.get(studentId) ?? null;
      const groupId = rowGroup.get(studentId) as string;
      const dueAt = dueOf.get(dueGroup.get(studentId) ?? groupId) ?? assessment.dueAt;
      const current = new Set(submission ? documentsOf(submission).map((d) => d.url) : []);
      let annotationCount = 0;
      let staleAnnotationCount = 0;
      for (const c of counts) {
        if (c.submissionId !== submission?.id) continue;
        if (current.has(c.fileUrl)) annotationCount += c.count;
        else staleAnnotationCount += c.count;
      }
      return {
        studentId,
        // Name, never email: the queue needs no contact detail (field minimisation).
        studentName: nameOf.get(studentId) ?? 'Unknown student',
        groupId,
        groupName: groupNameOf.get(groupId) ?? '',
        submissionId: submission?.id ?? null,
        status: submissionStatusOf(submission),
        dueAt,
        isLate: submission !== null && new Date(submission.lastSubmittedAt).getTime() > new Date(dueAt).getTime(),
        isOverdue: submission === null && now > new Date(dueAt).getTime(),
        fileUrl: submission?.fileUrl ?? null,
        documents: submission ? documentsOf(submission) : [],
        answerText: submission?.answerText ?? null,
        lastSubmittedAt: submission?.lastSubmittedAt ?? null,
        score: submission?.score ?? null,
        feedback: submission?.feedback ?? null,
        correctedAt: submission?.correctedAt ?? null,
        returnedAt: submission?.returnedAt ?? null,
        annotationCount,
        staleAnnotationCount,
      };
    });
    // Arabic-safe ordering: by group, then by name.
    rows.sort(
      (a, b) => a.groupName.localeCompare(b.groupName) || a.studentName.localeCompare(b.studentName),
    );

    // Counted over each group's OWN memberships, not over the rows: a student
    // in two groups is one row (under their earliest reachable placement,
    // which depends on the viewer) but a member of both, so counting rows
    // would make a group's figures change with who is looking.
    const summaries: TaskSubmissionGroup[] = reachable
      .map((t) => {
        const statuses = allMembers
          .filter((m) => m.groupId === t.groupId)
          .map((m) => submissionStatusOf(submissionOf.get(m.studentId) ?? null));
        const count = (status: SubmissionStatus) => statuses.filter((x) => x === status).length;
        return {
          groupId: t.groupId,
          groupName: groupNameOf.get(t.groupId) ?? '',
          memberCount: statuses.length,
          notSubmitted: count('not_submitted'),
          submitted: count('submitted'),
          marked: count('marked'),
          returned: count('returned'),
        };
      })
      .sort((a, b) => a.groupName.localeCompare(b.groupName));

    return {
      assessmentId: assessment.id,
      courseId: assessment.courseId,
      title: assessment.title,
      maxScore: assessment.maxScore,
      dueAt: assessment.dueAt,
      workType: assessment.workType,
      markerId: assessment.markerId,
      markerName: marker?.name ?? null,
      groups: summaries,
      rows,
    };
  }

  // -- Annotations (`MARK-1`) ---------------------------------------------

  /** Everything drawn on one paper, each with its author's name. */
  async listAnnotations(submissionId: string, actor: StaffActor): Promise<AnnotationView[]> {
    await this.access.loadInScope(submissionId, actor);
    return this.withNames(await this.annotationRepo.findBySubmission(submissionId));
  }

  /**
   * Draw one mark. The file must be one this submission carries **now** and
   * one the platform stores (`D-41`); a pasted link is graded with a mark and
   * feedback instead.
   *
   * Allowed after return (`D-42` (b)), like a re-grade: the student sees it
   * immediately, and the audit entry records who added it and when.
   *
   * The first annotation on a task nobody is named for claims it (`D-43`).
   */
  async createAnnotation(
    submissionId: string,
    actor: StaffActor,
    input: AnnotationInput,
  ): Promise<AnnotationView> {
    return this.db.runInTransaction(async () => {
      const { submission, assessment } = await this.access.loadInScope(submissionId, actor);
      const document = documentsOf(submission).find((d) => d.url === input.fileUrl);
      if (!document) {
        throw new BadRequestException(ANNOTATION_FILE_MISMATCH);
      }
      if (document.kind === 'link') {
        throw new BadRequestException(ANNOTATION_FILE_NOT_STORED);
      }
      if (!document.annotatable) {
        throw new BadRequestException(ANNOTATION_FILE_NOT_RENDERABLE);
      }
      const path = input.path ?? null;
      const text = input.text ?? '';
      assertCoherent(input.kind, path, text);
      if ((await this.annotationRepo.countBySubmission(submissionId)) >= MAX_ANNOTATIONS_PER_SUBMISSION) {
        throw new BadRequestException(
          `A paper can carry at most ${MAX_ANNOTATIONS_PER_SUBMISSION} marks.`,
        );
      }
      const created = await this.annotationRepo.create({
        submissionId,
        fileUrl: input.fileUrl,
        page: input.page,
        kind: input.kind,
        xPercent: input.xPercent,
        yPercent: input.yPercent,
        text,
        path,
        createdBy: actor.id,
      });
      await this.recordAnnotation(actor, submissionId, assessment.courseId, null, snapshot(created));
      // `D-43`: the first mark of either kind on an unclaimed task claims it.
      await this.grading.claimIfUnmarked(assessment, actor, 'first annotation');
      return (await this.withNames([created]))[0]!;
    });
  }

  /**
   * Move, re-word or redraw one's own mark. `kind` and `fileUrl` are not
   * editable (the DTO omits them). Coherence is re-checked against the STORED
   * kind: a path sent for a tick is a 400, not a silently changed kind.
   */
  async updateAnnotation(
    submissionId: string,
    annotationId: string,
    actor: StaffActor,
    patch: AnnotationPatch,
  ): Promise<AnnotationView> {
    return this.db.runInTransaction(async () => {
      const { assessment } = await this.access.loadInScope(submissionId, actor);
      const before = await this.ownAnnotation(submissionId, annotationId, actor);
      assertCoherent(
        before.kind,
        patch.path ?? before.path,
        patch.text ?? before.text,
      );
      const after = await this.annotationRepo.update(annotationId, patch);
      if (!after) {
        throw new NotFoundException(ANNOTATION_NOT_FOUND);
      }
      // `before` came from a copying read, so it cannot alias `after` (CLAUDE.md §9).
      await this.recordAnnotation(actor, submissionId, assessment.courseId, snapshot(before), snapshot(after));
      return (await this.withNames([after]))[0]!;
    });
  }

  /**
   * The eraser (`D-2`): a hard delete of one's own mark - annotations are
   * "editable and deletable", not history-bearing. The UI calls this per
   * stroke the eraser touches; there is no server-side hit-testing.
   */
  async removeAnnotation(
    submissionId: string,
    annotationId: string,
    actor: StaffActor,
  ): Promise<void> {
    return this.db.runInTransaction(async () => {
      const { assessment } = await this.access.loadInScope(submissionId, actor);
      const before = await this.ownAnnotation(submissionId, annotationId, actor);
      if (!(await this.annotationRepo.remove(annotationId))) {
        throw new NotFoundException(ANNOTATION_NOT_FOUND);
      }
      await this.recordAnnotation(actor, submissionId, assessment.courseId, snapshot(before), null);
    });
  }

  /**
   * The mark, if it is on THIS paper (404 otherwise, the same body as a missing
   * id - an id from another paper confirms nothing) and the caller drew it
   * (403 otherwise, `D-42` (a)). Called after the submission's own scope gate,
   * so an out-of-scope caller never reaches the 403.
   */
  private async ownAnnotation(
    submissionId: string,
    annotationId: string,
    actor: StaffActor,
  ): Promise<StoredAnnotation> {
    const annotation = await this.annotationRepo.findById(annotationId);
    if (!annotation || annotation.submissionId !== submissionId) {
      throw new NotFoundException(ANNOTATION_NOT_FOUND);
    }
    if (annotation.createdBy !== actor.id) {
      throw new ForbiddenException(ANNOTATION_NOT_YOURS);
    }
    return annotation;
  }

  private async recordAnnotation(
    actor: StaffActor,
    submissionId: string,
    courseId: string,
    before: AuditSnapshot | null,
    after: AuditSnapshot | null,
  ): Promise<void> {
    await this.audit.record({
      actorId: actor.id,
      actorRole: actorRoleOf(actor),
      action: 'submission.annotated',
      targetType: 'assessment_submission',
      targetId: submissionId,
      courseId,
      before,
      after,
    });
  }

  /** One batch read for the authors' names (never a read per mark). */
  private async withNames(annotations: StoredAnnotation[]): Promise<AnnotationView[]> {
    const authors = await this.userRepo.findByIds([...new Set(annotations.map((a) => a.createdBy))]);
    const nameOf = new Map(authors.map((u) => [u.id, u.name]));
    return annotations.map((a) => ({ ...a, createdByName: nameOf.get(a.createdBy) ?? 'Former staff member' }));
  }

  /**
   * Hand marked work back to the student (`MARK-2`). Saving a mark and
   * returning it are two operations: this is the one that makes the score,
   * feedback and annotations visible to the student.
   *
   * - Unmarked: **409** (A-3) - there is nothing to hand back.
   * - Already returned: **200** with the current state, **no second audit
   *   entry**, and `returnedAt` keeps the first return's time (A-3). There is
   *   no un-return: no document asks for one.
   */
  async returnSubmission(submissionId: string, actor: StaffActor): Promise<GradingQueueItem> {
    return this.db.runInTransaction(async () => {
      const { submission, assessment } = await this.access.loadInScope(submissionId, actor);
      if (submission.correctedAt === null) {
        throw new ConflictException(RETURN_NEEDS_MARK);
      }
      const student = await this.userRepo.findById(submission.studentId);
      if (submission.returnedAt !== null) {
        return toGradingQueueItem(submission, assessment, student);
      }
      const returned = await this.assessmentRepo.returnSubmission(submissionId);
      if (!returned) {
        // Deleted between the read and the write.
        throw new NotFoundException(SUBMISSION_NOT_FOUND);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'submission.returned',
        targetType: 'assessment_submission',
        targetId: submissionId,
        courseId: assessment.courseId,
        before: { returnedAt: null },
        after: { returnedAt: returned.returnedAt, score: returned.score },
      });
      return toGradingQueueItem(returned, assessment, student);
    });
  }
}
