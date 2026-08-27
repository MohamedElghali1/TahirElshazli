import { Injectable } from '@nestjs/common';
import type {
  AssessmentRepository,
  StoredAssessment,
  StoredSubmission,
} from '../interfaces/assessment-repository.interface.js';

const STUB_ASSESSMENTS: StoredAssessment[] = [
  {
    id: 'assess-1',
    courseId: 'course-1',
    title: 'Atomic Structure Homework',
    description: 'Complete the questions on atomic structure',
    type: 'homework',
    availableFrom: '2026-07-01T00:00:00Z',
    availableTo: '2026-12-31T23:59:59Z',
    dueAt: '2026-12-15T23:59:59Z',
    maxScore: 100,
    createdAt: '2026-06-28T10:00:00Z',
  },
  {
    id: 'assess-2',
    courseId: 'course-1',
    title: 'Chemical Bonding Quiz',
    description: 'Quiz on ionic and covalent bonding',
    type: 'quiz',
    availableFrom: '2026-09-01T00:00:00Z',
    availableTo: '2026-09-15T23:59:59Z',
    dueAt: '2026-09-14T23:59:59Z',
    maxScore: 50,
    createdAt: '2026-06-28T10:00:00Z',
  },
  {
    id: 'assess-3',
    courseId: 'course-1',
    title: 'Mid-term Assignment',
    description: 'Research assignment on chemical reactions',
    type: 'assignment',
    availableFrom: '2026-06-01T00:00:00Z',
    availableTo: '2026-08-30T23:59:59Z',
    dueAt: '2026-08-28T23:59:59Z',
    maxScore: 200,
    createdAt: '2026-05-15T10:00:00Z',
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
      score: 175,
      correctedAt: '2026-08-22T10:00:00Z',
      feedback: 'Good analysis. Some areas need improvement.',
    },
  ];

  async findByCourse(courseId: string): Promise<StoredAssessment[]> {
    return STUB_ASSESSMENTS.filter((a) => a.courseId === courseId);
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

  async createSubmission(
    assessmentId: string,
    studentId: string,
    fileUrl: string | null,
    answerText: string | null,
  ): Promise<StoredSubmission> {
    const submission: StoredSubmission = {
      id: `sub-${Date.now()}`,
      assessmentId,
      studentId,
      fileUrl,
      answerText,
      submittedAt: new Date().toISOString(),
      score: null,
      correctedAt: null,
      feedback: null,
    };
    this.submissions.push(submission);
    return submission;
  }
}
