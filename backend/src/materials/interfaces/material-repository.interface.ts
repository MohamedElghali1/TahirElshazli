export type MaterialCategory =
  | 'course_notes'
  | 'study_materials'
  | 'important_files';

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'course_notes',
  'study_materials',
  'important_files',
];

export interface Material {
  id: string;
  courseId: string;
  /**
   * The lesson this material belongs to, when it belongs to one (`025`).
   *
   * **Null is the normal case, not a gap.** Most materials belong to the course
   * as a whole — a syllabus, a formula sheet, a past paper — and only some are
   * "the handout from lesson 4". The student's lesson detail page (`STU-3`)
   * shows the ones that name its lesson; the course Materials page shows them
   * all either way, so a null here hides nothing from anyone.
   */
  lessonId: string | null;
  title: string;
  description: string | null;
  category: MaterialCategory;
  chapter: string | null;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

export interface MaterialRepository {
  findByCourse(
    courseId: string,
    category?: MaterialCategory,
  ): Promise<Material[]>;
}

export const MATERIAL_REPOSITORY = Symbol('MATERIAL_REPOSITORY');
