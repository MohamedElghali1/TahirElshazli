import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  CourseStaffAssignment,
  CourseStaffRepository,
} from '../interfaces/course-staff-repository.interface.js';

interface AssignmentRow {
  id: string;
  user_id: string;
  course_id: string;
  assigned_at: Date;
  assigned_by: string;
}

const SELECT =
  'SELECT id, user_id, course_id, assigned_at, assigned_by FROM course_staff_assignments';

function toAssignment(row: AssignmentRow): CourseStaffAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    assignedAt: iso(row.assigned_at),
    assignedBy: row.assigned_by,
  };
}

/**
 * `find` is to the TA surface what `PostgresEnrollmentRepository.find` is to
 * the student surface: the gate every scoped read passes through, and therefore
 * the query most worth keeping cheap. The unique index on
 * `(course_id, user_id)` makes it an index lookup rather than a scan.
 */
@Injectable()
export class PostgresCourseStaffRepository implements CourseStaffRepository {
  constructor(private readonly db: DatabaseService) {}

  async find(
    courseId: string,
    userId: string,
  ): Promise<CourseStaffAssignment | null> {
    const row = await this.db.queryOne<AssignmentRow>(
      `${SELECT} WHERE course_id = $1 AND user_id = $2`,
      [courseId, userId],
    );
    return row ? toAssignment(row) : null;
  }

  async findByStaff(userId: string): Promise<CourseStaffAssignment[]> {
    const rows = await this.db.query<AssignmentRow>(
      `${SELECT} WHERE user_id = $1 ORDER BY assigned_at`,
      [userId],
    );
    return rows.map(toAssignment);
  }

  async findByCourse(courseId: string): Promise<CourseStaffAssignment[]> {
    const rows = await this.db.query<AssignmentRow>(
      `${SELECT} WHERE course_id = $1 ORDER BY assigned_at`,
      [courseId],
    );
    return rows.map(toAssignment);
  }

  async create(
    courseId: string,
    userId: string,
    assignedBy: string,
  ): Promise<{ assignment: CourseStaffAssignment; created: boolean }> {
    // ON CONFLICT DO NOTHING rather than a SELECT-then-INSERT: two admins
    // assigning the same TA at once would both see "not there" and one would
    // hit the unique violation. This lets the database arbitrate, and the empty
    // result is how we learn we lost.
    const inserted = await this.db.queryOne<AssignmentRow>(
      `INSERT INTO course_staff_assignments (id, user_id, course_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_id, user_id) DO NOTHING
       RETURNING id, user_id, course_id, assigned_at, assigned_by`,
      [randomUUID(), userId, courseId, assignedBy],
    );
    if (inserted) {
      return { assignment: toAssignment(inserted), created: true };
    }

    const existing = await this.find(courseId, userId);
    if (!existing) {
      // The conflicting row was deleted between the INSERT and this read.
      // Rare, and not worth a retry loop: the caller can ask again.
      throw new Error(
        'Staff assignment conflicted on insert but was gone on re-read; retry',
      );
    }
    return { assignment: existing, created: false };
  }

  async remove(courseId: string, userId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM course_staff_assignments
       WHERE course_id = $1 AND user_id = $2
       RETURNING id`,
      [courseId, userId],
    );
    return rows.length > 0;
  }
}
