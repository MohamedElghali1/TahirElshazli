import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  Enrollment,
  EnrollmentRepository,
  LearningMode,
} from '../interfaces/enrollment-repository.interface.js';

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  learning_mode: LearningMode;
  enrolled_at: Date;
}

const SELECT =
  'SELECT student_id, course_id, learning_mode, enrolled_at FROM enrollments';

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    studentId: row.student_id,
    courseId: row.course_id,
    learningMode: row.learning_mode,
    enrolledAt: iso(row.enrolled_at),
  };
}

/**
 * The gate every course-scoped student read passes through
 * (`EnrollmentsService.assertEnrolled`). `find` is the single hottest query in
 * the application, which is why `enrollments` is keyed on
 * `(student_id, course_id)` - this is a primary-key lookup, not a scan.
 */
@Injectable()
export class PostgresEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByStudent(studentId: string): Promise<Enrollment[]> {
    const rows = await this.db.query<EnrollmentRow>(
      `${SELECT} WHERE student_id = $1 ORDER BY enrolled_at`,
      [studentId],
    );
    return rows.map(toEnrollment);
  }

  async find(courseId: string, studentId: string): Promise<Enrollment | null> {
    const row = await this.db.queryOne<EnrollmentRow>(
      `${SELECT} WHERE course_id = $1 AND student_id = $2`,
      [courseId, studentId],
    );
    return row ? toEnrollment(row) : null;
  }
}
