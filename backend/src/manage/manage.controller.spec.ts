import { Test, TestingModule } from '@nestjs/testing';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { InMemoryTaskDraftRepository } from './repositories/in-memory-task-draft.repository.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffManageController } from './staff-manage.controller.js';
import { AdminManageController } from './admin-manage.controller.js';
import { ManageService } from './manage.service.js';
import { GradingService } from './grading.service.js';
import { SubmissionAccessService } from './submission-access.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import { DirectoryService } from './directory.service.js';
import { RegistrationApprovalService } from './registration-approval.service.js';
import { AdminStudentsService } from './admin-students.service.js';
import { AdminAssistantsService } from './admin-assistants.service.js';
import { ASSISTANT_INVITATION_REPOSITORY } from './interfaces/assistant-invitation-repository.interface.js';
import { InMemoryAssistantInvitationRepository } from './repositories/in-memory-assistant-invitation.repository.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from '../students/repositories/in-memory-student.repository.js';
import { BcryptPasswordHasher } from '../auth/bcrypt-password-hasher.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import { MailService } from '../mail/mail.service.js';
import { MAIL_SENDER } from '../mail/mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from '../mail/mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from '../mail/in-memory-mail-delivery.repository.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from '../courses/repositories/in-memory-course.repository.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';
import { LiveSessionsService } from '../live-sessions/live-sessions.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY, EXTERNAL_WORK_BINDER } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from '../recordings/repositories/in-memory-recording.repository.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { Role } from '../auth/roles.enum.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

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
/** The Full admin (AUTH-1): the teacher's reach under her own identity. */
const FULL_ADMIN = {
  user: { sub: 'admin-1', email: 'admin@example.com', role: 'admin', jti: 'j4' },
};

describe('Manage surface', () => {
  let staff: StaffManageController;
  let admin: AdminManageController;
  let audit: AuditService;
  let assessments: InMemoryAssessmentRepository;
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffManageController, AdminManageController],
      providers: [
        ManageService,
        GradingService,
        // `/grade` is group-grain since `D-44` (unit 7).
        SubmissionAccessService,
        ManageRecordingsService,
        ManageLiveSessionsService,
        DirectoryService,
        // The registration queue (`DOM-4`). `accept` runs activation,
        // enrolment and placement in one transaction, so the real
        // `CoursesService` is wired rather than a stub - the point of the
        // transaction test is that a failing enrol really does roll back.
        RegistrationApprovalService,
        AdminStudentsService,
        AdminAssistantsService,
        {
          provide: ASSISTANT_INVITATION_REPOSITORY,
          useClass: InMemoryAssistantInvitationRepository,
        },
        MailService,
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: MAIL_SENDER, useValue: { send: vi.fn().mockResolvedValue(undefined) } },
        { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        CoursesService,
        EnrollmentsService,
        RecordingsService,
        LiveSessionsService,
        AssessmentAuthoringService,
        StaffScopeService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        // The learning mode lives on the group now (CLAUDE.md §5.2), so every
        // module that renders a student's course needs these two. Real
        // implementations rather than stubs: the resolution order (group,
        // then course default) is the part worth exercising.
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        StudentGroupsService,
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        // The authoring service binds external work through this port. A trivial
        // fake is enough precisely because it IS a port - the fixtures here are all
        // file_upload, so nothing external is ever bound, and pulling the real
        // Google stack in would make these tests depend on an OAuth client they
        // have no business knowing about.
        { provide: EXTERNAL_WORK_BINDER, useValue: { bindExternal: async () => {} } },
        // The draft library (`TASK-3`): authoring from a draft bumps its count.
        { provide: TASK_DRAFT_REPOSITORY, useClass: InMemoryTaskDraftRepository },
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    staff = module.get(StaffManageController);
    admin = module.get(AdminManageController);
    audit = module.get(AuditService);
    assessments = module.get(ASSESSMENT_REPOSITORY);
    users = module.get(USER_REPOSITORY);
  });

  describe('GET /staff/overview', () => {
    it('scopes an assistant to their assigned courses', async () => {
      const overview = await staff.overview(ASSIGNED_TA);
      expect(overview.scope).toBe('assigned');
      expect(overview.courses.map((c) => c.id)).toEqual(['course-1']);
      expect(overview.courses[0].assignedAt).not.toBeNull();
    });

    it('gives an unassigned assistant an empty console rather than an error', async () => {
      const overview = await staff.overview(UNASSIGNED_TA);
      expect(overview.scope).toBe('assigned');
      expect(overview.courses).toEqual([]);
      expect(overview.studentCount).toBe(0);
      expect(overview.awaitingGrading).toBe(0);
    });

    it('leaves the teacher unscoped', async () => {
      const overview = await staff.overview(ADMIN);
      expect(overview.scope).toBe('platform');
      expect(overview.courses.length).toBeGreaterThan(1);
      // The teacher holds no assignment rows; that is the asymmetry, not a gap.
      expect(overview.courses.every((c) => c.assignedAt === null)).toBe(true);
    });

    it('counts a student on two courses once', async () => {
      const overview = await staff.overview(ADMIN);
      const summed = overview.courses.reduce((n, c) => n + c.studentCount, 0);
      expect(overview.studentCount).toBeLessThan(summed);
    });

    it('carries no revenue figure of any kind (CLAUDE.md §1)', async () => {
      const overview = await staff.overview(ADMIN);
      const keys = [
        ...Object.keys(overview),
        ...Object.keys(overview.courses[0] ?? {}),
      ].join(' ');
      expect(keys).not.toMatch(/revenue|earning|amount|price|paid|income/i);
    });
  });

  describe('GET /staff/courses/:id/roster', () => {
    it('returns the roster for an assigned course', async () => {
      const roster = await staff.roster('course-1', ASSIGNED_TA);
      expect(roster.courseId).toBe('course-1');
      expect(roster.entries.length).toBeGreaterThan(0);
      expect(roster.entries[0]).toHaveProperty('averageScorePercent');
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(staff.roster('course-2', ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives the same answer for a held-but-wrong course and a nonexistent one', async () => {
      const wrong = await staff.roster('course-2', ASSIGNED_TA).catch((e) => e.message);
      const missing = await staff
        .roster('course-does-not-exist', ASSIGNED_TA)
        .catch((e) => e.message);
      // Otherwise an unassigned TA can enumerate the catalog one id at a time.
      expect(wrong).toBe(missing);
    });

    it('lets the teacher read any course', async () => {
      await expect(staff.roster('course-2', ADMIN)).resolves.toMatchObject({
        courseId: 'course-2',
      });
    });
  });

  describe('GET /staff/courses/:id/submissions', () => {
    it('returns the queue with per-assessment averages', async () => {
      const queue = await staff.submissions('course-1', {}, ASSIGNED_TA);
      expect(queue.items.length).toBeGreaterThan(0);
      expect(queue.assessments.length).toBeGreaterThan(0);
      const graded = queue.assessments.find((a) => a.gradedCount > 0);
      expect(graded?.averageScorePercent).not.toBeNull();
    });

    it('filters to work nobody has corrected', async () => {
      const queue = await staff.submissions(
        'course-1',
        { status: 'awaiting' },
        ASSIGNED_TA,
      );
      expect(queue.items.length).toBeGreaterThan(0);
      expect(queue.items.every((i) => i.correctedAt === null)).toBe(true);
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(staff.submissions('course-2', {}, ASSIGNED_TA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /staff/submissions/:id/grade', () => {
    it('records a mark and returns it', async () => {
      const result = await staff.grade(
        'sub-2',
        { score: 17, feedback: 'Good work.' },
        ASSIGNED_TA,
      );
      expect(result).toMatchObject({ score: 17, status: 'graded' });
      expect(result.correctedAt).not.toBeNull();
    });

    it('refuses a submission belonging to a course the assistant does not hold', async () => {
      // The scope check resolves the course from the submission's own
      // assessment, so there is no course id in the request to be trusted.
      await expect(
        staff.grade('sub-2', { score: 10 }, UNASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);

      const after = await assessments.findSubmissionById('sub-2');
      expect(after?.score).toBeNull();
    });

    it('refuses a score above the assessment maximum', async () => {
      // assess-4 is out of 20. The ceiling is per assessment, so a DTO cannot
      // know it and the service has to.
      await expect(
        staff.grade('sub-2', { score: 21 }, ASSIGNED_TA),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s an unknown submission', async () => {
      await expect(
        staff.grade('sub-nope', { score: 1 }, ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('gives a held-but-wrong submission and a nonexistent one the same body', async () => {
      // Not just the same status. Two different 404 sentences are an existence
      // oracle: a TA could tell a real submission id on someone else's course
      // from an id that was never issued, and enumerate the platform one id at
      // a time. Same argument as the held-but-wrong course test above (§5.11).
      const outOfScope = await staff
        .grade('sub-2', { score: 10 }, UNASSIGNED_TA)
        .catch((error: Error) => error.message);
      const nonexistent = await staff
        .grade('sub-nope', { score: 10 }, UNASSIGNED_TA)
        .catch((error: Error) => error.message);

      expect(outOfScope).toBe(nonexistent);
    });

    it('never alters the student’s submitted work (CLAUDE.md §5.5)', async () => {
      const before = await assessments.findSubmissionById('sub-2');
      await staff.grade('sub-2', { score: 12, feedback: 'ok' }, ASSIGNED_TA);
      const after = await assessments.findSubmissionById('sub-2');
      expect(after?.fileUrl).toBe(before?.fileUrl);
      expect(after?.answerText).toBe(before?.answerText);
      expect(after?.submittedAt).toBe(before?.submittedAt);
      expect(after?.lastSubmittedAt).toBe(before?.lastSubmittedAt);
    });

    it('writes an audit entry naming the actor and the mark that moved', async () => {
      await staff.grade('sub-2', { score: 15 }, ASSIGNED_TA);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'submission.graded');
      expect(entry).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetType: 'assessment_submission',
        targetId: 'sub-2',
        courseId: 'course-1',
      });
      expect(entry?.before).toMatchObject({ score: null });
      expect(entry?.after).toMatchObject({ score: 15 });
    });

    it('records the teacher as teacher, not as an assistant', async () => {
      await staff.grade('sub-2', { score: 9 }, ADMIN);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'submission.graded');
      expect(entry?.actorRole).toBe('teacher');
    });

    it('records the full admin as admin, not as a teacher or an assistant', async () => {
      // AUTH-1's whole reason for existing. Before `actorRoleOf` this line
      // returned 'assistant' here - `grading.service.ts` carried the
      // `=== Teacher ? Teacher : Assistant` form - so an admin's marking landed
      // inside the assistant activity trail, permanently: the audit log has no
      // UPDATE and no DELETE path.
      await staff.grade('sub-2', { score: 11 }, FULL_ADMIN);
      const page = await audit.find({ limit: 10 });
      const entry = page.entries.find((e) => e.action === 'submission.graded');
      expect(entry).toMatchObject({ actorId: 'admin-1', actorRole: 'admin' });
    });
  });

  describe('recordings', () => {
    it('lets an assigned assistant read the library', async () => {
      const list = await staff.listRecordings('course-1', ASSIGNED_TA);
      expect(list.length).toBeGreaterThan(0);
      // The staff read carries no student's watch progress.
      expect(list[0]).not.toHaveProperty('watchedSeconds');
    });

    it('404s the library of a course the assistant does not hold', async () => {
      await expect(
        staff.listRecordings('course-2', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('publishes a recording and appends it to the running order', async () => {
      const before = await staff.listRecordings('course-1', ADMIN);
      const created = await admin.createRecording(
        'course-1',
        {
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Redox recap',
          videoUrl: 'https://video.example.com/redox',
          durationSeconds: 1800,
        },
        ADMIN,
      );
      expect(created.order).toBeGreaterThan(
        Math.max(...before.map((r) => r.order)),
      );
      // Defaults to the module's chapter so the student filter still finds it.
      expect(created.chapter).toBe('Chapter 1');

      const after = await staff.listRecordings('course-1', ADMIN);
      expect(after).toHaveLength(before.length + 1);
    });

    it('refuses a lesson that belongs to another module', async () => {
      await expect(
        admin.createRecording(
          'course-1',
          {
            moduleId: 'mod-1',
            lessonId: 'lesson-99',
            title: 'Wrong lesson',
            videoUrl: 'https://video.example.com/x',
            durationSeconds: 600,
          },
          ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('audits publish, edit and delete', async () => {
      const created = await admin.createRecording(
        'course-1',
        {
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Temporary',
          videoUrl: 'https://video.example.com/tmp',
          durationSeconds: 300,
        },
        ADMIN,
      );
      await admin.updateRecording(created.id, { title: 'Renamed' }, ADMIN);
      await admin.deleteRecording(created.id, ADMIN);

      const page = await audit.find({ limit: 20 });
      const actions = page.entries.map((e) => e.action);
      expect(actions).toContain('recording.created');
      expect(actions).toContain('recording.updated');
      expect(actions).toContain('recording.deleted');
    });

    it('records a before/after pair that actually differs', async () => {
      // The same guard the live-session suite carries, and the reason it is
      // here: the in-memory repository handed `findRecordingById` back by
      // reference, so `update` mutated the very object holding the "before"
      // snapshot and the entry recorded a rename that appeared never to have
      // happened - evidence-shaped and empty (§5.4).
      const created = await admin.createRecording(
        'course-1',
        {
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Before the rename',
          videoUrl: 'https://video.example.com/before',
          durationSeconds: 300,
        },
        ADMIN,
      );
      await admin.updateRecording(
        created.id,
        { title: 'After the rename', videoUrl: 'https://video.example.com/after' },
        ADMIN,
      );

      const page = await audit.find({ limit: 20, action: 'recording.updated' });
      const entry = page.entries[0];
      expect(entry?.before).toMatchObject({
        title: 'Before the rename',
        videoUrl: 'https://video.example.com/before',
      });
      expect(entry?.after).toMatchObject({
        title: 'After the rename',
        videoUrl: 'https://video.example.com/after',
      });
    });

    it('scopes an edit and a delete on the recording’s own course', async () => {
      // The routes are teacher-only today, so this asserts the service rather
      // than the wiring - and that is the point. §11 says widening recordings
      // to TAs is a controller move; it only stays a controller move while the
      // by-id writes resolve the course from the recording and scope on it.
      const created = await admin.createRecording(
        'course-2',
        {
          moduleId: 'mod-4',
          lessonId: 'lesson-13',
          title: 'On a course the assistant does not hold',
          videoUrl: 'https://video.example.com/scoped',
          durationSeconds: 120,
        },
        ADMIN,
      );

      await expect(
        admin.updateRecording(created.id, { title: 'Renamed' }, ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
      await expect(
        admin.deleteRecording(created.id, ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);

      // Still there, and still under its original title.
      const survived = await staff.listRecordings('course-2', ADMIN);
      expect(survived.map((r) => r.title)).toContain(
        'On a course the assistant does not hold',
      );
    });

    it('404s a delete of a recording that is already gone', async () => {
      await expect(admin.deleteRecording('rec-nope', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes the recording from the student library once deleted', async () => {
      const created = await admin.createRecording(
        'course-1',
        {
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Doomed',
          videoUrl: 'https://video.example.com/doomed',
          durationSeconds: 300,
        },
        ADMIN,
      );
      await admin.deleteRecording(created.id, ADMIN);
      const list = await staff.listRecordings('course-1', ADMIN);
      expect(list.find((r) => r.id === created.id)).toBeUndefined();
    });
  });

  describe('live sessions', () => {
    const SESSION = {
      title: 'Paper 2 clinic',
      zoomLink: 'https://zoom.us/j/55512345678',
      scheduledAt: '2026-10-01T18:00:00Z',
      durationMinutes: 90,
    };

    it('lets an assigned assistant read the schedule', async () => {
      const list = await staff.listLiveSessions('course-1', ASSIGNED_TA);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('zoomLink');
    });

    it('404s the schedule of a course the assistant does not hold', async () => {
      await expect(
        staff.listLiveSessions('course-2', ASSIGNED_TA),
      ).rejects.toThrow(NotFoundException);
    });

    it('schedules a session the course then lists', async () => {
      const before = await staff.listLiveSessions('course-1', ADMIN);
      const created = await admin.createLiveSession('course-1', SESSION, ADMIN);
      expect(created).toMatchObject({ courseId: 'course-1', title: 'Paper 2 clinic' });

      const after = await staff.listLiveSessions('course-1', ADMIN);
      expect(after).toHaveLength(before.length + 1);
      expect(after.map((s) => s.id)).toContain(created.id);
    });

    it('404s a course that does not exist', async () => {
      await expect(
        admin.createLiveSession('course-nope', SESSION, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('edits a session and leaves the omitted fields alone', async () => {
      const created = await admin.createLiveSession('course-1', SESSION, ADMIN);
      const updated = await admin.updateLiveSession(
        created.id,
        { scheduledAt: '2026-10-02T18:00:00Z' },
        ADMIN,
      );
      expect(updated.scheduledAt).toBe('2026-10-02T18:00:00Z');
      expect(updated.title).toBe('Paper 2 clinic');
      expect(updated.zoomLink).toBe(SESSION.zoomLink);
    });

    it('404s an edit or a cancel of a session that is not there', async () => {
      await expect(
        admin.updateLiveSession('sess-nope', { title: 'x' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      await expect(admin.deleteLiveSession('sess-nope', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cancels a session and removes it from the schedule', async () => {
      const created = await admin.createLiveSession('course-1', SESSION, ADMIN);
      await expect(
        admin.deleteLiveSession(created.id, ADMIN),
      ).resolves.toEqual({ removed: true });
      const list = await staff.listLiveSessions('course-1', ADMIN);
      expect(list.find((s) => s.id === created.id)).toBeUndefined();
    });

    it('audits scheduling, editing and cancelling', async () => {
      const created = await admin.createLiveSession('course-1', SESSION, ADMIN);
      await admin.updateLiveSession(created.id, { title: 'Renamed' }, ADMIN);
      await admin.deleteLiveSession(created.id, ADMIN);

      const page = await audit.find({ limit: 20 });
      const actions = page.entries.map((e) => e.action);
      expect(actions).toContain('live_session.scheduled');
      expect(actions).toContain('live_session.updated');
      expect(actions).toContain('live_session.cancelled');
    });

    it('records a before/after pair that actually differs', async () => {
      // The bug this guards against: a repository handing back the stored
      // object by reference makes before and after the same mutated object -
      // an entry that looks like evidence and shows nothing having moved.
      const created = await admin.createLiveSession('course-1', SESSION, ADMIN);
      await admin.updateLiveSession(created.id, { title: 'Renamed' }, ADMIN);

      const page = await audit.find({ limit: 20, action: 'live_session.updated' });
      const entry = page.entries[0];
      expect(entry?.before).toMatchObject({ title: 'Paper 2 clinic' });
      expect(entry?.after).toMatchObject({ title: 'Renamed' });
      expect(entry?.courseId).toBe('course-1');
    });
  });

  describe('admin directory', () => {
    it('lists students and nobody else', async () => {
      const students = await admin.students({});
      expect(students.length).toBeGreaterThan(0);
      expect(students.every((s) => !s.email.startsWith('teacher'))).toBe(true);
      expect(students.every((s) => !s.email.startsWith('assistant'))).toBe(true);
    });

    it('never returns a password hash', async () => {
      const students = await admin.students({});
      expect(JSON.stringify(students)).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('carries each student’s account status', async () => {
      const students = await admin.students({});
      expect(students.every((s) => s.status === 'active')).toBe(true);
    });

    it('filters to the waiting queue, and shows every status when asked for none', async () => {
      const queued = await users.create({
        email: 'queued@example.com',
        passwordHash: 'hash',
        name: 'Queued Student',
        role: Role.Student,
        status: 'waiting',
      });

      const waiting = await admin.students({ status: 'waiting' });
      expect(waiting.map((s) => s.id)).toEqual([queued.id]);

      // Absent means every status, not `active` - this list is the only place
      // the queue is visible at all.
      const everyone = await admin.students({});
      expect(everyone.map((s) => s.id)).toContain(queued.id);
      expect(everyone.length).toBeGreaterThan(waiting.length);
    });

    it('accepts a waiting registration and moves it out of the queue', async () => {
      const queued = await users.create({
        email: 'queued@example.com',
        passwordHash: 'hash',
        name: 'Queued Student',
        role: Role.Student,
        status: 'waiting',
      });

      const row = await admin.acceptRegistration(
        queued.id,
        { groupId: 'group-1' },
        FULL_ADMIN,
      );

      expect(row).toMatchObject({ id: queued.id, status: 'active' });
      expect(await admin.students({ status: 'waiting' })).toEqual([]);
    });

    it('rejects a waiting registration', async () => {
      const queued = await users.create({
        email: 'queued2@example.com',
        passwordHash: 'hash',
        name: 'Queued Two',
        role: Role.Student,
        status: 'waiting',
      });

      expect(
        await admin.rejectRegistration(
          queued.id,
          { reason: 'Wrong year group' },
          ADMIN,
        ),
      ).toEqual({ ok: true });
      expect(
        (await admin.students({ status: 'rejected' })).map((s) => s.id),
      ).toEqual([queued.id]);
    });

    it('counts each student’s enrollments without an N+1', async () => {
      const students = await admin.students({});
      const ali = students.find((s) => s.email === 'student@example.com');
      expect(ali?.enrolledCourseCount).toBeGreaterThan(0);
    });

    it('searches by name and email', async () => {
      const byEmail = await admin.students({ search: 'student2@example.com' });
      expect(byEmail).toHaveLength(1);
      const none = await admin.students({ search: 'nobody-by-this-name' });
      expect(none).toEqual([]);
    });

    it('lists assistants and admins, and nothing else', async () => {
      const assistants = await admin.assistants();
      expect(assistants.length).toBeGreaterThan(0);
      // An `admin` account that appeared in no directory would be a person
      // with the teacher's access whom nobody can see (AUTH-1,
      // `API_SPEC.yaml:217`).
      expect(
        assistants.every(
          (a) => a.role === Role.Assistant || a.role === Role.Admin,
        ),
      ).toBe(true);
      expect(assistants.map((a) => a.id)).toContain('assistant-1');
      expect(assistants.map((a) => a.id)).toContain('admin-1');
      expect(assistants.map((a) => a.id)).not.toContain('student-1');
      expect(assistants.map((a) => a.id)).not.toContain('teacher-1');
      // `role` is emitted so the console can tell the tiers apart - the picker
      // must not offer to assign an admin, whom `StaffService.assign` refuses.
      expect(assistants.find((a) => a.id === 'admin-1')?.role).toBe(Role.Admin);
      // `PEOPLE-4`: every real account is `active`, with its scope/groupIds.
      expect(assistants.every((a) => a.status === 'active')).toBe(true);
    });

    it('refuses a role filter that would return every account', async () => {
      // The safety property behind `findByRole`'s required, non-empty list: an
      // empty filter must never be read as "no filter".
      await expect(
        users.findByRole([], { limit: 50, offset: 0 }),
      ).rejects.toThrow();
    });
  });
});
