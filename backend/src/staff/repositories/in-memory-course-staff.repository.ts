import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CourseStaffAssignment,
  CourseStaffRepository,
} from '../interfaces/course-staff-repository.interface.js';

/**
 * One seeded assignment, and it is chosen to be useful rather than tidy:
 * `assistant-1` holds `course-1` and **not** `course-2`, and `assistant-2`
 * holds nothing at all. A fixture where the only TA holds every course cannot
 * fail the scoping test, which is the one test in this module that matters.
 * Mirrors `database/seeds/002_staff_fixtures.sql`.
 */
const STUB_ASSIGNMENTS: CourseStaffAssignment[] = [
  {
    id: 'staff-assignment-1',
    userId: 'assistant-1',
    courseId: 'course-1',
    assignedAt: '2026-02-01T09:00:00Z',
    assignedBy: 'teacher-1',
  },
];

@Injectable()
export class InMemoryCourseStaffRepository implements CourseStaffRepository {
  private assignments: CourseStaffAssignment[] = [...STUB_ASSIGNMENTS];

  async find(
    courseId: string,
    userId: string,
  ): Promise<CourseStaffAssignment | null> {
    return (
      this.assignments.find(
        (a) => a.courseId === courseId && a.userId === userId,
      ) ?? null
    );
  }

  async findByStaff(userId: string): Promise<CourseStaffAssignment[]> {
    return this.assignments.filter((a) => a.userId === userId);
  }

  async findByCourse(courseId: string): Promise<CourseStaffAssignment[]> {
    return this.assignments.filter((a) => a.courseId === courseId);
  }

  async create(
    courseId: string,
    userId: string,
    assignedBy: string,
  ): Promise<{ assignment: CourseStaffAssignment; created: boolean }> {
    const existing = await this.find(courseId, userId);
    if (existing) {
      return { assignment: existing, created: false };
    }
    const assignment: CourseStaffAssignment = {
      id: randomUUID(),
      userId,
      courseId,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };
    this.assignments.push(assignment);
    return { assignment, created: true };
  }

  async remove(courseId: string, userId: string): Promise<boolean> {
    const index = this.assignments.findIndex(
      (a) => a.courseId === courseId && a.userId === userId,
    );
    if (index === -1) {
      return false;
    }
    this.assignments.splice(index, 1);
    return true;
  }
}
