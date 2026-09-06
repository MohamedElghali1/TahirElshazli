import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
  Material,
  MaterialCategory,
  MaterialRepository,
} from '../interfaces/material-repository.interface.js';

interface MaterialRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  category: MaterialCategory;
  chapter: string | null;
  file_url: string;
  file_type: string;
  file_size_bytes: string;
  uploaded_at: Date;
}

function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    category: row.category,
    chapter: row.chapter,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileSizeBytes: num(row.file_size_bytes),
    uploadedAt: iso(row.uploaded_at),
  };
}

@Injectable()
export class PostgresMaterialRepository implements MaterialRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByCourse(
    courseId: string,
    category?: MaterialCategory,
  ): Promise<Material[]> {
    // The optional filter is expressed as a nullable parameter rather than by
    // appending to the SQL string - one prepared statement, one plan, and no
    // path where a caller's value reaches the parser.
    const rows = await this.db.query<MaterialRow>(
      `SELECT id, course_id, title, description, category, chapter,
              file_url, file_type, file_size_bytes, uploaded_at
       FROM materials
       WHERE course_id = $1
         AND ($2::text IS NULL OR category = $2)
       ORDER BY uploaded_at DESC`,
      [courseId, category ?? null],
    );
    return rows.map(toMaterial);
  }
}
