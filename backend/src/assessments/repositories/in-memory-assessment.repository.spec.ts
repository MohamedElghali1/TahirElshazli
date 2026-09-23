import { InMemoryAssessmentRepository } from './in-memory-assessment.repository.js';
import type { NewAssessment } from '../interfaces/assessment-repository.interface.js';

/**
 * The memory driver's half of the unit-6 column contract. The Postgres half is
 * `postgres-repositories.integration-spec.ts` → "assessments: unit-6 columns";
 * the two drivers back one interface, so both halves assert the same things.
 */
const NEW_TASK: NewAssessment = {
  courseId: 'course-1',
  lessonId: null,
  title: 'Memory task',
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
  draftId: null,
  attachments: [],
};

describe('InMemoryAssessmentRepository: unit-6 columns', () => {
  let repo: InMemoryAssessmentRepository;
  beforeEach(() => {
    repo = new InMemoryAssessmentRepository();
  });

  it('seeds every task at the migration-018 defaults, on the student reads too', async () => {
    const seeded = await repo.findByIdForGroups('assess-1', ['group-1']);
    expect(seeded).toMatchObject({
      visibility: 'published',
      markerId: null,
      allowResubmission: true,
      submissionModes: [],
      draftId: null,
      attachments: [],
    });
    const listed = await repo.findByCourseForGroups('course-1', ['group-1']);
    expect(listed.every((a) => a.visibility === 'published')).toBe(true);
  });

  it('carries the new fields through create, update and the targeted reads', async () => {
    const created = await repo.create({
      ...NEW_TASK,
      visibility: 'hidden',
      markerId: 'teacher-1',
      allowResubmission: false,
      submissionModes: ['photo_upload'],
      attachments: [{ url: '/uploads/a.pdf', name: 'A', mimeType: null, sizeBytes: null, audience: 'students' }],
    });
    await repo.setTargets(created.id, [{ groupId: 'group-1' }]);
    const targeted = await repo.findByIdForGroups(created.id, ['group-1']);
    expect(targeted).toMatchObject({
      visibility: 'hidden',
      markerId: 'teacher-1',
      allowResubmission: false,
      submissionModes: ['photo_upload'],
    });

    const cleared = await repo.update(created.id, { markerId: null });
    expect(cleared?.markerId).toBeNull();
    expect(cleared?.visibility).toBe('hidden');
  });

  it('never aliases attachments between a read and the stored row (CLAUDE.md §9)', async () => {
    const created = await repo.create({
      ...NEW_TASK,
      attachments: [{ url: '/uploads/a.pdf', name: 'Before', mimeType: null, sizeBytes: null, audience: 'students' }],
    });
    const before = await repo.findById(created.id);
    await repo.update(created.id, {
      attachments: [{ url: '/uploads/a.pdf', name: 'After', mimeType: null, sizeBytes: null, audience: 'students' }],
    });
    expect(before?.attachments[0]?.name).toBe('Before');

    // Mutating what a read returned does not reach the store either.
    const read = await repo.findById(created.id);
    read!.attachments[0]!.name = 'Tampered';
    expect((await repo.findById(created.id))?.attachments[0]?.name).toBe('After');
  });

  it('findForStaff and findTargetsForAssessments restrict by reach, and treat % literally', async () => {
    const shared = await repo.create({ ...NEW_TASK, title: 'Shared 100% task' });
    await repo.setTargets(shared.id, [{ groupId: 'group-1' }, { groupId: 'group-3' }]);
    const onlyThird = await repo.create({ ...NEW_TASK, title: 'Only the third 100 task' });
    await repo.setTargets(onlyThird.id, [{ groupId: 'group-3' }]);

    const held = (await repo.findForStaff({ groupIds: ['group-1'] })).map((a) => a.id);
    expect(held).toContain(shared.id);
    expect(held).not.toContain(onlyThird.id);
    expect(await repo.findForStaff({ groupIds: [] })).toEqual([]);
    expect(
      (await repo.findForStaff({ groupIds: null, search: '100%' })).map((a) => a.id),
    ).toEqual([shared.id]);

    const targets = await repo.findTargetsForAssessments([shared.id], ['group-1']);
    expect(targets.map((t) => t.groupId)).toEqual(['group-1']);
    expect(await repo.findTargetsForAssessments([shared.id], [])).toEqual([]);
  });
});
