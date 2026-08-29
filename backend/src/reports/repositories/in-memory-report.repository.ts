import { Injectable } from '@nestjs/common';
import type {
  ReportDocument,
  ReportRepository,
} from '../interfaces/report-repository.interface.js';

const STUB_DOCUMENTS: ReportDocument[] = [
  {
    id: 'rpt-1',
    courseId: 'course-1',
    studentId: 'student-1',
    title: 'Term Performance Report',
    period: 'Term 1 2026',
    fileUrl: 'https://storage.example.com/reports/ali-esam-term1-2026.pdf',
    overallPercentage: 80,
    issuedAt: '2026-06-30T12:00:00Z',
  },
  {
    id: 'rpt-2',
    courseId: 'course-1',
    studentId: 'student-1',
    title: 'Midterm Progress Report',
    period: 'Midterm 2026',
    fileUrl: 'https://storage.example.com/reports/ali-esam-midterm-2026.pdf',
    overallPercentage: 76,
    issuedAt: '2026-04-15T12:00:00Z',
  },
  {
    id: 'rpt-3',
    courseId: 'course-1',
    studentId: 'student-1',
    title: 'Attendance Summary',
    period: 'Term 1 2026',
    fileUrl: 'https://storage.example.com/reports/ali-esam-attendance-t1.pdf',
    overallPercentage: null,
    issuedAt: '2026-06-30T12:00:00Z',
  },
];

@Injectable()
export class InMemoryReportRepository implements ReportRepository {
  async findDocuments(
    courseId: string,
    studentId: string,
  ): Promise<ReportDocument[]> {
    return STUB_DOCUMENTS.filter(
      (d) => d.courseId === courseId && d.studentId === studentId,
    ).sort(
      (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
    );
  }

  async findDocumentById(documentId: string): Promise<ReportDocument | null> {
    return STUB_DOCUMENTS.find((d) => d.id === documentId) ?? null;
  }
}
