import { Inject, Injectable } from '@nestjs/common';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { LearningMode } from '../enrollments/interfaces/enrollment-repository.interface.js';
import type { GroupRepository } from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { StudentGroupsService } from './student-groups.service.js';

/**
 * Answers *how is this student taught this course* - recorded or live
 * (CLAUDE.md §5.2).
 *
 * The mode moved off `Enrollment` and onto `GroupCourse` on 2026-09-10, because
 * a group is *taught* one way and two students in the same room cannot be in
 * different modes. That leaves exactly one problem, and this service exists to
 * solve it in one place: a student who is **enrolled but not yet placed**
 * (§7.2) has no group to read a mode from, and §5.2 is explicit that the
 * dashboard must never have no mode to render.
 *
 * So the resolution order is:
 *
 * 1. The `learning_mode` of a group the student is in that studies this course.
 * 2. Failing that, `courses.default_learning_mode` - shipped in migration 003
 *    for self-enrollment, and this is its second job.
 * 3. Failing *that* - no such course - `'recorded'`, which is the safe end of
 *    the fork: it renders checkpoints against an empty recording list rather
 *    than an attendance timeline against sessions that do not exist. Callers
 *    have almost always established the course exists before asking.
 *
 * **Why a service and not a column.** Keeping `enrollments.learning_mode` as a
 * cache of this answer would be two sources of truth for one value, and the
 * copy would go stale the moment a student is moved between groups - which is
 * the operation groups exist to support.
 */
@Injectable()
export class LearningModeService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    private readonly studentGroups: StudentGroupsService,
  ) {}

  /**
   * One student, one course.
   *
   * Two primary-key-ish reads in the worst case. At the size this runs at
   * (§7.3) that is a fraction of a millisecond and not worth threading a
   * pre-fetched course through six call sites to avoid - the round trips that
   * matter here are the ones a phone makes, not the ones Postgres serves on
   * the same host.
   */
  async resolve(courseId: string, studentId: string): Promise<LearningMode> {
    // A student may legally sit in two groups studying one course, so this
    // needs a tie-break - and the same one the assessment window uses, or the
    // student gets a live dashboard and a recorded cohort's due dates.
    // `StudentGroupsService` owns that rule; see it for why it is not inlined.
    const pairings = await this.studentGroups.pairingsFor(courseId, studentId);
    if (pairings.length > 0) {
      return pairings[0].learningMode;
    }
    return this.courseDefault(courseId);
  }

  /**
   * Every student on one course, keyed by student id - for the staff roster,
   * which would otherwise call `resolve` once per row.
   *
   * The query count is bounded by the number of *groups* on the course, not by
   * the number of students in it: a handful either way at this size, but it is
   * the difference between a constant and an O(N) on a page that lists thirty
   * people. Students absent from the map are unplaced; callers apply the
   * course default, which is returned alongside so they need not fetch it.
   */
  async resolveForCourse(courseId: string): Promise<{
    byStudent: Record<string, LearningMode>;
    courseDefault: LearningMode;
  }> {
    const [pairings, courseDefault] = await Promise.all([
      this.groupRepo.findGroupCoursesByCourse(courseId),
      this.courseDefault(courseId),
    ]);
    const rosters = await Promise.all(
      pairings.map((pairing) => this.groupRepo.findMembers(pairing.groupId)),
    );

    const byStudent: Record<string, LearningMode> = {};
    pairings.forEach((pairing, index) => {
      for (const membership of rosters[index]) {
        // First write wins, matching `resolve`'s "longest-standing placement"
        // rule - `findGroupCoursesByCourse` orders by `enrolled_at` too, so a
        // student in two groups gets the same answer from both methods. Two
        // reads of one value that disagree is worse than either answer.
        byStudent[membership.studentId] ??= pairing.learningMode;
      }
    });
    return { byStudent, courseDefault };
  }

  private async courseDefault(courseId: string): Promise<LearningMode> {
    const course = await this.courseRepo.findById(courseId);
    return course?.defaultLearningMode ?? 'recorded';
  }
}
