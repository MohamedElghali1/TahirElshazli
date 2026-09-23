import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
} from '../live-sessions/interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import type { AttendanceRepository } from '../live-sessions/interfaces/attendance-repository.interface.js';
import { ATTENDANCE_REPOSITORY } from '../live-sessions/interfaces/attendance-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';

/** What a teacher supplies to schedule a session, in the old course-keyed DTO's shape. */
export interface ScheduleLiveSessionInput {
  title: string;
  zoomLink: string;
  scheduledAt: string;
  durationMinutes: number;
}

/** A partial edit, same old shape - `CreateLiveSessionDto`'s fields, all optional. */
export interface LiveSessionEditInput {
  title?: string;
  zoomLink?: string;
  scheduledAt?: string;
  durationMinutes?: number;
}

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
 * **Stopgap, course-keyed, pending `SESS-1`'s S3 slice.** Migration 019
 * re-parented `live_sessions` onto `group_id`; `PHASE_PLAN.md` §1.3/§3.1
 * (`D-6`) rewrites this service to be group-scoped from birth - `mayReachGroup`
 * instead of `assertAssigned(courseId)` - and deletes the three `/admin/*`
 * routes it backs outright. That rewrite is out of scope for the slice that
 * produced this file (S1/S2: schema and repositories only); until it lands,
 * every method here still takes the course-keyed shape its callers
 * (`AdminManageController`, `StaffManageController`) already use, and
 * translates a course to "the one group that studies it"
 * (`GroupRepository.findByCourse`) to reach the reshaped repository. That
 * translation requires exactly one group per course, true of every fixture
 * and of the codebase's current shape (migration 013); it is not the D-6
 * authorization rewrite and must not be read as one.
 */
@Injectable()
export class ManageLiveSessionsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(LIVE_SESSION_REPOSITORY)
    private readonly sessionRepo: LiveSessionRepository,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepo: GroupRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  private toEndsAt(scheduledAt: string, durationMinutes: number): string {
    return new Date(
      new Date(scheduledAt).getTime() + durationMinutes * 60_000,
    ).toISOString();
  }

  private durationMinutesOf(session: LiveSession): number {
    return Math.round(
      (new Date(session.endsAt).getTime() -
        new Date(session.scheduledAt).getTime()) /
        60_000,
    );
  }

  /**
   * The course-to-group translation this whole file is a stopgap around. See
   * the class comment. Requires exactly one group; a course with none or
   * several is treated the same as "course not found" rather than guessed at,
   * consistent with migration 019's own refusal to guess.
   */
  private async soleGroupOf(courseId: string): Promise<string> {
    const groups = await this.groupRepo.findByCourse(courseId);
    if (groups.length !== 1) {
      throw new NotFoundException('Course not found');
    }
    return groups[0]!.id;
  }

  /**
   * The scope check for a write addressed by session id. Resolves the
   * session's group back to its course (`groupRepo.findById`) and collapses
   * the out-of-scope 404 into the resource's own wording, so a real id on
   * another course cannot be told apart from an id that never existed.
   * Returns the resolved `courseId`, which the caller needs for its audit
   * entry - the same field the pre-reshape row carried directly.
   */
  private async assertMayWrite(
    session: LiveSession,
    actor: StaffActor,
  ): Promise<string> {
    const group = await this.groupRepo.findById(session.groupId);
    if (!group) {
      throw new NotFoundException('Live session not found');
    }
    try {
      await this.scope.assertAssigned(group.courseId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Live session not found');
      }
      throw error;
    }
    return group.courseId;
  }

  async list(courseId: string, actor: StaffActor): Promise<LiveSession[]> {
    await this.scope.assertAssigned(courseId, actor);
    const groups = await this.groupRepo.findByCourse(courseId);
    return this.sessionRepo.findByGroups(groups.map((g) => g.id));
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

      const groupId = await this.soleGroupOf(courseId);

      const session = await this.sessionRepo.create({
        groupId,
        title: input.title,
        meetingLink: input.zoomLink,
        scheduledAt: input.scheduledAt,
        endsAt: this.toEndsAt(input.scheduledAt, input.durationMinutes),
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });

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
          endsAt: session.endsAt,
        },
      });

      return session;
    });
  }

  async update(
    sessionId: string,
    actor: StaffActor,
    patch: LiveSessionEditInput,
  ): Promise<LiveSession> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException('Live session not found');
      }
      const courseId = await this.assertMayWrite(existing, actor);

      const repoPatch: LiveSessionUpdate = {};
      if (patch.title !== undefined) {
        repoPatch.title = patch.title;
      }
      if (patch.zoomLink !== undefined) {
        repoPatch.meetingLink = patch.zoomLink;
      }
      if (patch.scheduledAt !== undefined || patch.durationMinutes !== undefined) {
        // `endsAt` is stored, not derived at read time (`DOMAIN_MODEL.md` §5), so
        // touching either half of the old duration shape recomputes it from
        // whichever value the patch left alone.
        const scheduledAt = patch.scheduledAt ?? existing.scheduledAt;
        const durationMinutes =
          patch.durationMinutes ?? this.durationMinutesOf(existing);
        repoPatch.scheduledAt = scheduledAt;
        repoPatch.endsAt = this.toEndsAt(scheduledAt, durationMinutes);
      }

      const updated = await this.sessionRepo.update(sessionId, repoPatch);
      if (!updated) {
        throw new NotFoundException('Live session not found');
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.updated',
        targetType: 'live_session',
        targetId: sessionId,
        courseId,
        // `existing` was read before the write and both drivers hand back a copy,
        // so these are genuinely two different states. A repository returning the
        // stored object by reference would make before and after the same mutated
        // object - an entry that looks like evidence and shows nothing moving.
        before: {
          title: existing.title,
          meetingLink: existing.meetingLink,
          scheduledAt: existing.scheduledAt,
          endsAt: existing.endsAt,
        },
        after: {
          title: updated.title,
          meetingLink: updated.meetingLink,
          scheduledAt: updated.scheduledAt,
          endsAt: updated.endsAt,
        },
      });

      return updated;
    });
  }

  /**
   * Cancel a session.
   *
   * Attendance is no longer removed by the repository's own cascade in the
   * memory driver - it is a separate repository behind its own interface now,
   * so this service owns the cascade explicitly, inside the same transaction.
   * Postgres still does it via `ON DELETE CASCADE` regardless; calling
   * `removeForSession` there too keeps both drivers doing the same thing for
   * the same reason, and gives the audit entry its full `before` snapshot
   * count without relying on the driver-specific cascade to have already run.
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
      const courseId = await this.assertMayWrite(existing, actor);

      await this.attendanceRepo.removeForSession(sessionId);

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
        courseId,
        before: {
          title: existing.title,
          meetingLink: existing.meetingLink,
          scheduledAt: existing.scheduledAt,
          endsAt: existing.endsAt,
        },
        after: null,
      });

      return { removed: true };
    });
  }
}
