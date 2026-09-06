import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  RecordingFilter,
  RecordingProgress,
  RecordingRepository,
  RecordingWithProgress,
} from './interfaces/recording-repository.interface.js';
import { RECORDING_REPOSITORY } from './interfaces/recording-repository.interface.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';

export interface RecordingFilterOptions {
  chapters: string[];
  topics: string[];
}

export interface RecordingListResponse {
  recordings: RecordingWithProgress[];
  filters: RecordingFilterOptions;
}

/** Course completion, derived from watch progress - never a stored percentage. */
export interface RecordedCompletion {
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
}

@Injectable()
export class RecordingsService {
  constructor(
    @Inject(RECORDING_REPOSITORY)
    private readonly recordingRepo: RecordingRepository,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  async getRecordingsForCourse(
    courseId: string,
    studentId: string,
    filter?: RecordingFilter,
  ): Promise<RecordingListResponse> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    // One read, filtered here. Issuing the filtered and unfiltered queries in
    // parallel cost nothing against an in-memory array and doubles a joined
    // Postgres query on every recordings tab and every recorded-mode dashboard.
    // The unfiltered set already carries every column both answers need.
    const all = await this.recordingRepo.findByCourse(courseId, studentId);
    const recordings = all.filter(
      (r) =>
        (!filter?.chapter || r.chapter === filter.chapter) &&
        (!filter?.topic || r.topics.includes(filter.topic)),
    );
    // Filter chips always list every chapter/topic in the course, not just the
    // ones surviving the current filter - otherwise selecting one hides the rest.
    return {
      recordings,
      filters: {
        chapters: [...new Set(all.map((r) => r.chapter))],
        topics: [...new Set(all.flatMap((r) => r.topics))].sort(),
      },
    };
  }

  async getCourseCompletion(
    courseId: string,
    studentId: string,
  ): Promise<RecordedCompletion> {
    const recordings = await this.recordingRepo.findByCourse(courseId, studentId);
    const completedLessons = recordings.filter((r) => r.completed).length;
    const totalLessons = recordings.length;
    return {
      completedLessons,
      totalLessons,
      completionPercentage:
        totalLessons === 0
          ? 0
          : Math.round((completedLessons / totalLessons) * 100),
    };
  }

  async countUnwatched(courseId: string, studentId: string): Promise<number> {
    const recordings = await this.recordingRepo.findByCourse(courseId, studentId);
    return recordings.filter((r) => r.watchedSeconds === 0).length;
  }

  async updateProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress> {
    const recording = await this.recordingRepo.findRecordingById(recordingId);
    // The recording carries its own courseId, so enrollment is checked against
    // the course that actually owns it rather than anything the client sent.
    //
    // Both failures answer with the same 404 body. Letting `assertEnrolled`
    // throw its own message would tell the caller which of the two happened,
    // which is an existence oracle over the recording id space.
    const enrollment = recording
      ? await this.enrollmentsService.find(recording.courseId, studentId)
      : null;
    if (!recording || !enrollment) {
      throw new NotFoundException('Recording not found');
    }
    return this.recordingRepo.upsertProgress(recordingId, studentId, watchedSeconds);
  }
}
