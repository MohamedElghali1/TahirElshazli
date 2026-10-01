import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { UploadsService } from '../common/storage/uploads.service.js';
import { FileUrls } from '../common/storage/file-urls.service.js';
import { FILE_STORAGE } from '../common/storage/file-storage.interface.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { InMemoryTaskDraftRepository } from './repositories/in-memory-task-draft.repository.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { WorkAnalyticsGateService } from './work-analytics-gate.service.js';
import { WorkAnalyticsService } from '../assessments/work-analytics.service.js';
import { GoogleFormSyncService } from '../assessments/google-form-sync.service.js';
import { GoogleIntegrationService } from '../integrations/google/google-integration.service.js';
import { GoogleFormsClient } from '../integrations/google/google-forms.client.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY, EXTERNAL_WORK_BINDER } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { StaffScopeService, COURSE_NOT_IN_SCOPE } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';

/** assistant-1 holds group-1 (course-1) only; assistant-2 holds nothing. */
const TA = { id: 'assistant-1', role: 'assistant' };
const OTHER_TA = { id: 'assistant-2', role: 'assistant' };
const ADMIN = { id: 'teacher-1', role: 'teacher' };

const TASK = {
  title: 'Analytics task',
  description: 'd',
  instructions: 'i',
  type: 'assignment' as const,
  topics: [] as string[],
  lessonId: null,
  availableFrom: '2026-01-01T00:00:00Z',
  availableTo: '2099-01-01T00:00:00Z',
  dueAt: '2098-01-01T00:00:00Z',
  maxScore: 20,
  allowedFileTypes: ['application/pdf'],
  maxFileSizeBytes: 1024,
  targets: [{ groupId: 'group-1' }],
};

/**
 * `AUTH-6`: `WorkAnalyticsGateService.assertMayRead`/`results`/`studentWork`
 * narrow to a scoped assistant's held groups on a course-1-shaped roster split
 * across two groups - the same shape the roster and authoring specs use.
 */
describe('WorkAnalyticsGateService (AUTH-6)', () => {
  let gate: WorkAnalyticsGateService;
  let authoring: AssessmentAuthoringService;
  let groups: InMemoryGroupRepository;
  let scopes: InMemoryAssistantScopeRepository;
  let groupBId: string;
  let audit: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        FileUrls,
        {
          provide: FILE_STORAGE,
          useValue: {
            save: async (i: { bytes: Buffer; mimeType: string; extension: string }) => ({
              url: `/uploads/${randomUUID()}.${i.extension}`,
              sizeBytes: i.bytes.length,
              mimeType: i.mimeType,
            }),
            remove: async () => true,
            readUrl: async (url: string) => url,
          },
        },
        AssessmentAuthoringService,
        WorkAnalyticsGateService,
        WorkAnalyticsService,
        GoogleFormSyncService,
        // Never called by `ingest`/`previewMatch` - the only paths this spec
        // exercises - so a stub is enough; a real Google client would need
        // OAuth credentials this suite has no business holding.
        { provide: GoogleIntegrationService, useValue: {} },
        { provide: GoogleFormsClient, useValue: {} },
        StaffScopeService,
        StudentGroupsService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: EXTERNAL_WORK_BINDER, useValue: { bindExternal: async () => {} } },
        { provide: TASK_DRAFT_REPOSITORY, useClass: InMemoryTaskDraftRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    gate = module.get(WorkAnalyticsGateService);
    authoring = module.get(AssessmentAuthoringService);
    groups = module.get(GROUP_REPOSITORY);
    scopes = module.get(ASSISTANT_SCOPE_REPOSITORY);
    audit = module.get(AuditService);

    // A second course-1 cohort assistant-1 does not hold. student-2 moves out
    // of group-1 into it, so the two students are cleanly split one per group.
    const groupB = await groups.create({
      name: 'AUTH-6 cohort B',
      teacherId: 'teacher-1',
      courseId: 'course-1',
      assistantId: null,
      meets: null,
      room: null,
    });
    groupBId = groupB.id;
    await groups.removeMember('group-1', 'student-2');
    await groups.addMember({ groupId: groupBId, studentId: 'student-2', assignedBy: 'teacher-1' });
  });

  describe('assertMayRead', () => {
    it('404s a task with no held group in its audience, byte-identical to a missing id', async () => {
      const bOnly = await authoring.create('course-1', ADMIN, {
        ...TASK,
        title: 'B-only',
        targets: [{ groupId: groupBId }],
      });
      const denied = await gate.assertMayRead(bOnly.id, TA).catch((e) => e as NotFoundException);
      const missing = await gate.assertMayRead('nope', TA).catch((e) => e as NotFoundException);
      expect(denied).toBeInstanceOf(NotFoundException);
      expect((denied as NotFoundException).message).toBe(ASSESSMENT_NOT_FOUND);
      expect((denied as NotFoundException).message).toBe((missing as NotFoundException).message);
    });

    it('allows a scoped assistant a task targeted at their held group', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      await expect(gate.assertMayRead(created.id, TA)).resolves.toBe('course-1');
    });

    it('leaves the teacher and an all_groups assistant unaffected', async () => {
      const bOnly = await authoring.create('course-1', ADMIN, {
        ...TASK,
        title: 'B-only 2',
        targets: [{ groupId: groupBId }],
      });
      await expect(gate.assertMayRead(bOnly.id, ADMIN)).resolves.toBe('course-1');
      await scopes.setScope('assistant-2', 'all_groups');
      await expect(gate.assertMayRead(bOnly.id, OTHER_TA)).resolves.toBe('course-1');
    });
  });

  describe('results', () => {
    it('narrows rows to held-group students for a scoped assistant', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-1' }, { groupId: groupBId }],
      });
      const rows = await gate.results(created.id, TA);
      expect(rows.map((r) => r.studentId)).toContain('student-1');
      expect(rows.map((r) => r.studentId)).not.toContain('student-2');
      // `D-60`/`T8`: no response stored yet - a non-respondent's resultId is
      // null, not a dangling id the Individual view could fetch.
      expect(rows.find((r) => r.studentId === 'student-1')?.resultId).toBeNull();
    });

    it('leaves the teacher and an all_groups assistant with the whole roster', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-1' }, { groupId: groupBId }],
      });
      const teacherRows = await gate.results(created.id, ADMIN);
      expect(teacherRows.map((r) => r.studentId).sort()).toEqual(['student-1', 'student-2'].sort());

      await scopes.setScope('assistant-2', 'all_groups');
      const wideRows = await gate.results(created.id, OTHER_TA);
      expect(wideRows.map((r) => r.studentId).sort()).toEqual(['student-1', 'student-2'].sort());
    });
  });

  describe('studentWork', () => {
    it('404s COURSE_NOT_IN_SCOPE for a student in no held group on that course', async () => {
      const denied = await gate
        .studentWork('course-1', 'student-2', TA)
        .catch((e) => e as NotFoundException);
      expect(denied).toBeInstanceOf(NotFoundException);
      expect((denied as NotFoundException).message).toBe(COURSE_NOT_IN_SCOPE);
    });

    it('allows a scoped assistant a student in their held group', async () => {
      await expect(gate.studentWork('course-1', 'student-1', TA)).resolves.toBeDefined();
    });

    it('leaves the teacher able to read either student', async () => {
      await expect(gate.studentWork('course-1', 'student-1', ADMIN)).resolves.toBeDefined();
      await expect(gate.studentWork('course-1', 'student-2', ADMIN)).resolves.toBeDefined();
    });

    it('404s COURSE_NOT_IN_SCOPE identically to an assistant who holds nothing on the course', async () => {
      const outOfCourse = await gate
        .studentWork('course-1', 'student-1', OTHER_TA)
        .catch((e) => e as NotFoundException);
      const outOfGroup = await gate
        .studentWork('course-1', 'student-2', TA)
        .catch((e) => e as NotFoundException);
      expect((outOfCourse as NotFoundException).message).toBe(
        (outOfGroup as NotFoundException).message,
      );
    });
  });

  describe('importCsv (D-60, REM-080a)', () => {
    /** student-1 = student@example.com, student-2 = student2@example.com. */
    const csv =
      'Timestamp,Email Address,Score,What is 2+2?\n' +
      '2026/09/27 3:00:00 PM GMT+3,student@example.com,4 / 5,Four\n' +
      '2026/09/27 3:01:00 PM GMT+3,student2@example.com,3 / 5,Four\n' +
      '2026/09/27 3:02:00 PM GMT+3,nobody@example.com,2 / 5,Five\n';

    it('400s a task that is not a google_form', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK); // file_upload
      await expect(
        gate.importCsv(created.id, ADMIN, csv, false),
      ).rejects.toThrow(/not a Google Form/);
    });

    it('404s an assistant an unheld task, byte-identical to a missing id (anti-enumeration)', async () => {
      const bOnly = await authoring.create('course-1', ADMIN, {
        ...TASK,
        workType: 'google_form',
        externalUrl: 'https://forms.gle/x',
        targets: [{ groupId: groupBId }],
      });
      const denied = await gate
        .importCsv(bOnly.id, TA, csv, false)
        .catch((e) => e as NotFoundException);
      const missing = await gate
        .importCsv('nope', TA, csv, false)
        .catch((e) => e as NotFoundException);
      expect(denied).toBeInstanceOf(NotFoundException);
      expect((denied as NotFoundException).message).toBe(
        (missing as NotFoundException).message,
      );
    });

    it('dryRun matches and counts without storing anything', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        workType: 'google_form',
        externalUrl: 'https://forms.gle/x',
      });
      const preview = await gate.importCsv(created.id, ADMIN, csv, true);
      expect(preview).toEqual({
        rows: 3,
        matched: 2,
        unmatched: 1,
        errors: [],
        questions: 1,
      });
      expect(await gate.unmatched(created.id)).toHaveLength(0);
    });

    it('imports, matches, and writes one audit entry inside a transaction', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        workType: 'google_form',
        externalUrl: 'https://forms.gle/x',
      });
      const outcome = await gate.importCsv(created.id, ADMIN, csv, false);
      expect(outcome).toMatchObject({ fetched: 3, matched: 2, unmatched: 1, questions: 1 });

      const rows = await gate.results(created.id, ADMIN);
      expect(rows.find((r) => r.studentId === 'student-1')?.score).toBe(4);
      // `D-60`/`T8`: a matched respondent's row carries its `ExternalResult`
      // id, for `GET /staff/results/:resultId`'s Individual view.
      expect(typeof rows.find((r) => r.studentId === 'student-1')?.resultId).toBe('string');

      const entries = (await audit.find({ limit: 50 })).entries;
      const entry = entries.find((e) => e.action === 'work.results_imported');
      expect(entry?.targetId).toBe(created.id);
      expect(entry?.actorId).toBe('teacher-1');
      expect(entry?.after).toMatchObject({ matched: 2, unmatched: 1 });
    });

    it('narrows question distributions to a scoped assistant\'s held groups', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        workType: 'google_form',
        externalUrl: 'https://forms.gle/x',
        targets: [{ groupId: 'group-1' }, { groupId: groupBId }],
      });
      await gate.importCsv(created.id, ADMIN, csv, false);

      const wide = await gate.analyticsFor(created.id, ADMIN);
      const q = wide.questions[0]!;
      expect(q.distribution.reduce((sum, d) => sum + d.count, 0)).toBe(2); // both matched rows

      const narrow = await gate.analyticsFor(created.id, TA); // holds group-1 (student-1) only
      const qNarrow = narrow.questions[0]!;
      expect(qNarrow.distribution.reduce((sum, d) => sum + d.count, 0)).toBe(1);
    });

    it('a second import of the same file is a no-op on the stored rows', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        workType: 'google_form',
        externalUrl: 'https://forms.gle/x',
      });
      await gate.importCsv(created.id, ADMIN, csv, false);
      const first = await gate.results(created.id, ADMIN);
      await gate.importCsv(created.id, ADMIN, csv, false);
      const second = await gate.results(created.id, ADMIN);
      expect(second).toEqual(first);
    });
  });
});
