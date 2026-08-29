import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';
import { InMemoryMaterialRepository } from './repositories/in-memory-material.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [MaterialsController],
  providers: [
    MaterialsService,
    {
      provide: MATERIAL_REPOSITORY,
      useClass: InMemoryMaterialRepository,
    },
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}
