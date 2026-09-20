import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isUnscopedStaffRole } from '../auth/staff-roles.js';
import type {
  CourseStaffAssignment,
  CourseStaffRepository,
} from './interfaces/course-staff-repository.interface.js';
import { COURSE_STAFF_REPOSITORY } from './interfaces/course-staff-repository.interface.js';

/**
 * The caller, reduced to what authorization actually depends on.
 *
 * Every method here takes one instead of a bare `userId`, and that is the
 * single most important decision in this file: with a bare id there is no way
 * to express "admins skip the join", so each caller would re-derive the
 * admin bypass itself and one of them would eventually get it wrong in the
 * direction that grants access.
 */
export interface StaffActor {
  id: string;
  /** `JwtPayload.role` is a plain string; compared against `Role` here. */
  role: string;
}

/**
 * What a caller may see. Either every course, or an explicit list.
 *
 * A union rather than an optional `courseIds`, so a caller cannot read the
 * field, find it undefined, and treat that as "no restriction" - which is the
 * same bug as forgetting the check, arrived at politely.
 */
export type StaffScope =
  | { unscoped: true }
  | { unscoped: false; assignments: CourseStaffAssignment[] };

/**
 * Owns the TA course-scoping check required by CLAUDE.md §5.11.
 *
 * It is the direct counterpart of `EnrollmentsService.assertEnrolled` - same
 * job, same failure mode, different table - and it lives in its own module for
 * the same reason: the services that will call it (grading, attendance,
 * quizzes, announcements) will also be the services it needs to stay
 * independent of.
 *
 * The asymmetry between the two roles is the design, not an optimisation.
 * A TA's every course-scoped query joins through `course_staff_assignments`;
 * an admin's never does.
 */
@Injectable()
export class StaffScopeService {
  constructor(
    @Inject(COURSE_STAFF_REPOSITORY)
    private readonly staffRepo: CourseStaffRepository,
  ) {}

  /**
   * True for an unscoped staff account - the teacher, or the Full admin, who is
   * identical to the teacher in permission (AUTH-1).
   *
   * `isUnscopedStaffRole` rather than a hand-written pair, because this is the
   * one line that decides whether an admin can reach anything at all: missed,
   * an admin passes `RolesGuard`, finds no `course_staff_assignments` row and
   * 404s on every course. That fails safe - a broken console, not a leak - but
   * it fails on 63 routes at once.
   */
  private isAdmin(actor: StaffActor): boolean {
    return isUnscopedStaffRole(actor.role);
  }

  /**
   * Throws unless the actor may act on this course. Returns the assignment for
   * a TA, or null for an admin, who holds no assignment row and needs none.
   *
   * **404, not 403** - implementing the posture CLAUDE.md §5.11 proposes and
   * matching what the student surface already does for an unenrolled course. A
   * 403 confirms the course exists, which lets an unassigned TA enumerate the
   * whole catalog one id at a time; the distinction is invisible to a TA acting
   * legitimately and the only thing it costs is a slightly vaguer error.
   */
  async assertAssigned(
    courseId: string,
    actor: StaffActor,
  ): Promise<CourseStaffAssignment | null> {
    if (this.isAdmin(actor)) {
      return null;
    }
    const assignment = await this.staffRepo.find(courseId, actor.id);
    if (!assignment) {
      throw new NotFoundException('Course not found or not assigned to you');
    }
    return assignment;
  }

  /**
   * The list form of the same question, for endpoints that return many courses
   * rather than one.
   *
   * Callers must branch on `unscoped` and issue a *different query*, not fetch
   * everything and filter afterwards - §5.11 is explicit that there is no "read
   * it all and hide some" shortcut, and a filter applied after the read is one
   * forgotten `.filter()` away from being no filter at all.
   */
  async scopeFor(actor: StaffActor): Promise<StaffScope> {
    if (this.isAdmin(actor)) {
      return { unscoped: true };
    }
    // The assignments themselves, not just their course ids: callers that
    // render a list want `assignedAt` too, and returning ids alone sends every
    // one of them back for a second read of the same rows.
    return { unscoped: false, assignments: await this.staffRepo.findByStaff(actor.id) };
  }

  /**
   * The raw lookup, without the admin bypass and without throwing.
   *
   * For the two callers that need the row itself rather than a decision: the
   * admin unassign path, which reads the assignment so the audit entry can
   * record what was removed. Not an authorization check - use `assertAssigned`
   * for that, and note this one deliberately does *not* treat an admin as
   * assigned, because an admin genuinely holds no row.
   */
  async findAssignment(
    courseId: string,
    userId: string,
  ): Promise<CourseStaffAssignment | null> {
    return this.staffRepo.find(courseId, userId);
  }

  /** Every TA on a course. Admin-only surface; the controller enforces that. */
  async listStaffForCourse(courseId: string): Promise<CourseStaffAssignment[]> {
    return this.staffRepo.findByCourse(courseId);
  }

  async assign(
    courseId: string,
    userId: string,
    assignedBy: string,
  ): Promise<{ assignment: CourseStaffAssignment; created: boolean }> {
    return this.staffRepo.create(courseId, userId, assignedBy);
  }

  async unassign(courseId: string, userId: string): Promise<boolean> {
    return this.staffRepo.remove(courseId, userId);
  }
}
