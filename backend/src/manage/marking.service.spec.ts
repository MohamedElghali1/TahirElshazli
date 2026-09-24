import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ANNOTATION_FILE_MISMATCH,
  ANNOTATION_FILE_NOT_STORED,
  ANNOTATION_NOT_FOUND,
  ANNOTATION_NOT_YOURS,
  MAX_ANNOTATIONS_PER_SUBMISSION,
  MarkingService,
  QUEUE_NOT_HANDED_IN_HERE,
  RETURN_NEEDS_MARK,
  documentsOf,
} from './marking.service.js';
import { ASSESSMENT_NOT_FOUND } from './assessment-authoring.service.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { GradingService } from './grading.service.js';
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
  let grading: GradingService;
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
        GradingService,
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
    grading = module.get(GradingService);
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
      const sub = await assessments.createSubmission(task.id, 'student-1', '/uploads/old.png', null);
      await annotations.create({ submissionId: sub.id, fileUrl: '/uploads/old.png', page: 1, kind: 'tick', xPercent: 1, yPercent: 1, text: '', path: null, createdBy: 'teacher-1' });
      await assessments.updateSubmission(sub.id, 'student-1', '/uploads/new.pdf', undefined);
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
      expect(documentsOf({ fileUrl: '/uploads/a.jpg', files: [] })).toEqual([
        { url: '/uploads/a.jpg', kind: 'image', annotatable: true },
      ]);
      expect(documentsOf({ fileUrl: '/uploads/b.pdf', files: [] })).toEqual([
        { url: '/uploads/b.pdf', kind: 'pdf', annotatable: true },
      ]);
      expect(documentsOf({ fileUrl: '/uploads/b.txt', files: [] })).toEqual([
        { url: '/uploads/b.txt', kind: 'file', annotatable: false },
      ]);
      expect(documentsOf({ fileUrl: null, files: [] })).toEqual([]);
    });

    it('lists an uploaded set in order, each judged by its server-minted type (D-47)', () => {
      expect(
        documentsOf({
          fileUrl: null,
          files: [
            { url: '/uploads/a.jpg', mimeType: 'image/jpeg' },
            { url: '/uploads/b.png', mimeType: 'image/png' },
          ],
        }),
      ).toEqual([
        { url: '/uploads/a.jpg', kind: 'image', annotatable: true },
        { url: '/uploads/b.png', kind: 'image', annotatable: true },
      ]);
    });
  });
  describe('annotations (MARK-1, D-42)', () => {
    const PHOTO = '/uploads/aaaaaaaa-0000-4000-8000-000000000001.png';
    const tick = { fileUrl: PHOTO, page: 1, kind: 'tick' as const, xPercent: 10, yPercent: 20 };

    /** student-1's paper on a group-1 task, carrying one stored photo. */
    async function paper() {
      const task = await assessments.create({ ...TASK, title: 'Marked up' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }, { groupId: group3 }]);
      // A platform-stored file no student route can create yet (B-2 is open):
      // manufactured here, as the plan's browser fixture is.
      const sub = await assessments.createSubmission(task.id, 'student-1', PHOTO, null);
      const theirs = await assessments.createSubmission(task.id, 'student-2', PHOTO, null);
      return { sub, theirs };
    }

    it('creates, lists with the author name, updates and erases, auditing each write', async () => {
      const { sub } = await paper();
      const created = await marking.createAnnotation(sub.id, A1, tick);
      expect(created).toMatchObject({ kind: 'tick', createdBy: 'assistant-1', createdByName: 'Nour Hassan', text: '', path: null });

      const stroke = await marking.createAnnotation(sub.id, TEACHER, {
        ...tick, kind: 'pen', path: [[10, 20], [11, 21], [12, 22]],
      });
      expect(stroke.path).toHaveLength(3);
      // Same page and possibly the same millisecond, so the order's tie-break
      // is the id (`(page, createdAt, id)`): compared as a set here.
      expect((await marking.listAnnotations(sub.id, TEACHER)).map((a) => a.id).sort()).toEqual(
        [created.id, stroke.id].sort(),
      );

      const moved = await marking.updateAnnotation(sub.id, created.id, A1, { xPercent: 55 });
      expect(moved.xPercent).toBe(55);
      await marking.removeAnnotation(sub.id, stroke.id, TEACHER);
      expect((await marking.listAnnotations(sub.id, TEACHER)).map((a) => a.id)).toEqual([created.id]);

      const logged = await entries('submission.annotated');
      expect(logged).toHaveLength(4);
      // The entry for the edit: `before` is the stored mark BEFORE the move -
      // not an alias of `after` (CLAUDE.md §9).
      const edit = logged.find((e) => e.before !== null && e.after !== null)!;
      expect(edit.before).toMatchObject({ annotationId: created.id, xPercent: 10 });
      expect(edit.after).toMatchObject({ annotationId: created.id, xPercent: 55 });
      const erase = logged.find((e) => e.after === null)!;
      expect(erase.before).toMatchObject({ annotationId: stroke.id, kind: 'pen', pathPoints: 3 });
      expect(logged.every((e) => e.targetType === 'assessment_submission' && e.targetId === sub.id)).toBe(true);
    });

    it('refuses a file this submission does not carry, and a pasted link', async () => {
      const { sub } = await paper();
      await expect(marking.createAnnotation(sub.id, TEACHER, { ...tick, fileUrl: '/uploads/other.png' }))
        .rejects.toThrow(ANNOTATION_FILE_MISMATCH);
      const task = await assessments.create({ ...TASK, title: 'Link' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }]);
      const link = await assessments.createSubmission(task.id, 'student-1', 'https://docs.google.com/d/1', null);
      await expect(marking.createAnnotation(link.id, TEACHER, { ...tick, fileUrl: 'https://docs.google.com/d/1' }))
        .rejects.toThrow(ANNOTATION_FILE_NOT_STORED);
    });

    it('refuses an incoherent mark with a 400', async () => {
      const { sub } = await paper();
      await expect(marking.createAnnotation(sub.id, TEACHER, { ...tick, kind: 'pen' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(marking.createAnnotation(sub.id, TEACHER, { ...tick, path: [[1, 1], [2, 2]] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(marking.createAnnotation(sub.id, TEACHER, { ...tick, kind: 'comment', text: '  ' })).rejects.toBeInstanceOf(BadRequestException);
      const pin = await marking.createAnnotation(sub.id, TEACHER, tick);
      // Coherence is re-checked against the STORED kind on an edit.
      await expect(marking.updateAnnotation(sub.id, pin.id, TEACHER, { path: [[1, 1], [2, 2]] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('caps a paper at the storage bound', async () => {
      const { sub } = await paper();
      for (let i = 0; i < MAX_ANNOTATIONS_PER_SUBMISSION; i += 1) {
        await annotations.create({ submissionId: sub.id, fileUrl: PHOTO, page: 1, kind: 'tick', xPercent: 1, yPercent: 1, text: '', path: null, createdBy: 'teacher-1' });
      }
      await expect(marking.createAnnotation(sub.id, TEACHER, tick)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('D-42 (a): only the author may change or erase a mark - 403, even for the teacher', async () => {
      const { sub } = await paper();
      const teachers = await marking.createAnnotation(sub.id, TEACHER, tick);
      const assistants = await marking.createAnnotation(sub.id, A1, tick);
      await expect(marking.removeAnnotation(sub.id, teachers.id, A1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(marking.removeAnnotation(sub.id, teachers.id, A1)).rejects.toThrow(ANNOTATION_NOT_YOURS);
      await expect(marking.updateAnnotation(sub.id, assistants.id, TEACHER, { xPercent: 1 })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(marking.removeAnnotation(sub.id, assistants.id, ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await marking.listAnnotations(sub.id, TEACHER)).toHaveLength(2);
    });

    it('D-42 (b): marking up a returned paper is allowed, and audited', async () => {
      const { sub } = await paper();
      await assessments.gradeSubmission(sub.id, { score: 5, feedback: null, annotatedFileUrl: undefined });
      await assessments.returnSubmission(sub.id);
      const late = await marking.createAnnotation(sub.id, TEACHER, tick);
      await marking.updateAnnotation(sub.id, late.id, TEACHER, { yPercent: 99 });
      expect(await entries('submission.annotated')).toHaveLength(2);
    });

    it('404s a mark id from another paper exactly like a missing one', async () => {
      const { sub } = await paper();
      const other = await paper();
      const elsewhere = await marking.createAnnotation(other.sub.id, TEACHER, tick);
      const missing = await notFound(marking.removeAnnotation(sub.id, 'nope', TEACHER));
      expect(missing).toBe(ANNOTATION_NOT_FOUND);
      expect((await notFound(marking.removeAnnotation(sub.id, elsewhere.id, TEACHER))) === missing).toBe(true);
      expect((await notFound(marking.updateAnnotation(sub.id, elsewhere.id, TEACHER, { xPercent: 1 }))) === missing).toBe(true);
    });

    it('answers an out-of-scope paper with the submission 404 before any 403', async () => {
      const { theirs } = await paper();
      const mark = await marking.createAnnotation(theirs.id, TEACHER, tick);
      const missing = await notFound(marking.listAnnotations('nope', A1));
      for (const call of [
        marking.listAnnotations(theirs.id, A1),
        marking.createAnnotation(theirs.id, A1, tick),
        marking.updateAnnotation(theirs.id, mark.id, A1, { xPercent: 1 }),
        marking.removeAnnotation(theirs.id, mark.id, A1),
        marking.listAnnotations(theirs.id, A2),
      ]) {
        expect((await notFound(call)) === missing).toBe(true);
      }
    });
  });

  describe('D-44: /grade and the course queue at the group grain (7j)', () => {
    it('grades a reachable paper and 404s an unreachable one exactly like a missing one', async () => {
      const { mine, theirs } = await sharedTask();
      await expect(grading.grade(mine.id, A1, { score: 10 })).resolves.toMatchObject({ score: 10 });
      const missing = await notFound(grading.grade('nope', A1, { score: 1 }));
      expect(missing).toBe(SUBMISSION_NOT_FOUND);
      // student-2 sits in group-3, which assistant-1 does not hold - before
      // D-44, holding any group on course-1 reached this paper.
      expect((await notFound(grading.grade(theirs.id, A1, { score: 1 }))) === missing).toBe(true);
      expect((await notFound(grading.grade(mine.id, A2, { score: 1 }))) === missing).toBe(true);
      await expect(grading.grade(theirs.id, TEACHER, { score: 12 })).resolves.toMatchObject({ score: 12 });
    });

    it('narrows the course queue items to held groups; the averages stay course-wide', async () => {
      const { mine, theirs } = await sharedTask();
      await grading.grade(mine.id, TEACHER, { score: 10 });
      await grading.grade(theirs.id, TEACHER, { score: 20 });
      const forTeacher = await grading.queue('course-1', TEACHER);
      const forA1 = await grading.queue('course-1', A1);
      const ids = (q: typeof forA1) => q.items.map((i) => i.submissionId);
      expect(ids(forTeacher)).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      expect(ids(forA1)).toContain(mine.id);
      expect(ids(forA1)).not.toContain(theirs.id);
      // The residue D-44 records: a figure about the whole course, identical
      // for every viewer, carrying no row-level data.
      expect(forA1.assessments).toEqual(forTeacher.assessments);
    });
  });

  describe('D-43: the first saved mark or annotation claims an unclaimed task (7l)', () => {
    const markerOf = async (id: string) => (await assessments.findById(id))!.markerId;

    it('claims on the first grade, audited once, and never over an existing marker', async () => {
      const { task, mine, theirs } = await sharedTask();
      await grading.grade(mine.id, TEACHER, { score: 10 });
      expect(await markerOf(task.id)).toBe('teacher-1');
      await grading.grade(theirs.id, ADMIN, { score: 11 });
      expect(await markerOf(task.id)).toBe('teacher-1');
      const claims = (await entries('assessment.updated')).filter((e) => e.targetId === task.id);
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({
        actorId: 'teacher-1',
        before: { markerId: null },
        after: { markerId: 'teacher-1', claimedBy: 'first saved mark' },
      });
    });

    it('lets an assistant claim for themselves when they reach every targeted group', async () => {
      const task = await assessments.create({ ...TASK, title: 'Group-1 only' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }]);
      const sub = await assessments.createSubmission(task.id, 'student-1', null, 'work');
      await grading.grade(sub.id, A1, { score: 9 });
      expect(await markerOf(task.id)).toBe('assistant-1');
    });

    it('does not claim for an assistant who reaches only some of the targeted groups', async () => {
      const { task, mine } = await sharedTask();
      await grading.grade(mine.id, A1, { score: 9 });
      // The mark is saved; the claim writes nothing D-32 would refuse to name.
      expect(await markerOf(task.id)).toBeNull();
      expect((await entries('assessment.updated')).filter((e) => e.targetId === task.id)).toEqual([]);
    });

    it('claims on the first annotation too', async () => {
      const task = await assessments.create({ ...TASK, title: 'Annotated first' });
      await assessments.setTargets(task.id, [{ groupId: 'group-1' }]);
      const photo = '/uploads/aaaaaaaa-0000-4000-8000-00000000000a.png';
      const sub = await assessments.createSubmission(task.id, 'student-1', photo, null);
      await marking.createAnnotation(sub.id, TEACHER, {
        fileUrl: photo, page: 1, kind: 'tick', xPercent: 5, yPercent: 5,
      });
      expect(await markerOf(task.id)).toBe('teacher-1');
      const claim = (await entries('assessment.updated')).find((e) => e.targetId === task.id);
      expect(claim?.after).toMatchObject({ claimedBy: 'first annotation' });
    });

    it('never claims on a read', async () => {
      const { task } = await sharedTask();
      await marking.queue(task.id, TEACHER);
      expect(await markerOf(task.id)).toBeNull();
    });
  });
});
