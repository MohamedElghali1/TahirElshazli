import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type {
  CourseModule,
  CourseRepository,
  Lesson,
  StoredCourse,
} from '../interfaces/course-repository.interface.js';

interface CourseRow {
  id: string;
  slug: string;
  is_published: boolean;
  title: string;
  description: string;
  thumbnail_url: string | null;
  teacher_name: string;
  sequential_lock_enabled: boolean;
}

interface ModuleLessonRow {
  course_id: string;
  module_id: string;
  module_title: string;
  chapter: string;
  module_position: number;
  lesson_id: string | null;
  lesson_title: string | null;
  lesson_position: number | null;
  duration_seconds: number | null;
}

const COURSE_COLUMNS = `
  id, slug, is_published, title, description, thumbnail_url, teacher_name,
  sequential_lock_enabled
`;

@Injectable()
export class PostgresCourseRepository implements CourseRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(courseId: string): Promise<StoredCourse | null> {
    const courses = await this.loadCourses([courseId]);
    return courses[0] ?? null;
  }

  async findByIds(courseIds: readonly string[]): Promise<StoredCourse[]> {
    if (courseIds.length === 0) {
      // `= ANY('{}')` is valid but still a round trip for a guaranteed-empty
      // answer, and this is the common case for a student with no enrollments.
      return [];
    }
    return this.loadCourses(courseIds);
  }

  async findPublished(limit: number, offset: number): Promise<StoredCourse[]> {
    return this.pageBy(
      `SELECT id FROM courses
        WHERE is_published
        ORDER BY title, id
        LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
  }

  async findBySlug(slug: string): Promise<StoredCourse | null> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM courses WHERE slug = $1`,
      [slug],
    );
    if (rows.length === 0) {
      return null;
    }
    const courses = await this.loadCourses([rows[0].id]);
    return courses[0] ?? null;
  }

  async findAll(limit: number, offset: number): Promise<StoredCourse[]> {
    return this.pageBy(
      `SELECT id FROM courses ORDER BY title, id LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
  }

  /**
   * Page over ids first, then hand them to the same loader the scoped reads
   * use. Paging inside `loadCourses` is not an option: it joins the module and
   * lesson rows, so a LIMIT there would cut a course's outline in half rather
   * than cutting the list of courses.
   *
   * The `idsSql` is a literal in this file, never built from a caller's input -
   * the only parameters that cross the boundary are the limit and offset.
   */
  private async pageBy(
    idsSql: string,
    limit: number,
    offset: number,
  ): Promise<StoredCourse[]> {
    const ids = await this.db.query<{ id: string }>(idsSql, [limit, offset]);
    if (ids.length === 0) {
      return [];
    }
    const courses = await this.loadCourses(ids.map((row) => row.id));
    // `loadCourses` does not promise an order; restore the paged one.
    const byId = new Map(courses.map((course) => [course.id, course]));
    return ids
      .map((row) => byId.get(row.id))
      .filter((course): course is StoredCourse => course !== undefined);
  }

  /**
   * Two queries for any number of courses: the course rows, then the whole
   * module/lesson tree for all of them at once.
   *
   * `= ANY($1)` rather than a generated `IN (...)` list, so the number of
   * courses never changes the SQL text - one prepared statement, one plan, and
   * no place where an id could be concatenated into the query.
   */
  private async loadCourses(
    courseIds: readonly string[],
  ): Promise<StoredCourse[]> {
    const ids = [...courseIds];
    const courses = await this.db.query<CourseRow>(
      `SELECT ${COURSE_COLUMNS} FROM courses WHERE id = ANY($1::text[])`,
      [ids],
    );
    if (courses.length === 0) {
      return [];
    }

    // The LEFT JOIN keeps a module with no lessons yet, which would otherwise
    // vanish from the course outline.
    const rows = await this.db.query<ModuleLessonRow>(
      `SELECT m.course_id,
              m.id       AS module_id,
              m.title    AS module_title,
              m.chapter,
              m.position AS module_position,
              l.id       AS lesson_id,
              l.title    AS lesson_title,
              l.position AS lesson_position,
              l.duration_seconds
       FROM course_modules m
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = ANY($1::text[])
       ORDER BY m.course_id, m.position, l.position`,
      [ids],
    );

    const modulesByCourse = new Map<string, Map<string, CourseModule>>();
    for (const row of rows) {
      let modules = modulesByCourse.get(row.course_id);
      if (!modules) {
        modules = new Map<string, CourseModule>();
        modulesByCourse.set(row.course_id, modules);
      }
      let module = modules.get(row.module_id);
      if (!module) {
        module = {
          id: row.module_id,
          title: row.module_title,
          chapter: row.chapter,
          order: row.module_position,
          lessons: [],
        };
        modules.set(row.module_id, module);
      }
      if (row.lesson_id !== null) {
        const lesson: Lesson = {
          id: row.lesson_id,
          title: row.lesson_title ?? '',
          order: row.lesson_position ?? 0,
          durationSeconds: row.duration_seconds ?? 0,
        };
        module.lessons.push(lesson);
      }
    }

    return courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      isPublished: course.is_published,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnail_url,
      teacherName: course.teacher_name,
      sequentialLockEnabled: course.sequential_lock_enabled,
      // ORDER BY already sorted them; Map preserves insertion order.
      modules: [...(modulesByCourse.get(course.id)?.values() ?? [])],
    }));
  }
}
