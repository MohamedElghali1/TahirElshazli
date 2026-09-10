import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type { LearningMode } from '../../enrollments/interfaces/enrollment-repository.interface.js';
import type {
  Group,
  GroupCourse,
  GroupMembership,
  GroupRepository,
  NewGroup,
  NewGroupCourse,
  NewGroupMembership,
} from '../interfaces/group-repository.interface.js';

interface GroupRow {
  id: string;
  name: string;
  teacher_id: string;
  created_at: Date;
}

interface GroupCourseRow {
  id: string;
  group_id: string;
  course_id: string;
  learning_mode: LearningMode;
  enrolled_at: Date;
  enrolled_by: string;
}

interface GroupMembershipRow {
  id: string;
  group_id: string;
  student_id: string;
  assigned_by: string;
  assigned_at: Date;
}

const SELECT_GROUP = 'SELECT id, name, teacher_id, created_at FROM groups';

const SELECT_GROUP_COURSE =
  'SELECT id, group_id, course_id, learning_mode, enrolled_at, enrolled_by FROM group_courses';

const SELECT_MEMBERSHIP =
  'SELECT id, group_id, student_id, assigned_by, assigned_at FROM group_memberships';

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacher_id,
    createdAt: iso(row.created_at),
  };
}

function toGroupCourse(row: GroupCourseRow): GroupCourse {
  return {
    id: row.id,
    groupId: row.group_id,
    courseId: row.course_id,
    learningMode: row.learning_mode,
    enrolledAt: iso(row.enrolled_at),
    enrolledBy: row.enrolled_by,
  };
}

function toMembership(row: GroupMembershipRow): GroupMembership {
  return {
    id: row.id,
    groupId: row.group_id,
    studentId: row.student_id,
    assignedBy: row.assigned_by,
    assignedAt: iso(row.assigned_at),
  };
}

@Injectable()
export class PostgresGroupRepository implements GroupRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(groupId: string): Promise<Group | null> {
    const row = await this.db.queryOne<GroupRow>(
      `${SELECT_GROUP} WHERE id = $1`,
      [groupId],
    );
    return row ? toGroup(row) : null;
  }

  async findAll(limit: number, offset: number): Promise<Group[]> {
    // `groups_created_at_idx` serves both the order and the id tie-break.
    const rows = await this.db.query<GroupRow>(
      `${SELECT_GROUP} ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toGroup);
  }

  async findByIds(groupIds: readonly string[]): Promise<Group[]> {
    if (groupIds.length === 0) {
      // `= ANY('{}')` is valid but still a round trip for a known-empty answer.
      return [];
    }
    const rows = await this.db.query<GroupRow>(
      `${SELECT_GROUP} WHERE id = ANY($1)`,
      [groupIds],
    );
    return rows.map(toGroup);
  }

  async create(input: NewGroup): Promise<Group> {
    const row = await this.db.queryOne<GroupRow>(
      `INSERT INTO groups (id, name, teacher_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, teacher_id, created_at`,
      [randomUUID(), input.name, input.teacherId],
    );
    // The INSERT ... RETURNING cannot come back empty; the non-null assertion
    // is the same one every other repository's create makes.
    return toGroup(row as GroupRow);
  }

  async rename(groupId: string, name: string): Promise<Group | null> {
    const row = await this.db.queryOne<GroupRow>(
      `UPDATE groups SET name = $2 WHERE id = $1
       RETURNING id, name, teacher_id, created_at`,
      [groupId, name],
    );
    return row ? toGroup(row) : null;
  }

  async addCourse(input: NewGroupCourse): Promise<GroupCourse> {
    // Idempotent through the UNIQUE (group_id, course_id) constraint. The
    // DO UPDATE is what makes RETURNING fire on the conflicting path too - a
    // plain DO NOTHING returns no row, and the caller would have to issue a
    // second query to learn what already existed. Setting the column to itself
    // keeps the existing learning mode rather than silently re-modeing a group
    // somebody deliberately moved.
    const row = await this.db.queryOne<GroupCourseRow>(
      `INSERT INTO group_courses (id, group_id, course_id, learning_mode, enrolled_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (group_id, course_id) DO UPDATE
         SET learning_mode = group_courses.learning_mode
       RETURNING id, group_id, course_id, learning_mode, enrolled_at, enrolled_by`,
      [
        randomUUID(),
        input.groupId,
        input.courseId,
        input.learningMode,
        input.enrolledBy,
      ],
    );
    return toGroupCourse(row as GroupCourseRow);
  }

  async removeCourse(groupId: string, courseId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `DELETE FROM group_courses WHERE group_id = $1 AND course_id = $2
       RETURNING id`,
      [groupId, courseId],
    );
    return row !== null;
  }

  async findCourses(groupId: string): Promise<GroupCourse[]> {
    const rows = await this.db.query<GroupCourseRow>(
      `${SELECT_GROUP_COURSE} WHERE group_id = $1 ORDER BY enrolled_at`,
      [groupId],
    );
    return rows.map(toGroupCourse);
  }

  async findGroupCoursesByCourse(courseId: string): Promise<GroupCourse[]> {
    // `group_courses_course_id_idx` serves this; the primary key cannot.
    const rows = await this.db.query<GroupCourseRow>(
      `${SELECT_GROUP_COURSE} WHERE course_id = $1 ORDER BY enrolled_at`,
      [courseId],
    );
    return rows.map(toGroupCourse);
  }

  async addMember(input: NewGroupMembership): Promise<GroupMembership> {
    // Same idempotence as `addCourse`, and for the same reason
    // `EnrollmentRepository.create` has it: two clicks on Add race here and the
    // losing one is describing a state that is true. Preserving `assigned_by`
    // matters - the first person to place a student is who placed them, and
    // overwriting it would rewrite the §5.4 trail with whoever clicked last.
    const row = await this.db.queryOne<GroupMembershipRow>(
      `INSERT INTO group_memberships (id, group_id, student_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, student_id) DO UPDATE
         SET assigned_by = group_memberships.assigned_by
       RETURNING id, group_id, student_id, assigned_by, assigned_at`,
      [randomUUID(), input.groupId, input.studentId, input.assignedBy],
    );
    return toMembership(row as GroupMembershipRow);
  }

  async removeMember(groupId: string, studentId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `DELETE FROM group_memberships WHERE group_id = $1 AND student_id = $2
       RETURNING id`,
      [groupId, studentId],
    );
    return row !== null;
  }

  async findMembers(groupId: string): Promise<GroupMembership[]> {
    const rows = await this.db.query<GroupMembershipRow>(
      `${SELECT_MEMBERSHIP} WHERE group_id = $1 ORDER BY assigned_at`,
      [groupId],
    );
    return rows.map(toMembership);
  }

  async findMembershipsForStudent(
    studentId: string,
  ): Promise<GroupMembership[]> {
    // `group_memberships_student_id_idx` serves this.
    const rows = await this.db.query<GroupMembershipRow>(
      `${SELECT_MEMBERSHIP} WHERE student_id = $1 ORDER BY assigned_at`,
      [studentId],
    );
    return rows.map(toMembership);
  }

  async findStudentGroupCourses(
    studentId: string,
    courseId: string,
  ): Promise<GroupCourse[]> {
    // One join, not two round trips composed in the service. This answers a
    // question that gates what a student may read (§5.2's mode, §5.17's
    // classmates), and a filter applied after the read is the shape §5.11 bans.
    const rows = await this.db.query<GroupCourseRow>(
      `SELECT gc.id, gc.group_id, gc.course_id, gc.learning_mode,
              gc.enrolled_at, gc.enrolled_by
         FROM group_courses gc
         JOIN group_memberships gm ON gm.group_id = gc.group_id
        WHERE gm.student_id = $1 AND gc.course_id = $2
        ORDER BY gc.enrolled_at`,
      [studentId, courseId],
    );
    return rows.map(toGroupCourse);
  }

  async countMembersByGroups(
    groupIds: readonly string[],
  ): Promise<Record<string, number>> {
    if (groupIds.length === 0) {
      return {};
    }
    const rows = await this.db.query<{ group_id: string; count: string }>(
      `SELECT group_id, COUNT(*) AS count
         FROM group_memberships
        WHERE group_id = ANY($1)
        GROUP BY group_id`,
      [groupIds],
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.group_id] = num(row.count);
    }
    return counts;
  }
}
