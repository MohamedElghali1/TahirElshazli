import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssessmentRepository,
  StoredAssessment,
  StoredSubmission,
} from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';

/**
 * The message a submission the caller may not reach and a submission that does
 * not exist **both** get, on every `/staff/submissions/:id/*` route.
 *
 * One exported `const`, asserted `===` between the two paths in the specs
 * (CLAUDE.md §7). It equals the literal `/grade` always used, so that route's
 * body is unchanged by moving it to the group grain (`D-44`).
 */
export const SUBMISSION_NOT_FOUND = 'Submission not found';

/** A submission the caller may act on, with the task it answers. */
export interface SubmissionInScope {
  submission: StoredSubmission;
  assessment: StoredAssessment;
}

/**
 * **The group-grain gate for every route that names a submission** (`D-23`,
 * `D-44`): grade, return, and the four annotation routes.
 *
 * A staff member may reach a submission when some group is in **all three**
 * sets: the groups the task was set for, the groups the caller holds, and the
 * groups the student sits in on this course. Before unit 7 `/grade` asked only
 * whether the caller held *a* group on the course - so one held cohort reached
 * every cohort's papers on it.
 *
 * `StaffScopeService` still makes the reach decision (`reachableGroupIds`); this
 * composes it with two reads and adds no method to the chokepoint, whose
 * contract is load-bearing (CLAUDE.md §7).
 *
 * Its own small service rather than a method on `MarkingService`, so
 * `GradingService` can inject it without the two files importing each other.
 *
 * Stated, not a bug: a student who left every held group after submitting is
 * unreachable to a scoped assistant and still reachable to the teacher.
 */
@Injectable()
export class SubmissionAccessService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    /** `GroupDataModule` is `@Global()`; this needs no import edge. */
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
  ) {}

  /**
   * Throws `SUBMISSION_NOT_FOUND` (404) for a missing submission, a missing
   * task, and an out-of-scope one alike - so this is always the first thing a
   * handler does, before any 403 or 409 could become an oracle.
   */
  async loadInScope(submissionId: string, actor: StaffActor): Promise<SubmissionInScope> {
    const submission = await this.assessmentRepo.findSubmissionById(submissionId);
    const assessment = submission
      ? await this.assessmentRepo.findById(submission.assessmentId)
      : null;
    if (!submission || !assessment) {
      throw new NotFoundException(SUBMISSION_NOT_FOUND);
    }
    const reach = await this.scope.reachableGroupIds(actor);
    // `null` is the teacher, an admin or an `all_groups` assistant.
    if (reach !== null) {
      // Narrowed to the caller's reach IN THE QUERY; a missing scope row is
      // `[]`, which reads nothing and refuses (fail closed).
      const targets = new Set(
        (await this.assessmentRepo.findTargetsForAssessments([assessment.id], reach)).map(
          (t) => t.groupId,
        ),
      );
      const studentGroups = await this.groupRepo.findStudentGroups(
        submission.studentId,
        assessment.courseId,
      );
      if (!studentGroups.some((g) => targets.has(g.id))) {
        throw new NotFoundException(SUBMISSION_NOT_FOUND);
      }
    }
    return { submission, assessment };
  }
}
