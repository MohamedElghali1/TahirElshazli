import { Module } from '@nestjs/common';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from './repositories/in-memory-recording.repository.js';

@Module({
  controllers: [RecordingsController],
  providers: [
    RecordingsService,
    {
      provide: RECORDING_REPOSITORY,
      useClass: InMemoryRecordingRepository,
    },
  ],
})
export class RecordingsModule {}
