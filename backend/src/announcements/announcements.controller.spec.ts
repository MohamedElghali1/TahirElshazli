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
import { parseAudience, encodeAudience } from './announcement-audience.js';

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
  let groups: InMemoryGroupRepository;
  let courses: InMemoryCourseRepository;
  let enrollments: InMemoryEnrollmentRepository;
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
    groups = module.get<InMemoryGroupRepository>(GROUP_REPOSITORY);
    courses = module.get<InMemoryCourseRepository>(COURSE_REPOSITORY);
    enrollments = module.get<InMemoryEnrollmentRepository>(ENROLLMENT_REPOSITORY);
    scopeRepo = module.get<InMemoryAssistantScopeRepository>(ASSISTANT_SCOPE_REPOSITORY);

    await users.create({ id: 'assistant-1', email: 'a1@example.com', passwordHash: 'x', name: 'A1', role: Role.Assistant, status: 'active' });
    await users.create({ id: 'assistant-2', email: 'a2@example.com', passwordHash: 'x', name: 'A2', role: Role.Assistant, status: 'active' });
    await users.create({ id: 'teacher-1', email: 't@example.com', passwordHash: 'x', name: 'T1', role: Role.Teacher, status: 'active' });
    await users.create({ id: 'student-1', email: 's1@example.com', passwordHash: 'x', name: 'S1', role: Role.Student, status: 'active' });
    await users.create({ id: 'student-2', email: 's2@example.com', passwordHash: 'x', name: 'S2', role: Role.Student, status: 'active' });
    
    await courses.create({ id: 'course-1', title: 'C1', syllabus: '', isPublished: true });
    await enrollments.create({ courseId: 'course-1', studentId: 'student-1', enrolledAt: new Date().toISOString() });
    await scopeRepo.assignGroup('assistant-1', 'group-1', 'teacher-1');
    
    await groups.create({ id: 'group-1', courseId: 'course-1', name: 'G1', assistantId: 'assistant-1' });
    await groups.addMember('group-1', 'student-1');
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
    
    await groups.create({ id: 'group-2', courseId: 'course-1', name: 'G2', assistantId: 'assistant-2' });
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
    await groups.create({ id: 'group-2', courseId: 'course-1', name: 'G2', assistantId: 'assistant-2' });
    const err = await staff.createGroupDraft('group-2', MESSAGE, ASSIGNED_TA).catch(e => e.message);
    expect(err).toBe('Group not found');
  });

  it('TA calling /admin/announcements/:id/publish -> 403 (through service check)', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    await expect(service.publish(draft.id, ASSIGNED_TA.user)).rejects.toThrow(ForbiddenException);
  });

  it('publish with MAIL_DRIVER=none -> propagates error (we simulate by making mail throw)', async () => {
    const draft = await admin.createDraft({ ...MESSAGE, audience: 'course:course-1' }, ADMIN);
    vi.mocked(mail.send).mockRejectedValueOnce(new Error('mail failed'));
    
    await expect(admin.publish(draft.id, ADMIN)).rejects.toThrow('mail failed');
    // Ensure it remains a draft
    const stillDraft = await service.listAll(10, 0, 'draft');
    expect(stillDraft).toHaveLength(0);
  });
});
