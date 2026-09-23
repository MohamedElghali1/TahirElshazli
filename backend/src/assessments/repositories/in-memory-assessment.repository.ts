import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AssessmentFilter,
  AssessmentRepository,
  AssessmentTarget,
  AssessmentUpdate,
  NewAssessment,
  NewAssessmentTarget,
  NewSubmissionAnnotation,
  NewSubmissionFile,
  StaffTaskFilter,
  StoredAssessment,
  StoredSubmission,
  SubmissionAnnotation,
  SubmissionAnnotationUpdate,
  SubmissionFile,
  SubmissionRevision,
  TargetedAssessment,
} from '../interfaces/assessment-repository.interface.js';

const PDF_ONLY = ['application/pdf'];
const TEN_MB = 10 * 1024 * 1024;

/**
 * The unit-6 columns at their migration defaults (018), so every seeded task
 * means exactly what it meant before them: published, resubmission until
 * window end, no stated modes, no marker, no draft, no attachments.
 */
const TASK_SETTING_DEFAULTS = {
  visibility: 'published',
  markerId: null,
  allowResubmission: true,
  submissionModes: [],
  draftId: null,
  attachments: [],
} as const satisfies Pick<
  StoredAssessment,
  | 'visibility'
  | 'markerId'
  | 'allowResubmission'
  | 'submissionModes'
  | 'draftId'
  | 'attachments'
>;

type SeedAssessment = Omit<StoredAssessment, keyof typeof TASK_SETTING_DEFAULTS>;

/**
 * A copy that shares no array with its source. `attachments` holds objects, so
 * a spread alone would alias them - and an in-memory read feeding an audit
 * `before` must never alias its `after` (CLAUDE.md §9; shipped twice).
 */
function copyAssessment<T extends StoredAssessment>(a: T): T {
  return {
    ...a,
    topics: [...a.topics],
    allowedFileTypes: [...a.allowedFileTypes],
    submissionModes: [...a.submissionModes],
    attachments: a.attachments.map((x) => ({ ...x })),
  };
}

/** Same aliasing rule as `copyAssessment`: `path` holds objects. */
function copyAnnotation(a: SubmissionAnnotation): SubmissionAnnotation {
  return { ...a, path: a.path ? a.path.map((p) => ({ ...p })) : null };
}

const SEED_ASSESSMENTS: SeedAssessment[] = [
  {
    id: 'assess-1',
    courseId: 'course-1',
    lessonId: 'lesson-4',
    title: 'Periodic Trends Homework',
    description: 'Questions on periodic trends across period 3',
    instructions:
      'Answer all six questions. Show full working for the ionisation energy comparisons. Upload a single PDF.',
    type: 'homework',
    topics: ['Atomic Structure'],
    availableFrom: '2026-08-10T00:00:00Z',
    availableTo: '2026-09-30T23:59:59Z',
    dueAt: '2026-09-05T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-08-05T10:00:00Z',
  },
  {
    id: 'assess-2',
    courseId: 'course-1',
    lessonId: 'lesson-9',
    title: 'Organic Reaction Mechanisms Quiz',
    description: 'Quiz covering free-radical substitution and electrophilic addition',
    instructions: 'Timed quiz. Opens automatically at the scheduled time.',
    type: 'quiz',
    topics: ['Organic Chemistry'],
    availableFrom: '2026-09-10T18:00:00Z',
    availableTo: '2026-09-17T23:59:59Z',
    dueAt: '2026-09-17T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-08-20T10:00:00Z',
  },
  {
    id: 'assess-3',
    courseId: 'course-1',
    lessonId: 'lesson-7',
    title: 'Mid-term Assignment',
    description: 'Extended titration and stoichiometry problem set',
    instructions:
      'Complete all parts. Include calculations and units. Upload as a single PDF, maximum 10MB.',
    type: 'assignment',
    topics: ['Moles', 'Physical Chemistry'],
    availableFrom: '2026-06-01T00:00:00Z',
    availableTo: '2026-08-30T23:59:59Z',
    dueAt: '2026-08-28T23:59:59Z',
    maxScore: 40,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-05-15T10:00:00Z',
  },
  {
    id: 'assess-4',
    courseId: 'course-1',
    lessonId: 'lesson-5',
    title: 'Moles Calculations Homework',
    description: 'Practice problems on the mole concept',
    instructions: 'Answer questions 1-12 from the worksheet and upload your working.',
    type: 'homework',
    topics: ['Moles'],
    availableFrom: '2026-07-15T00:00:00Z',
    availableTo: '2026-09-15T23:59:59Z',
    dueAt: '2026-08-25T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-07-10T10:00:00Z',
  },
  {
    id: 'assess-5',
    courseId: 'course-1',
    lessonId: 'lesson-11',
    title: 'Organic Nomenclature Quiz',
    description: 'Naming alkanes, alkenes and alcohols',
    instructions: 'Twenty short-answer naming questions.',
    type: 'quiz',
    topics: ['Organic Chemistry'],
    availableFrom: '2026-07-01T00:00:00Z',
    availableTo: '2026-07-14T23:59:59Z',
    dueAt: '2026-07-14T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-06-25T10:00:00Z',
  },
  {
    id: 'assess-6',
    courseId: 'course-1',
    lessonId: 'lesson-3',
    title: 'Energetics & Rates Quiz',
    description: 'Quiz on enthalpy changes and reaction rates',
    instructions: 'Twenty multiple-choice questions.',
    type: 'quiz',
    topics: ['Physical Chemistry'],
    availableFrom: '2026-06-10T00:00:00Z',
    availableTo: '2026-06-24T23:59:59Z',
    dueAt: '2026-06-24T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-06-01T10:00:00Z',
  },
  {
    id: 'assess-7',
    courseId: 'course-1',
    lessonId: 'lesson-10',
    title: 'Organic Synthesis Assignment',
    description: 'Multi-step synthesis routes',
    instructions: 'Propose and justify a synthesis route for each target molecule.',
    type: 'assignment',
    topics: ['Organic Chemistry'],
    availableFrom: '2026-07-20T00:00:00Z',
    availableTo: '2026-08-10T23:59:59Z',
    dueAt: '2026-08-10T23:59:59Z',
    maxScore: 40,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-07-15T10:00:00Z',
  },
  {
    id: 'assess-8',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    title: 'Atomic Structure Homework',
    description: 'Subatomic particles, isotopes and mass spectrometry',
    instructions: 'Complete the worksheet and upload it as a PDF.',
    type: 'homework',
    topics: ['Atomic Structure'],
    availableFrom: '2026-05-01T00:00:00Z',
    availableTo: '2026-05-20T23:59:59Z',
    dueAt: '2026-05-20T23:59:59Z',
    maxScore: 20,
    allowedFileTypes: PDF_ONLY,
    maxFileSizeBytes: TEN_MB,
    workType: 'file_upload',
    externalUrl: null,
    createdAt: '2026-04-25T10:00:00Z',
  },
];

const STUB_ASSESSMENTS: StoredAssessment[] = SEED_ASSESSMENTS.map((a) => ({
  ...a,
  ...TASK_SETTING_DEFAULTS,
  submissionModes: [],
  attachments: [],
}));

/** The fields of a partial update that were actually supplied. */
function definedOnly<T extends object>(update: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

@Injectable()
export class InMemoryAssessmentRepository implements AssessmentRepository {
  private submissions: StoredSubmission[] = [
    {
      id: 'sub-1',
      assessmentId: 'assess-3',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/midterm.pdf',
      answerText: null,
      submittedAt: '2026-08-20T15:30:00Z',
      lastSubmittedAt: '2026-08-20T15:30:00Z',
      updatedAt: '2026-08-20T15:30:00Z',
      score: 35,
      correctedAt: '2026-08-22T10:00:00Z',
      feedback: 'Strong titration work. Watch significant figures in part 3.',
      annotatedFileUrl: 'https://storage.example.com/annotated/midterm-corrected.pdf',
      linkUrl: null,
      returnedAt: '2026-08-22T10:00:00Z',
    },
    {
      id: 'sub-2',
      assessmentId: 'assess-4',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/moles-hw.pdf',
      answerText: null,
      submittedAt: '2026-08-24T19:10:00Z',
      lastSubmittedAt: '2026-08-24T19:10:00Z',
      updatedAt: '2026-08-24T19:10:00Z',
      score: null,
      correctedAt: null,
      feedback: null,
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: null,
    },
    {
      id: 'sub-3',
      assessmentId: 'assess-5',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/nomenclature.pdf',
      answerText: null,
      submittedAt: '2026-07-12T14:00:00Z',
      lastSubmittedAt: '2026-07-12T14:00:00Z',
      updatedAt: '2026-07-12T14:00:00Z',
      score: 18,
      correctedAt: '2026-07-15T09:00:00Z',
      feedback: 'Excellent. Only slipped on the halogenoalkane ordering.',
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: '2026-07-15T09:00:00Z',
    },
    {
      id: 'sub-4',
      assessmentId: 'assess-6',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/energetics.pdf',
      answerText: null,
      submittedAt: '2026-06-22T20:00:00Z',
      lastSubmittedAt: '2026-06-22T20:00:00Z',
      updatedAt: '2026-06-22T20:00:00Z',
      score: 12,
      correctedAt: '2026-06-25T11:00:00Z',
      feedback: 'Revise Hess cycles and the effect of temperature on rate.',
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: '2026-06-25T11:00:00Z',
    },
    {
      id: 'sub-5',
      assessmentId: 'assess-7',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/synthesis.pdf',
      answerText: null,
      submittedAt: '2026-08-08T17:45:00Z',
      lastSubmittedAt: '2026-08-08T17:45:00Z',
      updatedAt: '2026-08-08T17:45:00Z',
      score: 34,
      correctedAt: '2026-08-12T13:00:00Z',
      feedback: 'Good routes. Justify reagent choice more explicitly next time.',
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: '2026-08-12T13:00:00Z',
    },
    {
      id: 'sub-6',
      assessmentId: 'assess-8',
      studentId: 'student-1',
      fileUrl: 'https://storage.example.com/submissions/atomic-hw.pdf',
      answerText: null,
      submittedAt: '2026-05-18T16:20:00Z',
      lastSubmittedAt: '2026-05-18T16:20:00Z',
      updatedAt: '2026-05-18T16:20:00Z',
      score: 16,
      correctedAt: '2026-05-21T10:30:00Z',
      feedback: 'Solid, but check your mass spectrometry interpretation.',
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: '2026-05-21T10:30:00Z',
    },
  ];

  private revisions: SubmissionRevision[] = [];

  /** Empty seed: no stub submission predates `020`'s multi-file model. */
  private submissionFiles: SubmissionFile[] = [];
  private submissionFileSeq = 0;

  private annotations: SubmissionAnnotation[] = [];
  private annotationSeq = 0;

  /**
   * A per-instance copy of the seed, not the module-level array.
   *
   * It read `STUB_ASSESSMENTS` directly until authoring landed on 2026-09-10,
   * which was harmless while every method was a read. It stopped being harmless
   * the moment `create`, `update` and `remove` existed: a test that writes an
   * assessment would have leaked it into every later test in the run, and the
   * failure would have surfaced somewhere else entirely. Same reasoning as
   * `InMemoryEnrollmentRepository`.
   */
  private assessments: StoredAssessment[] = STUB_ASSESSMENTS.map(copyAssessment);

  /**
   * Who each task was set for (CLAUDE.md §5.16). Seeded so the eight stub
   * assessments stay visible: they all belong to course-1, which `group-1`
   * studies, and after targeting an untargeted assessment is set for nobody.
   */
  private targets: AssessmentTarget[] = STUB_ASSESSMENTS.map((a, index) => ({
    id: `assessment-target-${index + 1}`,
    assessmentId: a.id,
    groupId: 'group-1',
    // No overrides: the common case is one window for everyone, and a seed
    // that overrode it would make the inherit path the untested one.
    availableFrom: null,
    availableTo: null,
    dueAt: null,
  }));

  /** The assessment as one group sees it - the target's window, or its own. */
  private resolve(
    assessment: StoredAssessment,
    target: AssessmentTarget,
  ): TargetedAssessment {
    const overridden =
      target.availableFrom !== null ||
      target.availableTo !== null ||
      target.dueAt !== null;
    return {
      ...copyAssessment(assessment),
      availableFrom: target.availableFrom ?? assessment.availableFrom,
      availableTo: target.availableTo ?? assessment.availableTo,
      dueAt: target.dueAt ?? assessment.dueAt,
      targetGroupId: target.groupId,
      windowOverridden: overridden,
    };
  }

  async findByCourse(
    courseId: string,
    filter?: AssessmentFilter,
  ): Promise<StoredAssessment[]> {
    return this.assessments
      .filter((a) => a.courseId === courseId)
      .filter((a) => !filter?.type || a.type === filter.type)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())
      .map(copyAssessment);
  }

  async findByCourseForGroups(
    courseId: string,
    groupIds: readonly string[],
    filter?: AssessmentFilter,
  ): Promise<TargetedAssessment[]> {
    if (groupIds.length === 0) {
      return [];
    }
    // Order matters: `groupIds` arrives longest-standing placement first, and
    // the first target found wins, so a student in two groups given the same
    // task sees one row on the same group's terms that `StudentGroupsService`
    // picked. A due date and a classmate list resolving through different
    // groups would be a genuinely baffling support call.
    const seen = new Map<string, TargetedAssessment>();
    for (const groupId of groupIds) {
      for (const target of this.targets) {
        if (target.groupId !== groupId || seen.has(target.assessmentId)) continue;
        const assessment = this.assessments.find((a) => a.id === target.assessmentId);
        if (!assessment || assessment.courseId !== courseId) continue;
        if (filter?.type && assessment.type !== filter.type) continue;
        seen.set(assessment.id, this.resolve(assessment, target));
      }
    }
    return [...seen.values()].sort(
      (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime(),
    );
  }

  async findByIdForGroups(
    assessmentId: string,
    groupIds: readonly string[],
  ): Promise<TargetedAssessment | null> {
    const assessment = this.assessments.find((a) => a.id === assessmentId);
    if (!assessment) {
      return null;
    }
    for (const groupId of groupIds) {
      const target = this.targets.find(
        (x) => x.assessmentId === assessmentId && x.groupId === groupId,
      );
      if (target) {
        return this.resolve(assessment, target);
      }
    }
    return null;
  }

  async findById(assessmentId: string): Promise<StoredAssessment | null> {
    const found = this.assessments.find((a) => a.id === assessmentId);
    // A copy: this feeds the `before` snapshot of an audited edit, and handing
    // out the stored object would make before and after the same object - the
    // defect CLAUDE.md §7.1 records finding twice.
    return found ? copyAssessment(found) : null;
  }

  async create(input: NewAssessment): Promise<StoredAssessment> {
    const stored: StoredAssessment = copyAssessment({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    this.assessments.push(stored);
    return copyAssessment(stored);
  }

  async update(
    assessmentId: string,
    update: AssessmentUpdate,
  ): Promise<StoredAssessment | null> {
    const found = this.assessments.find((a) => a.id === assessmentId);
    if (!found) {
      return null;
    }
    // Copied in, so the caller's arrays never become the stored ones.
    const incoming = copyAssessment({ ...found, ...definedOnly(update) });
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        (found as unknown as Record<string, unknown>)[key] =
          (incoming as unknown as Record<string, unknown>)[key];
      }
    }
    return copyAssessment(found);
  }

  async remove(assessmentId: string): Promise<boolean> {
    const index = this.assessments.findIndex((a) => a.id === assessmentId);
    if (index === -1) {
      return false;
    }
    this.assessments.splice(index, 1);
    // What the FK cascades do in Postgres, done by hand here so the two drivers
    // leave the same state behind.
    this.targets = this.targets.filter((x) => x.assessmentId !== assessmentId);
    this.submissions = this.submissions.filter(
      (s) => s.assessmentId !== assessmentId,
    );
    return true;
  }

  async setTargets(
    assessmentId: string,
    targets: readonly NewAssessmentTarget[],
  ): Promise<AssessmentTarget[]> {
    this.targets = this.targets.filter((x) => x.assessmentId !== assessmentId);
    const written = targets.map((target) => ({
      id: randomUUID(),
      assessmentId,
      groupId: target.groupId,
      availableFrom: target.availableFrom ?? null,
      availableTo: target.availableTo ?? null,
      dueAt: target.dueAt ?? null,
    }));
    this.targets.push(...written);
    return written.map((x) => ({ ...x }));
  }

  async clearDraftProvenance(draftId: string): Promise<number> {
    let changed = 0;
    for (const assessment of this.assessments) {
      if (assessment.draftId === draftId) {
        assessment.draftId = null;
        changed += 1;
      }
    }
    return changed;
  }

  async findTargets(assessmentId: string): Promise<AssessmentTarget[]> {
    return this.targets
      .filter((x) => x.assessmentId === assessmentId)
      .map((x) => ({ ...x }));
  }

  async findForStaff(filter: StaffTaskFilter): Promise<StoredAssessment[]> {
    if (filter.groupIds !== null && filter.groupIds.length === 0) {
      return [];
    }
    const reach = filter.groupIds === null ? null : new Set(filter.groupIds);
    const term = filter.search?.toLocaleLowerCase();
    const targetedAt = (assessmentId: string, test: (groupId: string) => boolean) =>
      this.targets.some((t) => t.assessmentId === assessmentId && test(t.groupId));
    return this.assessments
      .filter((a) => reach === null || targetedAt(a.id, (g) => reach.has(g)))
      .filter((a) => !filter.courseId || a.courseId === filter.courseId)
      .filter((a) => !filter.groupId || targetedAt(a.id, (g) => g === filter.groupId))
      // A literal substring, so `%` is a percent sign here exactly as the
      // escaped ILIKE makes it one in Postgres.
      .filter((a) => !term || a.title.toLocaleLowerCase().includes(term))
      .sort(
        (a, b) =>
          new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .map(copyAssessment);
  }

  async findTargetsForAssessments(
    assessmentIds: readonly string[],
    groupIds: readonly string[] | null,
  ): Promise<AssessmentTarget[]> {
    const wanted = new Set(assessmentIds);
    const reach = groupIds === null ? null : new Set(groupIds);
    return this.targets
      .filter((t) => wanted.has(t.assessmentId))
      .filter((t) => reach === null || reach.has(t.groupId))
      .sort(
        (a, b) =>
          a.assessmentId.localeCompare(b.assessmentId) ||
          a.groupId.localeCompare(b.groupId),
      )
      .map((t) => ({ ...t }));
  }

  async findSubmission(
    assessmentId: string,
    studentId: string,
  ): Promise<StoredSubmission | null> {
    return (
      this.submissions.find(
        (s) => s.assessmentId === assessmentId && s.studentId === studentId,
      ) ?? null
    );
  }

  async findSubmissionsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<StoredSubmission[]> {
    const wanted = new Set(assessmentIds);
    return this.submissions.filter(
      (s) => s.studentId === studentId && wanted.has(s.assessmentId),
    );
  }

  async findSubmissionsForAssessments(
    assessmentIds: readonly string[],
  ): Promise<StoredSubmission[]> {
    const wanted = new Set(assessmentIds);
    return this.submissions.filter((s) => wanted.has(s.assessmentId));
  }

  async countUngradedSubmissionsByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = new Set(courseIds);
    // assessment id -> course id, for the courses asked about only.
    const courseOf = new Map<string, string>();
    for (const assessment of this.assessments) {
      if (wanted.has(assessment.courseId)) {
        courseOf.set(assessment.id, assessment.courseId);
      }
    }

    const counts: Record<string, number> = {};
    for (const submission of this.submissions) {
      if (submission.correctedAt !== null) continue;
      const courseId = courseOf.get(submission.assessmentId);
      if (courseId === undefined) continue;
      counts[courseId] = (counts[courseId] ?? 0) + 1;
    }
    return counts;
  }

  async countSubmissionsByAssessments(
    assessmentIds: readonly string[],
  ): Promise<Record<string, { total: number; ungraded: number }>> {
    const wanted = new Set(assessmentIds);
    const counts: Record<string, { total: number; ungraded: number }> = {};
    for (const submission of this.submissions) {
      if (!wanted.has(submission.assessmentId)) continue;
      const entry = (counts[submission.assessmentId] ??= { total: 0, ungraded: 0 });
      entry.total += 1;
      if (submission.correctedAt === null) entry.ungraded += 1;
    }
    return counts;
  }

  async findSubmissionById(
    submissionId: string,
  ): Promise<StoredSubmission | null> {
    const found = this.submissions.find((s) => s.id === submissionId);
    // A copy, not the stored object. Postgres necessarily returns a fresh row
    // per read; handing out the live reference here makes the two drivers
    // behave differently in a way that is invisible until something holds the
    // result across a write and finds it has changed underneath - which is
    // exactly how the grading audit entry first recorded before === after.
    return found ? { ...found } : null;
  }

  async gradeSubmission(
    submissionId: string,
    grade: {
      score: number;
      feedback: string | null;
      annotatedFileUrl: string | undefined;
    },
  ): Promise<StoredSubmission | null> {
    const submission = this.submissions.find((s) => s.id === submissionId);
    if (!submission) {
      return null;
    }
    const now = new Date().toISOString();
    submission.score = grade.score;
    submission.feedback = grade.feedback;
    if (grade.annotatedFileUrl !== undefined) {
      submission.annotatedFileUrl = grade.annotatedFileUrl;
    }
    // Stamped on every grading pass, including a re-grade: it is when the mark
    // currently shown was decided, which is what the student's status line
    // means by "corrected" (CLAUDE.md §5.10).
    submission.correctedAt = now;
    submission.updatedAt = now;
    // `fileUrl`, `answerText`, `submittedAt` and `lastSubmittedAt` are
    // untouched - the student's own work is immutable here (§5.5).
    return submission;
  }

  async returnSubmission(
    submissionId: string,
  ): Promise<StoredSubmission | null> {
    const submission = this.submissions.find((s) => s.id === submissionId);
    if (!submission) {
      return null;
    }
    const now = new Date().toISOString();
    // Re-returning after a re-mark re-stamps, for the same reason
    // `correctedAt` does: it is when what the student sees was released.
    submission.returnedAt = now;
    submission.updatedAt = now;
    return { ...submission };
  }

  async findFilesForSubmissions(
    submissionIds: readonly string[],
  ): Promise<SubmissionFile[]> {
    const wanted = new Set(submissionIds);
    return this.submissionFiles
      .filter((f) => wanted.has(f.submissionId))
      .map((f) => ({ ...f }));
  }

  async replaceSubmissionFiles(
    submissionId: string,
    files: readonly NewSubmissionFile[],
  ): Promise<SubmissionFile[]> {
    this.submissionFiles = this.submissionFiles.filter(
      (f) => f.submissionId !== submissionId,
    );
    const now = new Date().toISOString();
    const created = files.map((f, i) => ({
      ...f,
      id: `subfile-${++this.submissionFileSeq}`,
      submissionId,
      // The caller's order is the truth; its `position` is not trusted, so a
      // gap or a duplicate cannot reach the `UNIQUE` column in Postgres.
      position: i,
      createdAt: now,
    }));
    this.submissionFiles.push(...created);
    return created.map((f) => ({ ...f }));
  }

  async findAnnotations(
    submissionId: string,
  ): Promise<SubmissionAnnotation[]> {
    return this.annotations
      .filter((a) => a.submissionId === submissionId)
      .map(copyAnnotation);
  }

  async findAnnotationById(
    annotationId: string,
  ): Promise<SubmissionAnnotation | null> {
    const found = this.annotations.find((a) => a.id === annotationId);
    return found ? copyAnnotation(found) : null;
  }

  async createAnnotation(
    annotation: NewSubmissionAnnotation,
  ): Promise<SubmissionAnnotation> {
    const now = new Date().toISOString();
    const created: SubmissionAnnotation = {
      ...annotation,
      path: annotation.path ? annotation.path.map((p) => ({ ...p })) : null,
      id: `annot-${++this.annotationSeq}`,
      createdAt: now,
      updatedAt: now,
    };
    this.annotations.push(created);
    return copyAnnotation(created);
  }

  async updateAnnotation(
    annotationId: string,
    update: SubmissionAnnotationUpdate,
  ): Promise<SubmissionAnnotation | null> {
    const found = this.annotations.find((a) => a.id === annotationId);
    if (!found) {
      return null;
    }
    if (update.page !== undefined) found.page = update.page;
    if (update.x !== undefined) found.x = update.x;
    if (update.y !== undefined) found.y = update.y;
    if (update.path !== undefined) {
      found.path = update.path ? update.path.map((p) => ({ ...p })) : null;
    }
    if (update.colour !== undefined) found.colour = update.colour;
    if (update.width !== undefined) found.width = update.width;
    if (update.body !== undefined) found.body = update.body;
    found.updatedAt = new Date().toISOString();
    return copyAnnotation(found);
  }

  async deleteAnnotation(annotationId: string): Promise<boolean> {
    const before = this.annotations.length;
    this.annotations = this.annotations.filter((a) => a.id !== annotationId);
    return this.annotations.length !== before;
  }

  async createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission> {
    const now = new Date().toISOString();
    const submission: StoredSubmission = {
      id: randomUUID(),
      assessmentId,
      studentId,
      fileUrl,
      answerText,
      submittedAt: now,
      lastSubmittedAt: now,
      updatedAt: now,
      score: null,
      correctedAt: null,
      feedback: null,
      annotatedFileUrl: null,
      linkUrl: null,
      returnedAt: null,
    };
    this.submissions.push(submission);
    return submission;
  }

  async updateSubmission(
    submissionId: string,
    studentId: string,
    fileUrl: string | undefined,
    answerText: string | undefined,
  ): Promise<StoredSubmission | null> {
    const submission = this.submissions.find(
      (s) => s.id === submissionId && s.studentId === studentId,
    );
    if (!submission) {
      return null;
    }
    const now = new Date().toISOString();

    // Archive what is being replaced before overwriting it, so the submission
    // history survives the edit.
    this.revisions.push({
      id: randomUUID(),
      submissionId: submission.id,
      fileUrl: submission.fileUrl,
      answerText: submission.answerText,
      submittedAt: submission.lastSubmittedAt,
      replacedAt: now,
    });

    // Only fields the student actually supplied are touched - omitting one
    // leaves the stored value alone rather than nulling it.
    if (fileUrl !== undefined) {
      submission.fileUrl = fileUrl;
    }
    if (answerText !== undefined) {
      submission.answerText = answerText;
    }
    submission.lastSubmittedAt = now;
    submission.updatedAt = now;
    return submission;
  }

  async findRevisions(
    submissionId: string,
    studentId: string,
  ): Promise<SubmissionRevision[]> {
    // Revisions carry no studentId of their own, so ownership is proven through
    // the submission they belong to.
    const owned = this.submissions.some(
      (s) => s.id === submissionId && s.studentId === studentId,
    );
    if (!owned) {
      return [];
    }
    return this.revisions
      .filter((r) => r.submissionId === submissionId)
      .sort((a, b) => a.replacedAt.localeCompare(b.replacedAt));
  }
}
