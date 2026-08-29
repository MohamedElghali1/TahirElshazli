import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Enrollment,
  EnrollmentRepository,
} from './interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from './interfaces/enrollment-repository.interface.js';

/**
 * Owns the course-scoped access check. It lives in its own module rather than in
 * CoursesService because CoursesService already depends on recordings and live
 * sessions to compute progress - having those depend back on it for the check
 * would be a dependency cycle.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: EnrollmentRepository,
  ) {}

  async findForStudent(studentId: string): Promise<Enrollment[]> {
    return this.enrollmentRepo.findByStudent(studentId);
  }

  async find(courseId: string, studentId: string): Promise<Enrollment | null> {
    return this.enrollmentRepo.find(courseId, studentId);
  }

  /**
   * Throws unless the student holds an enrollment in the course. Every
   * course-scoped read and write goes through this before touching data.
   * Deliberately a 404, not a 403: a student who is not enrolled should not be
   * able to tell an existing course from a non-existent one.
   */
  async assertEnrolled(courseId: string, studentId: string): Promise<Enrollment> {
    const enrollment = await this.enrollmentRepo.find(courseId, studentId);
    if (!enrollment) {
      throw new NotFoundException('Course not found or student not enrolled');
    }
    return enrollment;
  }
}
