import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import type {
  CoursePatch,
  CourseRepository,
  NewCourse,
  StoredCourse,
} from './interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';

/** One message for a taken slug. It names the slug, which the caller sent. */
export const SLUG_TAKEN = 'A course with that slug already exists';

export const COURSE_NOT_FOUND = 'Course not found';

/** What a create may set. The service supplies the defaults it does not. */
export interface CourseWrite {
  title: string;
  description: string;
  slug: string;
  teacherName: string;
  thumbnailUrl?: string | null;
  sequentialLockEnabled?: boolean;
  isPublished?: boolean;
}

/**
 * The flat snapshot an audit entry carries for a course.
 *
 * Built by hand from scalars rather than spread from `StoredCourse`, for two
 * reasons: `AuditSnapshot` is flat and scalar by contract, and a `before`
 * taken by reference from the in-memory driver would alias the row the update
 * is about to mutate - recording a change that appears never to have happened
 * (`CLAUDE.md` §9). `modules` is excluded; it is not what these actions change.
 */
function snapshot(course: StoredCourse) {
  return {
    slug: course.slug,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    teacherName: course.teacherName,
    sequentialLockEnabled: course.sequentialLockEnabled,
    isPublished: course.isPublished,
  };
}

/**
 * Course lifecycle (`DOM-5`): the two writes behind `POST /admin/courses` and
 * `PATCH /admin/courses/:courseId`.
 *
 * Unscoped and teacher/admin only. There is no `StaffScopeService` call here
 * and there should not be: scope answers "which of the existing courses may
 * this assistant reach", and neither creating a course nor editing one is a
 * question an assistant is asked (`CLAUDE.md` §6's `/admin/*` rule). The
 * controller's `@Roles(...STAFF_ADMIN)` is the gate.
 *
 * Its own service rather than more methods on `CoursesService`: that one is
 * the *student's* view of a course and computes progress from recordings and
 * sessions. These two share none of it.
 */
@Injectable()
export class CourseAdminService {
  constructor(
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  async create(input: CourseWrite, actor: StaffActor): Promise<StoredCourse> {
    return this.db.runInTransaction(async () => {
      // Checked here rather than left to `courses_slug_key`, so the caller
      // gets a 409 with a message instead of a driver error surfacing as a
      // 500. The unique index is still the backstop under a race.
      if (await this.courseRepo.findBySlug(input.slug)) {
        throw new ConflictException(SLUG_TAKEN);
      }
      const course: NewCourse = {
        slug: input.slug,
        title: input.title,
        description: input.description,
        teacherName: input.teacherName,
        thumbnailUrl: input.thumbnailUrl ?? null,
        sequentialLockEnabled: input.sequentialLockEnabled ?? false,
        // **Draft by default.** A course that published itself on creation
        // would put an empty outline on the marketing site; publishing is a
        // separate, deliberate PATCH.
        isPublished: input.isPublished ?? false,
      };
      const created = await this.courseRepo.create(course);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'course.created',
        targetType: 'course',
        targetId: created.id,
        courseId: created.id,
        before: null,
        after: snapshot(created),
      });
      return created;
    });
  }

  async update(
    courseId: string,
    patch: CoursePatch,
    actor: StaffActor,
  ): Promise<StoredCourse> {
    return this.db.runInTransaction(async () => {
      const existing = await this.courseRepo.findById(courseId);
      if (!existing) {
        throw new NotFoundException(COURSE_NOT_FOUND);
      }
      // Taken **before** the write, and it is a flat copy - the in-memory
      // driver hands back the stored row itself, so holding `existing` and
      // reading it afterwards would report the new values as the old ones.
      const before = snapshot(existing);

      if (patch.slug !== undefined && patch.slug !== existing.slug) {
        const clash = await this.courseRepo.findBySlug(patch.slug);
        if (clash && clash.id !== courseId) {
          throw new ConflictException(SLUG_TAKEN);
        }
      }

      const updated = await this.courseRepo.update(courseId, patch);
      if (!updated) {
        // Read a moment ago inside this transaction; a null here would mean
        // the driver contract changed.
        throw new NotFoundException(COURSE_NOT_FOUND);
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'course.updated',
        targetType: 'course',
        targetId: courseId,
        courseId,
        before,
        after: snapshot(updated),
      });
      return updated;
    });
  }

  async findById(courseId: string): Promise<StoredCourse> {
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException(COURSE_NOT_FOUND);
    }
    return course;
  }
}
