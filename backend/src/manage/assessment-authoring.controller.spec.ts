import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { UploadsService } from '../common/storage/uploads.service.js';
import { FILE_STORAGE } from '../common/storage/file-storage.interface.js';
import { SUBMISSION_ANNOTATION_REPOSITORY } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import { InMemorySubmissionAnnotationRepository } from '../assessments/repositories/in-memory-submission-annotation.repository.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { InMemoryTaskDraftRepository } from './repositories/in-memory-task-draft.repository.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentAuthoringService,
  ASSESSMENT_NOT_FOUND,
  MARKER_NOT_ELIGIBLE,
  RETARGET_UNREACHABLE_AUDIENCE,
  staffTaskStatusOf,
  visibilityStateOf,
  UPLOAD_MODES_NEED_STORAGE,
} from './assessment-authoring.service.js';
import { TASK_DRAFT_NOT_FOUND } from './task-drafts.service.js';
import type { TaskDraftRepository } from './interfaces/task-draft-repository.interface.js';
import { AssessmentsController } from '../assessments/assessments.controller.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { WORK_REPOSITORY, EXTERNAL_WORK_BINDER } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../auth/roles.enum.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';

/** assistant-1 holds course-1; assistant-2 holds nothing. */
const TA = { id: 'assistant-1', role: 'assistant' };
const OTHER_TA = { id: 'assistant-2', role: 'assistant' };
const ADMIN = { id: 'teacher-1', role: 'teacher' };

/** student-1 and student-2 are both in group-1, which studies course-1. */
const STUDENT_1 = {
  user: { sub: 'student-1', email: 's1@example.com', role: 'student', jti: 'j1' },
};

const TASK = {
  title: 'Kinetics problem set',
  description: 'Rates and orders',
  instructions: 'Upload a single PDF.',
  type: 'assignment' as const,
  topics: ['Kinetics'],
  lessonId: null,
  availableFrom: '2026-09-01T00:00:00Z',
  availableTo: '2026-12-01T23:59:59Z',
  dueAt: '2026-09-20T23:59:59Z',
  maxScore: 30,
  allowedFileTypes: ['application/pdf'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  targets: [{ groupId: 'group-1' }],
};

describe('Assessment authoring (§5.18) and targeting (§5.16)', () => {
  let authoring: AssessmentAuthoringService;
  let uploads: UploadsService;
  let student: AssessmentsController;
  let audit: AuditService;
  let groups: InMemoryGroupRepository;
  let drafts: TaskDraftRepository;
  let scopes: InMemoryAssistantScopeRepository;
  let studentService: AssessmentsService;
  let users: InMemoryUserRepository;
  let work: InMemoryWorkRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        // Storage is ON here: `D-48` (b) refuses upload modes without it. A
        // double of the port, so nothing touches disk.
        UploadsService,
        {
          provide: FILE_STORAGE,
          useValue: {
            save: async (i: { bytes: Buffer; mimeType: string; extension: string }) => ({
              url: `/uploads/${randomUUID()}.${i.extension}`,
              sizeBytes: i.bytes.length,
              mimeType: i.mimeType,
            }),
            remove: async () => true,
          },
        },
        AssessmentAuthoringService,
        AssessmentsService,
        EnrollmentsService,
        StudentGroupsService,
        StaffScopeService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: SUBMISSION_ANNOTATION_REPOSITORY, useClass: InMemorySubmissionAnnotationRepository },
        // The authoring service binds external work through this port. A trivial
        // fake is enough precisely because it IS a port - the fixtures here are all
        // file_upload, so nothing external is ever bound, and pulling the real
        // Google stack in would make these tests depend on an OAuth client they
        // have no business knowing about.
        { provide: EXTERNAL_WORK_BINDER, useValue: { bindExternal: async () => {} } },
        // The draft library (`TASK-3`): authoring from a draft bumps its count.
        { provide: TASK_DRAFT_REPOSITORY, useClass: InMemoryTaskDraftRepository },
        // Who a named marker is (`D-32`).
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        {
          provide: ASSISTANT_SCOPE_REPOSITORY,
          useClass: InMemoryAssistantScopeRepository,
        },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authoring = module.get(AssessmentAuthoringService);
    uploads = module.get(UploadsService);
    student = module.get(AssessmentsController);
    audit = module.get(AuditService);
    groups = module.get(GROUP_REPOSITORY);
    drafts = module.get(TASK_DRAFT_REPOSITORY);
    scopes = module.get(ASSISTANT_SCOPE_REPOSITORY);
    studentService = module.get(AssessmentsService);
    users = module.get(USER_REPOSITORY);
    work = module.get(WORK_REPOSITORY);
  });

  const entries = async () => (await audit.find({ limit: 50 })).entries;

  describe('a TA may author both assignments and quizzes', () => {
    it('lets an assistant create an assignment and records them as the actor', async () => {
      // The client settled this on 2026-09-10, against the preset's narrower
      // reading. One role rule, no branch on `type`.
      const created = await authoring.create('course-1', TA, TASK);
      expect(created.title).toBe('Kinetics problem set');
      expect(created.targets.map((t) => t.groupId)).toEqual(['group-1']);

      const entry = (await entries()).find((e) => e.action === 'assessment.created');
      expect(entry?.actorId).toBe('assistant-1');
      expect(entry?.actorRole).toBe(Role.Assistant);
      // The audience is what a dispute turns on, so it is in the snapshot.
      expect(entry?.after).toMatchObject({ targetGroups: 'group-1' });
    });

    it('lets an assistant create a quiz too', async () => {
      const quiz = await authoring.create('course-1', TA, {
        ...TASK,
        type: 'quiz',
        title: 'Kinetics quiz',
      });
      expect(quiz.type).toBe('quiz');
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(
        authoring.create('course-1', OTHER_TA, TASK),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the window has to be coherent before it is stored (§5.10)', () => {
    it('rejects an inverted availability window', async () => {
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          availableFrom: '2026-12-01T00:00:00Z',
          availableTo: '2026-09-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a due date outside the window', async () => {
      // Otherwise the task is permanently `locked` with nothing to explain it.
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          dueAt: '2027-01-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an edit that would invert the stored window', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      await expect(
        authoring.update(created.id, ADMIN, {
          availableTo: '2026-08-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('targeting is the audience (§5.16)', () => {
    it('refuses a task set for nobody', async () => {
      await expect(
        authoring.create('course-1', ADMIN, { ...TASK, targets: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a group that does not study this course', async () => {
      // group-2 studies course-2. Without this check the task would be set for
      // a cohort that does not take the subject.
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          targets: [{ groupId: 'group-2' }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses the same group twice', async () => {
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          targets: [{ groupId: 'group-1' }, { groupId: 'group-1' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces the whole audience on re-target, and logs both sides', async () => {
      const second = await groups.create({
        name: 'Chemistry — Monday',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const created = await authoring.create('course-1', ADMIN, TASK);

      const retargeted = await authoring.setTargets(created.id, ADMIN, [
        { groupId: second.id },
      ]);
      expect(retargeted.targets.map((t) => t.groupId)).toEqual([second.id]);

      const entry = (await entries()).find((e) => e.action === 'assessment.targeted');
      expect(entry?.before).toEqual({ targetGroups: 'group-1' });
      expect(entry?.after).toEqual({ targetGroups: second.id });
      expect(entry?.before).not.toEqual(entry?.after);
    });
  });

  describe('the student sees only what was set for their group', () => {
    it('shows a newly created task on the student list', async () => {
      const before = await student.listAssessments('course-1', {}, STUDENT_1);
      await authoring.create('course-1', ADMIN, TASK);
      const after = await student.listAssessments('course-1', {}, STUDENT_1);

      // §5.18's actual acceptance test: a student opens the app and the thing
      // that was just posted is there.
      expect(after).toHaveLength(before.length + 1);
      expect(after.map((a) => a.title)).toContain('Kinetics problem set');
    });

    it('hides a task set for another group on the same course', async () => {
      const other = await groups.create({
        name: 'Chemistry — Monday',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const secret = await authoring.create('course-1', ADMIN, {
        ...TASK,
        title: 'Only for the Monday group',
        targets: [{ groupId: other.id }],
      });

      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.title)).not.toContain('Only for the Monday group');

      // And not reachable by id either - enrollment alone stopped being enough
      // the moment work was set per group.
      await expect(
        student.getAssessmentDetail(secret.id, STUDENT_1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies a per-group window override to the student it belongs to', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-1', dueAt: '2026-11-30T23:59:59Z' }],
      });
      const detail = await student.getAssessmentDetail(created.id, STUDENT_1);
      // The override, not the assessment's own 2026-09-20.
      expect(detail.dueAt).toBe('2026-11-30T23:59:59Z');
    });

    it('leaves an unplaced student with an empty list, not an error', async () => {
      // §7.2's state. student-2 holds course-1 and sits in group-1; remove them
      // and the course goes quiet rather than erroring.
      await groups.removeMember('group-1', 'student-2');
      const student2 = {
        user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
      };
      await expect(student.listAssessments('course-1', {}, student2)).resolves.toEqual([]);
    });
  });

  describe('deleting is guarded by the student work on it', () => {
    it('deletes a task nobody has submitted to', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      await authoring.remove(created.id, ADMIN);
      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.id)).not.toContain(created.id);

      const entry = (await entries()).find((e) => e.action === 'assessment.deleted');
      expect(entry?.before).toMatchObject({ title: 'Kinetics problem set' });
      expect(entry?.after).toBeNull();
    });

    it('refuses to delete one that has a submission', async () => {
      // assess-3 carries sub-1. A submission is a student's work and §6 keeps
      // history where history matters, so this refuses rather than cascading.
      // `TASK-F3`: a 409, matching `D-36`'s refusal for synced results.
      await expect(
        authoring.remove('assess-3', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(authoring.remove('assess-3', ADMIN)).rejects.toThrow(
        'This assessment has submissions and cannot be deleted. ' +
          'Close its availability window or re-target it instead.',
      );
    });
  });

  /** Rejects with a 404 and returns its message, for `===` comparisons. */
  const notFoundMessage = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      return (error as NotFoundException).message;
    }
    throw new Error('expected a 404');
  };

  const newDraft = (courseId = 'course-1') =>
    drafts.create({
      courseId,
      type: 'homework',
      workType: 'file_upload',
      title: 'Draft passage',
      description: '',
      instructions: 'From the library.',
      attachments: [{ url: '/uploads/passage.pdf', name: 'Passage', mimeType: null, sizeBytes: null, audience: 'students' }],
      createdBy: 'teacher-1',
    });

  describe('authoring from a draft (TASK-3)', () => {
    it('create from a draft increments usedCount by one and records draftId on assessment.created', async () => {
      const draft = await newDraft();
      const created = await authoring.create('course-1', TA, { ...TASK, draftId: draft.id });
      expect(created.draftId).toBe(draft.id);
      expect((await drafts.findById(draft.id))?.usedCount).toBe(1);

      const entry = (await entries()).find((e) => e.action === 'assessment.created');
      expect(entry?.after).toMatchObject({ draftId: draft.id, attachmentCount: 0, allowResubmission: true });
    });

    it('create with a draft from another course throws TASK_DRAFT_NOT_FOUND === missing draft', async () => {
      const elsewhere = await newDraft('course-2');
      const denied = await notFoundMessage(
        authoring.create('course-1', ADMIN, { ...TASK, draftId: elsewhere.id }),
      );
      const gone = await notFoundMessage(
        authoring.create('course-1', ADMIN, { ...TASK, draftId: 'draft-nope' }),
      );
      expect(denied).toBe(TASK_DRAFT_NOT_FOUND);
      expect(denied === gone).toBe(true);
      // The foreign draft's count is untouched.
      expect((await drafts.findById(elsewhere.id))?.usedCount).toBe(0);
    });

    it('the request body is authoritative: nothing is merged from the draft (A-2)', async () => {
      const draft = await newDraft();
      const created = await authoring.create('course-1', ADMIN, { ...TASK, draftId: draft.id });
      expect(created.title).toBe(TASK.title);
      expect(created.instructions).toBe(TASK.instructions);
      expect(created.attachments).toEqual([]);
    });

    it('editing a draft after authoring does not change the task (copy, not link)', async () => {
      const draft = await newDraft();
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        draftId: draft.id,
        title: draft.title,
        attachments: draft.attachments,
      });
      await drafts.update(draft.id, { title: 'Draft, rewritten', attachments: [] });
      await drafts.remove(draft.id);
      const list = await authoring.list('course-1', ADMIN);
      const task = list.find((a) => a.id === created.id);
      expect(task?.title).toBe('Draft passage');
      expect(task?.attachments).toHaveLength(1);
    });
  });

  describe('attachments and allowResubmission (TASK-4, TASK-5)', () => {
    it('attachments and allowResubmission round-trip; assessment.updated before/after carry them and do not alias', async () => {
      const attachments = [
        { url: '/uploads/scheme.pdf', name: 'Mark scheme', mimeType: 'application/pdf', sizeBytes: 5, audience: 'staff' as const },
      ];
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        attachments,
        allowResubmission: false,
      });
      expect(created.attachments).toEqual(attachments);
      expect(created.allowResubmission).toBe(false);

      const updated = await authoring.update(created.id, ADMIN, {
        attachments: [],
        allowResubmission: true,
      });
      expect(updated.attachments).toEqual([]);
      expect(updated.allowResubmission).toBe(true);

      const entry = (await entries()).find((e) => e.action === 'assessment.updated');
      expect(entry?.before).toMatchObject({ attachmentCount: 1, allowResubmission: false });
      expect(entry?.after).toMatchObject({ attachmentCount: 0, allowResubmission: true });
      expect(entry?.before).not.toEqual(entry?.after);
    });

    it('allowResubmission false: a second submission is 409 and canSubmit is false after the first', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2026-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        dueAt: '2098-01-01T00:00:00Z',
        allowResubmission: false,
      });
      const open = await student.getAssessmentDetail(created.id, STUDENT_1);
      expect(open.canSubmit).toBe(true);

      await student.submitAssessment(created.id, { answerText: 'first' }, STUDENT_1);
      await expect(
        student.submitAssessment(created.id, { answerText: 'second' }, STUDENT_1),
      ).rejects.toBeInstanceOf(ConflictException);
      const closed = await student.getAssessmentDetail(created.id, STUDENT_1);
      expect(closed.canSubmit).toBe(false);
      expect(closed.submission?.answerText).toBe('first');
    });

    it('allowResubmission true: resubmission unchanged until window end', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2026-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        // Past due, window still open: the cut-off is the window end (D-31).
        dueAt: '2026-01-02T00:00:00Z',
      });
      await student.submitAssessment(created.id, { answerText: 'first' }, STUDENT_1);
      await student.submitAssessment(created.id, { answerText: 'second' }, STUDENT_1);
      const detail = await student.getAssessmentDetail(created.id, STUDENT_1);
      expect(detail.submission?.answerText).toBe('second');
      expect(detail.canSubmit).toBe(true);
    });
  });

  describe('the existence oracle on /staff/assessments/:id (finding 2)', () => {
    it('loadInScope: an out-of-scope assessment 404 body === a missing id, on update, delete and re-target', async () => {
      // A real task on course-2, which assistant-1 cannot reach.
      const elsewhere = await authoring.create('course-2', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-2' }],
      });

      const cases: Array<[Promise<unknown>, Promise<unknown>]> = [
        [authoring.update(elsewhere.id, TA, { title: 'x' }), authoring.update('nope', TA, { title: 'x' })],
        [authoring.remove(elsewhere.id, TA), authoring.remove('nope', TA)],
        [
          authoring.setTargets(elsewhere.id, TA, [{ groupId: 'group-1' }]),
          authoring.setTargets('nope', TA, [{ groupId: 'group-1' }]),
        ],
      ];
      for (const [outOfScope, missing] of cases) {
        const denied = await notFoundMessage(outOfScope);
        const gone = await notFoundMessage(missing);
        expect(denied).toBe(ASSESSMENT_NOT_FOUND);
        expect(denied === gone).toBe(true);
      }
    });
  });

  /**
   * `GET /staff/tasks` (`TASK-6`). Group-3 is a second course-1 cohort created
   * here, not in the seeds: every seeded course has exactly one group, which is
   * why course grain and group grain are indistinguishable in the fixtures.
   */
  describe('listForStaff is group-grain (TASK-6)', () => {
    let group3: string;
    let shared: string;
    let onlyGroup3: string;

    beforeEach(async () => {
      group3 = (
        await groups.create({
          name: 'Chemistry — Group 3',
          teacherId: 'teacher-1',
          courseId: 'course-1',
          assistantId: null,
          meets: null,
          room: null,
        })
      ).id;
      shared = (
        await authoring.create('course-1', ADMIN, {
          ...TASK,
          title: 'Shared task',
          targets: [{ groupId: 'group-1' }, { groupId: group3 }],
        })
      ).id;
      onlyGroup3 = (
        await authoring.create('course-1', ADMIN, {
          ...TASK,
          title: 'Group 3 only',
          targets: [{ groupId: group3 }],
        })
      ).id;
    });

    it('an assigned assistant sees a task set for group-1 and group-3 with only group-1 in targets', async () => {
      const list = await authoring.listForStaff(TA, {});
      const row = list.find((t) => t.id === shared);
      expect(row?.targets.map((t) => t.groupId)).toEqual(['group-1']);
      expect(row?.targets[0]?.groupName).toBeTruthy();
      // No trace of the unheld group anywhere in the response.
      expect(JSON.stringify(list)).not.toContain(group3);
    });

    it('a task set only for an unheld group is absent', async () => {
      const ids = (await authoring.listForStaff(TA, {})).map((t) => t.id);
      expect(ids).not.toContain(onlyGroup3);
    });

    it('a groupId filter outside the held set returns [] exactly as an unknown groupId does', async () => {
      const unheld = await authoring.listForStaff(TA, { groupId: group3 });
      const unknown = await authoring.listForStaff(TA, { groupId: 'group-nope' });
      expect(unheld).toEqual([]);
      expect(unheld).toEqual(unknown);
      // And an unreachable course narrows the same way.
      expect(await authoring.listForStaff(TA, { courseId: 'course-2' })).toEqual([]);
    });

    it('admin and all_groups see every task and every target', async () => {
      for (const actor of [ADMIN, { id: 'admin-1', role: 'admin' }]) {
        const row = (await authoring.listForStaff(actor, {})).find((t) => t.id === shared);
        expect(row?.targets.map((t) => t.groupId).sort()).toEqual(['group-1', group3].sort());
      }
      await scopes.setScope('assistant-2', 'all_groups');
      const everything = await authoring.listForStaff(OTHER_TA, {});
      expect(everything.map((t) => t.id)).toEqual(expect.arrayContaining([shared, onlyGroup3]));
    });

    it('an assistant who holds nothing sees nothing', async () => {
      expect(await authoring.listForStaff(OTHER_TA, {})).toEqual([]);
    });

    it('filters by search, literally', async () => {
      const found = await authoring.listForStaff(ADMIN, { search: 'group 3' });
      expect(found.map((t) => t.id)).toEqual([onlyGroup3]);
    });
  });

  /** `D-28` (B-1 → C + iii). */
  describe('visibility: published | hidden, scheduled derived (D-28)', () => {
    const OPEN_WINDOW = {
      availableFrom: '2026-01-01T00:00:00Z',
      availableTo: '2099-01-01T00:00:00Z',
      dueAt: '2098-01-01T00:00:00Z',
    };

    it('hidden: no row in the student list, and detail and submit 404 identically to a genuine miss', async () => {
      const created = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN_WINDOW });
      await authoring.update(created.id, ADMIN, { visibility: 'hidden' });

      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.id)).not.toContain(created.id);

      const hiddenDetail = await notFoundMessage(student.getAssessmentDetail(created.id, STUDENT_1));
      const missingDetail = await notFoundMessage(student.getAssessmentDetail('nope', STUDENT_1));
      expect(hiddenDetail === missingDetail).toBe(true);

      const hiddenSubmit = await notFoundMessage(
        student.submitAssessment(created.id, { answerText: 'x' }, STUDENT_1),
      );
      const missingSubmit = await notFoundMessage(
        student.submitAssessment('nope', { answerText: 'x' }, STUDENT_1),
      );
      expect(hiddenSubmit === missingSubmit).toBe(true);
    });

    it('published again: the task comes back for the student', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        ...OPEN_WINDOW,
        visibility: 'hidden',
      });
      expect(created.visibility).toBe('hidden');
      await authoring.update(created.id, ADMIN, { visibility: 'published' });
      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.id)).toContain(created.id);
    });

    it('refuses to hide a task that has any submission, with 409, and leaves it published', async () => {
      // assess-3 carries sub-1.
      await expect(
        authoring.update('assess-3', ADMIN, { visibility: 'hidden' }),
      ).rejects.toBeInstanceOf(ConflictException);
      const list = await authoring.list('course-1', ADMIN);
      expect(list.find((a) => a.id === 'assess-3')?.visibility).toBe('published');
    });

    it('drops a hidden task from the performance entries a report averages', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        ...OPEN_WINDOW,
        visibility: 'hidden',
      });
      const performance = await studentService.getPerformanceEntries('course-1', 'student-1');
      expect(performance.map((e) => e.assessmentId)).not.toContain(created.id);
    });

    it('records visibility on assessment.updated, before and after', async () => {
      const created = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN_WINDOW });
      await authoring.update(created.id, TA, { visibility: 'hidden' });
      const entry = (await entries()).find((e) => e.action === 'assessment.updated');
      expect(entry?.before).toMatchObject({ visibility: 'published' });
      expect(entry?.after).toMatchObject({ visibility: 'hidden' });
    });

    it('derives scheduled from a published task with a future availableFrom; never stores it', () => {
      const now = new Date('2026-09-22T12:00:00Z');
      expect(visibilityStateOf({ visibility: 'published', availableFrom: '2026-10-01T00:00:00Z' }, now)).toBe('scheduled');
      expect(visibilityStateOf({ visibility: 'published', availableFrom: '2026-09-01T00:00:00Z' }, now)).toBe('published');
      expect(visibilityStateOf({ visibility: 'hidden', availableFrom: '2026-10-01T00:00:00Z' }, now)).toBe('hidden');
    });

    it('carries the derived label on the staff task list', async () => {
      const future = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2098-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        dueAt: '2098-06-01T00:00:00Z',
      });
      const row = (await authoring.listForStaff(ADMIN, {})).find((t) => t.id === future.id);
      expect(row?.visibility).toBe('published');
      expect(row?.visibilityState).toBe('scheduled');
    });
  });

  /** `D-32` (B-5, as recommended). */
  describe('the marker (D-32)', () => {
    const FULL_ADMIN = { id: 'admin-1', role: 'admin' };

    it('lets the teacher name an active assistant who reaches every targeted group', async () => {
      const created = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-1' });
      expect(created.markerId).toBe('assistant-1');
      const entry = (await entries()).find((e) => e.action === 'assessment.created');
      expect(entry?.after).toMatchObject({ markerId: 'assistant-1' });
    });

    it('lets an admin name the teacher, an admin, or clear it back to whoever opens it first', async () => {
      const created = await authoring.create('course-1', FULL_ADMIN, { ...TASK, markerId: 'teacher-1' });
      expect((await authoring.update(created.id, FULL_ADMIN, { markerId: 'admin-1' })).markerId).toBe('admin-1');
      expect((await authoring.update(created.id, FULL_ADMIN, { markerId: null })).markerId).toBeNull();
      // The feed is newest first.
      const entry = (await entries()).find((e) => e.action === 'assessment.updated');
      expect(entry?.before).toMatchObject({ markerId: 'admin-1' });
      expect(entry?.after).toMatchObject({ markerId: null });
    });

    it('403s an assistant sending a non-null markerId, on create and on update', async () => {
      await expect(
        authoring.create('course-1', TA, { ...TASK, markerId: 'assistant-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const created = await authoring.create('course-1', ADMIN, TASK);
      await expect(
        authoring.update(created.id, TA, { markerId: 'teacher-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403s an assistant clearing a marker someone else chose; null on an unmarked task is a no-op', async () => {
      const marked = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'teacher-1' });
      await expect(
        authoring.update(marked.id, TA, { markerId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const unmarked = await authoring.create('course-1', TA, { ...TASK, markerId: null });
      expect((await authoring.update(unmarked.id, TA, { markerId: null })).markerId).toBeNull();
    });

    it.each([
      ['an assistant who holds none of the targets', 'assistant-2'],
      ['a student', 'student-1'],
      ['a user who does not exist', 'user-nope'],
    ])('400s %s as the marker', async (_label, markerId) => {
      await expect(
        authoring.create('course-1', ADMIN, { ...TASK, markerId }),
      ).rejects.toThrow(MARKER_NOT_ELIGIBLE);
    });

    it('400s an assistant who reaches only some of the targeted groups', async () => {
      const group3 = await groups.create({
        name: 'Marker cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          targets: [{ groupId: 'group-1' }, { groupId: group3.id }],
          markerId: 'assistant-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400s an assistant whose account is not active', async () => {
      await users.setStatus('assistant-1', 'waiting');
      await expect(
        authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-1' }),
      ).rejects.toThrow(MARKER_NOT_ELIGIBLE);
    });

    it('accepts an all_groups assistant for any audience', async () => {
      await scopes.setScope('assistant-2', 'all_groups');
      const created = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-2' });
      expect(created.markerId).toBe('assistant-2');
    });

    it('displays later drift and never clears the marker', async () => {
      const group3 = await groups.create({
        name: 'Drift cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const created = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-1' });
      let row = (await authoring.listForStaff(ADMIN, {})).find((t) => t.id === created.id);
      expect(row?.markerDrift).toBe(false);
      expect(row?.markerName).toBe('Nour Hassan');

      // The teacher re-aims it past what assistant-1 reaches.
      await authoring.setTargets(created.id, ADMIN, [{ groupId: 'group-1' }, { groupId: group3.id }]);
      row = (await authoring.listForStaff(ADMIN, {})).find((t) => t.id === created.id);
      expect(row?.markerId).toBe('assistant-1');
      expect(row?.markerDrift).toBe(true);
      // The same fact for the assistant, whose own targets are narrowed.
      const theirs = (await authoring.listForStaff(TA, {})).find((t) => t.id === created.id);
      expect(theirs?.markerDrift).toBe(true);
      expect(theirs?.targets.map((t) => t.groupId)).toEqual(['group-1']);
    });
  });

  /** `D-33` (B-6 → A+): the targeting-write half of `AUTH-6`. */
  describe('an assistant may not add a group they do not hold (D-33)', () => {
    let group3: string;
    beforeEach(async () => {
      group3 = (
        await groups.create({
          name: 'Unheld cohort',
          teacherId: 'teacher-1',
          courseId: 'course-1',
          assistantId: null,
          meets: null,
          room: null,
        })
      ).id;
    });

    it('404s assistant-1 creating a task for group-3 with the byte-identical not-enrolled message', async () => {
      const unheld = await notFoundMessage(
        authoring.create('course-1', TA, { ...TASK, targets: [{ groupId: group3 }] }),
      );
      expect(unheld).toBe(`Group ${group3} is not enrolled in this course`);
      // The same template a group genuinely off this course gets.
      const offCourse = await notFoundMessage(
        authoring.create('course-1', TA, { ...TASK, targets: [{ groupId: 'group-2' }] }),
      );
      expect(offCourse).toBe('Group group-2 is not enrolled in this course');
      expect(unheld.replace(group3, '<id>') === offCourse.replace('group-2', '<id>')).toBe(true);
      // And mixed with a held group it is still refused, writing nothing.
      await expect(
        authoring.create('course-1', TA, {
          ...TASK,
          title: 'Mixed',
          targets: [{ groupId: 'group-1' }, { groupId: group3 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const list = await authoring.list('course-1', ADMIN);
      expect(list.map((a) => a.title)).not.toContain('Mixed');
    });

    it('404s assistant-1 re-targeting their own task to add group-3, identically', async () => {
      const mine = await authoring.create('course-1', TA, TASK);
      const message = await notFoundMessage(
        authoring.setTargets(mine.id, TA, [{ groupId: 'group-1' }, { groupId: group3 }]),
      );
      expect(message).toBe(`Group ${group3} is not enrolled in this course`);
      // Re-aiming within what they hold still works.
      const moved = await authoring.setTargets(mine.id, TA, [
        { groupId: 'group-1', dueAt: '2026-11-30T23:59:59Z' },
      ]);
      expect(moved.targets.map((t) => t.groupId)).toEqual(['group-1']);
    });

    it('403s assistant-1 re-targeting a task also set for a group they cannot reach, and drops nothing', async () => {
      const shared = await authoring.create('course-1', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-1' }, { groupId: group3 }],
      });
      await expect(
        authoring.setTargets(shared.id, TA, [{ groupId: 'group-1' }]),
      ).rejects.toThrow(RETARGET_UNREACHABLE_AUDIENCE);
      await expect(
        authoring.setTargets(shared.id, TA, [{ groupId: 'group-1' }]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const after = (await authoring.list('course-1', ADMIN)).find((a) => a.id === shared.id);
      expect(after?.targets.map((t) => t.groupId).sort()).toEqual(['group-1', group3].sort());
    });

    it('leaves the teacher, an admin and an all_groups assistant unaffected', async () => {
      const teacher = await authoring.create('course-1', ADMIN, { ...TASK, targets: [{ groupId: group3 }] });
      await authoring.setTargets(teacher.id, { id: 'admin-1', role: 'admin' }, [
        { groupId: 'group-1' },
        { groupId: group3 },
      ]);
      await scopes.setScope('assistant-2', 'all_groups');
      const wide = await authoring.create('course-1', OTHER_TA, { ...TASK, targets: [{ groupId: group3 }] });
      await authoring.setTargets(wide.id, OTHER_TA, [{ groupId: 'group-1' }]);
    });
  });

  /** `D-29` (B-2 → B): who an attachment is for. */
  describe('attachment audience (D-29)', () => {
    it('the student detail carries only the students attachments', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2026-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        dueAt: '2098-01-01T00:00:00Z',
        attachments: [
          { url: '/uploads/passage.pdf', name: 'Passage', mimeType: 'application/pdf', sizeBytes: 10, audience: 'students' },
          { url: '/uploads/listening.mp3', name: 'Listening', mimeType: 'audio/mpeg', sizeBytes: 20, audience: 'students' },
          { url: '/uploads/scheme.pdf', name: 'Mark scheme', mimeType: 'application/pdf', sizeBytes: 30, audience: 'staff' },
        ],
      });
      const detail = await student.getAssessmentDetail(created.id, STUDENT_1);
      expect(detail.attachments).toEqual([
        { url: '/uploads/passage.pdf', name: 'Passage', mimeType: 'application/pdf', sizeBytes: 10 },
        { url: '/uploads/listening.mp3', name: 'Listening', mimeType: 'audio/mpeg', sizeBytes: 20 },
      ]);
      expect(JSON.stringify(detail)).not.toContain('scheme.pdf');
      // Staff still see all three.
      const staff = (await authoring.list('course-1', ADMIN)).find((a) => a.id === created.id);
      expect(staff?.attachments.map((a) => a.audience)).toEqual(['students', 'students', 'staff']);
    });
  });

  /** `D-31` (B-4 → B). */
  describe('submission modes (D-31)', () => {
    it('round-trips the modes on create and update, and records them on the audit entries', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        submissionModes: ['pdf_upload', 'photo_upload'],
      });
      expect(created.submissionModes).toEqual(['pdf_upload', 'photo_upload']);
      const updated = await authoring.update(created.id, ADMIN, { submissionModes: ['doc_link'] });
      expect(updated.submissionModes).toEqual(['doc_link']);

      const log = await entries();
      expect(log.find((e) => e.action === 'assessment.created')?.after).toMatchObject({
        submissionModes: 'pdf_upload,photo_upload',
      });
      const edit = log.find((e) => e.action === 'assessment.updated');
      expect(edit?.before).toMatchObject({ submissionModes: 'pdf_upload,photo_upload' });
      expect(edit?.after).toMatchObject({ submissionModes: 'doc_link' });
    });

    it('defaults to [] ("not stated") and leaves the upload rules governing as before', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      expect(created.submissionModes).toEqual([]);
      expect(created.allowedFileTypes).toEqual(['application/pdf']);
    });

    it('D-47: derives the accepted file types from the modes, on create and on update', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        allowedFileTypes: ['text/plain'],
        submissionModes: ['photo_upload'],
      });
      expect(created.allowedFileTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      const pdf = await authoring.update(created.id, ADMIN, { submissionModes: ['pdf_upload'] });
      expect(pdf.allowedFileTypes).toEqual(['application/pdf']);
      // A lone edit of the types cannot make them disagree with the stated modes.
      const forced = await authoring.update(created.id, ADMIN, { allowedFileTypes: ['text/plain'] });
      expect(forced.allowedFileTypes).toEqual(['application/pdf']);
    });

    it('D-48 (b): refuses an upload mode while file storage is off, and still allows a link', async () => {
      const off = vi.spyOn(uploads, 'enabled', 'get').mockReturnValue(false);
      try {
        await expect(
          authoring.create('course-1', ADMIN, { ...TASK, submissionModes: ['pdf_upload'] }),
        ).rejects.toThrow(UPLOAD_MODES_NEED_STORAGE);
        await expect(
          authoring.create('course-1', ADMIN, { ...TASK, submissionModes: ['doc_link', 'photo_upload'] }),
        ).rejects.toThrow(UPLOAD_MODES_NEED_STORAGE);
        const link = await authoring.create('course-1', ADMIN, { ...TASK, submissionModes: ['doc_link'] });
        expect(link.submissionModes).toEqual(['doc_link']);
        await expect(
          authoring.update(link.id, ADMIN, { submissionModes: ['photo_upload'] }),
        ).rejects.toThrow(UPLOAD_MODES_NEED_STORAGE);
        // An edit that does not SET the modes is not refused (an older task keeps them).
        await expect(authoring.update(link.id, ADMIN, { title: 'Renamed' })).resolves.toMatchObject({ title: 'Renamed' });
      } finally {
        off.mockRestore();
      }
    });
  });

  /** `D-30` (B-3 → a, no counts). */
  describe('the staff task status (D-30)', () => {
    const now = new Date('2026-09-22T12:00:00Z');
    const past = '2026-09-01T00:00:00Z';
    const future = '2026-10-01T00:00:00Z';

    it('open while now <= dueAt, whatever has been submitted', () => {
      expect(staffTaskStatusOf({ dueAt: future }, [{ dueAt: null }], { total: 0, ungraded: 0 }, now)).toBe('open');
      expect(staffTaskStatusOf({ dueAt: future }, [{ dueAt: null }], { total: 3, ungraded: 3 }, now)).toBe('open');
      // Exactly at the due instant is still open (<=).
      expect(staffTaskStatusOf({ dueAt: '2026-09-22T12:00:00Z' }, [], { total: 0, ungraded: 0 }, now)).toBe('open');
    });

    it('marking when past due with any ungraded submission; marked when every submission is graded', () => {
      expect(staffTaskStatusOf({ dueAt: past }, [{ dueAt: null }], { total: 3, ungraded: 1 }, now)).toBe('marking');
      expect(staffTaskStatusOf({ dueAt: past }, [{ dueAt: null }], { total: 3, ungraded: 0 }, now)).toBe('marked');
    });

    it('uses each group’s own due date: an override in the future keeps the task open', () => {
      expect(staffTaskStatusOf({ dueAt: past }, [{ dueAt: future }], { total: 0, ungraded: 0 }, now)).toBe('open');
    });

    it('is closed past due with nothing submitted (D-34)', () => {
      expect(staffTaskStatusOf({ dueAt: past }, [{ dueAt: null }], { total: 0, ungraded: 0 }, now)).toBe('closed');
    });

    it('lets the latest due date drive it: open until every group is past its own due date (D-35)', () => {
      // One group past due, one not: still open, whatever is submitted.
      expect(
        staffTaskStatusOf({ dueAt: past }, [{ dueAt: null }, { dueAt: future }], { total: 2, ungraded: 0 }, now),
      ).toBe('open');
      // Every group past due: the normal three.
      const earlier = '2026-08-01T00:00:00Z';
      const both = [{ dueAt: earlier }, { dueAt: null }];
      expect(staffTaskStatusOf({ dueAt: past }, both, { total: 2, ungraded: 1 }, now)).toBe('marking');
      expect(staffTaskStatusOf({ dueAt: past }, both, { total: 2, ungraded: 0 }, now)).toBe('marked');
      expect(staffTaskStatusOf({ dueAt: past }, both, { total: 0, ungraded: 0 }, now)).toBe('closed');
    });

    it('derives it on the list and filters by it; every task has one', async () => {
      // The seeds: assess-3 is past due with its one submission graded,
      // assess-4 past due with its one submission ungraded, assess-2 past due
      // with nothing submitted.
      const list = await authoring.listForStaff(ADMIN, {});
      const statusOf = (id: string) => list.find((t) => t.id === id)?.status;
      expect(statusOf('assess-3')).toBe('marked');
      expect(statusOf('assess-4')).toBe('marking');
      expect(statusOf('assess-2')).toBe('closed');
      expect(list.every((t) => t.status !== null && t.status !== undefined)).toBe(true);

      for (const status of ['open', 'marking', 'marked', 'closed'] as const) {
        const rows = await authoring.listForStaff(ADMIN, { status });
        expect(rows.every((t) => t.status === status)).toBe(true);
      }
      expect((await authoring.listForStaff(ADMIN, { status: 'closed' })).map((t) => t.id)).toContain('assess-2');
    });

    it('gives an assistant the same status the teacher sees (viewer-independent)', async () => {
      const group3 = await groups.create({
        name: 'Status cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2026-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        dueAt: '2026-02-01T00:00:00Z',
        targets: [
          { groupId: 'group-1' },
          // The unheld group's own due date is in the future.
          { groupId: group3.id, dueAt: '2098-01-01T00:00:00Z' },
        ],
      });
      const teacher = (await authoring.listForStaff(ADMIN, {})).find((t) => t.id === created.id);
      const ta = (await authoring.listForStaff(TA, {})).find((t) => t.id === created.id);
      expect(ta?.status).toBe(teacher?.status);
      expect(ta?.targets.map((t) => t.groupId)).toEqual(['group-1']);
    });
  });

  /** Review round 1: `F-1`, `F-3` (`D-36`), deviation 3 (`D-37`). */
  describe('review round 1', () => {
    const OPEN = {
      availableFrom: '2026-01-01T00:00:00Z',
      availableTo: '2099-01-01T00:00:00Z',
      dueAt: '2098-01-01T00:00:00Z',
    };
    const syncOneResult = (assessmentId: string, studentId: string | null) =>
      work.replaceResults(assessmentId, 'google_form', [
        {
          assessmentId,
          provider: 'google_form',
          externalId: `resp-${assessmentId}`,
          studentId,
          respondentId: 'someone@example.com',
          score: null,
          maxScore: null,
          submittedAt: '2026-09-20T10:00:00Z',
          raw: {},
        },
      ]);

    it('F-1: a title-only PATCH on a drifted task succeeds and leaves the marker as it was', async () => {
      const group3 = await groups.create({
        name: 'F-1 cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const created = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-1' });
      await authoring.setTargets(created.id, ADMIN, [{ groupId: 'group-1' }, { groupId: group3.id }]);
      expect((await authoring.listForStaff(ADMIN, {})).find((t) => t.id === created.id)?.markerDrift).toBe(true);

      // What the edit form sends: the unchanged marker alongside the edit.
      const saved = await authoring.update(created.id, ADMIN, { title: 'Typo fixed', markerId: 'assistant-1' });
      expect(saved.title).toBe('Typo fixed');
      expect(saved.markerId).toBe('assistant-1');
      // A CHANGED marker is still validated.
      await expect(
        authoring.update(created.id, ADMIN, { markerId: 'assistant-2' }),
      ).rejects.toThrow(MARKER_NOT_ELIGIBLE);
    });

    it('F-3 / D-36: a task with a synced external result cannot be hidden (409); without one it can', async () => {
      const answered = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN, title: 'Answered form' });
      await syncOneResult(answered.id, 'student-1');
      await expect(
        authoring.update(answered.id, ADMIN, { visibility: 'hidden' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // An unmatched response is still somebody's work.
      const unmatched = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN, title: 'Unmatched form' });
      await syncOneResult(unmatched.id, null);
      await expect(
        authoring.update(unmatched.id, ADMIN, { visibility: 'hidden' }),
      ).rejects.toBeInstanceOf(ConflictException);

      const quiet = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN, title: 'Nobody answered' });
      expect((await authoring.update(quiet.id, ADMIN, { visibility: 'hidden' })).visibility).toBe('hidden');
    });

    it('F-3 / D-36: a task with a synced external result cannot be deleted (409); without one it can', async () => {
      const answered = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN, title: 'Answered, then deleted?' });
      await syncOneResult(answered.id, 'student-1');
      await expect(authoring.remove(answered.id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect((await authoring.list('course-1', ADMIN)).map((a) => a.id)).toContain(answered.id);
      expect(await work.findResults(answered.id)).toHaveLength(1);

      const quiet = await authoring.create('course-1', ADMIN, { ...TASK, ...OPEN, title: 'Deletable' });
      await authoring.remove(quiet.id, ADMIN);
      expect((await authoring.list('course-1', ADMIN)).map((a) => a.id)).not.toContain(quiet.id);
    });

    it('D-37: scheduled follows the EARLIEST group opening, counting per-group overrides', () => {
      const now = new Date('2026-09-22T12:00:00Z');
      const task = { visibility: 'published' as const, availableFrom: '2026-10-01T00:00:00Z' };
      // The task's own opening is in the future, but one group opens earlier.
      expect(visibilityStateOf(task, now, [{ availableFrom: null }, { availableFrom: '2026-09-01T00:00:00Z' }])).toBe('published');
      // Every group opens in the future.
      expect(visibilityStateOf(task, now, [{ availableFrom: null }, { availableFrom: '2026-11-01T00:00:00Z' }])).toBe('scheduled');
      // The task opened, but every group's override is later.
      expect(
        visibilityStateOf({ ...task, availableFrom: '2026-09-01T00:00:00Z' }, now, [{ availableFrom: '2026-10-05T00:00:00Z' }]),
      ).toBe('scheduled');
    });

    it('D-37: the staff list applies it through the whole audience', async () => {
      const group3 = await groups.create({
        name: 'Early cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        availableFrom: '2098-01-01T00:00:00Z',
        availableTo: '2099-01-01T00:00:00Z',
        dueAt: '2098-06-01T00:00:00Z',
        targets: [{ groupId: 'group-1' }, { groupId: group3.id, availableFrom: '2026-01-01T00:00:00Z' }],
      });
      const teacherRow = (await authoring.listForStaff(ADMIN, {})).find((t) => t.id === created.id);
      expect(teacherRow?.visibilityState).toBe('published');
      // The same label for assistant-1, who sees only group-1.
      const taRow = (await authoring.listForStaff(TA, {})).find((t) => t.id === created.id);
      expect(taRow?.visibilityState).toBe('published');
    });
  });

  /** Re-check 1, `R1-1`: the unchanged-marker no-op, and its limit. */
  describe('R1-1: an assistant re-sending the current marker', () => {
    it('is a no-op 200 that keeps the marker; a DIFFERENT marker is still 403', async () => {
      const created = await authoring.create('course-1', ADMIN, { ...TASK, markerId: 'assistant-1' });
      const saved = await authoring.update(created.id, TA, { title: 'Edited by the TA', markerId: 'assistant-1' });
      expect(saved.markerId).toBe('assistant-1');
      expect(saved.title).toBe('Edited by the TA');
      await expect(
        authoring.update(created.id, TA, { markerId: 'teacher-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        authoring.update(created.id, TA, { markerId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await authoring.list('course-1', ADMIN)).find((a) => a.id === created.id)?.markerId).toBe('assistant-1');
    });
  });
});
