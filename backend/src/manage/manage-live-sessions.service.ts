import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
  NewLiveSession,
} from '../live-sessions/interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';

/** What a teacher supplies to schedule a session. `courseId` comes from the URL. */
export type ScheduleLiveSessionInput = Omit<NewLiveSession, 'courseId'>;

/**
 * The live-session schedule: the "make announcements of the live sessions"
 * half of the client's ask, on the writing side.
 *
 * **Teacher-only at the controller, deliberately.** CLAUDE.md §2.2's preset
 * does not grant a TA session scheduling, and §11 records the disagreement:
 * the user-stories board's `CRS-11` ("Schedule/share Zoom links for my
 * sessions") puts it in the TA column, the preset does not, and the two
 * artifacts are peers rather than one correcting the other. The client's own
 * words here were about *him* - "he could upload his recordings and make
 * announcements of the live sessions" - so this ships the narrow reading.
 *
 * It takes a `StaffActor` rather than assuming admin for exactly that reason:
 * if §11 resolves the other way, the three write routes move from
 * `AdminManageController` to `StaffManageController` and this file is
 * untouched. Same shape, and same argument, as `ManageRecordingsService`.
 *
 * Zoom is a pasted link, not an API call (§11's other open Zoom question).
 * Nothing here provisions a meeting.
 */
@Injectable()
export class ManageLiveSessionsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(LIVE_SESSION_REPOSITORY)
    private readonly sessionRepo: LiveSessionRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * Shared read: the TA sees the schedule of a course they hold, the teacher
   * sees any. A TA who will be marking attendance needs to know which sessions
   * exist, and reading a schedule is not scheduling one.
   */
  /**
   * The scope check for a write addressed by session id. Collapses the
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
        throw new NotFoundException('Live session not found');
      }
      throw error;
    }
  }

  async list(courseId: string, actor: StaffActor): Promise<LiveSession[]> {
    await this.scope.assertAssigned(courseId, actor);
    return this.sessionRepo.findByCourse(courseId);
  }

  async create(
    courseId: string,
    actor: StaffActor,
    input: ScheduleLiveSessionInput,
  ): Promise<LiveSession> {
    return this.db.runInTransaction(async () => {
      // Scheduling into a course is a write; the existence check below is not a
      // permission check. A no-op for the teacher, and the thing that makes
      // "widening CRS-11 is a controller move" (§11) actually true.
      await this.scope.assertAssigned(courseId, actor);

      const course = await this.courseRepo.findById(courseId);
      if (!course) {
        throw new NotFoundException('Course not found');
      }

      const session = await this.sessionRepo.create({ courseId, ...input });

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.scheduled',
        targetType: 'live_session',
        targetId: session.id,
        courseId,
        before: null,
        after: {
          title: session.title,
          scheduledAt: session.scheduledAt,
          durationMinutes: session.durationMinutes,
        },
      });

      return session;
    });
  }

  async update(
    sessionId: string,
    actor: StaffActor,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException('Live session not found');
      }
      await this.assertMayWrite(existing.courseId, actor);

      const updated = await this.sessionRepo.update(sessionId, patch);
      if (!updated) {
        throw new NotFoundException('Live session not found');
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.updated',
        targetType: 'live_session',
        targetId: sessionId,
        courseId: existing.courseId,
        // `existing` was read before the write and both drivers hand back a copy,
        // so these are genuinely two different states. A repository returning the
        // stored object by reference would make before and after the same mutated
        // object - an entry that looks like evidence and shows nothing moving.
        before: {
          title: existing.title,
          zoomLink: existing.zoomLink,
          scheduledAt: existing.scheduledAt,
          durationMinutes: existing.durationMinutes,
        },
        after: {
          title: updated.title,
          zoomLink: updated.zoomLink,
          scheduledAt: updated.scheduledAt,
          durationMinutes: updated.durationMinutes,
        },
      });

      return updated;
    });
  }

  /**
   * Cancel a session.
   *
   * This destroys the attendance rows for it through the cascade, which is a
   * real loss of history rather than a tidy-up - the same caveat recordings
   * carry, and the reason the audit entry keeps a full `before` snapshot.
   */
  async remove(
    sessionId: string,
    actor: StaffActor,
  ): Promise<{ removed: true }> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException('Live session not found');
      }
      await this.assertMayWrite(existing.courseId, actor);

      const removed = await this.sessionRepo.remove(sessionId);
      if (!removed) {
        // Lost a race with another admin; theirs is the cancellation that
        // happened and is already logged. Logging a second would double-count it.
        throw new NotFoundException('Live session not found');
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.cancelled',
        targetType: 'live_session',
        targetId: sessionId,
        courseId: existing.courseId,
        before: {
          title: existing.title,
          zoomLink: existing.zoomLink,
          scheduledAt: existing.scheduledAt,
          durationMinutes: existing.durationMinutes,
        },
        after: null,
      });

      return { removed: true };
    });
  }
}
