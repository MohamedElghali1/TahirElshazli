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

export interface StudentProfileUpdate {
  name?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface StudentRepository {
  findByUserId(userId: string): Promise<StudentProfile | null>;
  /** Called on registration - every student user needs a profile from the start. */
  createForUser(user: {
    userId: string;
    name: string;
    email: string;
  }): Promise<StudentProfile>;
  updateByUserId(
    userId: string,
    update: StudentProfileUpdate,
  ): Promise<StudentProfile | null>;
}

export const STUDENT_REPOSITORY = Symbol('STUDENT_REPOSITORY');
