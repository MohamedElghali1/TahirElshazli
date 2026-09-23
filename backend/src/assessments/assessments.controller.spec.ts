import { Test, TestingModule } from '@nestjs/testing';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from './repositories/in-memory-assessment.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { WORK_REPOSITORY } from './interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from './repositories/in-memory-work.repository.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};
const OTHER_STUDENT = {
  user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
};

describe('AssessmentsController', () => {
  let controller: AssessmentsController;

  beforeEach(async () => {
    // Status is derived from "now" vs. the stored window, so pin the clock.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        // Work is set per group now (CLAUDE.md §5.16), so the student read
        // filters through this. Real implementation, not a stub: the filter
        // is the behaviour under test.
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        StudentGroupsService,
        AssessmentsService,
        { provide: DATABASE_POOL, useValue: null },
        DatabaseService,
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        // Work types and mirrored external results. The real implementation
        // rather than a stub, for the same reason as the group repository
        // above: the fixtures are all `file_upload`, so this returning nothing
        // is exactly the behaviour every existing assertion depends on, and a
        // stub would let a regression in that path pass unnoticed.
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssessmentsController>(AssessmentsController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should compute every status from timestamps and submission state', async () => {
    const items = await controller.listAssessments('course-1', {}, STUDENT);
    const byId = new Map(items.map((a) => [a.id, a.status]));
    expect(byId.get('assess-1')).toBe('available'); // window open, nothing submitted
    expect(byId.get('assess-2')).toBe('locked'); // opens 2026-09-10
    expect(byId.get('assess-3')).toBe('corrected'); // marked
    expect(byId.get('assess-4')).toBe('submitted'); // awaiting feedback
  });

  it('should recompute a locked item as available once its window opens', async () => {
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    const items = await controller.listAssessments('course-1', {}, STUDENT);
    expect(items.find((a) => a.id === 'assess-2')?.status).toBe('available');
  });

  it('should show the same item as available to a student with no submission', async () => {
    const items = await controller.listAssessments('course-1', {}, OTHER_STUDENT);
    // student-2 has submitted nothing, so nothing can read as submitted/corrected.
    expect(items.every((a) => a.status === 'available' || a.status === 'locked')).toBe(
      true,
    );
  });

  it('should filter by type for the Answer screen tabs', async () => {
    const quizzes = await controller.listAssessments(
      'course-1',
      { type: 'quiz' },
      STUDENT,
    );
    expect(quizzes).toHaveLength(3);
    expect(quizzes.every((a) => a.type === 'quiz')).toBe(true);
  });

  it('should expose the score only once corrected', async () => {
    const items = await controller.listAssessments('course-1', {}, STUDENT);
    const corrected = items.find((a) => a.id === 'assess-3');
    expect(corrected).toMatchObject({ score: 35, maxScore: 40, scorePercentage: 88 });
    // Submitted-but-unmarked work must not leak a score.
    expect(items.find((a) => a.id === 'assess-4')?.score).toBeNull();
  });

  it('should flag an unsubmitted past-due item as overdue', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    const items = await controller.listAssessments('course-1', {}, STUDENT);
    expect(items.find((a) => a.id === 'assess-1')?.isOverdue).toBe(true);
    // assess-4 was submitted 2026-08-24, ahead of its 2026-08-25 due date, so
    // it stays on time. Lateness follows the submission, not the clock - a
    // submitted item CAN be overdue if the work arrived after dueAt.
    expect(items.find((a) => a.id === 'assess-4')?.isOverdue).toBe(false);
  });

  it('should return detail with the per-assessment upload rules', async () => {
    const detail = await controller.getAssessmentDetail('assess-1', STUDENT);
    expect(detail.allowedFileTypes).toEqual(['application/pdf']);
    expect(detail.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    expect(detail.canSubmit).toBe(true);
    expect(detail.instructions).toContain('Answer all six questions');
  });

  it('should attach the annotated copy to a corrected submission', async () => {
    const detail = await controller.getAssessmentDetail('assess-3', STUDENT);
    expect(detail.status).toBe('corrected');
    expect(detail.canSubmit).toBe(false);
    expect(detail.submission?.annotatedFileUrl).toContain('midterm-corrected.pdf');
    // The original upload is preserved alongside the annotated version.
    expect(detail.submission?.fileUrl).toContain('midterm.pdf');
  });

  it('should accept a submission and flip the status to submitted', async () => {
    const created = await controller.submitAssessment(
      'assess-1',
      { fileUrl: 'https://storage.example.com/submissions/new.pdf' },
      STUDENT,
    );
    expect(created.assessmentId).toBe('assess-1');
    const detail = await controller.getAssessmentDetail('assess-1', STUDENT);
    expect(detail.status).toBe('submitted');
  });

  it('should replace an existing submission before the window closes', async () => {
    const updated = await controller.submitAssessment(
      'assess-4',
      { fileUrl: 'https://storage.example.com/submissions/moles-v2.pdf' },
      STUDENT,
    );
    expect(updated.id).toBe('sub-2');
    expect(updated.fileUrl).toContain('moles-v2.pdf');
  });

  it('should keep an uploaded file when a resubmission only sends text', async () => {
    // The edit used to null out whichever field the student left out, silently
    // destroying an already-uploaded file.
    const updated = await controller.submitAssessment(
      'assess-4',
      { answerText: 'Adding a note to my existing upload.' },
      STUDENT,
    );
    expect(updated.fileUrl).toContain('moles-hw.pdf');
    expect(updated.answerText).toBe('Adding a note to my existing upload.');
  });

  it('should archive the previous content as a revision on resubmission', async () => {
    await controller.submitAssessment(
      'assess-4',
      { fileUrl: 'https://storage.example.com/submissions/moles-v2.pdf' },
      STUDENT,
    );
    const detail = await controller.getAssessmentDetail('assess-4', STUDENT);
    expect(detail.submission?.revisions).toHaveLength(1);
    expect(detail.submission?.revisions[0].fileUrl).toContain('moles-hw.pdf');
  });

  it('should advance lastSubmittedAt but never submittedAt on resubmission', async () => {
    // Otherwise a placeholder filed before the deadline, then swapped for real
    // work afterwards, still reads as an on-time submission.
    const before = await controller.getAssessmentDetail('assess-4', STUDENT);
    const originalSubmittedAt = before.submission!.submittedAt;

    const updated = await controller.submitAssessment(
      'assess-4',
      { fileUrl: 'https://storage.example.com/submissions/moles-v3.pdf' },
      STUDENT,
    );
    expect(updated.submittedAt).toBe(originalSubmittedAt);
    expect(new Date(updated.lastSubmittedAt).getTime()).toBeGreaterThan(
      new Date(originalSubmittedAt).getTime(),
    );
  });

  it('should refuse to submit to a locked assessment', async () => {
    await expect(
      controller.submitAssessment(
        'assess-2',
        { fileUrl: 'https://storage.example.com/submissions/early.pdf' },
        STUDENT,
      ),
    ).rejects.toThrow();
  });

  it('should refuse to change an already-corrected submission', async () => {
    await expect(
      controller.submitAssessment(
        'assess-3',
        { fileUrl: 'https://storage.example.com/submissions/redo.pdf' },
        STUDENT,
      ),
    ).rejects.toThrow();
  });

  it('should require a file or typed answer', async () => {
    await expect(
      controller.submitAssessment('assess-1', {}, STUDENT),
    ).rejects.toThrow();
  });

  it('should 404 an unknown assessment', async () => {
    await expect(
      controller.getAssessmentDetail('assess-nope', STUDENT),
    ).rejects.toThrow();
  });

  // assess-2 window: availableFrom 2026-09-10T18:00:00Z, availableTo 2026-09-17T23:59:59Z
  describe('status derivation at the exact window boundaries', () => {
    const statusOf = async (iso: string) => {
      vi.setSystemTime(new Date(iso));
      const items = await controller.listAssessments('course-1', {}, STUDENT);
      return items.find((a) => a.id === 'assess-2')?.status;
    };

    it('is locked one millisecond before availableFrom', async () => {
      expect(await statusOf('2026-09-10T17:59:59.999Z')).toBe('locked');
    });

    it('is available exactly at availableFrom', async () => {
      expect(await statusOf('2026-09-10T18:00:00.000Z')).toBe('available');
    });

    it('is available exactly at availableTo', async () => {
      expect(await statusOf('2026-09-17T23:59:59.000Z')).toBe('available');
    });

    it('is locked one millisecond after availableTo', async () => {
      expect(await statusOf('2026-09-17T23:59:59.001Z')).toBe('locked');
    });

    it('stays locked long after the window has closed', async () => {
      expect(await statusOf('2027-01-01T00:00:00.000Z')).toBe('locked');
    });
  });

  describe('overdue derivation at the exact due timestamp', () => {
    // assess-1 dueAt 2026-09-05T23:59:59Z, never submitted by student-1.
    const overdueOf = async (iso: string) => {
      vi.setSystemTime(new Date(iso));
      const items = await controller.listAssessments('course-1', {}, STUDENT);
      return items.find((a) => a.id === 'assess-1')?.isOverdue;
    };

    it('is not overdue exactly at dueAt', async () => {
      expect(await overdueOf('2026-09-05T23:59:59.000Z')).toBe(false);
    });

    it('is overdue one millisecond after dueAt', async () => {
      expect(await overdueOf('2026-09-05T23:59:59.001Z')).toBe(true);
    });
  });

  describe('course-scoped authorization', () => {
    // student-2 is enrolled in course-1 only. All assess-* belong to course-1,
    // so use a student enrolled nowhere to prove the gate bites.
    const STRANGER = {
      user: { sub: 'student-999', email: 'x@example.com', role: 'student', jti: 'j9' },
    };

    it('refuses to list assessments for a course the caller is not enrolled in', async () => {
      await expect(
        controller.listAssessments('course-1', {}, STRANGER),
      ).rejects.toThrow();
    });

    it('refuses assessment detail to a non-enrolled student', async () => {
      await expect(
        controller.getAssessmentDetail('assess-1', STRANGER),
      ).rejects.toThrow();
    });

    it('refuses a submission from a non-enrolled student', async () => {
      await expect(
        controller.submitAssessment(
          'assess-1',
          { fileUrl: 'https://storage.example.com/submissions/x.pdf' },
          STRANGER,
        ),
      ).rejects.toThrow();
    });
  });

  /**
   * File-type and submission-mode enforcement (slice 7a, gap 1 & 2).
   *
   * Each case creates a fresh assessment with the properties under test and
   * targets it at `group-1` (student-1's group in course-1), then verifies
   * both the accepted and refused direction. CLAUDE.md §10: "a test that only
   * proves the happy path is not evidence of a boundary."
   */
  describe('allowedFileTypes and submissionModes enforcement', () => {
    let assessmentRepo: import('./repositories/in-memory-assessment.repository.js').InMemoryAssessmentRepository;

    // A window that is open relative to the pinned clock (2026-08-27T12:00:00Z).
    const OPEN_WINDOW = {
      availableFrom: '2026-08-01T00:00:00Z',
      availableTo: '2026-09-30T23:59:59Z',
      dueAt: '2026-09-30T23:59:59Z',
    };

    // Base assessment fields shared by all test tasks created in this block.
    const BASE_ASSESSMENT = {
      courseId: 'course-1',
      lessonId: null,
      description: 'enforcement test',
      instructions: 'enforcement test',
      type: 'homework' as const,
      workType: 'file_upload' as const,
      externalUrl: null,
      topics: [],
      maxScore: 10,
      maxFileSizeBytes: 10 * 1024 * 1024,
      visibility: 'published' as const,
      markerId: null,
      allowResubmission: true,
      draftId: null,
      attachments: [],
      ...OPEN_WINDOW,
    };

    beforeEach(async () => {
      // Re-compile the module to get a fresh repository instance with no
      // carry-over from the shared `controller` setup above.
      const mod = await Test.createTestingModule({
        controllers: [AssessmentsController],
        providers: [
          EnrollmentsService,
          { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
          { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
          StudentGroupsService,
          AssessmentsService,
          // `submitAssessment` wraps its writes in a transaction, so the
          // service needs the real DatabaseService. A null pool puts it in the
          // memory passthrough documented in `CLAUDE.md` §9 - no rollback, and
          // the multi-file tests below say where that matters.
          { provide: DATABASE_POOL, useValue: null },
          DatabaseService,
          { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
          { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();

      controller = mod.get(AssessmentsController);
      assessmentRepo = mod.get(ASSESSMENT_REPOSITORY);
    });

    /** Creates an assessment and targets it at group-1 so loadForStudent finds it. */
    async function createTargeted(
      overrides: Partial<Parameters<typeof assessmentRepo.create>[0]>,
    ) {
      const created = await assessmentRepo.create({
        ...BASE_ASSESSMENT,
        title: 'Enforcement test task',
        allowedFileTypes: [],
        submissionModes: [],
        ...overrides,
      });
      await assessmentRepo.setTargets(created.id, [{ groupId: 'group-1' }]);
      return created;
    }

    // --- allowedFileTypes tests ---

    it('allowedFileTypes: accepts a .pdf url when pdf-only is set', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/hw.pdf' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('allowedFileTypes: refuses a .png url when pdf-only is set', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/hw.png' },
          STUDENT,
        ),
      ).rejects.toThrow('application/pdf');
    });

    it('allowedFileTypes: empty list accepts any globally-valid file', async () => {
      // The regression guard: existing tasks with empty allowedFileTypes must
      // keep working exactly as before this slice.
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/hw.pdf' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('allowedFileTypes: refuses a url with no extension', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/homework' },
          STUDENT,
        ),
      ).rejects.toThrow();
    });

    it('allowedFileTypes: reads the extension correctly through a query string', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      // The url has a query string; the extension must still be read as `pdf`.
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://cdn.example.com/hw.pdf?token=abc&v=2' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('allowedFileTypes: comparison is case-insensitive on the extension', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      // `.PDF` must be treated the same as `.pdf`.
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/hw.PDF' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('allowedFileTypes: answerText-only submission passes even when pdf-only is set', async () => {
      const task = await createTargeted({
        allowedFileTypes: ['application/pdf'],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { answerText: 'My typed answer.' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    // --- submissionModes: pdf_upload tests ---

    it('submissionModes: pdf_upload accepts a .pdf url', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['pdf_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/essay.pdf' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('submissionModes: pdf_upload accepts a .docx url', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['pdf_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/essay.docx' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('submissionModes: pdf_upload refuses a .txt url', async () => {
      // `D-41` names pdf and docx, and `text/plain` is in the *global* upload
      // whitelist - so deriving this mode from the whitelist's `kind: 'file'`
      // bucket silently admits a .txt. This test is what pins the mode to the
      // decision instead of to the storage layer's file/image split.
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['pdf_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/notes.txt' },
          STUDENT,
        ),
      ).rejects.toThrow('pdf_upload');
    });

    it('submissionModes: pdf_upload refuses a .jpg url', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['pdf_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/photo.jpg' },
          STUDENT,
        ),
      ).rejects.toThrow('pdf_upload');
    });

    // --- submissionModes: photo_upload tests ---

    it('submissionModes: photo_upload accepts a .jpg url', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['photo_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/work.jpg' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('submissionModes: photo_upload refuses a .pdf url', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['photo_upload'],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/work.pdf' },
          STUDENT,
        ),
      ).rejects.toThrow('photo_upload');
    });

    // --- multiple modes ---

    it('submissionModes: a file satisfying either stated mode is accepted', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: ['pdf_upload', 'photo_upload'],
      });
      // pdf passes pdf_upload
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/essay.pdf' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
      // jpg passes photo_upload (resubmission allowed, so the second call also succeeds)
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/photo.jpg' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    // --- both checks are independent ---

    it('both allowedFileTypes and submissionModes must pass independently', async () => {
      // The task says pdf_upload AND only allows docx. That combination is
      // internally consistent (docx is a file-kind type accepted by pdf_upload)
      // but illustrates that both gates are evaluated.
      const task = await createTargeted({
        allowedFileTypes: [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        submissionModes: ['pdf_upload'],
      });
      // docx passes both
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/essay.docx' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
      // pdf passes submissionModes but NOT allowedFileTypes -> rejected
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/essay.pdf' },
          STUDENT,
        ),
      ).rejects.toThrow();
    });

    // --- empty modes ---

    it('empty allowedFileTypes AND empty submissionModes: accepts any globally-valid file', async () => {
      // This is the regression guard for all existing tasks. Their behaviour
      // must be identical to before this slice was added.
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/hw.pdf' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    it('empty allowedFileTypes AND empty submissionModes: answerText-only submission succeeds', async () => {
      const task = await createTargeted({
        allowedFileTypes: [],
        submissionModes: [],
      });
      await expect(
        controller.submitAssessment(
          task.id,
          { answerText: 'Text answer, no file.' },
          STUDENT,
        ),
      ).resolves.toBeDefined();
    });

    /**
     * Multi-file submission and `linkUrl` (slice 7b-ii; `D-39`, `D-42`, `D-43`).
     *
     * These run against the in-memory driver, where `runInTransaction` is a
     * passthrough with no rollback (`CLAUDE.md` §9). That is not a gap for the
     * refusal cases below, because **every file is validated before the
     * transaction opens** - a bad file is refused before anything is written,
     * rather than written and rolled back. True mid-transaction rollback is
     * only provable against real PostgreSQL and is not claimed here.
     */
    describe('multi-file and linkUrl', () => {
      const FILE = (n: string) => ({
        fileUrl: `https://storage.example.com/submissions/${n}`,
        displayName: n,
      });

      it('persists several files in order, with 0-based positions', async () => {
        const task = await createTargeted({});
        await controller.submitAssessment(
          task.id,
          { files: [FILE('a.pdf'), FILE('b.pdf'), FILE('c.pdf')] },
          STUDENT,
        );
        const detail = await controller.getAssessmentDetail(task.id, STUDENT);
        expect(detail.submission?.files).toHaveLength(3);
        expect(detail.submission?.files.map((f) => f.position)).toEqual([0, 1, 2]);
        expect(detail.submission?.files.map((f) => f.displayName)).toEqual([
          'a.pdf',
          'b.pdf',
          'c.pdf',
        ]);
      });

      it('accepts five files and refuses six (`D-43`)', async () => {
        const five = await createTargeted({});
        await expect(
          controller.submitAssessment(
            five.id,
            { files: ['a', 'b', 'c', 'd', 'e'].map((n) => FILE(`${n}.pdf`)) },
            STUDENT,
          ),
        ).resolves.toBeDefined();

        const six = await createTargeted({});
        await expect(
          controller.submitAssessment(
            six.id,
            { files: ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => FILE(`${n}.pdf`)) },
            STUDENT,
          ),
        ).rejects.toThrow(/at most 5 files/i);
      });

      it('refuses the whole submission when one file among several is bad, and writes nothing', async () => {
        const task = await createTargeted({
          allowedFileTypes: ['application/pdf'],
        });
        await expect(
          controller.submitAssessment(
            task.id,
            { files: [FILE('good.pdf'), FILE('bad.png'), FILE('also-good.pdf')] },
            STUDENT,
          ),
        ).rejects.toThrow('File 2');

        // Not merely "it threw": nothing may have been persisted. No
        // submission row at all, so no files either.
        const detail = await controller.getAssessmentDetail(task.id, STUDENT);
        expect(detail.submission).toBeNull();
      });

      it('replaces the previous file set on resubmission rather than appending', async () => {
        const task = await createTargeted({});
        await controller.submitAssessment(
          task.id,
          { files: [FILE('v1-a.pdf'), FILE('v1-b.pdf'), FILE('v1-c.pdf')] },
          STUDENT,
        );
        await controller.submitAssessment(
          task.id,
          { files: [FILE('v2-a.pdf'), FILE('v2-b.pdf')] },
          STUDENT,
        );
        const detail = await controller.getAssessmentDetail(task.id, STUDENT);
        expect(detail.submission?.files).toHaveLength(2);
        expect(detail.submission?.files.map((f) => f.displayName)).toEqual([
          'v2-a.pdf',
          'v2-b.pdf',
        ]);
        expect(detail.submission?.files.map((f) => f.position)).toEqual([0, 1]);
      });

      it('accepts an https link and refuses an http one (`D-39`)', async () => {
        const ok = await createTargeted({});
        await expect(
          controller.submitAssessment(
            ok.id,
            { linkUrl: 'https://docs.example.com/essay' },
            STUDENT,
          ),
        ).resolves.toBeDefined();
        const detail = await controller.getAssessmentDetail(ok.id, STUDENT);
        expect(detail.submission?.linkUrl).toBe('https://docs.example.com/essay');

        // http is refused by the DTO's IsPublicHttpUrl in production; the
        // service check is the copy that matters and is asserted directly.
        const bad = await createTargeted({});
        await expect(
          controller.submitAssessment(
            bad.id,
            { linkUrl: 'http://docs.example.com/essay' },
            STUDENT,
          ),
        ).rejects.toThrow(/https/i);
      });

      it('leaves an existing link alone when a resubmission omits it', async () => {
        const task = await createTargeted({});
        await controller.submitAssessment(
          task.id,
          { linkUrl: 'https://docs.example.com/first' },
          STUDENT,
        );
        await controller.submitAssessment(
          task.id,
          { answerText: 'Adding a note, leaving the link.' },
          STUDENT,
        );
        const detail = await controller.getAssessmentDetail(task.id, STUDENT);
        expect(detail.submission?.linkUrl).toBe('https://docs.example.com/first');
        expect(detail.submission?.answerText).toBe(
          'Adding a note, leaving the link.',
        );
      });

      it('leaves a single-fileUrl submission working unchanged', async () => {
        // The regression guard: every submission made before this slice used
        // the scalar `fileUrl` and carries no `submission_files` rows.
        const task = await createTargeted({});
        await controller.submitAssessment(
          task.id,
          { fileUrl: 'https://storage.example.com/submissions/legacy.pdf' },
          STUDENT,
        );
        const detail = await controller.getAssessmentDetail(task.id, STUDENT);
        expect(detail.submission?.fileUrl).toContain('legacy.pdf');
        expect(detail.submission?.files).toEqual([]);
        expect(detail.submission?.linkUrl).toBeNull();
      });
    });
  });
});

