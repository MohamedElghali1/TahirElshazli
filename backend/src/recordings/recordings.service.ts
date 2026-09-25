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

/**
 * What the Home screen needs about a course's recordings, from one read.
 *
 * `resume` is the continue-watching card's recording (`STU-1`): the earliest in
 * course order that has been started and not finished, else the earliest not
 * finished at all - "next up" for a student who has watched nothing. `null`
 * only when every recording is complete or the course has none.
 *
 * ponytail: ordered by `order`, not by when the student last watched.
 * `RecordingWithProgress` carries no progress timestamp - `RecordingProgress`
 * has `updatedAt` but the joined read does not surface it. Surface it there if
 * "continue watching" ever needs to mean the genuinely most recent one.
 */
export interface CourseWatchState {
  /** Recordings the student has not started - the "N new" count. */
  unwatched: number;
  resume: RecordingWithProgress | null;
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

  /**
   * Replaces the old `countUnwatched`: both screens that wanted the count now
   * also want the resume point, and issuing a second `findByCourse` per course
   * to get it would put back a read per enrolled course on the one endpoint
   * that exists to have removed the fan-out (`StudentHomeService`'s header).
   */
  async getWatchState(courseId: string, studentId: string): Promise<CourseWatchState> {
    const recordings = await this.recordingRepo.findByCourse(courseId, studentId);
    const started = recordings.find((r) => r.watchedSeconds > 0 && !r.completed);
    return {
      unwatched: recordings.filter((r) => r.watchedSeconds === 0).length,
      resume: started ?? recordings.find((r) => !r.completed) ?? null,
    };
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
