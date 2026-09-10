import { Inject, Injectable } from '@nestjs/common';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import type { GroupRepository } from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';

/**
 * One classmate. **Name and id, and nothing else.**
 *
 * CLAUDE.md §5.17 is explicit about the field set and about why it is small:
 * never email, phone, grades, progress or attendance. A classmate list that
 * carries a mark is a leaderboard, which is a different product decision with a
 * different answer for a parent. An avatar belongs here when accounts have one;
 * they do not today, and inventing a field to fill a layout is what §11 already
 * declined to do for the course level badge.
 */
export interface Classmate {
  studentId: string;
  name: string;
}

/** One of the caller's groups in this course, and who else is in it. */
export interface ClassmateGroup {
  groupId: string;
  groupName: string;
  classmates: Classmate[];
}

/**
 * The first read in this codebase where one student learns another exists.
 *
 * Everything else on the student surface is strictly self-scoped, so this is a
 * new PII surface rather than one more list endpoint (CLAUDE.md §5.17), and it
 * is built to be narrow in three separate ways:
 *
 * 1. **Enrollment is checked first.** Same gate as every other course-scoped
 *    read; an unenrolled caller gets the same 404 they get everywhere.
 * 2. **The scope is the group, never the course.** Two groups studying one
 *    course must not see each other, so the query starts from the caller's own
 *    memberships and never from the course roster.
 * 3. **The staff roster is a different method on a different service.**
 *    `GroupsService.members` returns email; this returns names. Widening that
 *    one must not widen this one, and they cannot be widened together by
 *    editing a single line.
 *
 * §5.11.1's "TAs see everything" posture stops at the staff surface and has no
 * effect here - what staff may see says nothing about what a student may see.
 */
@Injectable()
export class ClassmatesService {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly enrollments: EnrollmentsService,
  ) {}

  /**
   * Returns one entry per group the caller sits in that studies this course -
   * a list of lists, not a merged set.
   *
   * §5.17: a student in two groups sees two rosters. Merging them would invent
   * a relationship between people who have never met, and the group name is
   * what makes each list mean something.
   *
   * An empty array is the normal answer for a student who is enrolled but not
   * yet placed (§7.2), and it is not an error.
   */
  async forCourse(
    courseId: string,
    studentId: string,
  ): Promise<ClassmateGroup[]> {
    await this.enrollments.assertEnrolled(courseId, studentId);

    const pairings = await this.groupRepo.findStudentGroupCourses(
      studentId,
      courseId,
    );
    if (pairings.length === 0) {
      return [];
    }

    const groupIds = pairings.map((pairing) => pairing.groupId);
    const groups = await this.groupRepo.findByIds(groupIds);
    const rosters = await Promise.all(
      groupIds.map((groupId) => this.groupRepo.findMembers(groupId)),
    );

    // One batch read for every name across every group, rather than one per
    // group or - worse - one per person (CLAUDE.md §7.1's N+1 rule). The caller
    // is dropped before the lookup, so their own row is never even fetched.
    const otherIds = [
      ...new Set(
        rosters
          .flat()
          .map((membership) => membership.studentId)
          .filter((id) => id !== studentId),
      ),
    ];
    const users = await this.userRepo.findByIds(otherIds);
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

    return groupIds.map((groupId, index) => ({
      groupId,
      groupName: groupNameById.get(groupId) ?? 'Group',
      classmates: rosters[index]
        .filter((membership) => membership.studentId !== studentId)
        .map((membership) => ({
          studentId: membership.studentId,
          // A member whose account has gone is skipped rather than rendered as
          // "Unknown" - a name is the entire content of this row, so a row
          // without one is noise.
          name: nameById.get(membership.studentId) ?? '',
        }))
        .filter((classmate) => classmate.name !== ''),
    }));
  }
}
