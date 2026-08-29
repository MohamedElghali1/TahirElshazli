import { Module } from '@nestjs/common';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from './repositories/in-memory-recording.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [RecordingsController],
  providers: [
    RecordingsService,
    {
      provide: RECORDING_REPOSITORY,
      useClass: InMemoryRecordingRepository,
    },
  ],
  exports: [RecordingsService],
})
export class RecordingsModule {}
