import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type {
  RecordingRepository,
  RecordingWithProgress,
  RecordingProgress,
} from './interfaces/recording-repository.interface.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';

@Injectable()
export class RecordingsService {
  constructor(
    @Inject(RECORDING_REPOSITORY)
    private readonly recordingRepo: RecordingRepository,
  ) {}

  async getRecordingsForCourse(
    courseId: string,
    studentId: string,
  ): Promise<RecordingWithProgress[]> {
    return this.recordingRepo.findByCourse(courseId, studentId);
  }

  async updateProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress> {
    const recording = await this.recordingRepo.findRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    return this.recordingRepo.upsertProgress(recordingId, studentId, watchedSeconds);
  }
}
