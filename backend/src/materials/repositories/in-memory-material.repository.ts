import { Injectable } from '@nestjs/common';
import type { MaterialRepository, Material } from '../interfaces/material-repository.interface.js';

const STUB_MATERIALS: Material[] = [
  {
    id: 'mat-1',
    courseId: 'course-1',
    title: 'Chapter 1 Notes - Atomic Structure',
    description: 'Comprehensive notes on atomic structure',
    category: 'course_notes',
    fileUrl: 'https://storage.example.com/materials/chapter1-notes.pdf',
    fileType: 'application/pdf',
    fileSizeBytes: 1048576,
    uploadedAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'mat-2',
    courseId: 'course-1',
    title: 'Practice Problems Set 1',
    description: 'Extra practice problems for revision',
    category: 'study_materials',
    fileUrl: 'https://storage.example.com/materials/practice-set1.pdf',
    fileType: 'application/pdf',
    fileSizeBytes: 524288,
    uploadedAt: '2026-06-20T14:00:00Z',
  },
  {
    id: 'mat-3',
    courseId: 'course-1',
    title: 'IGCSE Syllabus 2026',
    description: null,
    category: 'important_files',
    fileUrl: 'https://storage.example.com/materials/syllabus-2026.pdf',
    fileType: 'application/pdf',
    fileSizeBytes: 2097152,
    uploadedAt: '2026-06-01T08:00:00Z',
  },
  {
    id: 'mat-4',
    courseId: 'course-2',
    title: 'IELTS Speaking Tips',
    description: 'Key tips for IELTS speaking section',
    category: 'course_notes',
    fileUrl: 'https://storage.example.com/materials/ielts-speaking-tips.pdf',
    fileType: 'application/pdf',
    fileSizeBytes: 768000,
    uploadedAt: '2026-07-01T09:00:00Z',
  },
];

@Injectable()
export class InMemoryMaterialRepository implements MaterialRepository {
  async findByCourse(courseId: string): Promise<Material[]> {
    return STUB_MATERIALS.filter((m) => m.courseId === courseId);
  }
}
