import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StudentSessionsService } from './student-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from './repositories/in-memory-live-session.repository.js';
import { ATTENDANCE_REPOSITORY } from './interfaces/attendance-repository.interface.js';
import { InMemoryAttendanceRepository } from './repositories/in-memory-attendance.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';

/**
 * `student-1` sits in group-1 (course-1) and group-2 (course-2)
 * (`InMemoryGroupRepository`'s seed). `student-3` sits in no group.
 */
const STUDENT = 'student-1';
const STUDENT_NO_GROUPS = 'student-3';

describe('StudentSessionsService (unit 8, S4)', () => {
  let service: StudentSessionsService;
  let sessionRepo: InMemoryLiveSessionRepository;
  let attendanceRepo: InMemoryAttendanceRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentSessionsService,
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: ATTENDANCE_REPOSITORY, useClass: InMemoryAttendanceRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
      ],
    }).compile();

    service = module.get(StudentSessionsService);
    sessionRepo = module.get(LIVE_SESSION_REPOSITORY);
    attendanceRepo = module.get(ATTENDANCE_REPOSITORY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getTimetable', () => {
    it('returns [] for a student in no groups, not a 404 or a crash', async () => {
      const result = await service.getTimetable(STUDENT_NO_GROUPS, {
        from: '2026-01-01T00:00:00Z',
        to: '2027-01-01T00:00:00Z',
      });
      expect(result).toEqual([]);
    });

    it('rejects a from after to', async () => {
      await expect(
        service.getTimetable(STUDENT, { from: '2026-09-03T00:00:00Z', to: '2026-09-01T00:00:00Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never leaks privateNotes, by name, even when set on the row', async () => {
      const created = await sessionRepo.create({
        groupId: 'group-1',
        title: 'Confidential prep',
        meetingLink: null,
        scheduledAt: '2026-09-10T18:00:00Z',
        endsAt: '2026-09-10T19:30:00Z',
        assistantId: null,
        description: 'public description',
        privateNotes: 'Do not mention the surprise quiz',
        isVisible: true,
        state: 'published',
      });

      const result = await service.getTimetable(STUDENT, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-30T00:00:00Z',
      });
      const view = result.find((s) => s.id === created.id);
      expect(view).toBeDefined();
      expect('privateNotes' in (view as object)).toBe(false);
      expect('assistantId' in (view as object)).toBe(false);
      expect(JSON.stringify(view)).not.toContain('surprise quiz');
    });

    it('excludes a planned (draft) session from the student timetable', async () => {
      const draft = await sessionRepo.create({
        groupId: 'group-1',
        title: 'Unpublished draft date',
        meetingLink: null,
        scheduledAt: '2026-09-11T18:00:00Z',
        endsAt: '2026-09-11T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'planned',
      });

      const result = await service.getTimetable(STUDENT, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-30T00:00:00Z',
      });
      expect(result.find((s) => s.id === draft.id)).toBeUndefined();
    });

    it('excludes an isVisible: false session from the student timetable', async () => {
      const hidden = await sessionRepo.create({
        groupId: 'group-1',
        title: 'Deliberately hidden',
        meetingLink: null,
        scheduledAt: '2026-09-12T18:00:00Z',
        endsAt: '2026-09-12T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: false,
        state: 'published',
      });

      const result = await service.getTimetable(STUDENT, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-30T00:00:00Z',
      });
      expect(result.find((s) => s.id === hidden.id)).toBeUndefined();
    });

    describe('T-30: the meeting link is absent, not null, until 30 minutes before scheduledAt', () => {
      const SCHEDULED_AT = '2026-09-20T18:00:00Z';
      const ENDS_AT = '2026-09-20T19:30:00Z';
      let sessionId: string;

      beforeEach(async () => {
        const created = await sessionRepo.create({
          groupId: 'group-1',
          title: 'T-30 probe',
          meetingLink: 'https://zoom.us/j/55566677788',
          scheduledAt: SCHEDULED_AT,
          endsAt: ENDS_AT,
          assistantId: null,
          description: null,
          privateNotes: null,
          isVisible: true,
          state: 'published',
        });
        sessionId = created.id;
      });

      it('T-31: the key is absent from the response, not null', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-20T17:29:00Z')); // 31 minutes before

        const result = await service.getTimetable(STUDENT, {
          from: '2026-09-01T00:00:00Z',
          to: '2026-09-30T00:00:00Z',
        });
        const view = result.find((s) => s.id === sessionId);
        expect(view).toBeDefined();
        // The rule under test: `toBeNull()` would pass against a `null` value
        // and prove nothing. `in` is the assertion that actually distinguishes
        // "absent" from "present but null".
        expect('meetingLink' in (view as object)).toBe(false);
      });

      it('T-29: the key is present and correct', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-20T17:31:00Z')); // 29 minutes before

        const result = await service.getTimetable(STUDENT, {
          from: '2026-09-01T00:00:00Z',
          to: '2026-09-30T00:00:00Z',
        });
        const view = result.find((s) => s.id === sessionId);
        expect(view).toBeDefined();
        expect('meetingLink' in (view as object)).toBe(true);
        expect(view?.meetingLink).toBe('https://zoom.us/j/55566677788');
      });

      it('stays present up to endsAt, and disappears again after it', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(ENDS_AT)); // exactly at endsAt
        let result = await service.getTimetable(STUDENT, {
          from: '2026-09-01T00:00:00Z',
          to: '2026-09-30T00:00:00Z',
        });
        expect(
          'meetingLink' in (result.find((s) => s.id === sessionId) as object),
        ).toBe(true);

        vi.setSystemTime(new Date('2026-09-20T19:31:00Z')); // one minute after endsAt
        result = await service.getTimetable(STUDENT, {
          from: '2026-09-01T00:00:00Z',
          to: '2026-09-30T00:00:00Z',
        });
        expect(
          'meetingLink' in (result.find((s) => s.id === sessionId) as object),
        ).toBe(false);
      });
    });
  });

  describe('getAttendance', () => {
    it('returns the zero shape for a student in no groups', async () => {
      const result = await service.getAttendance(STUDENT_NO_GROUPS);
      expect(result).toEqual({
        present: 0,
        late: 0,
        absent: 0,
        expected: 0,
        percentage: 0,
        history: [],
      });
    });

    it('counts late as neither present nor absent, and computes percentage over expected', async () => {
      // Freeze "now" well after every seed session has ended, so the expected
      // set is exactly the six seed sessions across student-1's two groups -
      // deterministic regardless of the real wall clock on the day this runs.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));

      // sess-6 (group-2, ended, published) carries 'absent' in the seed.
      // Overwrite it to 'late' so this test owns the row it asserts on.
      await attendanceRepo.upsert({
        sessionId: 'sess-6',
        studentId: STUDENT,
        status: 'late',
        markedBy: 'teacher-1',
        markedAt: '2026-08-08T16:05:00Z',
      });

      const result = await service.getAttendance(STUDENT);

      // student-1's ended, published sessions: sess-1/2/3 (group-1) and
      // sess-4/5/6 (group-2) - all six, since "now" is set after every one of
      // them. Marks: sess-1 present, sess-5 present, sess-6 late (above);
      // sess-2, sess-3, sess-4 are unmarked. A `late` mark must land in
      // neither `present` nor `absent`, and unmarked sessions must inflate
      // neither - only `expected`.
      expect(result.expected).toBe(6);
      expect(result.present).toBe(2);
      expect(result.late).toBe(1);
      expect(result.absent).toBe(0);
      expect(result.percentage).toBe(Math.round((2 / 6) * 100));

      const lateRow = result.history.find((h) => h.sessionId === 'sess-6');
      expect(lateRow?.status).toBe('late');
      const unmarked = result.history.filter((h) => h.status === null);
      expect(unmarked.map((h) => h.sessionId).sort()).toEqual(['sess-2', 'sess-3', 'sess-4']);
    });

    it('lists an ended, unmarked session as status null, never absent', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));

      const created = await sessionRepo.create({
        groupId: 'group-1',
        title: 'Ended, never marked',
        meetingLink: null,
        scheduledAt: '2026-09-25T18:00:00Z',
        endsAt: '2026-09-25T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });

      const result = await service.getAttendance(STUDENT);
      const row = result.history.find((h) => h.sessionId === created.id);
      expect(row?.status).toBeNull();
      // Unmarked does not add to present, late or absent - only to expected.
      const marked = result.present + result.late + result.absent;
      expect(marked).toBeLessThan(result.expected);
    });

    it('never expects a planned session', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));

      await sessionRepo.create({
        groupId: 'group-1',
        title: 'Draft, would have ended by now',
        meetingLink: null,
        scheduledAt: '2026-09-25T18:00:00Z',
        endsAt: '2026-09-25T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'planned',
      });

      const before = await service.getAttendance(STUDENT);
      // A planned session, however far in the past its timestamp, is never
      // "expected" - only published sessions count (`PHASE_PLAN.md` §3.3).
      expect(before.history.some((h) => h.title === 'Draft, would have ended by now')).toBe(
        false,
      );
    });
  });
});
