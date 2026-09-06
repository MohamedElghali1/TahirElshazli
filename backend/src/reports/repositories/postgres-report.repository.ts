import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import type {
  ReportDocument,
  ReportRepository,
} from '../interfaces/report-repository.interface.js';

interface ReportRow {
  id: string;
  course_id: string;
  student_id: string;
  title: string;
  period: string;
  file_url: string;
  overall_percentage: number | null;
  issued_at: Date;
}

const COLUMNS = `
  id, course_id, student_id, title, period, file_url, overall_percentage, issued_at
`;

function toDocument(row: ReportRow): ReportDocument {
  return {
    id: row.id,
    courseId: row.course_id,
    studentId: row.student_id,
    title: row.title,
    period: row.period,
    fileUrl: row.file_url,
    overallPercentage: row.overall_percentage,
    issuedAt: iso(row.issued_at),
  };
}

@Injectable()
export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly db: DatabaseService) {}

  async findDocuments(
    courseId: string,
    studentId: string,
  ): Promise<ReportDocument[]> {
    const rows = await this.db.query<ReportRow>(
      `SELECT ${COLUMNS}
       FROM report_documents
       WHERE course_id = $1 AND student_id = $2
       ORDER BY issued_at DESC`,
      [courseId, studentId],
    );
    return rows.map(toDocument);
  }

  /**
   * Deliberately unscoped: the row carries `studentId`, and the service is what
   * compares it to the caller. Adding the ownership predicate here as well
   * would leave two places that have to agree about who may read a report.
   */
  async findDocumentById(documentId: string): Promise<ReportDocument | null> {
    const row = await this.db.queryOne<ReportRow>(
      `SELECT ${COLUMNS} FROM report_documents WHERE id = $1`,
      [documentId],
    );
    return row ? toDocument(row) : null;
  }
}
