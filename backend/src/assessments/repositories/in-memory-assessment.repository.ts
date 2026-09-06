import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AssessmentFilter,
  AssessmentRepository,
  StoredAssessment,
  StoredSubmission,
  SubmissionRevision,
} from '../interfaces/assessment-repository.interface.js';

const PDF_ONLY = ['application/pdf'];
const TEN_MB = 10 * 1024 * 1024;

const STUB_ASSESSMENTS: StoredAssessment[] = [
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
    createdAt: '2026-04-25T10:00:00Z',
  },
];

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
    },
  ];

  private revisions: SubmissionRevision[] = [];

  async findByCourse(
    courseId: string,
    filter?: AssessmentFilter,
  ): Promise<StoredAssessment[]> {
    return STUB_ASSESSMENTS.filter((a) => a.courseId === courseId)
      .filter((a) => !filter?.type || a.type === filter.type)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  }

  async findById(assessmentId: string): Promise<StoredAssessment | null> {
    return STUB_ASSESSMENTS.find((a) => a.id === assessmentId) ?? null;
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
