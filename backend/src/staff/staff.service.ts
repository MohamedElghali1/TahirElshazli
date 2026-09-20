import { Inject, Injectable } from '@nestjs/common';
import { StaffScopeService, type StaffActor } from './staff-scope.service.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';

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

/** Admin course listing page size. Bounded so the route cannot return the catalog. */
export const MAX_COURSE_PAGE_SIZE = 100;
export const DEFAULT_COURSE_PAGE_SIZE = 50;

@Injectable()
export class StaffService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
  ) {}

  /**
   * The courses the caller may work on.
   *
   * Two different queries, chosen by `scopeFor` - not one query filtered
   * afterwards. `CLAUDE.md` §7: an assistant reads through the groups they
   * hold, and an admin does not read through them at all.
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

    // Scoped branch: the courses this assistant's groups reach and no others.
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
}
