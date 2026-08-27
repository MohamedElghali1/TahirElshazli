export type MaterialCategory = 'course_notes' | 'study_materials' | 'important_files';

export interface Material {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  category: MaterialCategory;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

export interface MaterialRepository {
  findByCourse(courseId: string): Promise<Material[]>;
}

export const MATERIAL_REPOSITORY = Symbol('MATERIAL_REPOSITORY');
