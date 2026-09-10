import { Injectable } from '@nestjs/common';
import type {
  Enrollment,
  EnrollmentRepository,
} from '../interfaces/enrollment-repository.interface.js';

const SEED_ENROLLMENTS: readonly Enrollment[] = [
  // No `learningMode`: it lives on the group now (CLAUDE.md §5.2). These three
  // students are placed in the seeded groups of `InMemoryGroupRepository`, and
  // that is where their mode comes from.
  { studentId: 'student-1', courseId: 'course-1', enrolledAt: '2026-01-20T09:00:00Z' },
  { studentId: 'student-1', courseId: 'course-2', enrolledAt: '2026-06-01T09:00:00Z' },
  { studentId: 'student-2', courseId: 'course-1', enrolledAt: '2026-03-15T09:00:00Z' },
];

@Injectable()
export class InMemoryEnrollmentRepository implements EnrollmentRepository {
  /**
   * A per-instance copy of the seed, not the seed itself. `create` writes here,
   * and this repository is a singleton in the app but a fresh instance in every
   * test - so a test that enrolls someone cannot leak that enrollment into the
   * next test, which a shared module-level array would.
   */
  private readonly enrollments: Enrollment[] = [...SEED_ENROLLMENTS];

  async findByStudent(studentId: string): Promise<Enrollment[]> {
    return this.enrollments.filter((e) => e.studentId === studentId);
  }

  async find(courseId: string, studentId: string): Promise<Enrollment | null> {
    return (
      this.enrollments.find(
        (e) => e.courseId === courseId && e.studentId === studentId,
      ) ?? null
    );
  }

  async findByCourse(courseId: string): Promise<Enrollment[]> {
    return this.enrollments.filter((e) => e.courseId === courseId);
  }

  async countByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = new Set(courseIds);
    const counts: Record<string, number> = {};
    for (const enrollment of this.enrollments) {
      if (wanted.has(enrollment.courseId)) {
        counts[enrollment.courseId] = (counts[enrollment.courseId] ?? 0) + 1;
      }
    }
    return counts;
  }

  async countDistinctStudents(courseIds: readonly string[]): Promise<number> {
    const wanted = new Set(courseIds);
    const students = new Set<string>();
    for (const enrollment of this.enrollments) {
      if (wanted.has(enrollment.courseId)) {
        students.add(enrollment.studentId);
      }
    }
    return students.size;
  }

  async countByStudents(
    studentIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = new Set(studentIds);
    const counts: Record<string, number> = {};
    for (const enrollment of this.enrollments) {
      if (wanted.has(enrollment.studentId)) {
        counts[enrollment.studentId] = (counts[enrollment.studentId] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Appends to the module-level array, so a self-enrollment survives for the
   * life of the process and no longer. That is the whole contract of the
   * memory driver - it is the dev fallback, and CLAUDE.md §7.1 is explicit
   * that nothing here outlives a restart.
   */
  async create(enrollment: Enrollment): Promise<Enrollment> {
    const existing = await this.find(enrollment.courseId, enrollment.studentId);
    if (existing) {
      return existing;
    }
    this.enrollments.push(enrollment);
    return enrollment;
  }
}
