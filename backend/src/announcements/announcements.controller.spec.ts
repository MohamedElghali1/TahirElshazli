import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StaffAnnouncementsController } from './staff-announcements.controller.js';
import { AdminAnnouncementsController } from './admin-announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { ANNOUNCEMENT_REPOSITORY } from './interfaces/announcement-repository.interface.js';
import { InMemoryAnnouncementRepository } from './repositories/in-memory-announcement.repository.js';
import {
  encodeAudience,
  parseAudience,
  AUDIENCE_PATTERN,
} from './announcement-audience.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { COURSE_STAFF_REPOSITORY } from '../staff/interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from '../staff/repositories/in-memory-course-staff.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { NOTIFICATION_REPOSITORY } from '../notifications/interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from '../notifications/repositories/in-memory-notification.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../auth/roles.enum.js';
import type { PostCourseAnnouncementDto } from './dto/post-announcement.dto.js';

/** `assistant-1` holds course-1 and not course-2; `assistant-2` holds neither. */
const ASSIGNED_TA = {
  user: { sub: 'assistant-1', email: 'a1@example.com', role: 'assistant', jti: 'j1' },
};
const UNASSIGNED_TA = {
  user: { sub: 'assistant-2', email: 'a2@example.com', role: 'assistant', jti: 'j2' },
};
const ADMIN = {
  user: { sub: 'teacher-1', email: 't@example.com', role: 'teacher', jti: 'j3' },
};

const MESSAGE = { title: 'Class moved', body: 'Sunday moves to 19:00.' };

describe('Announcements', () => {
  let staff: StaffAnnouncementsController;
  let admin: AdminAnnouncementsController;
  let audit: AuditService;
  let notifications: NotificationsService;
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffAnnouncementsController, AdminAnnouncementsController],
      providers: [
        AnnouncementsService,
        StaffScopeService,
        NotificationsService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ANNOUNCEMENT_REPOSITORY, useClass: InMemoryAnnouncementRepository },
        { provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: NOTIFICATION_REPOSITORY, useClass: InMemoryNotificationRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    staff = module.get(StaffAnnouncementsController);
    admin = module.get(AdminAnnouncementsController);
    audit = module.get(AuditService);
    notifications = module.get(NotificationsService);
    users = module.get(USER_REPOSITORY);
  });

  describe('the audience codec', () => {
    it('round-trips every shape CLAUDE.md §6.1 names', () => {
      for (const raw of ['all_students', 'all_tas', 'course:course-1']) {
        const parsed = parseAudience(raw);
        expect(parsed).not.toBeNull();
        expect(encodeAudience(parsed!)).toBe(raw);
      }
    });

    it('rejects a malformed audience rather than coercing it', () => {
      // A half-understood audience is a message delivered to the wrong people.
      for (const raw of ['', 'course:', 'course', 'all', 'course:a b', 'ALL_TAS']) {
        expect(parseAudience(raw)).toBeNull();
      }
    });

    it('keeps the DTO pattern and the parser in step', () => {
      // They are written from the same parts; this is the assertion that they
      // have not drifted into accepting different strings.
      for (const raw of ['all_students', 'all_tas', 'course:course-1']) {
        expect(AUDIENCE_PATTERN.test(raw)).toBe(true);
      }
      for (const raw of ['course:', 'nonsense', 'course:bad id']) {
        expect(AUDIENCE_PATTERN.test(raw)).toBe(parseAudience(raw) !== null);
      }
    });
  });

  describe('POST /staff/courses/:id/announcements', () => {
    it('lets an assigned assistant post to their own course (§2.2)', async () => {
      const posted = await staff.post('course-1', MESSAGE, ASSIGNED_TA);
      expect(posted).toMatchObject({
        audience: 'course:course-1',
        audienceType: 'course',
        courseId: 'course-1',
        postedBy: 'assistant-1',
        title: 'Class moved',
      });
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(staff.post('course-2', MESSAGE, ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives the same answer for a held-but-wrong course and a nonexistent one', async () => {
      const wrong = await staff
        .post('course-2', MESSAGE, ASSIGNED_TA)
        .catch((e) => e.message);
      const missing = await staff
        .post('course-does-not-exist', MESSAGE, ASSIGNED_TA)
        .catch((e) => e.message);
      expect(wrong).toBe(missing);
    });

    it('lets the teacher post to any course through the same route', async () => {
      await expect(staff.post('course-2', MESSAGE, ADMIN)).resolves.toMatchObject({
        audience: 'course:course-2',
        postedBy: 'teacher-1',
      });
    });

    it('takes the audience from the URL, so a TA cannot widen it from the body', async () => {
      // The DTO has no `audience` field at all and the global pipe whitelists,
      // so this property never reaches the service. Asserted anyway: it is the
      // difference between a scoped write and a platform-wide one.
      const smuggled = {
        ...MESSAGE,
        audience: 'all_students',
      } as unknown as PostCourseAnnouncementDto;
      const posted = await staff.post('course-1', smuggled, ASSIGNED_TA);
      expect(posted.audience).toBe('course:course-1');
    });
  });

  describe('the audience is resolved at send time (§5.14)', () => {
    it('delivers a course announcement to that course’s enrolled students only', async () => {
      await staff.post('course-1', MESSAGE, ASSIGNED_TA);

      // course-1 holds student-1 and student-2; course-2 holds student-1.
      const one = await notifications.list('student-1', false);
      const two = await notifications.list('student-2', false);
      expect(
        one.notifications.filter((n) => n.type === 'announcement'),
      ).toHaveLength(1);
      expect(
        two.notifications.filter((n) => n.type === 'announcement'),
      ).toHaveLength(1);
      // The link is a page route, not an API route.
      expect(
        one.notifications.find((n) => n.type === 'announcement')?.link,
      ).toBe('/learn/course-1');
    });

    it('carries the whole body, since there is no detail page to click through to', async () => {
      await staff.post('course-1', MESSAGE, ASSIGNED_TA);
      const feed = await notifications.list('student-1', false);
      expect(feed.notifications.find((n) => n.type === 'announcement')).toMatchObject(
        { title: 'Class moved', message: 'Sunday moves to 19:00.', read: false },
      );
    });

    it('reaches an assistant hired after the announcement was drafted', async () => {
      // The §5.14 requirement in one test: `all_tas` resolves from
      // role = 'assistant' at the moment of sending, so a frozen recipient list
      // captured earlier would miss this account.
      const newHire = await users.create({
        email: 'assistant3@example.com',
        passwordHash: 'hash',
        name: 'Late Arrival',
        role: Role.Assistant,
      });

      const posted = await admin.post(
        { ...MESSAGE, audience: 'all_tas' },
        ADMIN,
      );
      // Four: assistant-1, assistant-2, the late hire - and admin-1. `all_tas`
      // is the staff broadcast channel and there is no other route to staff, so
      // it includes the Full admin (AUTH-1, unit-1 ruling 3). Was 3 before the
      // `admin` role existed.
      expect(posted.recipientCount).toBe(4);

      const feed = await notifications.list(newHire.id, false);
      expect(feed.notifications).toHaveLength(1);
      // No page shows a platform-wide announcement, so null rather than a link
      // that 404s.
      expect(feed.notifications[0]?.link).toBeNull();
    });

    it('sends all_students to every student and to no assistant', async () => {
      const posted = await admin.post(
        { ...MESSAGE, audience: 'all_students' },
        ADMIN,
      );
      expect(posted.recipientCount).toBe(2);
      expect((await notifications.list('assistant-1', false)).notifications).toEqual(
        [],
      );
      expect(
        (await notifications.list('student-2', false)).unreadCount,
      ).toBeGreaterThan(0);
    });

    it('does not store a recipient list, only how many there were', async () => {
      const posted = await admin.post(
        { ...MESSAGE, audience: 'all_students' },
        ADMIN,
      );
      expect(Object.keys(posted)).not.toContain('recipientIds');
      expect(JSON.stringify(posted)).not.toContain('student-1');
      expect(posted.recipientCount).toBe(2);
    });

    it('404s a course audience naming a course that does not exist', async () => {
      await expect(
        admin.post({ ...MESSAGE, audience: 'course:nope' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('the audit trail (§5.4)', () => {
    it('records the assistant, the course and the reach', async () => {
      const posted = await staff.post('course-1', MESSAGE, ASSIGNED_TA);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'announcement.posted');
      expect(entry).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetType: 'announcement',
        targetId: posted.id,
        courseId: 'course-1',
      });
      expect(entry?.before).toBeNull();
      expect(entry?.after).toMatchObject({
        audience: 'course:course-1',
        recipientCount: 2,
      });
    });

    it('records the teacher as teacher, not as an assistant', async () => {
      await admin.post({ ...MESSAGE, audience: 'all_tas' }, ADMIN);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'announcement.posted');
      expect(entry?.actorRole).toBe('teacher');
      // Platform-wide, so it belongs to no course.
      expect(entry?.courseId).toBeNull();
    });
  });

  describe('reading them back', () => {
    it('scopes the course list the same way the write is scoped', async () => {
      await staff.post('course-1', MESSAGE, ASSIGNED_TA);
      const mine = await staff.list('course-1', {}, ASSIGNED_TA);
      expect(mine).toHaveLength(1);
      await expect(staff.list('course-2', {}, ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(staff.list('course-1', {}, UNASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('keeps a course list to that course', async () => {
      await staff.post('course-1', MESSAGE, ADMIN);
      await staff.post('course-2', MESSAGE, ADMIN);
      await admin.post({ ...MESSAGE, audience: 'all_students' }, ADMIN);

      const courseOne = await staff.list('course-1', {}, ADMIN);
      expect(courseOne).toHaveLength(1);
      expect(courseOne[0]?.courseId).toBe('course-1');

      // The admin history spans every audience, including the platform-wide one.
      const all = await admin.list({});
      expect(all).toHaveLength(3);
      expect(all.map((a) => a.audience)).toContain('all_students');
    });

    it('returns newest first and pages by offset', async () => {
      for (const title of ['first', 'second', 'third']) {
        await admin.post({ title, body: 'x', audience: 'all_tas' }, ADMIN);
      }
      const page = await admin.list({ limit: 2, offset: 0 });
      expect(page).toHaveLength(2);
      const next = await admin.list({ limit: 2, offset: 2 });
      expect(next).toHaveLength(1);
      expect([...page, ...next].map((a) => a.title)).toEqual([
        'third',
        'second',
        'first',
      ]);
    });
  });
});
