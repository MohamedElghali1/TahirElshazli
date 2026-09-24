import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
  Group,
  GroupMembership,
  GroupPatch,
  GroupRepository,
  NewGroup,
  NewGroupMembership,
} from '../interfaces/group-repository.interface.js';

interface GroupRow {
  id: string;
  name: string;
  teacher_id: string;
  course_id: string;
  assistant_id: string | null;
  meets: string | null;
  room: string | null;
  created_at: Date;
}

interface GroupMembershipRow {
  id: string;
  group_id: string;
  student_id: string;
  assigned_by: string;
  assigned_at: Date;
}

const GROUP_COLUMNS =
  'id, name, teacher_id, course_id, assistant_id, meets, room, created_at';

/** The same columns, aliased, for the one query that joins another table. */
const GROUP_COLUMNS_ALIASED =
  'g.id, g.name, g.teacher_id, g.course_id, g.assistant_id, g.meets, g.room, g.created_at';

const SELECT_GROUP = `SELECT ${GROUP_COLUMNS} FROM groups`;

const SELECT_MEMBERSHIP =
  'SELECT id, group_id, student_id, assigned_by, assigned_at FROM group_memberships';

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    // Display only - never read this to decide access. See the interface.
    assistantId: row.assistant_id,
    meets: row.meets,
    room: row.room,
    createdAt: iso(row.created_at),
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
      `INSERT INTO groups (id, name, teacher_id, course_id, assistant_id, meets, room)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${GROUP_COLUMNS}`,
      [
        randomUUID(),
        input.name,
        input.teacherId,
        input.courseId,
        input.assistantId,
        input.meets,
        input.room,
      ],
    );
    // The INSERT ... RETURNING cannot come back empty; the non-null assertion
    // is the same one every other repository's create makes.
    return toGroup(row as GroupRow);
  }

  async update(groupId: string, patch: GroupPatch): Promise<Group | null> {
    // COALESCE per column, with a fixed parameter list - never a string-built
    // SET clause. Every column is named in the SQL text at author time, so no
    // key of `patch` can reach the query as identifier text (`CLAUDE.md` §8).
    //
    // The three nullable columns need an extra boolean parameter each, because
    // COALESCE cannot tell "leave alone" from "set to NULL" - both arrive as
    // NULL. The boolean says which was meant. `name` and `course_id` are NOT
    // NULL columns, so for them COALESCE is unambiguous.
    const row = await this.db.queryOne<GroupRow>(
      `UPDATE groups SET
         name         = COALESCE($2, name),
         course_id    = COALESCE($3, course_id),
         assistant_id = CASE WHEN $4 THEN $5 ELSE assistant_id END,
         meets        = CASE WHEN $6 THEN $7 ELSE meets END,
         room         = CASE WHEN $8 THEN $9 ELSE room END
       WHERE id = $1
       RETURNING ${GROUP_COLUMNS}`,
      [
        groupId,
        patch.name ?? null,
        patch.courseId ?? null,
        patch.assistantId !== undefined,
        patch.assistantId ?? null,
        patch.meets !== undefined,
        patch.meets ?? null,
        patch.room !== undefined,
        patch.room ?? null,
      ],
    );
    return row ? toGroup(row) : null;
  }

  async findByCourse(courseId: string): Promise<Group[]> {
    // `groups_course_id_idx` (migration 013) serves this.
    const rows = await this.db.query<GroupRow>(
      `${SELECT_GROUP} WHERE course_id = $1 ORDER BY created_at, id`,
      [courseId],
    );
    return rows.map(toGroup);
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

  async findMembersForGroups(groupIds: readonly string[]): Promise<GroupMembership[]> {
    if (groupIds.length === 0) {
      return [];
    }
    // One read for many rosters; `group_memberships (group_id, ...)` serves it.
    const rows = await this.db.query<GroupMembershipRow>(
      `${SELECT_MEMBERSHIP} WHERE group_id = ANY($1) ORDER BY assigned_at, id`,
      [[...groupIds]],
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

  async findStudentGroups(
    studentId: string,
    courseId: string,
  ): Promise<Group[]> {
    // One join, not two round trips composed in the service. This answers a
    // question that gates what a student may read (§5.17's classmates, the
    // assessment window), and a filter applied after the read is the shape
    // §5.11 bans.
    //
    // Ordered by the MEMBERSHIP's assigned_at - longest-standing placement
    // first. That is `StudentGroupsService`'s tie-break; the sort key moved
    // here from `group_courses.enrolled_at` when the join table collapsed, and
    // the in-memory driver sorts the same way. `gm.id` breaks a shared
    // millisecond so the order is total in both drivers.
    const rows = await this.db.query<GroupRow>(
      `SELECT ${GROUP_COLUMNS_ALIASED}
         FROM groups g
         JOIN group_memberships gm ON gm.group_id = g.id
        WHERE gm.student_id = $1 AND g.course_id = $2
        ORDER BY gm.assigned_at, gm.id`,
      [studentId, courseId],
    );
    return rows.map(toGroup);
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
