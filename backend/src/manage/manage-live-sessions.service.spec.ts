import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ManageLiveSessionsService,
  LIVE_SESSION_NOT_FOUND,
  GROUP_NOT_FOUND,
} from './manage-live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { ATTENDANCE_REPOSITORY } from '../live-sessions/interfaces/attendance-repository.interface.js';
import { InMemoryAttendanceRepository } from '../live-sessions/repositories/in-memory-attendance.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';

/** assistant-1 holds group-1 (course-1); assistant-2 holds nothing. */
const TA_GROUP1 = { id: 'assistant-1', role: 'assistant' };
const UNCONFIGURED_TA = { id: 'assistant-9', role: 'assistant' };
const TEACHER = { id: 'teacher-1', role: 'teacher' };

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundException);
    return (error as NotFoundException).message;
  }
  throw new Error('expected a rejection');
}

describe('ManageLiveSessionsService (unit 8, S3)', () => {
  let service: ManageLiveSessionsService;
  let audit: AuditService;
  let attendanceRepo: InMemoryAttendanceRepository;
  let groupRepo: InMemoryGroupRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManageLiveSessionsService,
        StaffScopeService,
        AuditService,
        { provide: DATABASE_POOL, useValue: null },
        DatabaseService,
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: ATTENDANCE_REPOSITORY, useClass: InMemoryAttendanceRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(ManageLiveSessionsService);
    audit = module.get(AuditService);
    attendanceRepo = module.get(ATTENDANCE_REPOSITORY);
    groupRepo = module.get(GROUP_REPOSITORY);
  });

  describe('publish idempotence (SESS-4)', () => {
    it('promotes a planned session to published and writes audit', async () => {
      const created = await service.create('group-1', TEACHER, {
        title: 'Draft session',
        scheduledAt: '2026-11-01T10:00:00Z',
        endsAt: '2026-11-01T11:30:00Z',
        state: 'planned',
      });
      expect(created.state).toBe('planned');

      const published = await service.publish(created.id, TEACHER);
      expect(published.state).toBe('published');

      const log = await audit.find({ limit: 10, action: 'session.published' });
      expect(log.entries).toHaveLength(1);
      expect(log.entries[0]).toMatchObject({
        targetId: created.id,
        before: { state: 'planned' },
        after: { state: 'published' },
      });
    });

    it('is an idempotent 200 no-op when already published and writes no second audit row', async () => {
      const created = await service.create('group-1', TEACHER, {
        title: 'Already published',
        scheduledAt: '2026-11-02T10:00:00Z',
        endsAt: '2026-11-02T11:30:00Z',
        state: 'published',
      });

      const res = await service.publish(created.id, TEACHER);
      expect(res.state).toBe('published');

      // No session.published audit row written for a session that was already published
      const log = await audit.find({ limit: 10, action: 'session.published' });
      expect(log.entries).toHaveLength(0);
    });
  });

  describe('attendance sheet (SESS-3)', () => {
    it('lists every group member, with unmarked members as null and never absent', async () => {
      // In-memory group-1 has members from stub
      const members = await groupRepo.findMembers('group-1');
      expect(members.length).toBeGreaterThan(0);

      const created = await service.create('group-1', TEACHER, {
        title: 'Session for attendance',
        scheduledAt: '2026-11-03T10:00:00Z',
        endsAt: '2026-11-03T11:30:00Z',
      });

      // Initially unmarked
      const sheet = await service.getAttendanceSheet(created.id, TEACHER);
      expect(sheet).toHaveLength(members.length);
      for (const row of sheet) {
        expect(row.status).toBeNull(); // Must be null, never absent
      }

      // Mark one student present and one student late
      const student1 = members[0]!.studentId;
      await attendanceRepo.upsert({
        sessionId: created.id,
        studentId: student1,
        status: 'present',
        markedBy: TEACHER.id,
        markedAt: new Date().toISOString(),
      });

      const sheetAfter = await service.getAttendanceSheet(created.id, TEACHER);
      const row1 = sheetAfter.find((r) => r.studentId === student1);
      expect(row1?.status).toBe('present');

      // Other members remain null
      const unmarked = sheetAfter.filter((r) => r.studentId !== student1);
      for (const row of unmarked) {
        expect(row.status).toBeNull();
      }
    });
  });

  describe('date-window filter (SESS-5)', () => {
    it('filters sessions falling within the [from, to] range', async () => {
      // Stub sessions in memory:
      // sess-1: 2026-08-20 (group-1)
      // sess-2: 2026-08-27 (group-1)
      // sess-3: 2026-09-03 (group-1)
      // sess-4: 2026-08-29 (group-2)
      // sess-5: 2026-08-15 (group-2)
      // sess-6: 2026-08-08 (group-2)

      // Query only group-1 sessions between 2026-08-18 and 2026-08-28
      const sessions = await service.list(TEACHER, {
        from: '2026-08-18T00:00:00Z',
        to: '2026-08-28T23:59:59Z',
        groupId: 'group-1',
      });

      const ids = sessions.map((s) => s.id);
      expect(ids).toContain('sess-1'); // 2026-08-20
      expect(ids).toContain('sess-2'); // 2026-08-27
      expect(ids).not.toContain('sess-3'); // 2026-09-03 (after to)
      expect(ids).not.toContain('sess-5'); // group-2
    });

    it('rejects inverted date ranges with BadRequestException', async () => {
      await expect(
        service.list(TEACHER, {
          from: '2026-09-01T00:00:00Z',
          to: '2026-08-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulk attendance write (SESS-3)', () => {
    it('rejects a studentId that is not a member of the session group', async () => {
      const created = await service.create('group-1', TEACHER, {
        title: 'Group 1 Session',
        scheduledAt: '2026-11-04T10:00:00Z',
        endsAt: '2026-11-04T11:30:00Z',
      });

      await expect(
        service.markAttendance(created.id, TEACHER, [
          { studentId: 'nonexistent-student', status: 'present' },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes marks in one transaction and logs one attendance.marked audit row with counts', async () => {
      const members = await groupRepo.findMembers('group-1');
      expect(members.length).toBeGreaterThanOrEqual(2);

      const created = await service.create('group-1', TEACHER, {
        title: 'Session to mark',
        scheduledAt: '2026-11-05T10:00:00Z',
        endsAt: '2026-11-05T11:30:00Z',
      });

      const s1 = members[0]!.studentId;
      const s2 = members[1]!.studentId;

      const res = await service.markAttendance(created.id, TEACHER, [
        { studentId: s1, status: 'present' },
        { studentId: s2, status: 'late' },
      ]);
      expect(res).toEqual({ recorded: true });

      const marks = await attendanceRepo.findBySession(created.id);
      expect(marks.find((m) => m.studentId === s1)?.status).toBe('present');
      expect(marks.find((m) => m.studentId === s2)?.status).toBe('late');

      const log = await audit.find({ limit: 10, action: 'attendance.marked' });
      expect(log.entries).toHaveLength(1);
      expect(log.entries[0]).toMatchObject({
        targetType: 'attendance',
        targetId: created.id,
        before: { present: 0, absent: 0, late: 0, total: 0 },
        after: { present: 1, absent: 0, late: 1, total: 2 },
      });
    });
  });

  describe('authorization & anti-enumeration (D-6)', () => {
    it('returns byte-identical 404 for nonexistent vs out-of-scope session', async () => {
      // sess-4 belongs to group-2; TA_GROUP1 only holds group-1
      const genuineMiss = await messageOf(service.publish('sess-nonexistent', TEACHER));
      const outOfScope = await messageOf(service.publish('sess-4', TA_GROUP1));

      expect(outOfScope).toBe(LIVE_SESSION_NOT_FOUND);
      expect(outOfScope).toBe(genuineMiss);
    });

    it('returns byte-identical 404 on attendance sheet for out-of-scope session', async () => {
      const genuineMiss = await messageOf(service.getAttendanceSheet('sess-nonexistent', TEACHER));
      const outOfScope = await messageOf(service.getAttendanceSheet('sess-4', TA_GROUP1));

      expect(outOfScope).toBe(LIVE_SESSION_NOT_FOUND);
      expect(outOfScope).toBe(genuineMiss);
    });

    it('returns byte-identical 404 on mark attendance for out-of-scope session', async () => {
      const genuineMiss = await messageOf(service.markAttendance('sess-nonexistent', TEACHER, []));
      const outOfScope = await messageOf(service.markAttendance('sess-4', TA_GROUP1, []));

      expect(outOfScope).toBe(LIVE_SESSION_NOT_FOUND);
      expect(outOfScope).toBe(genuineMiss);
    });

    it('returns byte-identical 404 on scheduling into unheld group vs nonexistent group', async () => {
      const input = {
        title: 'New Session',
        scheduledAt: '2026-11-06T10:00:00Z',
        endsAt: '2026-11-06T11:30:00Z',
      };
      const genuineMiss = await messageOf(service.create('group-nonexistent', TEACHER, input));
      const outOfScope = await messageOf(service.create('group-2', TA_GROUP1, input));

      expect(outOfScope).toBe(GROUP_NOT_FOUND);
      expect(outOfScope).toBe(genuineMiss);
    });

    it('refuses unconfigured assistant (empty scope row)', async () => {
      const input = {
        title: 'New Session',
        scheduledAt: '2026-11-06T10:00:00Z',
        endsAt: '2026-11-06T11:30:00Z',
      };
      await expect(service.create('group-1', UNCONFIGURED_TA, input)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
