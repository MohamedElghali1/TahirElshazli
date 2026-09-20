import { Inject, Injectable } from '@nestjs/common';
import type {
  Group,
  GroupRepository,
} from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';

/**
 * *Which of this course's groups is this student in?* - the one question two
 * different features ask, and the one place that fixes the answer's order.
 *
 * A student may legally sit in two groups studying the same course. That makes
 * a tie-break necessary, and it makes the tie-break **load-bearing**: the
 * window on their assessments (CLAUDE.md §5.16) and their classmate list
 * (§5.17) both resolve through a group, and if the two picked differently the
 * same student would see one cohort's classmates and another cohort's due
 * dates. The rule is the **longest-standing placement first**, and it lives
 * here rather than in each caller precisely so it cannot drift between them.
 *
 * The order itself comes from `findStudentGroups`, which sorts by the
 * membership's `assigned_at` in both drivers - so this service names the rule
 * and the repository enforces it, rather than either doing both.
 *
 * **The sort key changed; the rule did not.** It used to be
 * `group_courses.enrolled_at` - when the group was enrolled in the course.
 * Migration 013 collapsed that table away, so it is now
 * `group_memberships.assigned_at` - when the student was placed in the group.
 * That is a behaviour-preserving substitution and arguably the better reading
 * of "longest-standing *placement*", which is what the rule always said.
 */
@Injectable()
export class StudentGroupsService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
  ) {}

  /**
   * The groups, longest-standing placement first. Empty for a student who is
   * enrolled but not yet placed (§7.2) - a normal, temporary state, not an
   * error, and callers render an empty course rather than throwing.
   */
  async groupsFor(courseId: string, studentId: string): Promise<Group[]> {
    return this.groupRepo.findStudentGroups(studentId, courseId);
  }

  /** The same, reduced to ids, for callers that only need the audience. */
  async groupIdsFor(courseId: string, studentId: string): Promise<string[]> {
    const groups = await this.groupsFor(courseId, studentId);
    return groups.map((group) => group.id);
  }
}
