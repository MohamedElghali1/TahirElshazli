import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssessmentRepository,
  StoredSubmission,
  SubmissionFile,
  SubmissionMode,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { WorkType } from '../assessments/interfaces/work-repository.interface.js';
import type { SubmissionAnnotationRepository } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import { SUBMISSION_ANNOTATION_REPOSITORY } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import { isPlatformStored, storedMimeTypeOf } from '../common/storage/upload-types.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { toGradingQueueItem, type GradingQueueItem } from './grading.service.js';
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

/** The files this submission currently carries, in order (`D-39`). */
export function documentsOf(s: Pick<StoredSubmission, 'fileUrl' | 'files'>): SubmissionDocument[] {
  const urls = [...s.files.map((f) => f.url), ...(s.fileUrl ? [s.fileUrl] : [])];
  return urls.map((url) => {
    if (!isPlatformStored(url)) {
      return { url, kind: 'link', annotatable: false };
    }
    const mime = storedMimeTypeOf(url);
    const kind = mime === 'application/pdf' ? 'pdf' : mime?.startsWith('image/') ? 'image' : 'file';
    return { url, kind, annotatable: kind !== 'file' };
  });
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
  files: SubmissionFile[];
  documents: SubmissionDocument[];
  answerText: string | null;
  lastSubmittedAt: string | null;
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  returnedAt: string | null;
  /** Marks on the files this submission carries now. */
  annotationCount: number;
  /** Marks on files a resubmission replaced (`D-42` (c)): kept, never deleted. */
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
  submissionModes: SubmissionMode[];
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
        files: submission?.files ?? [],
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
      submissionModes: assessment.submissionModes,
      markerId: assessment.markerId,
      markerName: marker?.name ?? null,
      groups: summaries,
      rows,
    };
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
