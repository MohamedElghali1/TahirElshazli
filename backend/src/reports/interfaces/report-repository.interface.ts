export interface ReportDocument {
  id: string;
  courseId: string;
  studentId: string;
  title: string;
  period: string;
  fileUrl: string;
  overallPercentage: number | null;
  issuedAt: string;
}

export interface ReportRepository {
  findDocuments(courseId: string, studentId: string): Promise<ReportDocument[]>;
  findDocumentById(documentId: string): Promise<ReportDocument | null>;
}

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
