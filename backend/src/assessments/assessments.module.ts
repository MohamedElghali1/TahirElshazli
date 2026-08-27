import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from './repositories/in-memory-assessment.repository.js';

@Module({
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    {
      provide: ASSESSMENT_REPOSITORY,
      useClass: InMemoryAssessmentRepository,
    },
  ],
})
export class AssessmentsModule {}
