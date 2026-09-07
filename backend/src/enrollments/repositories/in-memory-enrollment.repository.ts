import { Injectable } from '@nestjs/common';
import type {
  Enrollment,
  EnrollmentRepository,
} from '../interfaces/enrollment-repository.interface.js';

const SEED_ENROLLMENTS: readonly Enrollment[] = [
  {
    studentId: 'student-1',
    courseId: 'course-1',
    learningMode: 'recorded',
    enrolledAt: '2026-01-20T09:00:00Z',
  },
  {
    studentId: 'student-1',
    courseId: 'course-2',
    learningMode: 'live',
    enrolledAt: '2026-06-01T09:00:00Z',
  },
  {
    studentId: 'student-2',
    courseId: 'course-1',
    learningMode: 'recorded',
    enrolledAt: '2026-03-15T09:00:00Z',
  },
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
