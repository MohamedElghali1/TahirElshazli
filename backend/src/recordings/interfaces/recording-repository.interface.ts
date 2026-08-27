export interface Recording {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  durationSeconds: number;
  order: number;
}

export interface RecordingWithProgress extends Recording {
  watchedSeconds: number;
  completed: boolean;
}

export interface RecordingProgress {
  recordingId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface RecordingRepository {
  findByCourse(courseId: string, studentId: string): Promise<RecordingWithProgress[]>;
  upsertProgress(recordingId: string, studentId: string, watchedSeconds: number): Promise<RecordingProgress>;
  findRecordingById(recordingId: string): Promise<Recording | null>;
}

export const RECORDING_REPOSITORY = Symbol('RECORDING_REPOSITORY');
