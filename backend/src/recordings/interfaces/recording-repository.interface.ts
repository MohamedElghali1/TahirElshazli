export interface Recording {
  id: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  chapter: string;
  topics: string[];
  videoUrl: string;
  durationSeconds: number;
  lessonDate: string;
  order: number;
}

export interface RecordingWithProgress extends Recording {
  watchedSeconds: number;
  completed: boolean;
  completedAt: string | null;
}

export interface RecordingProgress {
  recordingId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  /** Stamped once on completion; the checkpoint date the course view reads. */
  completedAt: string | null;
  updatedAt: string;
}

export interface RecordingFilter {
  chapter?: string;
  topic?: string;
}

export interface RecordingRepository {
  findByCourse(
    courseId: string,
    studentId: string,
    filter?: RecordingFilter,
  ): Promise<RecordingWithProgress[]>;
  upsertProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress>;
  findRecordingById(recordingId: string): Promise<Recording | null>;
}

export const RECORDING_REPOSITORY = Symbol('RECORDING_REPOSITORY');
