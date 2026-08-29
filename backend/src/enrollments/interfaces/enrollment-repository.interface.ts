export type LearningMode = 'recorded' | 'live';

export interface Enrollment {
  studentId: string;
  courseId: string;
  learningMode: LearningMode;
  enrolledAt: string;
}

export interface EnrollmentRepository {
  findByStudent(studentId: string): Promise<Enrollment[]>;
  find(courseId: string, studentId: string): Promise<Enrollment | null>;
}

export const ENROLLMENT_REPOSITORY = Symbol('ENROLLMENT_REPOSITORY');
