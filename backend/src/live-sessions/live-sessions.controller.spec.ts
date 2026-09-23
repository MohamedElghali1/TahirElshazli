import { Test, TestingModule } from '@nestjs/testing';
import { LiveSessionsController } from './live-sessions.controller.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from './repositories/in-memory-live-session.repository.js';
import { ATTENDANCE_REPOSITORY } from './interfaces/attendance-repository.interface.js';
import { InMemoryAttendanceRepository } from './repositories/in-memory-attendance.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('LiveSessionsController', () => {
  let controller: LiveSessionsController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveSessionsController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        LiveSessionsService,
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: ATTENDANCE_REPOSITORY, useClass: InMemoryAttendanceRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LiveSessionsController>(LiveSessionsController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should split sessions into upcoming and past against the stored time', async () => {
    const { upcoming, past } = await controller.listSessions('course-1', STUDENT);
    expect(upcoming.map((s) => s.id)).toEqual(['sess-2', 'sess-3']);
    expect(past.map((s) => s.id)).toEqual(['sess-1']);
    expect(past[0].attended).toBe(true);
  });

  it('should return the next session with a real timestamp and Zoom link', async () => {
    const next = await controller.getNextSession('course-1', STUDENT);
    expect(next).toMatchObject({
      id: 'sess-2',
      scheduledAt: '2026-08-27T18:00:00Z',
    });
    expect(next?.meetingLink).toMatch(/^https:\/\/zoom\.us\//);
  });

  it('should treat a session as upcoming until it has actually ended', async () => {
    // 18:30 - half way through the 90-minute session starting at 18:00.
    vi.setSystemTime(new Date('2026-08-27T18:30:00Z'));
    const next = await controller.getNextSession('course-1', STUDENT);
    expect(next?.id).toBe('sess-2');

    // 19:31 - the session has ended, so the banner moves on.
    vi.setSystemTime(new Date('2026-08-27T19:31:00Z'));
    expect((await controller.getNextSession('course-1', STUDENT))?.id).toBe('sess-3');
  });

  it('should return null when a course has no future sessions', async () => {
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    expect(await controller.getNextSession('course-1', STUDENT)).toBeNull();
  });

  describe('course-scoped authorization', () => {
    // student-2 is enrolled in course-1 only, so course-2 Zoom links are private.
    const OTHER_STUDENT = {
      user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
    };

    it('does not hand Zoom links to a non-enrolled student', async () => {
      await expect(
        controller.listSessions('course-2', OTHER_STUDENT),
      ).rejects.toThrow();
    });

    it('does not reveal the next session to a non-enrolled student', async () => {
      await expect(
        controller.getNextSession('course-2', OTHER_STUDENT),
      ).rejects.toThrow();
    });
  });
});
