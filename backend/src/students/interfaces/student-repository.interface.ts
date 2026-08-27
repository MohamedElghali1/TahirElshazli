export interface StudentProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  enrolledCourseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentRepository {
  findByUserId(userId: string): Promise<StudentProfile | null>;
}

export const STUDENT_REPOSITORY = Symbol('STUDENT_REPOSITORY');
