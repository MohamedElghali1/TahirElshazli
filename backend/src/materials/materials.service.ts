import { Inject, Injectable } from '@nestjs/common';
import type {
  Material,
  MaterialCategory,
  MaterialRepository,
} from './interfaces/material-repository.interface.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';

export type MaterialsByCategory = Record<MaterialCategory, Material[]>;
export type MaterialCounts = Record<MaterialCategory, number>;

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(MATERIAL_REPOSITORY)
    private readonly materialRepo: MaterialRepository,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  private empty(): MaterialsByCategory {
    return { course_notes: [], study_materials: [], important_files: [] };
  }

  /**
   * Backs the three quick-access links. A category filter narrows which bucket
   * is populated; the other buckets stay present but empty so the response
   * shape never changes on the client.
   */
  async getMaterialsForCourse(
    courseId: string,
    studentId: string,
    category?: MaterialCategory,
  ): Promise<MaterialsByCategory> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const materials = await this.materialRepo.findByCourse(courseId, category);
    const grouped = this.empty();
    for (const material of materials) {
      grouped[material.category].push(material);
    }
    return grouped;
  }

  async getCounts(courseId: string, studentId: string): Promise<MaterialCounts> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    const materials = await this.materialRepo.findByCourse(courseId);
    const counts: MaterialCounts = {
      course_notes: 0,
      study_materials: 0,
      important_files: 0,
    };
    for (const material of materials) {
      counts[material.category] += 1;
    }
    return counts;
  }
}
