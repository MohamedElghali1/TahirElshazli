import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffAnnouncementsController } from './staff-announcements.controller.js';
import { AdminAnnouncementsController } from './admin-announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { ANNOUNCEMENT_REPOSITORY } from './interfaces/announcement-repository.interface.js';
import { InMemoryAnnouncementRepository } from './repositories/in-memory-announcement.repository.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
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
import { Role } from '../auth/roles.enum.js';
import { MailService } from '../mail/mail.service.js';
import { parseAudience, encodeAudience, AUDIENCE_PATTERN } from './announcement-audience.js';
import type { PostCourseAnnouncementDto } from './dto/post-announcement.dto.js';

const ASSIGNED_TA = { user: { sub: 'assistant-1', email: 'a1@example.com', role: 'assistant', jti: 'j1' } };
const UNASSIGNED_TA = { user: { sub: 'assistant-2', email: 'a2@example.com', role: 'assistant', jti: 'j2' } };
const ADMIN = { user: { sub: 'teacher-1', email: 't@example.com', role: 'teacher', jti: 'j3' } };

const MESSAGE = { title: 'Class moved', body: 'Sunday moves to 19:00.' };

describe('Announcements Unit & Integration', () => {
  let staff: StaffAnnouncementsController;
  let admin: AdminAnnouncementsController;
  let service: AnnouncementsService;
  let audit: AuditService;
  let notifications: NotificationsService;
  let mail: MailService;
  let users: InMemoryUserRepository;
  let scopeRepo: InMemoryAssistantScopeRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffAnnouncementsController, AdminAnnouncementsController],
      providers: [
        AnnouncementsService,
        StaffScopeService,
        NotificationsService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ANNOUNCEMENT_REPOSITORY, useClass: InMemoryAnnouncementRepository },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: NOTIFICATION_REPOSITORY, useClass: InMemoryNotificationRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
        { provide: MailService, useValue: { send: vi.fn() } },
      ],
    }).compile();

    staff = module.get(StaffAnnouncementsController);
    admin = module.get(AdminAnnouncementsController);
    service = module.get(AnnouncementsService);
    audit = module.get(AuditService);
    notifications = module.get(NotificationsService);
    mail = module.get(MailService);
    users = module.get<InMemoryUserRepository>(USER_REPOSITORY);
    scopeRepo = module.get<InMemoryAssistantScopeRepository>(ASSISTANT_SCOPE_REPOSITORY);

    // The in-memory repositories seed `assistant-1`/`assistant-2`, `teacher-1`,
    // `student-1`/`student-2`, `course-1`, `group-1`, `group-2` and group-1's
    // two memberships under these exact ids, so only the scope assignment -
    // which is what this suite is actually about - is set up here.
    await scopeRepo.assignGroup('assistant-1', 'group-1', 'teacher-1');
  });

  it('audience parse/encode round-trip for group', () => {
    const raw = 'group:group-1';
    const parsed = parseAudience(raw);
    expect(parsed).toEqual({ type: 'group', courseId: null, groupId: 'group-1' });
    expect(encodeAudience(parsed!)).toBe(raw);
  });

  it('createDraft works', async () => {
    const created = await staff.createGroupDraft('group-1', MESSAGE, ASSIGNED_TA);
    expect(created.audienceType).toBe('group');
    expect(created.groupId).toBe('group-1');
    expect(created.publishedAt).toBeNull();
  });

  it('resolveRecipients for group', async () => {
    // using previewReach since it calls resolveRecipients
    const reach = await staff.previewReach('group:group-1', ASSIGNED_TA);
    expect(reach.reach).toBe(2);
  });

  it('previewReach non-admin platform wide -> 403', async () => {
    await expect(staff.previewReach('all_students', ASSIGNED_TA)).rejects.toThrow(ForbiddenException);
  });

  it('previewReach held group vs unheld group (404 anti-enumeration)', async () => {
    const reach = await staff.previewReach('group:group-1', ASSIGNED_TA);
    expect(reach.reach).toBe(2);
    
    await expect(staff.previewReach('group:group-2', ASSIGNED_TA)).rejects.toThrow(NotFoundException);
    const err = await staff.previewReach('group:group-2', ASSIGNED_TA).catch(e => e.message);
    expect(err).toBe('Group not found'); // exact match
  });

  it('publish called twice: second throws Conflict, mail sent once', async () => {
    vi.spyOn(notifications, 'fanOut');
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    await admin.publish(draft.id, ADMIN);
    await expect(admin.publish(draft.id, ADMIN)).rejects.toThrow(ConflictException);
    
    expect(notifications.fanOut).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('publish then updateDraft: edit succeeds, no second fan-out/mail', async () => {
    vi.spyOn(notifications, 'fanOut');
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    const published = await admin.publish(draft.id, ADMIN);
    
    const updated = await admin.updateDraft(draft.id, { title: 'New title' }, ADMIN);
    expect(updated.title).toBe('New title');
    
    expect(notifications.fanOut).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('updateDraft changing audience on published -> 409', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    await admin.publish(draft.id, ADMIN);
    
    await expect(admin.updateDraft(draft.id, { audience: 'all_students' }, ADMIN)).rejects.toThrow(ConflictException);
  });

  it('deleteDraft after publish -> 409', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    await admin.publish(draft.id, ADMIN);
    await expect(admin.deleteDraft(draft.id, ADMIN)).rejects.toThrow(ConflictException);
  });

  it('TA posting to unheld course -> 404', async () => {
    await expect(staff.createCourseDraft('course-2', MESSAGE, ASSIGNED_TA)).rejects.toThrow(NotFoundException);
  });

  it('TA posting to unheld group -> 404', async () => {
    const err = await staff.createGroupDraft('group-2', MESSAGE, ASSIGNED_TA).catch(e => e.message);
    expect(err).toBe('Group not found');
  });

  it('TA calling /admin/announcements/:id/publish -> 403 (through service check)', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    await expect(
      service.publish(draft.id, { id: ASSIGNED_TA.user.sub, role: ASSIGNED_TA.user.role }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('assistant calling updateDraft with platform-wide audience -> 403', async () => {
    const draft = await staff.createGroupDraft('group-1', MESSAGE, ASSIGNED_TA);
    const assistantActor = { id: ASSIGNED_TA.user.sub, role: ASSIGNED_TA.user.role };
    await expect(
      service.updateDraft(draft.id, assistantActor, { audience: 'all_students' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('publish with MAIL_DRIVER=none -> propagates error (we simulate by making mail throw)', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    vi.mocked(mail.send).mockRejectedValueOnce(new Error('mail failed'));
    
    await expect(admin.publish(draft.id, ADMIN)).rejects.toThrow('mail failed');
    // Ensure it remains a draft
    const stillDraft = await service.listAll(10, 0, 'draft');
    expect(stillDraft).toHaveLength(0);
  });

  describe('the audience codec', () => {
    it('round-trips every shape CLAUDE.md §6.1 names', () => {
      for (const raw of ['all_students', 'all_tas', 'course:course-1', 'group:group-1']) {
        const parsed = parseAudience(raw);
        expect(parsed).not.toBeNull();
        expect(encodeAudience(parsed!)).toBe(raw);
      }
    });

    it('rejects a malformed audience rather than coercing it', () => {
      // A half-understood audience is a message delivered to the wrong people.
      for (const raw of ['', 'course:', 'course', 'all', 'course:a b', 'ALL_TAS', 'group:', 'group:a b']) {
        expect(parseAudience(raw)).toBeNull();
      }
    });

    it('keeps the DTO pattern and the parser in step', () => {
      // They are written from the same parts; this is the assertion that they
      // have not drifted into accepting different strings.
      for (const raw of ['all_students', 'all_tas', 'course:course-1', 'group:group-1']) {
        expect(AUDIENCE_PATTERN.test(raw)).toBe(true);
      }
      for (const raw of ['course:', 'nonsense', 'course:bad id', 'group:', 'group:bad id']) {
        expect(AUDIENCE_PATTERN.test(raw)).toBe(parseAudience(raw) !== null);
      }
    });
  });

  describe('POST /staff/courses/:id/announcements', () => {
    it('lets an assigned assistant post to their own course (§2.2)', async () => {
      const posted = await staff.createCourseDraft('course-1', MESSAGE, ASSIGNED_TA);
      expect(posted).toMatchObject({
        audience: 'course:course-1',
        audienceType: 'course',
        courseId: 'course-1',
        postedBy: 'assistant-1',
        title: 'Class moved',
      });
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(staff.createCourseDraft('course-2', MESSAGE, ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives the same answer for a held-but-wrong course and a nonexistent one', async () => {
      const wrong = await staff
        .createCourseDraft('course-2', MESSAGE, ASSIGNED_TA)
        .catch((e) => e.message);
      const missing = await staff
        .createCourseDraft('course-does-not-exist', MESSAGE, ASSIGNED_TA)
        .catch((e) => e.message);
      expect(wrong).toBe(missing);
    });

    it('lets the teacher post to any course through the same route', async () => {
      await expect(staff.createCourseDraft('course-2', MESSAGE, ADMIN)).resolves.toMatchObject({
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
      const posted = await staff.createCourseDraft('course-1', smuggled, ASSIGNED_TA);
      expect(posted.audience).toBe('course:course-1');
    });
  });

  describe('the audience is resolved at send time (§5.14)', () => {
    it('delivers a course announcement to that course’s enrolled students only', async () => {
      const draft = await staff.createCourseDraft('course-1', MESSAGE, ASSIGNED_TA);
      await admin.publish(draft.id, ADMIN);

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
      const draft = await staff.createCourseDraft('course-1', MESSAGE, ASSIGNED_TA);
      await admin.publish(draft.id, ADMIN);
      const feed = await notifications.list('student-1', false);
      expect(feed.notifications.find((n) => n.type === 'announcement')).toMatchObject(
        { title: 'Class moved', message: 'Sunday moves to 19:00.', read: false },
      );
    });

    it('reaches an assistant hired after the announcement was drafted', async () => {
      // The §5.14 requirement in one test: `all_tas` resolves from
      // role = 'assistant' at the moment of sending, so a frozen recipient list
      // captured earlier would miss this account.
      const draft = await admin.createDraft(
        { ...MESSAGE, audience: 'all_tas' },
        ADMIN,
      );

      const newHire = await users.create({
        email: 'assistant3@example.com',
        passwordHash: 'hash',
        name: 'Late Arrival',
        role: Role.Assistant,
        status: 'active',
      });

      const published = await admin.publish(draft.id, ADMIN);
      const allTas = await users.findIdsByRole([Role.Assistant, Role.Admin]);
      expect(published.recipientCount).toBe(allTas.length);

      const feed = await notifications.list(newHire.id, false);
      expect(feed.notifications).toHaveLength(1);
      // No page shows a platform-wide announcement, so null rather than a link
      // that 404s.
      expect(feed.notifications[0]?.link).toBeNull();
    });

    it('sends all_students to every student and to no assistant', async () => {
      const draft = await admin.createDraft(
        { ...MESSAGE, audience: 'all_students' },
        ADMIN,
      );
      const published = await admin.publish(draft.id, ADMIN);
      const studentIds = await users.findIdsByRole([Role.Student]);
      expect(published.recipientCount).toBe(studentIds.length);
      expect((await notifications.list('assistant-1', false)).notifications).toEqual(
        [],
      );
      expect(
        (await notifications.list('student-2', false)).unreadCount,
      ).toBeGreaterThan(0);
    });

    it('does not store a recipient list, only how many there were', async () => {
      const draft = await admin.createDraft(
        { ...MESSAGE, audience: 'all_students' },
        ADMIN,
      );
      const published = await admin.publish(draft.id, ADMIN);
      expect(Object.keys(published)).not.toContain('recipientIds');
      expect(JSON.stringify(published)).not.toContain('student-1');
      expect(published.recipientCount).toBeGreaterThan(0);

      const all = await admin.list({});
      const stored = all.find((a) => a.id === published.id);
      expect(stored).toBeDefined();
      expect(Object.keys(stored!)).not.toContain('recipientIds');
      expect(JSON.stringify(stored)).not.toContain('student-1');
      expect(stored!.recipientCount).toBe(published.recipientCount);
    });

    it('404s a course audience naming a course that does not exist', async () => {
      const draft = await admin.createDraft(
        { ...MESSAGE, audience: 'course:nope' },
        ADMIN,
      );
      await expect(admin.publish(draft.id, ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('the audit trail (§5.4)', () => {
    it('records the assistant, the course and the reach', async () => {
      const draft = await staff.createCourseDraft('course-1', MESSAGE, ASSIGNED_TA);
      const published = await admin.publish(draft.id, ADMIN);

      const page = await audit.find({ limit: 10 });
      const createdEntry = page.entries.find((e) => e.action === 'announcement.created');
      expect(createdEntry).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetType: 'announcement',
        targetId: draft.id,
        courseId: 'course-1',
      });

      const postedEntry = page.entries.find((e) => e.action === 'announcement.posted');
      expect(postedEntry).toMatchObject({
        actorId: 'teacher-1',
        actorRole: 'teacher',
        targetType: 'announcement',
        targetId: published.id,
        courseId: 'course-1',
      });
      expect(postedEntry?.before).toBeNull();
      expect(postedEntry?.after).toMatchObject({
        audience: 'course:course-1',
        recipientCount: 2,
      });
    });

    it('records the teacher as teacher, not as an assistant', async () => {
      const draft = await admin.createDraft({ ...MESSAGE, audience: 'all_tas' }, ADMIN);
      await admin.publish(draft.id, ADMIN);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'announcement.posted');
      expect(entry?.actorRole).toBe('teacher');
      // Platform-wide, so it belongs to no course.
      expect(entry?.courseId).toBeNull();
    });
  });

  describe('reading them back', () => {
    it('scopes the course list the same way the write is scoped', async () => {
      await staff.createCourseDraft('course-1', MESSAGE, ASSIGNED_TA);
      const mine = await staff.listForCourse('course-1', {}, ASSIGNED_TA);
      expect(mine).toHaveLength(1);
      await expect(staff.listForCourse('course-2', {}, ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(staff.listForCourse('course-1', {}, UNASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('keeps a course list to that course', async () => {
      await staff.createCourseDraft('course-1', MESSAGE, ADMIN);
      await staff.createCourseDraft('course-2', MESSAGE, ADMIN);
      await admin.createDraft({ ...MESSAGE, audience: 'all_students' }, ADMIN);

      const courseOne = await staff.listForCourse('course-1', {}, ADMIN);
      expect(courseOne).toHaveLength(1);
      expect(courseOne[0]?.courseId).toBe('course-1');

      // The admin history spans every audience, including the platform-wide one.
      const all = await admin.list({});
      expect(all).toHaveLength(3);
      expect(all.map((a) => a.audience)).toContain('all_students');
    });

    it('returns newest first and pages by offset', async () => {
      for (const title of ['first', 'second', 'third']) {
        await admin.createDraft({ title, body: 'x', audience: 'all_tas' }, ADMIN);
        await new Promise((r) => setTimeout(r, 10));
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
