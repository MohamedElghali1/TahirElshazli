import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TaskDraftsService, TASK_DRAFT_NOT_FOUND } from './task-drafts.service.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { InMemoryTaskDraftRepository } from './repositories/in-memory-task-draft.repository.js';
import { COURSE_NOT_IN_SCOPE, StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { Role } from '../auth/roles.enum.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';

/** assistant-1 holds group-1 (course-1); assistant-2 holds nothing. */
const TA = { id: 'assistant-1', role: 'assistant' };
const EMPTY_TA = { id: 'assistant-2', role: 'assistant' };
/** An assistant with no `assistant_scopes` row at all: never configured. */
const UNCONFIGURED_TA = { id: 'assistant-9', role: 'assistant' };
const TEACHER = { id: 'teacher-1', role: 'teacher' };
const ADMIN = { id: 'admin-1', role: 'admin' };

const DRAFT = {
  courseId: 'course-1',
  type: 'homework' as const,
  title: 'Reading passage: rates',
  instructions: 'Read and answer.',
  attachments: [
    { url: '/uploads/passage.pdf', name: 'Passage', mimeType: 'application/pdf', sizeBytes: 12, audience: 'students' as const },
  ],
};

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundException);
    return (error as NotFoundException).message;
  }
  throw new Error('expected a rejection');
}

describe('TaskDraftsService (TASK-2)', () => {
  let service: TaskDraftsService;
  let audit: AuditService;
  let assessments: InMemoryAssessmentRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskDraftsService,
        StaffScopeService,
        AuditService,
        // A null pool selects the memory driver; `runInTransaction` still
        // enters the context `AuditService.record` asserts.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: TASK_DRAFT_REPOSITORY, useClass: InMemoryTaskDraftRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
      ],
    }).compile();
    service = module.get(TaskDraftsService);
    audit = module.get(AuditService);
    assessments = module.get(ASSESSMENT_REPOSITORY);
  });

  const entries = async (action: string) =>
    (await audit.find({ limit: 50 })).entries.filter((e) => e.action === action);

  describe('audit', () => {
    it('create writes task_draft.created with actor, actorRole via actorRoleOf, targetType task_draft, courseId, after {title,type,workType,attachmentCount}', async () => {
      const created = await service.create(TA, DRAFT);
      const [entry] = await entries('task_draft.created');
      expect(entry).toMatchObject({
        actorId: 'assistant-1',
        actorRole: Role.Assistant,
        targetType: 'task_draft',
        targetId: created.id,
        courseId: 'course-1',
        before: null,
        after: {
          title: 'Reading passage: rates',
          type: 'homework',
          workType: 'file_upload',
          attachmentCount: 1,
        },
      });

      // An admin is recorded as an admin, not collapsed to the teacher.
      await service.create(ADMIN, DRAFT);
      expect((await entries('task_draft.created')).map((e) => e.actorRole)).toContain(Role.Admin);
    });

    it('update writes task_draft.updated whose before is not the after (copy, not alias)', async () => {
      const created = await service.create(TEACHER, DRAFT);
      await service.update(created.id, TEACHER, { title: 'Renamed', attachments: [] });
      const [entry] = await entries('task_draft.updated');
      expect(entry.before).toMatchObject({ title: 'Reading passage: rates', attachmentCount: 1 });
      expect(entry.after).toMatchObject({ title: 'Renamed', attachmentCount: 0 });
      expect(entry.before).not.toEqual(entry.after);
    });

    it('remove writes task_draft.deleted with before {title,type} and after null', async () => {
      const created = await service.create(TEACHER, DRAFT);
      await service.remove(created.id, TEACHER);
      const [entry] = await entries('task_draft.deleted');
      expect(entry.before).toEqual({ title: 'Reading passage: rates', type: 'homework' });
      expect(entry.after).toBeNull();
      expect(await service.list(TEACHER, {})).toEqual([]);
    });
  });

  describe('scope', () => {
    it('an assistant lists only drafts on courses they reach through a held group', async () => {
      const mine = await service.create(TEACHER, DRAFT);
      const other = await service.create(TEACHER, { ...DRAFT, courseId: 'course-2' });
      expect((await service.list(TA, {})).map((d) => d.id)).toEqual([mine.id]);
      // The teacher and an admin see both.
      expect((await service.list(TEACHER, {})).map((d) => d.id).sort()).toEqual(
        [mine.id, other.id].sort(),
      );
      expect((await service.list(ADMIN, {})).length).toBe(2);
    });

    it('a courseId filter outside the reach answers [], exactly as an unknown course does (A-4)', async () => {
      await service.create(TEACHER, { ...DRAFT, courseId: 'course-2' });
      expect(await service.list(TA, { courseId: 'course-2' })).toEqual([]);
      expect(await service.list(TA, { courseId: 'course-nope' })).toEqual([]);
    });

    it('a never-configured assistant lists nothing', async () => {
      await service.create(TEACHER, DRAFT);
      expect(await service.list(UNCONFIGURED_TA, {})).toEqual([]);
      expect(await service.list(EMPTY_TA, {})).toEqual([]);
    });

    it('create on an unreachable course throws COURSE_NOT_IN_SCOPE === the nonexistent-course message', async () => {
      const denied = await messageOf(service.create(TA, { ...DRAFT, courseId: 'course-2' }));
      const gone = await messageOf(service.create(TA, { ...DRAFT, courseId: 'course-nope' }));
      expect(denied).toBe(COURSE_NOT_IN_SCOPE);
      expect(denied === gone).toBe(true);
      // And nothing was written on the refused path.
      expect(await entries('task_draft.created')).toEqual([]);
    });

    it('update and remove on an unreachable draft throw TASK_DRAFT_NOT_FOUND === a missing id', async () => {
      const elsewhere = await service.create(TEACHER, { ...DRAFT, courseId: 'course-2' });

      const updateDenied = await messageOf(service.update(elsewhere.id, TA, { title: 'x' }));
      const updateGone = await messageOf(service.update('nope', TA, { title: 'x' }));
      expect(updateDenied).toBe(TASK_DRAFT_NOT_FOUND);
      expect(updateDenied === updateGone).toBe(true);

      const removeDenied = await messageOf(service.remove(elsewhere.id, TA));
      const removeGone = await messageOf(service.remove('nope', TA));
      expect(removeDenied === removeGone).toBe(true);
      expect(removeDenied).toBe(TASK_DRAFT_NOT_FOUND);

      // Never the course message: a draft-id route names no course.
      expect(updateDenied).not.toBe(COURSE_NOT_IN_SCOPE);
      // And the refused draft is untouched and still there for the teacher.
      expect((await service.list(TEACHER, { courseId: 'course-2' }))[0]?.title).toBe(
        DRAFT.title,
      );
    });

    it('an assistant may edit and delete a draft the teacher created (no own-only rule)', async () => {
      const created = await service.create(TEACHER, DRAFT);
      const edited = await service.update(created.id, TA, { title: 'Edited by the TA' });
      expect(edited.title).toBe('Edited by the TA');
      expect(edited.createdBy).toBe('teacher-1');
      await service.remove(created.id, TA);
      expect(await service.list(TEACHER, {})).toEqual([]);
    });
  });

  describe('server-owned fields', () => {
    it('courseId is not patchable', async () => {
      const created = await service.create(TEACHER, DRAFT);
      // An untyped caller sending courseId: the service passes only the
      // declared patch fields, and the repositories write only those.
      const after = await service.update(created.id, TEACHER, {
        title: 'Moved?',
        courseId: 'course-2',
      } as never);
      expect(after.courseId).toBe('course-1');
    });

    it('starts usedCount at 0 and records the creator', async () => {
      const created = await service.create(TA, DRAFT);
      expect(created.usedCount).toBe(0);
      expect(created.createdBy).toBe('assistant-1');
      expect(created.workType).toBe('file_upload');
    });
  });

  describe('the memory driver matches Postgres on delete (review F-5)', () => {
    it('deleting a draft nulls draftId on the tasks authored from it, and leaves them intact', async () => {
      const draft = await service.create(TEACHER, DRAFT);
      const task = await assessments.create({
        courseId: 'course-1',
        lessonId: null,
        title: 'Authored from the draft',
        description: '',
        instructions: '',
        type: 'homework',
        topics: [],
        availableFrom: '2026-09-01T00:00:00.000Z',
        availableTo: '2026-12-01T00:00:00.000Z',
        dueAt: '2026-11-01T00:00:00.000Z',
        maxScore: 20,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 1024,
        workType: 'file_upload',
        externalUrl: null,
        visibility: 'published',
        markerId: null,
        allowResubmission: true,
        submissionModes: [],
        draftId: draft.id,
        attachments: [],
      });
      await service.remove(draft.id, TEACHER);
      const after = await assessments.findById(task.id);
      expect(after?.draftId).toBeNull();
      expect(after?.title).toBe('Authored from the draft');
    });
  });
});
