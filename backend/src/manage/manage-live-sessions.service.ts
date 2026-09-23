import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  LiveSession,
  LiveSessionRepository,
} from '../live-sessions/interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import type { AttendanceRepository } from '../live-sessions/interfaces/attendance-repository.interface.js';
import { ATTENDANCE_REPOSITORY } from '../live-sessions/interfaces/attendance-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type {
  AttendanceEntryDto,
  AttendanceSheetItem,
  CreateSessionDto,
  ListSessionsQueryDto,
  UpdateSessionDto,
} from './dto/session.dto.js';

export const LIVE_SESSION_NOT_FOUND = 'Live session not found';
export const GROUP_NOT_FOUND = 'Group not found';

/**
 * How many groups an unscoped actor's week grid will gather sessions across.
 *
 * `findByGroups` wants explicit ids, and an unrestricted actor has no id list
 * of their own, so the whole roster is read and passed through. The platform
 * runs ~10 groups (`CLAUDE.md` §1), so this is ten times the real ceiling -
 * but it **is** a ceiling, and it truncates silently rather than erroring.
 * Should the school ever pass it, the teacher's grid quietly loses sessions
 * from the groups that sort last, which is the failure mode worth knowing
 * about before it happens. Raise this, or give the repository an
 * "every group" read, rather than debugging a grid with holes in it.
 */
const MAX_GROUPS_FOR_UNSCOPED_GRID = 100;

/**
 * Staff live-session and attendance management (`SESS-1` .. `SESS-5`).
 *
 * **`D-6` — group-scoped authorization**: an assistant may create, edit, cancel
 * and publish sessions, and mark attendance, for their **own groups only**.
 * The check is `StaffScopeService.mayReachGroup(groupId, actor)` — a non-throwing
 * predicate. Sessions are group-parented (migration 019), so the group is the
 * scope key.
 *
 * **Anti-enumeration**: out-of-scope sessions and genuinely nonexistent sessions
 * both fail with `404 Live session not found` and byte-identical wording. An
 * assistant attempting to schedule into an unheld group gets `404 Group not found`,
 * matching `GroupsService`.
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
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * The week grid (`GET /staff/sessions?from=&to=&groupId=`).
   *
   * Date filtering is applied in the service over `findByGroups` (`PHASE_PLAN.md` §3.1).
   * Returns both `planned` and `published` sessions.
   */
  async list(
    actor: StaffActor,
    query: ListSessionsQueryDto,
  ): Promise<LiveSession[]> {
    if (new Date(query.from).getTime() > new Date(query.to).getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const reachable = await this.scope.reachableGroupIds(actor);
    let groupIds: readonly string[];

    if (query.groupId !== undefined) {
      if (reachable !== null && !reachable.includes(query.groupId)) {
        return [];
      }
      groupIds = [query.groupId];
    } else {
      if (reachable !== null) {
        if (reachable.length === 0) {
          return [];
        }
        groupIds = reachable;
      } else {
        const allGroups = await this.groupRepo.findAll(MAX_GROUPS_FOR_UNSCOPED_GRID, 0);
        groupIds = allGroups.map((g) => g.id);
      }
    }

    const sessions = await this.sessionRepo.findByGroups(groupIds);

    const fromTime = new Date(query.from).getTime();
    const toTime = /^\d{4}-\d{2}-\d{2}$/.test(query.to)
      ? new Date(`${query.to}T23:59:59.999Z`).getTime()
      : new Date(query.to).getTime();

    return sessions.filter((s) => {
      const t = new Date(s.scheduledAt).getTime();
      return t >= fromTime && t <= toTime;
    });
  }

  /**
   * The draft timetable (`GET /staff/sessions/planned`).
   * In-scope groups only.
   */
  async listPlanned(actor: StaffActor): Promise<LiveSession[]> {
    const reachable = await this.scope.reachableGroupIds(actor);
    let groupIds: readonly string[];

    if (reachable !== null) {
      if (reachable.length === 0) {
        return [];
      }
      groupIds = reachable;
    } else {
      const allGroups = await this.groupRepo.findAll(MAX_GROUPS_FOR_UNSCOPED_GRID, 0);
      groupIds = allGroups.map((g) => g.id);
    }

    const sessions = await this.sessionRepo.findByGroups(groupIds);
    return sessions.filter((s) => s.state === 'planned');
  }

  /**
   * Schedule a session for a group (`POST /staff/groups/:groupId/sessions`).
   * Audits `live_session.scheduled` (or `session.planned` if planned).
   */
  async create(
    groupId: string,
    actor: StaffActor,
    input: CreateSessionDto,
  ): Promise<LiveSession> {
    return this.db.runInTransaction(async () => {
      const group = await this.groupRepo.findById(groupId);
      if (!group || !(await this.scope.mayReachGroup(groupId, actor))) {
        throw new NotFoundException(GROUP_NOT_FOUND);
      }

      if (
        new Date(input.scheduledAt).getTime() >=
        new Date(input.endsAt).getTime()
      ) {
        throw new BadRequestException('endsAt must be after scheduledAt');
      }

      const session = await this.sessionRepo.create({
        groupId,
        title: input.title,
        meetingLink: input.meetingLink ?? null,
        scheduledAt: input.scheduledAt,
        endsAt: input.endsAt,
        assistantId: input.assistantId ?? null,
        description: input.description ?? null,
        privateNotes: input.privateNotes ?? null,
        isVisible: input.isVisible ?? true,
        state: input.state ?? 'published',
      });

      const action =
        input.state === 'planned' ? 'session.planned' : 'live_session.scheduled';

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action,
        targetType: 'live_session',
        targetId: session.id,
        courseId: group.courseId,
        before: null,
        after: {
          title: session.title,
          scheduledAt: session.scheduledAt,
          endsAt: session.endsAt,
          state: session.state,
        },
      });

      return session;
    });
  }

  /**
   * Partial edit (`PATCH /staff/sessions/:sessionId`).
   * Audits `live_session.updated`.
   */
  async update(
    sessionId: string,
    actor: StaffActor,
    patch: UpdateSessionDto,
  ): Promise<LiveSession> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }
      if (!(await this.scope.mayReachGroup(existing.groupId, actor))) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      const scheduledAt = patch.scheduledAt ?? existing.scheduledAt;
      const endsAt = patch.endsAt ?? existing.endsAt;
      if (new Date(scheduledAt).getTime() >= new Date(endsAt).getTime()) {
        throw new BadRequestException('endsAt must be after scheduledAt');
      }

      const before = {
        title: existing.title,
        meetingLink: existing.meetingLink,
        scheduledAt: existing.scheduledAt,
        endsAt: existing.endsAt,
        assistantId: existing.assistantId,
        description: existing.description,
        privateNotes: existing.privateNotes,
        isVisible: existing.isVisible,
        state: existing.state,
      };

      const updated = await this.sessionRepo.update(sessionId, patch);
      if (!updated) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      const after = {
        title: updated.title,
        meetingLink: updated.meetingLink,
        scheduledAt: updated.scheduledAt,
        endsAt: updated.endsAt,
        assistantId: updated.assistantId,
        description: updated.description,
        privateNotes: updated.privateNotes,
        isVisible: updated.isVisible,
        state: updated.state,
      };

      const group = await this.groupRepo.findById(existing.groupId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.updated',
        targetType: 'live_session',
        targetId: sessionId,
        courseId: group?.courseId ?? null,
        before,
        after,
      });

      return updated;
    });
  }

  /**
   * Cancel a session (`DELETE /staff/sessions/:sessionId`).
   * Audits `live_session.cancelled`.
   */
  async remove(
    sessionId: string,
    actor: StaffActor,
  ): Promise<{ removed: true }> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }
      if (!(await this.scope.mayReachGroup(existing.groupId, actor))) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      await this.attendanceRepo.removeForSession(sessionId);

      const removed = await this.sessionRepo.remove(sessionId);
      if (!removed) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      const group = await this.groupRepo.findById(existing.groupId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'live_session.cancelled',
        targetType: 'live_session',
        targetId: sessionId,
        courseId: group?.courseId ?? null,
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

  /**
   * Promote planned to published (`POST /staff/sessions/:sessionId/publish`).
   * Idempotent: publishing an already-published session is a 200 no-op.
   */
  async publish(sessionId: string, actor: StaffActor): Promise<LiveSession> {
    const existing = await this.sessionRepo.findById(sessionId);
    if (!existing) {
      throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
    }
    if (!(await this.scope.mayReachGroup(existing.groupId, actor))) {
      throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
    }

    if (existing.state === 'published') {
      return existing;
    }

    return this.db.runInTransaction(async () => {
      const beforeState = existing.state;
      const updated = await this.sessionRepo.update(sessionId, {
        state: 'published',
      });
      if (!updated) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      const group = await this.groupRepo.findById(existing.groupId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'session.published',
        targetType: 'live_session',
        targetId: sessionId,
        courseId: group?.courseId ?? null,
        before: { state: beforeState },
        after: { state: updated.state },
      });

      return updated;
    });
  }

  /**
   * The attendance sheet (`GET /staff/sessions/:sessionId/attendance`).
   * Every member of the session's group, each with their status or `null` when unmarked.
   */
  async getAttendanceSheet(
    sessionId: string,
    actor: StaffActor,
  ): Promise<AttendanceSheetItem[]> {
    const existing = await this.sessionRepo.findById(sessionId);
    if (!existing) {
      throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
    }
    if (!(await this.scope.mayReachGroup(existing.groupId, actor))) {
      throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
    }

    const memberships = await this.groupRepo.findMembers(existing.groupId);
    const marks = await this.attendanceRepo.findBySession(sessionId);
    const markByStudent = new Map(marks.map((m) => [m.studentId, m.status]));

    return memberships.map((m) => ({
      studentId: m.studentId,
      status: markByStudent.get(m.studentId) ?? null,
    }));
  }

  /**
   * Whole-sheet bulk attendance write (`PUT /staff/sessions/:sessionId/attendance`).
   * One transaction, one audit row (`attendance.marked`) carrying the counts.
   * Rejects any studentId not in the session's group.
   */
  async markAttendance(
    sessionId: string,
    actor: StaffActor,
    entries: AttendanceEntryDto[],
  ): Promise<{ recorded: true }> {
    return this.db.runInTransaction(async () => {
      const existing = await this.sessionRepo.findById(sessionId);
      if (!existing) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }
      if (!(await this.scope.mayReachGroup(existing.groupId, actor))) {
        throw new NotFoundException(LIVE_SESSION_NOT_FOUND);
      }

      const memberships = await this.groupRepo.findMembers(existing.groupId);
      const validStudentIds = new Set(memberships.map((m) => m.studentId));

      for (const entry of entries) {
        if (!validStudentIds.has(entry.studentId)) {
          throw new BadRequestException(
            `Student "${entry.studentId}" is not a member of group "${existing.groupId}"`,
          );
        }
      }

      const beforeMarks = await this.attendanceRepo.findBySession(sessionId);
      const before = {
        present: beforeMarks.filter((m) => m.status === 'present').length,
        absent: beforeMarks.filter((m) => m.status === 'absent').length,
        late: beforeMarks.filter((m) => m.status === 'late').length,
        total: beforeMarks.length,
      };

      const markedAt = new Date().toISOString();
      for (const entry of entries) {
        await this.attendanceRepo.upsert({
          sessionId,
          studentId: entry.studentId,
          status: entry.status,
          markedBy: actor.id,
          markedAt,
        });
      }

      const afterMarks = await this.attendanceRepo.findBySession(sessionId);
      const after = {
        present: afterMarks.filter((m) => m.status === 'present').length,
        absent: afterMarks.filter((m) => m.status === 'absent').length,
        late: afterMarks.filter((m) => m.status === 'late').length,
        total: afterMarks.length,
      };

      const group = await this.groupRepo.findById(existing.groupId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'attendance.marked',
        targetType: 'attendance',
        targetId: sessionId,
        courseId: group?.courseId ?? null,
        before,
        after,
      });

      return { recorded: true };
    });
  }
}
