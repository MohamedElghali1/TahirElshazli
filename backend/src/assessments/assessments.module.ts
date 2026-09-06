import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import type { AssessmentRepository } from './interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from './repositories/in-memory-assessment.repository.js';
import { PostgresAssessmentRepository } from './repositories/postgres-assessment.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    InMemoryAssessmentRepository,
    PostgresAssessmentRepository,
    repositoryProvider<AssessmentRepository>(ASSESSMENT_REPOSITORY, InMemoryAssessmentRepository, PostgresAssessmentRepository),
  ],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
