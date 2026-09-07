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

  /**
   * `DO NOTHING` plus a RETURNING-less re-read rather than `DO UPDATE`: the
   * conflict case must not touch the existing row (see the interface). The
   * second read only happens on the losing side of a race, so the common path
   * is still one statement.
   */
  async create(enrollment: Enrollment): Promise<Enrollment> {
    const row = await this.db.queryOne<EnrollmentRow>(
      `INSERT INTO enrollments (student_id, course_id, learning_mode, enrolled_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, course_id) DO NOTHING
       RETURNING student_id, course_id, learning_mode, enrolled_at`,
      [
        enrollment.studentId,
        enrollment.courseId,
        enrollment.learningMode,
        enrollment.enrolledAt,
      ],
    );
    if (row) {
      return toEnrollment(row);
    }
    const existing = await this.find(enrollment.courseId, enrollment.studentId);
    // Only reachable if the row was deleted between the conflict and this read.
    return existing ?? enrollment;
  }
}
