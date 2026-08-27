import { Injectable } from '@nestjs/common';
import type {
  RecordingRepository,
  Recording,
  RecordingWithProgress,
  RecordingProgress,
} from '../interfaces/recording-repository.interface.js';

interface StoredProgress {
  recordingId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  updatedAt: string;
}

const STUB_RECORDINGS: Recording[] = [
  {
    id: 'rec-1',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    title: 'Atomic Structure - Lecture',
    durationSeconds: 2400,
    order: 1,
  },
  {
    id: 'rec-2',
    courseId: 'course-1',
    lessonId: 'lesson-2',
    title: 'The Periodic Table - Lecture',
    durationSeconds: 1800,
    order: 2,
  },
  {
    id: 'rec-3',
    courseId: 'course-1',
    lessonId: 'lesson-3',
    title: 'Ionic Bonding - Lecture',
    durationSeconds: 3000,
    order: 3,
  },
];

@Injectable()
export class InMemoryRecordingRepository implements RecordingRepository {
  private progressStore: StoredProgress[] = [
    {
      recordingId: 'rec-1',
      studentId: 'student-1',
      watchedSeconds: 2400,
      completed: true,
      updatedAt: '2026-07-01T10:00:00Z',
    },
    {
      recordingId: 'rec-2',
      studentId: 'student-1',
      watchedSeconds: 900,
      completed: false,
      updatedAt: '2026-07-03T14:00:00Z',
    },
  ];

  async findByCourse(courseId: string, studentId: string): Promise<RecordingWithProgress[]> {
    const courseRecordings = STUB_RECORDINGS.filter((r) => r.courseId === courseId);
    return courseRecordings.map((r) => {
      const progress = this.progressStore.find(
        (p) => p.recordingId === r.id && p.studentId === studentId,
      );
      return {
        ...r,
        watchedSeconds: progress?.watchedSeconds ?? 0,
        completed: progress?.completed ?? false,
      };
    });
  }

  async upsertProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress> {
    const recording = STUB_RECORDINGS.find((r) => r.id === recordingId);
    const completed = recording ? watchedSeconds >= recording.durationSeconds : false;
    const now = new Date().toISOString();

    const existingIndex = this.progressStore.findIndex(
      (p) => p.recordingId === recordingId && p.studentId === studentId,
    );

    const progress: StoredProgress = {
      recordingId,
      studentId,
      watchedSeconds,
      completed,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.progressStore[existingIndex] = progress;
    } else {
      this.progressStore.push(progress);
    }

    return progress;
  }

  async findRecordingById(recordingId: string): Promise<Recording | null> {
    return STUB_RECORDINGS.find((r) => r.id === recordingId) ?? null;
  }
}
