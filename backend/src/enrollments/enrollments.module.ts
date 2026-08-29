import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from './interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from './repositories/in-memory-enrollment.repository.js';

@Module({
  providers: [
    EnrollmentsService,
    {
      provide: ENROLLMENT_REPOSITORY,
      useClass: InMemoryEnrollmentRepository,
    },
  ],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
