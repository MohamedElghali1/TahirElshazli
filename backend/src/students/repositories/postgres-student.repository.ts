import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
  StudentProfile,
  StudentProfileUpdate,
  StudentRepository,
} from '../interfaces/student-repository.interface.js';

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  enrolled_course_count: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * `enrolled_course_count` is computed, not stored. A denormalised counter
 * column would need every enrollment write in the system to remember to bump
 * it, and the first one that forgets makes the profile quietly wrong.
 */
const PROFILE_SELECT = `
  SELECT p.id,
         p.user_id,
         p.name,
         p.email,
         p.phone,
         p.avatar_url,
         p.created_at,
         p.updated_at,
         (SELECT count(*) FROM enrollments e WHERE e.student_id = p.user_id)
           AS enrolled_course_count
  FROM student_profiles p
`;

function toProfile(row: ProfileRow): StudentProfile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    enrolledCourseCount: num(row.enrolled_course_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class PostgresStudentRepository implements StudentRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByUserId(userId: string): Promise<StudentProfile | null> {
    const row = await this.db.queryOne<ProfileRow>(
      `${PROFILE_SELECT} WHERE p.user_id = $1`,
      [userId],
    );
    return row ? toProfile(row) : null;
  }

  async createForUser(user: {
    userId: string;
    name: string;
    email: string;
  }): Promise<StudentProfile> {
    const row = await this.db.queryOne<ProfileRow>(
      `WITH inserted AS (
         INSERT INTO student_profiles (id, user_id, name, email)
         VALUES ($1, $2, $3, $4)
         RETURNING *
       )
       SELECT p.id, p.user_id, p.name, p.email, p.phone, p.avatar_url,
              p.created_at, p.updated_at,
              (SELECT count(*) FROM enrollments e WHERE e.student_id = p.user_id)
                AS enrolled_course_count
       FROM inserted p`,
      [randomUUID(), user.userId, user.name, user.email],
    );
    return toProfile(row!);
  }

  async updateByUserId(
    userId: string,
    update: StudentProfileUpdate,
  ): Promise<StudentProfile | null> {
    // COALESCE with an explicit NULL parameter cannot express "set this column
    // to NULL", which clearing a phone number needs. A per-field boolean flag
    // keeps `undefined` (leave alone) distinct from `null` (clear it) without
    // building the SQL string from the request body.
    const row = await this.db.queryOne<ProfileRow>(
      `WITH updated AS (
         UPDATE student_profiles
         SET name       = CASE WHEN $2::boolean THEN $3::text ELSE name END,
             phone      = CASE WHEN $4::boolean THEN $5::text ELSE phone END,
             avatar_url = CASE WHEN $6::boolean THEN $7::text ELSE avatar_url END,
             updated_at = now()
         WHERE user_id = $1
         RETURNING *
       )
       SELECT p.id, p.user_id, p.name, p.email, p.phone, p.avatar_url,
              p.created_at, p.updated_at,
              (SELECT count(*) FROM enrollments e WHERE e.student_id = p.user_id)
                AS enrolled_course_count
       FROM updated p`,
      [
        userId,
        update.name !== undefined,
        update.name ?? null,
        update.phone !== undefined,
        update.phone ?? null,
        update.avatarUrl !== undefined,
        update.avatarUrl ?? null,
      ],
    );
    return row ? toProfile(row) : null;
  }
}
