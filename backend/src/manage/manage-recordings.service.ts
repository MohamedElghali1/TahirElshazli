import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  NewRecording,
  Recording,
  RecordingRepository,
  RecordingUpdate,
} from '../recordings/interfaces/recording-repository.interface.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { Role } from '../auth/roles.enum.js';

/** What a teacher supplies to publish a recording. `courseId` comes from the URL. */
export interface CreateRecordingInput {
  moduleId: string;
  lessonId: string;
  title: string;
  chapter?: string;
  topics?: string[];
  videoUrl: string;
  durationSeconds: number;
  lessonDate?: string;
}

/**
 * The teacher's recording library.
 *
 * Reads are shared with the TA through `StaffScopeService`; every write on this
 * service is reached only from an admin-only controller. CLAUDE.md §2.2 grants
 * a TA materials but never recordings, and the client's instruction was
 * specifically that *the teacher* uploads them - so the split is deliberate,
 * and widening it later is one `@Roles` line rather than a redesign.
 */
@Injectable()
export class ManageRecordingsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(RECORDING_REPOSITORY)
    private readonly recordingRepo: RecordingRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    private readonly audit: AuditService,
  ) {}

  /** Shared read: the TA sees their assigned courses, the teacher sees any. */
  /**
   * The role recorded on the audit entry, derived from the caller rather than
   * assumed. These routes are teacher-only today (§2.2 grants a TA materials
   * and never recordings), but if that widens an assistant's upload must not
   * be attributed to Dr. Tahir.
   */
  private roleOf(actor: StaffActor): Role {
    return actor.role === Role.Assistant ? Role.Assistant : Role.Teacher;
  }

  /**
   * The scope check for a write addressed by resource id. Collapses the
   * out-of-scope 404 into the resource's own wording, so a real id on another
   * course cannot be told apart from an id that never existed.
   */
  private async assertMayWrite(
    courseId: string,
    actor: StaffActor,
  ): Promise<void> {
    try {
      await this.scope.assertAssigned(courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Recording not found');
      }
      throw error;
    }
  }

  async list(courseId: string, actor: StaffActor): Promise<Recording[]> {
    await this.scope.assertAssigned(courseId, actor);
    return this.recordingRepo.findByCourseForStaff(courseId);
  }

  /**
   * Publish a recording. Teacher-only at the controller.
   *
   * The lesson is verified to belong to *this* course before the insert. Under
   * Postgres a foreign lesson id would still satisfy the FK - `lessons` has no
   * course_id column, so the constraint cannot catch it - and the recording
   * would land on a course the teacher did not name. Under the memory driver
   * there is no constraint at all. Both are why this check is in the service.
   */
  async create(
    courseId: string,
    actor: StaffActor,
    input: CreateRecordingInput,
  ): Promise<Recording> {
    // Before the course is even read: publishing into a course is a write, and
    // the existence check below is not a permission check.
    await this.scope.assertAssigned(courseId, actor);

    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const module = course.modules.find((m) => m.id === input.moduleId);
    if (!module) {
      throw new BadRequestException('That module is not part of this course');
    }
    const lesson = module.lessons.find((l) => l.id === input.lessonId);
    if (!lesson) {
      throw new BadRequestException('That lesson is not part of that module');
    }

    const payload: NewRecording = {
      courseId,
      moduleId: module.id,
      lessonId: lesson.id,
      title: input.title,
      // The module's chapter is the sensible default - it is what the student's
      // chapter filter groups by, and a free-typed chapter that matches nothing
      // makes the recording unfindable behind that filter.
      chapter: input.chapter?.trim() || module.chapter,
      topics: input.topics ?? [],
      videoUrl: input.videoUrl,
      durationSeconds: input.durationSeconds,
      lessonDate: input.lessonDate ?? new Date().toISOString(),
    };

    const recording = await this.recordingRepo.create(payload);

    await this.audit.record({
      actorId: actor.id,
      actorRole: this.roleOf(actor),
      action: 'recording.created',
      targetType: 'recording',
      targetId: recording.id,
      courseId,
      before: null,
      after: {
        title: recording.title,
        lessonId: recording.lessonId,
        durationSeconds: recording.durationSeconds,
      },
    });

    return recording;
  }

  async update(
    recordingId: string,
    actor: StaffActor,
    patch: RecordingUpdate,
  ): Promise<Recording> {
    const existing = await this.recordingRepo.findRecordingById(recordingId);
    if (!existing) {
      throw new NotFoundException('Recording not found');
    }
    // Scoped on the course the resource itself names, not on one from the URL.
    // These routes are teacher-only today, for whom `assertAssigned` is a no-op
    // - but the claim next door is that widening them to TAs is a controller
    // move, and that claim is only true while the scope check lives here. A
    // by-id write with no join is the §5.11 leak in its usual shape.
    await this.assertMayWrite(existing.courseId, actor);

    const updated = await this.recordingRepo.update(recordingId, patch);
    if (!updated) {
      throw new NotFoundException('Recording not found');
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: this.roleOf(actor),
      action: 'recording.updated',
      targetType: 'recording',
      targetId: recordingId,
      courseId: existing.courseId,
      before: { title: existing.title, videoUrl: existing.videoUrl },
      after: { title: updated.title, videoUrl: updated.videoUrl },
    });

    return updated;
  }

  /**
   * Remove a recording.
   *
   * This destroys every student's watch progress for it through the cascade,
   * which is a real loss of history rather than a tidy-up - worth knowing when
   * the soft-delete conventions in §6 are eventually applied here.
   */
  async remove(recordingId: string, actor: StaffActor): Promise<{ removed: true }> {
    const existing = await this.recordingRepo.findRecordingById(recordingId);
    if (!existing) {
      throw new NotFoundException('Recording not found');
    }
    await this.assertMayWrite(existing.courseId, actor);

    const removed = await this.recordingRepo.remove(recordingId);
    if (!removed) {
      // Lost a race with another admin; theirs is the deletion that happened
      // and is already logged. Logging a second would double-count it.
      throw new NotFoundException('Recording not found');
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: this.roleOf(actor),
      action: 'recording.deleted',
      targetType: 'recording',
      targetId: recordingId,
      courseId: existing.courseId,
      before: {
        title: existing.title,
        lessonId: existing.lessonId,
        videoUrl: existing.videoUrl,
      },
      after: null,
    });

    return { removed: true };
  }
}
