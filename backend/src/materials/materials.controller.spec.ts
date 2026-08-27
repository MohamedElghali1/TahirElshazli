import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';
import { InMemoryMaterialRepository } from './repositories/in-memory-material.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('MaterialsController', () => {
  let controller: MaterialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        MaterialsService,
        {
          provide: MATERIAL_REPOSITORY,
          useClass: InMemoryMaterialRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return materials grouped by category', async () => {
    const result = await controller.listMaterials('course-1');
    expect(result).toHaveProperty('course_notes');
    expect(result).toHaveProperty('study_materials');
    expect(result).toHaveProperty('important_files');
    expect(result.course_notes.length).toBeGreaterThan(0);
  });
});
