import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import type { MaterialRepository } from './interfaces/material-repository.interface.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';
import { InMemoryMaterialRepository } from './repositories/in-memory-material.repository.js';
import { PostgresMaterialRepository } from './repositories/postgres-material.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [MaterialsController],
  providers: [
    MaterialsService,
    InMemoryMaterialRepository,
    PostgresMaterialRepository,
    repositoryProvider<MaterialRepository>(MATERIAL_REPOSITORY, InMemoryMaterialRepository, PostgresMaterialRepository),
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}
