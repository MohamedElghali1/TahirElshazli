import { Test, TestingModule } from '@nestjs/testing';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from './repositories/in-memory-recording.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('RecordingsController', () => {
  let controller: RecordingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordingsController],
      providers: [
        RecordingsService,
        {
          provide: RECORDING_REPOSITORY,
          useClass: InMemoryRecordingRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RecordingsController>(RecordingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list recordings for a course', async () => {
    const recordings = await controller.listRecordings('course-1', { user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(recordings.length).toBeGreaterThan(0);
    expect(recordings[0]).toHaveProperty('watchedSeconds');
  });

  it('should update recording progress (idempotent)', async () => {
    const req = { user: { sub: 'student-1', email: 'student@example.com', role: 'student' } };
    const result1 = await controller.updateProgress('rec-1', { watchedSeconds: 1200 }, req);
    expect(result1.watchedSeconds).toBe(1200);
    const result2 = await controller.updateProgress('rec-1', { watchedSeconds: 1500 }, req);
    expect(result2.watchedSeconds).toBe(1500);
  });
});
