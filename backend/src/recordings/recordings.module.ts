import { Module } from '@nestjs/common';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import type { RecordingRepository } from './interfaces/recording-repository.interface.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from './repositories/in-memory-recording.repository.js';
import { PostgresRecordingRepository } from './repositories/postgres-recording.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [RecordingsController],
  providers: [
    RecordingsService,
    InMemoryRecordingRepository,
    PostgresRecordingRepository,
    repositoryProvider<RecordingRepository>(RECORDING_REPOSITORY, InMemoryRecordingRepository, PostgresRecordingRepository),
  ],
  exports: [RecordingsService, RECORDING_REPOSITORY],
})
export class RecordingsModule {}
