import { Injectable } from '@nestjs/common';
import type {
  Enrollment,
  EnrollmentRepository,
} from '../interfaces/enrollment-repository.interface.js';

const STUB_ENROLLMENTS: Enrollment[] = [
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
  async findByStudent(studentId: string): Promise<Enrollment[]> {
    return STUB_ENROLLMENTS.filter((e) => e.studentId === studentId);
  }

  async find(courseId: string, studentId: string): Promise<Enrollment | null> {
    return (
      STUB_ENROLLMENTS.find(
        (e) => e.courseId === courseId && e.studentId === studentId,
      ) ?? null
    );
  }
}
