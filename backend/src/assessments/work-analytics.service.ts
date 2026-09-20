import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type {
  AssessmentRepository,
  StoredAssessment,
} from './interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import type {
  ExternalResult,
  WorkRepository,
  WorkType,
} from './interfaces/work-repository.interface.js';
import { WORK_REPOSITORY } from './interfaces/work-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';

/**
 * Where one student stands on one piece of work, whatever kind it is.
 *
 * Deliberately a **different** union from `AssessmentStatus`
 * (locked/available/submitted/corrected), which describes a file-upload
 * lifecycle that a Google Form does not have: there is no "corrected" state for
 * a form Google marked itself, and no "submitted but ungraded" either.
 *
 * `not_started` is the member that matters, and it is the one CLAUDE.md §11
 * notes is missing from `AssessmentStatus` - a student who never answered is
 * distinguishable here from one who cannot answer yet, which is the whole
 * point of a completion report.
 */
export type WorkStatus =
  | 'not_started'
  | 'submitted'
  | 'graded'
  | 'not_available';

/** One row of the per-student table: Work | Type | Status | Score | Result. */
export interface StudentWorkResult {
  assessmentId: string;
  title: string;
  workType: WorkType;
  status: WorkStatus;
  score: number | null;
  maxScore: number | null;
  /** Null when nothing was submitted; percentages of a null score are null. */
  scorePercentage: number | null;
  submittedAt: string | null;
  /**
   * Whether there is per-question detail to open. False for a file upload
   * (whose detail is the submission screen) and for work never started - the
   * "View" action in the client is this flag.
   */
  hasDetail: boolean;
}

/** The teacher's view of one piece of work across everyone it was set for. */
export interface WorkAnalytics {
  assessmentId: string;
  title: string;
  workType: WorkType;
  /** Students the work was actually set for - the denominator. */
  expected: number;
  completed: number;
  notCompleted: number;
  /** 0-100, rounded. Null when nothing was set for anybody. */
  completionRate: number | null;
  averageScore: number | null;
  averageMaxScore: number | null;
  /** 0-100, rounded. Null unless scores exist. */
  averagePercentage: number | null;
  /**
   * Responses that could not be attributed to a student.
   *
   * Surfaced at the top level rather than buried, because a non-zero value
   * means the numbers above are **understated** - somebody did the work and is
   * being counted as not having done it. That is a different and more urgent
   * message than "three students haven't started".
   */
  unmatched: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  /** Null when the form does not collect emails, or it could not be determined. */
  collectsEmail: boolean | null;
}

export interface StudentWorkRow {
  studentId: string;
  studentName: string;
  status: WorkStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
}

/**
 * Reads over work results, for both directions the client asked for: *how did
 * this task go?* and *how is this student doing?*
 *
 * Provider-agnostic by construction. Nothing here mentions Google - it reads
 * `external_results`, whose `provider` column is the only thing that knows.
 * That is the requirement "do not hard-code the analytics system specifically
 * for one Google Form" holding in the layer where it is easiest to break.
 */
@Injectable()
export class WorkAnalyticsService {
  constructor(
    @Inject(WORK_REPOSITORY) private readonly work: WorkRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    /**
     * The **repository**, not `GroupsService.members`, and that is the point.
     *
     * `members` became group-scoped with `D-10`, so calling it here would
     * compute the denominator over only the groups the *caller* holds - a
     * silently wrong number rather than a refusal, which is the worse of the
     * two failures. The denominator is a fact about the task, not about who is
     * looking at it. Whether an assistant may see analytics for a task targeted
     * at a group they do not hold is a separate, open question (`B-4`,
     * `EXECUTION_NOTES_2B_II.md`); the gate on the route is unchanged until it
     * is answered. `GroupDataModule` is `@Global()`, so this needs no import
     * edge.
     */
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
  ) {}

  /**
   * How many students this task was actually set for.
   *
   * The denominator is the **union of the targeted groups' members**, not the
   * course roster. A task set for the Saturday group only has not been missed
   * by the Sunday group, and counting them as "not completed" would make a
   * teacher chase students who were never asked.
   *
   * A student in two targeted groups is counted once - hence the Set.
   */
  private async expectedStudentIds(
    assessmentId: string,
  ): Promise<Set<string>> {
    const targets = await this.assessments.findTargets(assessmentId);
    const ids = new Set<string>();
    for (const target of targets) {
      const members = await this.groupRepo.findMembers(target.groupId);
      for (const member of members) {
        ids.add(member.studentId);
      }
    }
    return ids;
  }

  /** The teacher's per-assessment analytics. */
  async forAssessment(assessmentId: string): Promise<WorkAnalytics> {
    const assessment = await this.assessments.findById(assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const [tally, binding, expected] = await Promise.all([
      this.work.tallyResults(assessmentId),
      this.work.findBinding(assessmentId),
      this.expectedStudentIds(assessmentId),
    ]);

    const expectedCount = expected.size;
    // Clamped at the denominator. A response can legitimately arrive from
    // someone outside the targeted groups - a student moved cohorts after
    // answering, say - and a completion rate above 100% reads as a bug in the
    // report rather than as the edge case it is. `unmatched` is where that
    // surplus is visible instead.
    const completed = Math.min(tally.matched, expectedCount);

    return {
      assessmentId,
      title: assessment.title,
      workType: assessment.workType,
      expected: expectedCount,
      completed,
      notCompleted: Math.max(expectedCount - completed, 0),
      completionRate: expectedCount
        ? Math.round((completed / expectedCount) * 100)
        : null,
      averageScore: tally.averageScore,
      averageMaxScore: tally.averageMaxScore,
      averagePercentage:
        tally.averageScore !== null &&
        tally.averageMaxScore !== null &&
        tally.averageMaxScore > 0
          ? Math.round((tally.averageScore / tally.averageMaxScore) * 100)
          : null,
      unmatched: tally.unmatched,
      lastSyncedAt: binding?.lastSyncedAt ?? null,
      lastSyncError: binding?.lastSyncError ?? null,
      collectsEmail: binding?.collectsEmail ?? null,
    };
  }

  /**
   * Every expected student's standing on one piece of work, including the ones
   * who did nothing.
   *
   * Built from the expected set rather than from the results, which is the
   * whole point: a report assembled from responses can only ever list students
   * who responded, and "who hasn't done it" is the question a teacher actually
   * opens this screen to answer.
   */
  async rosterForAssessment(assessmentId: string): Promise<StudentWorkRow[]> {
    const expected = await this.expectedStudentIds(assessmentId);
    const ids = [...expected];
    const [results, students] = await Promise.all([
      this.work.findResults(assessmentId),
      this.users.findByIds(ids),
    ]);

    const byStudent = new Map<string, ExternalResult>();
    for (const result of results) {
      if (result.studentId) {
        const existing = byStudent.get(result.studentId);
        // Latest submission wins where a respondent answered twice - the same
        // rule the file-upload path applies via `lastSubmittedAt`.
        if (!existing || result.submittedAt > existing.submittedAt) {
          byStudent.set(result.studentId, result);
        }
      }
    }

    const names = new Map(students.map((s) => [s.id, s.name]));
    return ids
      .map((studentId) => {
        const result = byStudent.get(studentId);
        return {
          studentId,
          // Falls back rather than throwing: a roster row for a deleted account
          // is a rendering problem, not a reason to fail the whole report.
          studentName: names.get(studentId) ?? 'Unknown student',
          status: this.statusOf(result),
          score: result?.score ?? null,
          maxScore: result?.maxScore ?? null,
          submittedAt: result?.submittedAt ?? null,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }

  /**
   * One student's results across a course's work - the table the client drew:
   * Work | Type | Status | Score | Result.
   *
   * Covers external results only. File-upload work has its own richer read on
   * `AssessmentsService` (submissions, revisions, annotated copies), and
   * duplicating a thinner version of it here would be a second place for
   * "submitted" to be decided differently.
   */
  async forStudent(
    assessments: readonly StoredAssessment[],
    studentId: string,
  ): Promise<StudentWorkResult[]> {
    if (assessments.length === 0) {
      return [];
    }
    // The assessments are passed in rather than re-fetched by id. Every caller
    // already holds them - they are rendering a list - and re-reading would
    // either add a repository method that exists for one call site or fan out
    // one query per row. It also keeps the targeting decision with the caller,
    // which is where it belongs: *which* assessments a student may see is
    // §5.16's question, and this service must not be a second place that
    // answers it differently.
    const results = await this.work.findResultsForStudent(
      assessments.map((a) => a.id),
      studentId,
    );

    const byAssessment = new Map(results.map((r) => [r.assessmentId, r]));
    return assessments.map((assessment) => {
      const result = byAssessment.get(assessment.id);
      const score = result?.score ?? null;
      const maxScore = result?.maxScore ?? null;
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        workType: assessment.workType,
        status: this.statusOf(result),
        score,
        maxScore,
        scorePercentage:
          score !== null && maxScore !== null && maxScore > 0
            ? Math.round((score / maxScore) * 100)
            : null,
        submittedAt: result?.submittedAt ?? null,
        hasDetail: result !== undefined,
      };
    });
  }

  /**
   * Status from a result row.
   *
   * `graded` requires a score, not merely a result: a non-quiz form produces a
   * response with nothing to mark, and reporting that as graded would put an
   * empty Score column next to a word promising one.
   */
  private statusOf(result: ExternalResult | undefined): WorkStatus {
    if (!result) {
      return 'not_started';
    }
    return result.score !== null ? 'graded' : 'submitted';
  }
}
