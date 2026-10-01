import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Role } from '../auth/roles.enum.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { AssessmentRepository } from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type {
  ExternalResult,
  WorkRepository,
} from '../assessments/interfaces/work-repository.interface.js';
import { WORK_REPOSITORY } from '../assessments/interfaces/work-repository.interface.js';
import { COURSE_NOT_IN_SCOPE, StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { isVisibleToStudents } from '../assessments/assessments.service.js';
import {
  WorkAnalyticsService,
  type StudentWorkResult,
  type StudentWorkRow,
  type WorkAnalytics,
} from '../assessments/work-analytics.service.js';
import {
  GoogleFormSyncService,
  type SyncOutcome,
} from '../assessments/google-form-sync.service.js';
import { parseGoogleFormCsv } from '../assessments/google-form-csv.js';

/**
 * `POST .../results/import?dryRun=true` - what would happen, without writing
 * anything. `errors` is always `[]` today: a malformed row fails the whole
 * parse with a 400 naming the row (`google-form-csv.ts`) rather than
 * collecting a partial list, so a dry run either throws or has none to show.
 * Kept as a field rather than dropped so the shape does not have to change if
 * that ever becomes per-row-tolerant.
 */
export interface ImportResultsPreview {
  rows: number;
  matched: number;
  unmatched: number;
  errors: string[];
  questions: number;
}

/** `POST .../results/import` (stored). Same shape as a sync, plus the question count. */
export interface ImportResultsOutcome extends SyncOutcome {
  questions: number;
}

/**
 * The access decision for every analytics route, in one place.
 *
 * It exists because the route shape makes the mistake easy. These endpoints are
 * addressed by *assessment* id, not course id - so the course has to be
 * resolved from the assessment and then scoped on, and a controller that
 * forgot would be a TA reading another cohort's marks. CLAUDE.md §5.11 calls
 * that "the single easiest way to leak the whole platform through the API", and
 * the defence is exactly the one `POST /staff/submissions/:id/grade` uses:
 * there is no course id in the path to be trusted unchecked.
 *
 * Putting it in a service rather than repeating four lines per handler means
 * there is one thing to audit and one thing to change if §5.11.1's posture
 * flips.
 */
@Injectable()
export class WorkAnalyticsGateService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(WORK_REPOSITORY) private readonly work: WorkRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
    /** Global (`GroupDataModule`), so this needs no import edge. */
    private readonly studentGroups: StudentGroupsService,
    private readonly analytics: WorkAnalyticsService,
    private readonly formSync: GoogleFormSyncService,
  ) {}

  /**
   * Resolves the assessment, proves the caller holds its course, and returns
   * the course id for anything that needs it.
   *
   * A missing assessment, an assessment in an unheld course, and an assessment
   * targeted at no group the caller holds all end as the same 404 (ASSESSMENT_NOT_FOUND)
   * to close any existence oracle.
   */
  async assertMayRead(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<string> {
    const assessment = await this.assessments.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException(ASSESSMENT_NOT_FOUND);
    }
    try {
      await this.scope.assertAssigned(assessment.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(ASSESSMENT_NOT_FOUND);
      }
      throw error;
    }
    const reach = await this.scope.reachableGroupIds(actor);
    if (reach !== null) {
      const targets = await this.assessments.findTargets(assessmentId);
      const hasHeld = targets.some((t) => reach.includes(t.groupId));
      if (!hasHeld) {
        throw new NotFoundException(ASSESSMENT_NOT_FOUND);
      }
    }
    return assessment.courseId;
  }

  /**
   * The held-group student set for a scoped caller, or `null` for one with
   * unrestricted reach (teacher, admin, `all_groups` assistant) - the same
   * shape `reachableGroupIds` itself uses, one level up.
   */
  private async allowedStudentIds(
    actor: StaffActor,
  ): Promise<Set<string> | null> {
    const reach = await this.scope.reachableGroupIds(actor);
    if (reach === null) {
      return null;
    }
    const members = await this.groupRepo.findMembersForGroups(reach);
    return new Set(members.map((m) => m.studentId));
  }

  /**
   * Per-student standing for one piece of work (`GET /staff/assessments/:id/results`).
   * Rows narrow to held-group students for scoped callers (AUTH-6).
   */
  async results(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<StudentWorkRow[]> {
    await this.assertMayRead(assessmentId, actor);
    const rows = await this.analytics.rosterForAssessment(assessmentId);
    const heldStudentIds = await this.allowedStudentIds(actor);
    if (heldStudentIds === null) {
      return rows;
    }
    return rows.filter((r) => heldStudentIds.has(r.studentId));
  }

  /**
   * `GET /staff/assessments/:id/analytics`. The aggregate completion/average
   * figures stay course-wide (`D-44`); `questions` is the one part of this
   * response narrowed to the caller's reach, because it is the one part that
   * can show another cohort's actual answers rather than a count.
   */
  async analyticsFor(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<WorkAnalytics> {
    await this.assertMayRead(assessmentId, actor);
    const [base, heldStudentIds] = await Promise.all([
      this.analytics.forAssessment(assessmentId),
      this.allowedStudentIds(actor),
    ]);
    const questions = await this.analytics.questionsForAssessment(
      assessmentId,
      heldStudentIds,
    );
    return { ...base, questions };
  }

  async unmatched(assessmentId: string): Promise<ExternalResult[]> {
    return this.work.findUnmatchedResults(assessmentId);
  }

  /**
   * `POST /staff/assessments/:id/results/import` (`D-60`, `REM-080a`).
   *
   * Gated exactly like `POST .../sync` - `assertMayRead`, no separate write
   * check - because both routes rewrite the same mirror and an assistant who
   * may see a task's results may also refresh them. Only for a `google_form`
   * task: importing responses into a file-upload assignment has nothing to
   * attach them to.
   *
   * `dryRun` parses and matches but writes nothing. Otherwise the store and
   * the audit entry commit in one transaction (CLAUDE.md §9) - the CSV is
   * never itself stored (D-60/T7: parsed from the buffer, discarded after).
   */
  async importCsv(
    assessmentId: string,
    actor: StaffActor,
    csvText: string,
    dryRun: boolean,
  ): Promise<ImportResultsPreview | ImportResultsOutcome> {
    await this.assertMayRead(assessmentId, actor);
    const assessment = await this.assessments.findById(assessmentId);
    if (!assessment || assessment.workType !== 'google_form') {
      throw new BadRequestException(
        'This task is not a Google Form - there is nothing to import results into.',
      );
    }

    const parsed = parseGoogleFormCsv(csvText);

    if (dryRun) {
      const { matched, unmatched } = await this.formSync.previewMatch(
        parsed.responses,
      );
      return {
        rows: parsed.responses.length,
        matched,
        unmatched,
        errors: [],
        questions: parsed.questions.length,
      };
    }

    return this.db.runInTransaction(async () => {
      const outcome = await this.formSync.ingest(
        assessmentId,
        parsed.responses,
        parsed.totalPoints,
        { questions: parsed.questions, source: 'csv' },
      );
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'work.results_imported',
        targetType: 'assessment',
        targetId: assessmentId,
        courseId: assessment.courseId,
        before: null,
        after: {
          rows: parsed.responses.length,
          fetched: outcome.fetched,
          matched: outcome.matched,
          unmatched: outcome.unmatched,
          questions: parsed.questions.length,
        },
      });
      return { ...outcome, questions: parsed.questions.length };
    });
  }

  /**
   * One student's standing on every piece of work this course set *for them*.
   *
   * If the named student is not a member of any held group on that course,
   * a scoped assistant gets a 404 whose message is byte-identical to COURSE_NOT_IN_SCOPE
   * (anti-enumeration, AUTH-6).
   */
  async studentWork(
    courseId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<StudentWorkResult[]> {
    await this.scope.assertAssigned(courseId, actor);
    const reach = await this.scope.reachableGroupIds(actor);
    const studentGroupIds = await this.studentGroups.groupIdsFor(courseId, studentId);

    if (reach !== null) {
      const heldGroupIds = studentGroupIds.filter((g) => reach.includes(g));
      if (heldGroupIds.length === 0) {
        throw new NotFoundException(COURSE_NOT_IN_SCOPE);
      }
      const assessments = (
        await this.assessments.findByCourseForGroups(courseId, heldGroupIds)
      ).filter(isVisibleToStudents);
      return this.analytics.forStudent(assessments, studentId);
    }

    const assessments = (
      await this.assessments.findByCourseForGroups(courseId, studentGroupIds)
    ).filter(isVisibleToStudents);
    return this.analytics.forStudent(assessments, studentId);
  }

  /**
   * One response in full, scoped through its own assessment's course.
   *
   * Keyed by result id, so the course has to be resolved from the result the
   * same way `attach` does - there is no course id in the path to be trusted.
   */
  async result(resultId: string, actor: StaffActor): Promise<ExternalResult> {
    const result = await this.work.findResultById(resultId);
    if (!result) {
      throw new NotFoundException('Response not found');
    }
    await this.assertMayRead(result.assessmentId, actor);
    return result;
  }

  /**
   * Attributes an unmatched response to a student and remembers the address.
   *
   * The second half is what makes this a fix rather than a recurring chore:
   * without recording the address, the same student's next response lands
   * unmatched again and staff reconcile the same person every week. It is the
   * difference between a queue that drains and one that refills.
   *
   * The student is **not** re-validated against the assessment's target groups.
   * That is deliberate: the realistic reason a response is unmatched is that
   * the student used an unknown address, and a student who has since moved
   * cohorts would then be un-attributable to work they genuinely did. Staff are
   * looking at the response and choosing the person; refusing their answer on a
   * membership check would be the tool second-guessing the human who can see
   * more than it can.
   */
  async attach(
    resultId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<ExternalResult> {
    // Scope first, and on the result's *own* assessment. This route is
    // addressed by result id, so without resolving result → assessment →
    // course there is nothing tying the caller to what they are writing into,
    // and a TA could attribute marks inside a course they do not hold.
    const existing = await this.work.findResultById(resultId);
    if (!existing) {
      throw new NotFoundException('Response not found');
    }
    const courseId = await this.assertMayRead(existing.assessmentId, actor);

    const student = await this.users.findById(studentId);
    if (!student || student.role !== Role.Student) {
      // Role-checked, not merely existence-checked: attributing a form response
      // to a teacher's account would put a staff member in a completion count.
      throw new BadRequestException('No such student.');
    }

    return this.db.runInTransaction(async () => {
      const attached = await this.work.attachResultToStudent(
        resultId,
        studentId,
      );
      if (!attached) {
        // Null means gone, or already attributed. Refused rather than
        // overwritten: silently reassigning a mark from one student to another
        // is not something a reconciliation screen should do by accident.
        throw new BadRequestException(
          'That response no longer exists, or has already been attributed to a ' +
            'student.',
        );
      }

      // Remember the address so it matches by itself next time. Only when the
      // student has none recorded - overwriting an existing one would silently
      // repoint a student's identity because of a single stray response.
      if (attached.respondentId && !student.googleEmail) {
        await this.users.setGoogleEmail(studentId, attached.respondentId);
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'external_result.attached',
        targetType: 'external_result',
        targetId: attached.id,
        // Already resolved by the scope check above, so this is not a second
        // read of the same row.
        courseId,
        before: { studentId: null, respondentId: attached.respondentId },
        after: { studentId, respondentId: attached.respondentId },
      });

      return attached;
    });
  }
}
