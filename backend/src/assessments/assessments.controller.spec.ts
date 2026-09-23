import { Test, TestingModule } from '@nestjs/testing';
import { SUBMISSION_ANNOTATION_REPOSITORY } from './interfaces/submission-annotation-repository.interface.js';
import { InMemorySubmissionAnnotationRepository } from './repositories/in-memory-submission-annotation.repository.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
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
  let service: AssessmentsService;
  let repo: InMemoryAssessmentRepository;
  let marks: InMemorySubmissionAnnotationRepository;

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
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        // Work types and mirrored external results. The real implementation
        // rather than a stub, for the same reason as the group repository
        // above: the fixtures are all `file_upload`, so this returning nothing
        // is exactly the behaviour every existing assertion depends on, and a
        // stub would let a regression in that path pass unnoticed.
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: SUBMISSION_ANNOTATION_REPOSITORY, useClass: InMemorySubmissionAnnotationRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssessmentsController>(AssessmentsController);
    service = module.get(AssessmentsService);
    repo = module.get(ASSESSMENT_REPOSITORY);
    marks = module.get(SUBMISSION_ANNOTATION_REPOSITORY);
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
   * `MARK-2`: a saved mark is invisible to the student until it is returned.
   * One predicate (`isReturnedToStudent`) over the five reads that used to key
   * on `correctedAt`; each read is asserted here (unit-7 plan, Risk 1).
   */
  describe('saved is not returned (MARK-2)', () => {
    const saveMark = () =>
      repo.gradeSubmission('sub-2', { score: 17, feedback: 'Nearly there', annotatedFileUrl: 'https://storage.example.com/annotated/moles.pdf' });

    it('hides the score, feedback, annotated copy and corrected status until return', async () => {
      await saveMark();
      const list = await controller.listAssessments('course-1', {}, STUDENT);
      const row = list.find((a) => a.id === 'assess-4')!;
      expect(row.status).toBe('submitted');
      expect(row.score).toBeNull();
      expect(row.scorePercentage).toBeNull();

      const detail = await controller.getAssessmentDetail('assess-4', STUDENT);
      expect(detail.status).toBe('submitted');
      expect(detail.score).toBeNull();
      expect(detail.submission).toMatchObject({
        score: null,
        feedback: null,
        annotatedFileUrl: null,
        returnedAt: null,
      });
      // The freeze is unchanged (A-2): a saved mark still closes resubmission,
      // and `correctedAt` is what lets the page say the teacher is marking it.
      expect(detail.canSubmit).toBe(false);
      expect(detail.submission!.correctedAt).not.toBeNull();

      const performance = await service.getPerformanceEntries('course-1', 'student-1');
      const entry = performance.find((e) => e.assessmentId === 'assess-4')!;
      expect(entry.score).toBeNull();
      expect(entry.status).toBe('submitted');
    });

    it('shows all of it once returned', async () => {
      await saveMark();
      await repo.returnSubmission('sub-2');

      const list = await controller.listAssessments('course-1', {}, STUDENT);
      expect(list.find((a) => a.id === 'assess-4')).toMatchObject({ status: 'corrected', score: 17 });

      const detail = await controller.getAssessmentDetail('assess-4', STUDENT);
      expect(detail.submission).toMatchObject({
        score: 17,
        feedback: 'Nearly there',
        annotatedFileUrl: 'https://storage.example.com/annotated/moles.pdf',
      });
      expect(detail.submission!.returnedAt).not.toBeNull();

      const performance = await service.getPerformanceEntries('course-1', 'student-1');
      expect(performance.find((e) => e.assessmentId === 'assess-4')).toMatchObject({ score: 17, status: 'corrected' });
    });

    it('does not show feedback typed before a mark exists (it was unconditional before unit 7)', async () => {
      // Force the pre-unit-7 shape: feedback stored, nothing returned.
      const stored = await repo.findSubmission('assess-4', 'student-1');
      stored!.feedback = 'draft note';
      const detail = await controller.getAssessmentDetail('assess-4', STUDENT);
      expect(detail.submission!.feedback).toBeNull();
    });

    it('MARK-5: carries the marks only once returned, and never who drew them', async () => {
      await marks.create({
        submissionId: 'sub-2', fileUrl: '/uploads/x.png', page: 1, kind: 'comment',
        xPercent: 10, yPercent: 20, text: 'Units!', path: null, createdBy: 'assistant-1',
      });
      await saveMark();
      const before = await controller.getAssessmentDetail('assess-4', STUDENT);
      expect(before.submission!.annotations).toEqual([]);

      await repo.returnSubmission('sub-2');
      const after = await controller.getAssessmentDetail('assess-4', STUDENT);
      expect(after.submission!.annotations).toHaveLength(1);
      expect(after.submission!.annotations[0]).toMatchObject({ kind: 'comment', text: 'Units!', xPercent: 10 });
      expect(Object.keys(after.submission!.annotations[0]!).sort()).toEqual(
        ['fileUrl', 'id', 'kind', 'page', 'path', 'text', 'xPercent', 'yPercent'],
      );
    });

    it('keeps every fixture mark that predates the split visible (019 backfill parity)', async () => {
      const detail = await controller.getAssessmentDetail('assess-3', STUDENT);
      expect(detail.status).toBe('corrected');
      expect(detail.submission).toMatchObject({ score: 35 });
      expect(detail.submission!.returnedAt).not.toBeNull();
    });
  });
});
