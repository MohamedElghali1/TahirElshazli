import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from './staff-scope.service.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { Role } from '../auth/roles.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

export interface StaffCourseSummary {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  /**
   * When this TA was assigned, or null for an admin - who reaches the same
   * endpoint through the unscoped branch and holds no assignment row. The field
   * is here rather than omitted so the two paths are visibly different in the
   * response instead of silently identical.
   */
  assignedAt: string | null;
}

export interface CourseStaffMember {
  userId: string;
  name: string;
  email: string;
  assignedAt: string;
  assignedBy: string;
}

/** Admin course listing page size. Bounded so the route cannot return the catalog. */
export const MAX_COURSE_PAGE_SIZE = 100;
export const DEFAULT_COURSE_PAGE_SIZE = 50;

@Injectable()
export class StaffService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * The courses the caller may work on.
   *
   * Two different queries, chosen by `scopeFor` - not one query filtered
   * afterwards. CLAUDE.md §5.11: a TA reads through `course_staff_assignments`
   * and an admin does not read through it at all.
   */
  async listCourses(
    actor: StaffActor,
    limit: number,
    offset: number,
  ): Promise<StaffCourseSummary[]> {
    const scope = await this.scope.scopeFor(actor);
    if (scope.unscoped) {
      const courses = await this.courseRepo.findAll(limit, offset);
      return courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        teacherName: course.teacherName,
        assignedAt: null,
      }));
    }

    // Scoped branch: the courses named by this TA's assignments and no others.
    // `limit`/`offset` are not applied here - a TA holds a handful of courses,
    // and paging a list the assignment table already bounds would only make
    // "why is my course missing" a paging question.
    const assignedAt = new Map(
      scope.assignments.map((assignment) => [
        assignment.courseId,
        assignment.assignedAt,
      ]),
    );
    const courses = await this.courseRepo.findByIds([...assignedAt.keys()]);
    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      teacherName: course.teacherName,
      assignedAt: assignedAt.get(course.id) ?? null,
    }));
  }

  /** Admin-only: who is assigned to a course, with names for the panel. */
  async listCourseStaff(courseId: string): Promise<CourseStaffMember[]> {
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const assignments = await this.scope.listStaffForCourse(courseId);
    const users = await this.userRepo.findByIds(
      assignments.map((assignment) => assignment.userId),
    );
    const byId = new Map(users.map((user) => [user.id, user]));
    return assignments.flatMap((assignment) => {
      const user = byId.get(assignment.userId);
      // An assignment whose account is gone is dropped rather than rendered
      // as a nameless row. The FK makes this unreachable in Postgres; the
      // in-memory driver has no such guarantee.
      return user
        ? [
            {
              userId: assignment.userId,
              name: user.name,
              email: user.email,
              assignedAt: assignment.assignedAt,
              assignedBy: assignment.assignedBy,
            },
          ]
        : [];
    });
  }

  /**
   * Admin-only: give a TA access to a course.
   *
   * Every failure mode here is checked *before* the write, because this is the
   * row that grants access - a bad one is a permission leak, not a bad record.
   */
  async assign(
    courseId: string,
    userId: string,
    admin: StaffActor,
  ): Promise<CourseStaffMember> {
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== Role.Assistant) {
      // Assigning a student here would hand them a TA's grading surface the
      // moment their role changed. The table means one thing only.
      throw new BadRequestException(
        'Only an assistant account can be assigned to a course',
      );
    }

    // The write and its audit entry commit together (CLAUDE.md §5.4). The
    // ConflictException inside rolls the assignment back, which is the correct
    // outcome for a duplicate: nothing happened, and nothing is logged.
    const assignment = await this.db.runInTransaction(async () => {
      const { assignment: row, created } = await this.scope.assign(
        courseId,
        userId,
        admin.id,
      );
      if (!created) {
        // Not an error worth failing the admin's day over, but it must not be
        // logged as an assignment that happened - the audit log would then show
        // a grant that granted nothing (CLAUDE.md §5.4).
        throw new ConflictException(
          'That assistant is already assigned to this course',
        );
      }

      await this.audit.record({
        actorId: admin.id,
        actorRole: Role.Teacher,
        action: 'course_staff.assigned',
        targetType: 'course_staff_assignment',
        targetId: row.id,
        courseId,
        before: null,
        after: { userId, courseId, assignedBy: admin.id },
      });
      return row;
    });

    return {
      userId,
      name: user.name,
      email: user.email,
      assignedAt: assignment.assignedAt,
      assignedBy: assignment.assignedBy,
    };
  }

  /** Admin-only: revoke a TA's access to a course. */
  async unassign(
    courseId: string,
    userId: string,
    admin: StaffActor,
  ): Promise<{ removed: true }> {
    // One unit of work: the removal and its audit entry commit together, or
    // neither does (CLAUDE.md §5.4).
    return this.db.runInTransaction(async () => {
      const existing = await this.scope.findAssignment(courseId, userId);
      if (!existing) {
        throw new NotFoundException(
          'That assistant is not assigned to this course',
        );
      }

      const removed = await this.scope.unassign(courseId, userId);
      if (!removed) {
        // Lost a race with another admin. Their removal is the one that
        // happened and is already logged; logging a second one would
        // double-count it.
        throw new NotFoundException(
          'That assistant is not assigned to this course',
        );
      }

      await this.audit.record({
        actorId: admin.id,
        actorRole: Role.Teacher,
        action: 'course_staff.unassigned',
        targetType: 'course_staff_assignment',
        targetId: existing.id,
        courseId,
        before: {
          userId,
          courseId,
          assignedBy: existing.assignedBy,
          assignedAt: existing.assignedAt,
        },
        after: null,
      });

      return { removed: true as const };
    });
  }
}
