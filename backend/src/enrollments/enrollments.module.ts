import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service.js';
import type { EnrollmentRepository } from './interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from './interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from './repositories/in-memory-enrollment.repository.js';
import { PostgresEnrollmentRepository } from './repositories/postgres-enrollment.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

@Module({
  providers: [
    EnrollmentsService,
    InMemoryEnrollmentRepository,
    PostgresEnrollmentRepository,
    repositoryProvider<EnrollmentRepository>(ENROLLMENT_REPOSITORY, InMemoryEnrollmentRepository, PostgresEnrollmentRepository),
  ],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
