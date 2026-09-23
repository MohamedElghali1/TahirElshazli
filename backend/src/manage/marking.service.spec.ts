import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  MarkingService,
  QUEUE_NOT_HANDED_IN_HERE,
  RETURN_NEEDS_MARK,
  documentsOf,
} from './marking.service.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { NewAssessment } from '../assessments/interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { SUBMISSION_ANNOTATION_REPOSITORY } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import { InMemorySubmissionAnnotationRepository } from '../assessments/repositories/in-memory-submission-annotation.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import type { AuditAction } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';

const TEACHER = { id: 'teacher-1', role: 'teacher' };
const ADMIN = { id: 'admin-1', role: 'admin' };
/** Holds group-1 only. */
const A1 = { id: 'assistant-1', role: 'assistant' };
/** `assigned_groups`, holding nothing. */
const A2 = { id: 'assistant-2', role: 'assistant' };

const TASK: NewAssessment = {
  courseId: 'course-1',
  lessonId: null,
  title: 'Unit 7 task',
  description: '',
  instructions: '',
  type: 'homework',
  topics: [],
  availableFrom: '2026-01-01T00:00:00.000Z',
  availableTo: '2099-01-01T00:00:00.000Z',
  dueAt: '2098-01-01T00:00:00.000Z',
  maxScore: 20,
  allowedFileTypes: ['application/pdf'],
  maxFileSizeBytes: 1048576,
  workType: 'file_upload',
  externalUrl: null,
  visibility: 'published',
  markerId: null,
  allowResubmission: true,
  submissionModes: [],
  draftId: null,
  attachments: [],
};

/** The 404 message a promise rejects with, for `===` comparisons. */
async function notFound(p: Promise<unknown>): Promise<string> {
  const error = await p.then(
    () => {
      throw new Error('expected a 404');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NotFoundException);
  return (error as NotFoundException).message;
}

describe('MarkingService', () => {
  let marking: MarkingService;
  let assessments: InMemoryAssessmentRepository;
  let groups: InMemoryGroupRepository;
  let annotations: InMemorySubmissionAnnotationRepository;
  let audit: AuditService;
  /** course-1; student-2 moved out of group-1 into it. */
  let group3: string;

  const entries = async (action: AuditAction) =>
    (await audit.find({ action, limit: 100 })).entries;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MarkingService,
        SubmissionAccessService,
        StaffScopeService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: SUBMISSION_ANNOTATION_REPOSITORY, useClass: InMemorySubmissionAnnotationRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();
    marking = module.get(MarkingService);
    assessments = module.get(ASSESSMENT_REPOSITORY);
    groups = module.get(GROUP_REPOSITORY);
    annotations = module.get(SUBMISSION_ANNOTATION_REPOSITORY);
    audit = module.get(AuditService);

    group3 = (
      await groups.create({
        name: 'Group three',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      })
    ).id;
    await groups.removeMember('group-1', 'student-2');
    await groups.addMember({ groupId: group3, studentId: 'student-2', assignedBy: 'teacher-1' });
  });

  /** A task set for group-1 and group-3, with a submission from each student. */
  async function sharedTask() {
    const task = await assessments.create({ ...TASK, title: 'Shared' });
    await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
    const mine = await assessments.createSubmission(task.id, 'student-1', '/uploads/a.png', null);
    const theirs = await assessments.createSubmission(task.id, 'student-2', '/uploads/b.png', null);
    return { task, mine, theirs };
  }

  describe('return (MARK-2)', () => {
    it('returns a marked paper once, audited with before and after', async () => {
      const { mine } = await sharedTask();
      await assessments.gradeSubmission(mine.id, { score: 14, feedback: 'ok', annotatedFileUrl: undefined });

      const item = await marking.returnSubmission(mine.id, A1);
      expect(item.returnedAt).not.toBeNull();
      expect(item.status).toBe('graded');
      expect(item.score).toBe(14);

      const logged = await entries('submission.returned');
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetType: 'assessment_submission',
        targetId: mine.id,
        courseId: 'course-1',
        before: { returnedAt: null },
        after: { returnedAt: item.returnedAt, score: 14 },
      });
    });

    it('is idempotent: a re-return keeps the first time and writes no second entry', async () => {
      const { mine } = await sharedTask();
      await assessments.gradeSubmission(mine.id, { score: 10, feedback: null, annotatedFileUrl: undefined });
      const first = await marking.returnSubmission(mine.id, TEACHER);
      const again = await marking.returnSubmission(mine.id, TEACHER);
      expect(again.returnedAt).toBe(first.returnedAt);
      expect(await entries('submission.returned')).toHaveLength(1);
    });

    it('refuses an unmarked paper with 409 and writes nothing', async () => {
      const { mine } = await sharedTask();
      await expect(marking.returnSubmission(mine.id, TEACHER)).rejects.toBeInstanceOf(ConflictException);
      await expect(marking.returnSubmission(mine.id, TEACHER)).rejects.toThrow(RETURN_NEEDS_MARK);
      expect((await assessments.findSubmissionById(mine.id))!.returnedAt).toBeNull();
      expect(await entries('submission.returned')).toHaveLength(0);
    });

    it('lets the teacher and the full admin return any paper', async () => {
      const { mine, theirs } = await sharedTask();
      for (const s of [mine, theirs]) {
        await assessments.gradeSubmission(s.id, { score: 5, feedback: null, annotatedFileUrl: undefined });
      }
      expect((await marking.returnSubmission(mine.id, TEACHER)).returnedAt).not.toBeNull();
      expect((await marking.returnSubmission(theirs.id, ADMIN)).returnedAt).not.toBeNull();
    });

    it('404s an out-of-scope paper with the same body as a missing one, before the 409', async () => {
      const { theirs } = await sharedTask();
      // Unmarked on purpose: the scope check must answer before the state check.
      const missing = await notFound(marking.returnSubmission('nope', A1));
      const unheldGroup = await notFound(marking.returnSubmission(theirs.id, A1));
      const holdsNothing = await notFound(marking.returnSubmission(theirs.id, A2));
      expect(missing).toBe(SUBMISSION_NOT_FOUND);
      expect(unheldGroup === missing).toBe(true);
      expect(holdsNothing === missing).toBe(true);
    });
  });

  describe('the group-grain gate (SubmissionAccessService)', () => {
    it('refuses a task set for a held group when the student is not in one', async () => {
      // student-2 sits in group-3 only; the task is also set for group-1, which
      // assistant-1 holds - a course-grain check would have let this through.
      const { theirs } = await sharedTask();
      await assessments.gradeSubmission(theirs.id, { score: 5, feedback: null, annotatedFileUrl: undefined });
      expect(await notFound(marking.returnSubmission(theirs.id, A1))).toBe(SUBMISSION_NOT_FOUND);
    });

    it('refuses when the student is in a held group the task was not set for', async () => {
      const task = await assessments.create({ ...TASK, title: 'Group three only' });
      await assessments.setTargets(task.id, [{ groupId: group3 }]);
      // student-1 is in group-1 (held) - but this task was never set for group-1.
      const sub = await assessments.createSubmission(task.id, 'student-1', null, 'x');
      await assessments.gradeSubmission(sub.id, { score: 5, feedback: null, annotatedFileUrl: undefined });
      expect(await notFound(marking.returnSubmission(sub.id, A1))).toBe(SUBMISSION_NOT_FOUND);
      expect((await marking.returnSubmission(sub.id, TEACHER)).returnedAt).not.toBeNull();
    });
  });
  describe('the per-task queue (MARK-3)', () => {
    it('lists every targeted student, submitted or not, with the four statuses', async () => {
      const task = await assessments.create({ ...TASK, title: 'Queue' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
      const s1 = await assessments.createSubmission(task.id, 'student-1', null, 'work');
      const view = await marking.queue(task.id, TEACHER);
      expect(view.rows.map((r) => [r.studentId, r.status])).toEqual(
        expect.arrayContaining([['student-1', 'submitted'], ['student-2', 'not_submitted']]),
      );
      expect(view.rows.find((r) => r.studentId === 'student-2')!.submissionId).toBeNull();

      await assessments.gradeSubmission(s1.id, { score: 3, feedback: null, annotatedFileUrl: undefined });
      expect((await marking.queue(task.id, TEACHER)).rows.find((r) => r.studentId === 'student-1')!.status).toBe('marked');
      await assessments.returnSubmission(s1.id);
      const returned = (await marking.queue(task.id, TEACHER)).rows.find((r) => r.studentId === 'student-1')!;
      expect(returned.status).toBe('returned');
      expect(returned.score).toBe(3);
    });

    it('derives lateness and overdue from each student’s own group deadline', async () => {
      const task = await assessments.create({ ...TASK, title: 'Deadlines', dueAt: '2098-01-01T00:00:00.000Z' });
      // group-3 had a deadline in the past; group-1 inherits the far-future one.
      await assessments.setTargets(task.id, [
        { groupId: 'group-1' },
        { groupId: group3, dueAt: '2026-01-02T00:00:00.000Z' },
      ]);
      await assessments.createSubmission(task.id, 'student-1', null, 'on time');
      const rows = (await marking.queue(task.id, TEACHER)).rows;
      const s1 = rows.find((r) => r.studentId === 'student-1')!;
      const s2 = rows.find((r) => r.studentId === 'student-2')!;
      expect(s1).toMatchObject({ isLate: false, isOverdue: false, dueAt: '2098-01-01T00:00:00.000Z' });
      expect(s2).toMatchObject({ isLate: false, isOverdue: true, dueAt: '2026-01-02T00:00:00.000Z' });
    });

    it('shows a student in two reachable groups once, under the earliest placement', async () => {
      await groups.addMember({ groupId: group3, studentId: 'student-1', assignedBy: 'teacher-1' });
      const task = await assessments.create({ ...TASK, title: 'Twice placed' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
      const view = await marking.queue(task.id, TEACHER);
      const mine = view.rows.filter((r) => r.studentId === 'student-1');
      expect(mine).toHaveLength(1);
      expect(mine[0]!.groupId).toBe('group-1');
      // Counted in BOTH groups' figures: each is a fact about that group.
      const g3 = view.groups.find((g) => g.groupId === group3)!;
      expect(g3).toMatchObject({ memberCount: 2, notSubmitted: 2 });
    });

    it('narrows a scoped assistant to their groups: no unheld member, id or name', async () => {
      const task = await assessments.create({ ...TASK, title: 'Narrowed' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
      await assessments.createSubmission(task.id, 'student-2', null, 'theirs');
      const view = await marking.queue(task.id, A1);
      expect(view.rows.map((r) => r.studentId)).toEqual(['student-1']);
      expect(view.groups.map((g) => g.groupId)).toEqual(['group-1']);
      const wire = JSON.stringify(view);
      expect(wire).not.toContain(group3);
      expect(wire).not.toContain('Group three');
      expect(wire).not.toContain('student-2');
      expect(wire).not.toContain('Sara Ahmed');
    });

    it('counts per group, and never across groups', async () => {
      const task = await assessments.create({ ...TASK, title: 'Counts' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
      await assessments.createSubmission(task.id, 'student-2', null, 'x');
      const view = await marking.queue(task.id, TEACHER);
      expect(view.groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ groupId: 'group-1', memberCount: 1, notSubmitted: 1, submitted: 0 }),
          expect.objectContaining({ groupId: group3, memberCount: 1, notSubmitted: 0, submitted: 1 }),
        ]),
      );
      expect(Object.keys(view)).not.toContain('total');
    });

    it('answers 409 for work not handed in here', async () => {
      const task = await assessments.create({ ...TASK, title: 'Form', workType: 'google_form' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }]);
      await expect(marking.queue(task.id, TEACHER)).rejects.toThrow(QUEUE_NOT_HANDED_IN_HERE);
      await expect(marking.queue(task.id, TEACHER)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unreachable task with the same body as a missing one, before the 409', async () => {
      const task = await assessments.create({ ...TASK, title: 'Group three form', workType: 'link' });
      await assessments.setTargets(task.id, [{ groupId: group3 }]);
      const missing = await notFound(marking.queue('nope', A1));
      expect(missing).toBe(ASSESSMENT_NOT_FOUND);
      expect((await notFound(marking.queue(task.id, A1))) === missing).toBe(true);
      expect((await notFound(marking.queue(task.id, A2))) === missing).toBe(true);
    });

    it('counts current and stale annotations, and derives documents server-side', async () => {
      const task = await assessments.create({ ...TASK, title: 'Stale' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }]);
      const sub = await assessments.createSubmission(task.id, 'student-1', null, null, [
        { url: '/uploads/old.png', mimeType: 'image/png', sizeBytes: 1 },
      ]);
      await annotations.create({ submissionId: sub.id, fileUrl: '/uploads/old.png', page: 1, kind: 'tick', xPercent: 1, yPercent: 1, text: '', path: null, createdBy: 'teacher-1' });
      await assessments.updateSubmission(sub.id, 'student-1', null, undefined, [
        { url: '/uploads/new.pdf', mimeType: 'application/pdf', sizeBytes: 2 },
      ]);
      await annotations.create({ submissionId: sub.id, fileUrl: '/uploads/new.pdf', page: 2, kind: 'cross', xPercent: 1, yPercent: 1, text: '', path: null, createdBy: 'teacher-1' });
      const row = (await marking.queue(task.id, TEACHER)).rows.find((r) => r.studentId === 'student-1')!;
      expect(row).toMatchObject({ annotationCount: 1, staleAnnotationCount: 1 });
      expect(row.documents).toEqual([{ url: '/uploads/new.pdf', kind: 'pdf', annotatable: true }]);
    });
  });

  describe('documentsOf', () => {
    it('marks a pasted link unannotatable and a stored image or PDF annotatable', () => {
      expect(documentsOf({ fileUrl: 'https://docs.google.com/x', files: [] })).toEqual([
        { url: 'https://docs.google.com/x', kind: 'link', annotatable: false },
      ]);
      expect(
        documentsOf({
          fileUrl: null,
          files: [
            { url: '/uploads/a.jpg', mimeType: 'image/jpeg', sizeBytes: 1 },
            { url: '/uploads/b.txt', mimeType: 'text/plain', sizeBytes: 1 },
          ],
        }),
      ).toEqual([
        { url: '/uploads/a.jpg', kind: 'image', annotatable: true },
        { url: '/uploads/b.txt', kind: 'file', annotatable: false },
      ]);
    });
  });
});
