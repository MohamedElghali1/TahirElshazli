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
import type { StaffActor } from '../staff/staff-scope.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import {
  WorkAnalyticsService,
  type StudentWorkResult,
} from '../assessments/work-analytics.service.js';

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
    private readonly scope: StaffScopeService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
    /** Global (`GroupDataModule`), so this needs no import edge. */
    private readonly studentGroups: StudentGroupsService,
    private readonly analytics: WorkAnalyticsService,
  ) {}

  /**
   * Resolves the assessment, proves the caller holds its course, and returns
   * the course id for anything that needs it.
   *
   * A missing assessment and an assessment in an unheld course both end as the
   * same 404 - `assertAssigned` already 404s rather than 403s so a TA cannot
   * enumerate courses, and letting a missing id 404 differently would give back
   * the existence oracle that rule exists to close.
   */
  async assertMayRead(
    assessmentId: string,
    actor: StaffActor,
  ): Promise<string> {
    const assessment = await this.assessments.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    await this.scope.assertAssigned(assessment.courseId, actor);
    return assessment.courseId;
  }

  async unmatched(assessmentId: string): Promise<ExternalResult[]> {
    return this.work.findUnmatchedResults(assessmentId);
  }

  /**
   * One student's standing on every piece of work this course set *for them*.
   *
   * Two filters, and both are load-bearing:
   *
   * - The **course** is scoped on, so a TA cannot read a student's record for a
   *   course they do not hold. That is why the route carries a course id at all
   *   - a student-only route would have nothing to scope by.
   * - The work is filtered to the student's **groups** via
   *   `findByCourseForGroups`, the same read the student's own list uses
   *   (§5.16). Listing every task on the course would put "not started" against
   *   work this student was never set, which reads as a failing record rather
   *   than as work that was never theirs.
   */
  async studentWork(
    courseId: string,
    studentId: string,
    actor: StaffActor,
  ): Promise<StudentWorkResult[]> {
    await this.scope.assertAssigned(courseId, actor);
    const groupIds = await this.studentGroups.groupIdsFor(courseId, studentId);
    // An unplaced student has been set nothing, so this is legitimately empty
    // rather than an error (§7.2) - the same state the student's own screen
    // shows, and the staff view must agree with it.
    const assessments = await this.assessments.findByCourseForGroups(
      courseId,
      groupIds,
    );
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
