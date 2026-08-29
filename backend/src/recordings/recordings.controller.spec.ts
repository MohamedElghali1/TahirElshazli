import { Test, TestingModule } from '@nestjs/testing';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { InMemoryRecordingRepository } from './repositories/in-memory-recording.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('RecordingsController', () => {
  let controller: RecordingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordingsController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        RecordingsService,
        { provide: RECORDING_REPOSITORY, useClass: InMemoryRecordingRepository },
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

  it('should list recordings with per-student watch progress', async () => {
    const { recordings } = await controller.listRecordings('course-1', {}, STUDENT);
    expect(recordings).toHaveLength(12);
    expect(recordings[0]).toMatchObject({ id: 'rec-1', completed: true });
    expect(recordings[0].completedAt).not.toBeNull();
    expect(recordings.at(-1)).toMatchObject({ watchedSeconds: 0, completed: false });
  });

  it('should offer every chapter and topic as a filter option', async () => {
    const { filters } = await controller.listRecordings('course-1', {}, STUDENT);
    expect(filters.chapters).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(filters.topics).toEqual([
      'Atomic Structure',
      'Moles',
      'Organic Chemistry',
      'Physical Chemistry',
    ]);
  });

  it('should filter by chapter', async () => {
    const { recordings } = await controller.listRecordings(
      'course-1',
      { chapter: 'Chapter 2' },
      STUDENT,
    );
    expect(recordings).toHaveLength(4);
    expect(recordings.every((r) => r.chapter === 'Chapter 2')).toBe(true);
  });

  it('should filter by topic', async () => {
    const { recordings } = await controller.listRecordings(
      'course-1',
      { topic: 'Physical Chemistry' },
      STUDENT,
    );
    expect(recordings.map((r) => r.id)).toEqual(['rec-3', 'rec-7', 'rec-8']);
  });

  it('should keep the full filter list when a filter is applied', async () => {
    const { filters } = await controller.listRecordings(
      'course-1',
      { chapter: 'Chapter 2' },
      STUDENT,
    );
    expect(filters.chapters).toHaveLength(3);
  });

  it('should upsert progress rather than creating duplicates', async () => {
    await controller.updateProgress('rec-7', { watchedSeconds: 600 }, STUDENT);
    await controller.updateProgress('rec-7', { watchedSeconds: 1200 }, STUDENT);
    const { recordings } = await controller.listRecordings('course-1', {}, STUDENT);
    const matches = recordings.filter((r) => r.id === 'rec-7');
    expect(matches).toHaveLength(1);
    expect(matches[0].watchedSeconds).toBe(1200);
  });

  it('should mark a recording completed past the threshold and not regress it', async () => {
    await controller.updateProgress('rec-7', { watchedSeconds: 3000 }, STUDENT);
    let { recordings } = await controller.listRecordings('course-1', {}, STUDENT);
    expect(recordings.find((r) => r.id === 'rec-7')?.completed).toBe(true);

    // A seek backwards must not undo the completion or lower watched seconds.
    await controller.updateProgress('rec-7', { watchedSeconds: 10 }, STUDENT);
    ({ recordings } = await controller.listRecordings('course-1', {}, STUDENT));
    expect(recordings.find((r) => r.id === 'rec-7')).toMatchObject({
      completed: true,
      watchedSeconds: 3000,
    });
  });

  it('should cap watched seconds at the recording duration', async () => {
    await controller.updateProgress('rec-8', { watchedSeconds: 999_999 }, STUDENT);
    const { recordings } = await controller.listRecordings('course-1', {}, STUDENT);
    expect(recordings.find((r) => r.id === 'rec-8')?.watchedSeconds).toBe(1920);
  });

  it('should 404 progress for an unknown recording', async () => {
    await expect(
      controller.updateProgress('rec-does-not-exist', { watchedSeconds: 5 }, STUDENT),
    ).rejects.toThrow();
  });

  describe('course-scoped authorization', () => {
    const STRANGER = {
      user: { sub: 'student-999', email: 'x@example.com', role: 'student', jti: 'j9' },
    };

    it('refuses to list recordings for a course the caller is not enrolled in', async () => {
      await expect(
        controller.listRecordings('course-1', {}, STRANGER),
      ).rejects.toThrow();
    });

    it('refuses watch progress on a recording the caller cannot access', async () => {
      // Enrollment is checked against the recording's own courseId, so a valid
      // recording id is not enough on its own.
      await expect(
        controller.updateProgress('rec-1', { watchedSeconds: 60 }, STRANGER),
      ).rejects.toThrow();
    });
  });
});
