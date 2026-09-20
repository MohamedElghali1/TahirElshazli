/**
 * The stored student record, **including the three staff-owned fields**
 * (`DOM-3`, migration 014).
 *
 * This is the repository's shape, not the student's. `schoolName`,
 * `parentEmail` and `staffNotes` must never reach a student-facing response
 * (`DOMAIN_MODEL.md:35`) - `parentEmail` is a third party's PII on a child's
 * record, and `staffNotes` is staff writing *about* the student. `students.ts`
 * builds `StudentProfileView` key by key rather than spreading this type, so a
 * field added here cannot arrive on `GET /students/me/profile` by accident.
 */
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

  /** Staff-owned. Never student-facing. */
  schoolName: string | null;
  /** Staff-owned, and a third party's PII. Never student-facing, never logged. */
  parentEmail: string | null;
  /** Staff-owned. Never student-facing. */
  staffNotes: string | null;
}

/**
 * What `PATCH /students/me/profile` may change - the student's own three
 * fields and no more.
 *
 * The three staff fields are deliberately **absent**. Nothing writes them in
 * this slice (`PEOPLE-1`, unit 5, owns `PATCH /admin/students/:id`), and a
 * writable member with no writer would be an open door on the one update path
 * that a *student* drives.
 */
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
