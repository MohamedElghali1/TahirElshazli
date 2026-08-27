import { Injectable, Inject } from '@nestjs/common';
import type { MaterialRepository, Material, MaterialCategory } from './interfaces/material-repository.interface.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';

export interface MaterialsByCategory {
  course_notes: Material[];
  study_materials: Material[];
  important_files: Material[];
}

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(MATERIAL_REPOSITORY)
    private readonly materialRepo: MaterialRepository,
  ) {}

  async getMaterialsForCourse(courseId: string): Promise<MaterialsByCategory> {
    const materials = await this.materialRepo.findByCourse(courseId);
    const grouped: MaterialsByCategory = {
      course_notes: [],
      study_materials: [],
      important_files: [],
    };
    for (const material of materials) {
      const category: MaterialCategory = material.category;
      grouped[category].push(material);
    }
    return grouped;
  }
}
