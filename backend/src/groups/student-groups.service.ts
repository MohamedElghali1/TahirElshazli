import { Inject, Injectable } from '@nestjs/common';
import type {
  GroupCourse,
  GroupRepository,
} from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';

/**
 * *Which of this course's groups is this student in?* - the one question two
 * different features now ask, and the one place that fixes the answer's order.
 *
 * A student may legally sit in two groups studying the same course. That makes
 * a tie-break necessary, and it makes the tie-break **load-bearing**: their
 * learning mode (CLAUDE.md §5.2) and the window on their assessments (§5.16)
 * both resolve through a group, and if the two picked differently the same
 * student would get a live dashboard and a recorded cohort's due dates. The
 * rule is the **longest-standing placement first**, and it lives here rather
 * than in each caller precisely so it cannot drift between them.
 *
 * The order itself comes from `findStudentGroupCourses`, which sorts by
 * `enrolled_at` in both drivers - so this service names the rule and the
 * repository enforces it, rather than either doing both.
 */
@Injectable()
export class StudentGroupsService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
  ) {}

  /**
   * The pairings, longest-standing first. Empty for a student who is enrolled
   * but not yet placed (§7.2) - a normal, temporary state, not an error.
   */
  async pairingsFor(
    courseId: string,
    studentId: string,
  ): Promise<GroupCourse[]> {
    return this.groupRepo.findStudentGroupCourses(studentId, courseId);
  }

  /** The same, reduced to ids, for callers that only need the audience. */
  async groupIdsFor(courseId: string, studentId: string): Promise<string[]> {
    const pairings = await this.pairingsFor(courseId, studentId);
    return pairings.map((pairing) => pairing.groupId);
  }
}
