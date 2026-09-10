import { Injectable } from '@nestjs/common';
import type {
  NewRecording,
  Recording,
  RecordingFilter,
  RecordingProgress,
  RecordingRepository,
  RecordingUpdate,
  RecordingWithProgress,
} from '../interfaces/recording-repository.interface.js';

interface StoredProgress {
  recordingId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  /**
   * Stamped once, when the lesson first crosses the threshold. Kept separate
   * from `updatedAt` because that moves on every progress ping - deriving the
   * checkpoint date from it would reset a student's history on a rewatch.
   */
  completedAt: string | null;
  updatedAt: string;
}

/** A recording counts as completed once the student has watched this share of it. */
const COMPLETION_THRESHOLD = 0.9;

const STUB_RECORDINGS: Recording[] = [
  // Chapter 1 - Atomic Structure
  {
    id: 'rec-1',
    courseId: 'course-1',
    moduleId: 'mod-1',
    lessonId: 'lesson-1',
    title: 'Atomic Structure Basics',
    chapter: 'Chapter 1',
    topics: ['Atomic Structure'],
    videoUrl: 'https://video.example.com/as-chem/rec-1',
    durationSeconds: 2400,
    lessonDate: '2026-02-03T17:00:00Z',
    order: 1,
  },
  {
    id: 'rec-2',
    courseId: 'course-1',
    moduleId: 'mod-1',
    lessonId: 'lesson-2',
    title: 'Electron Configuration',
    chapter: 'Chapter 1',
    topics: ['Atomic Structure'],
    videoUrl: 'https://video.example.com/as-chem/rec-2',
    durationSeconds: 2100,
    lessonDate: '2026-02-10T17:00:00Z',
    order: 2,
  },
  {
    id: 'rec-3',
    courseId: 'course-1',
    moduleId: 'mod-1',
    lessonId: 'lesson-3',
    title: 'Ionisation Energy',
    chapter: 'Chapter 1',
    topics: ['Atomic Structure', 'Physical Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-3',
    durationSeconds: 1980,
    lessonDate: '2026-02-17T17:00:00Z',
    order: 3,
  },
  {
    id: 'rec-4',
    courseId: 'course-1',
    moduleId: 'mod-1',
    lessonId: 'lesson-4',
    title: 'The Periodic Table',
    chapter: 'Chapter 1',
    topics: ['Atomic Structure'],
    videoUrl: 'https://video.example.com/as-chem/rec-4',
    durationSeconds: 1800,
    lessonDate: '2026-02-24T17:00:00Z',
    order: 4,
  },
  // Chapter 2 - Moles & Stoichiometry
  {
    id: 'rec-5',
    courseId: 'course-1',
    moduleId: 'mod-2',
    lessonId: 'lesson-5',
    title: 'The Mole Concept',
    chapter: 'Chapter 2',
    topics: ['Moles'],
    videoUrl: 'https://video.example.com/as-chem/rec-5',
    durationSeconds: 2700,
    lessonDate: '2026-03-03T17:00:00Z',
    order: 5,
  },
  {
    id: 'rec-6',
    courseId: 'course-1',
    moduleId: 'mod-2',
    lessonId: 'lesson-6',
    title: 'Empirical & Molecular Formulae',
    chapter: 'Chapter 2',
    topics: ['Moles'],
    videoUrl: 'https://video.example.com/as-chem/rec-6',
    durationSeconds: 2280,
    lessonDate: '2026-03-10T17:00:00Z',
    order: 6,
  },
  {
    id: 'rec-7',
    courseId: 'course-1',
    moduleId: 'mod-2',
    lessonId: 'lesson-7',
    title: 'Titration Calculations',
    chapter: 'Chapter 2',
    topics: ['Moles', 'Physical Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-7',
    durationSeconds: 3000,
    lessonDate: '2026-03-17T17:00:00Z',
    order: 7,
  },
  {
    id: 'rec-8',
    courseId: 'course-1',
    moduleId: 'mod-2',
    lessonId: 'lesson-8',
    title: 'Gas Volumes',
    chapter: 'Chapter 2',
    topics: ['Moles', 'Physical Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-8',
    durationSeconds: 1920,
    lessonDate: '2026-03-24T17:00:00Z',
    order: 8,
  },
  // Chapter 3 - Organic Chemistry
  {
    id: 'rec-9',
    courseId: 'course-1',
    moduleId: 'mod-3',
    lessonId: 'lesson-9',
    title: 'Alkanes',
    chapter: 'Chapter 3',
    topics: ['Organic Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-9',
    durationSeconds: 2520,
    lessonDate: '2026-04-07T17:00:00Z',
    order: 9,
  },
  {
    id: 'rec-10',
    courseId: 'course-1',
    moduleId: 'mod-3',
    lessonId: 'lesson-10',
    title: 'Alkenes',
    chapter: 'Chapter 3',
    topics: ['Organic Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-10',
    durationSeconds: 2640,
    lessonDate: '2026-04-14T17:00:00Z',
    order: 10,
  },
  {
    id: 'rec-11',
    courseId: 'course-1',
    moduleId: 'mod-3',
    lessonId: 'lesson-11',
    title: 'Alcohols',
    chapter: 'Chapter 3',
    topics: ['Organic Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-11',
    durationSeconds: 2400,
    lessonDate: '2026-04-21T17:00:00Z',
    order: 11,
  },
  {
    id: 'rec-12',
    courseId: 'course-1',
    moduleId: 'mod-3',
    lessonId: 'lesson-12',
    title: 'Halogenoalkanes',
    chapter: 'Chapter 3',
    topics: ['Organic Chemistry'],
    videoUrl: 'https://video.example.com/as-chem/rec-12',
    durationSeconds: 2160,
    lessonDate: '2026-04-28T17:00:00Z',
    order: 12,
  },
];

@Injectable()
export class InMemoryRecordingRepository implements RecordingRepository {
  /**
   * A per-instance copy of the seed, not the seed itself.
   *
   * The teacher's upload/edit/delete surface writes here, and this repository
   * is a singleton in the app but a fresh instance in every test - so a test
   * that publishes a recording cannot leak it into the next one, which a
   * shared module-level array would. Same reasoning as
   * `InMemoryEnrollmentRepository`.
   */
  private readonly recordings: Recording[] = [...STUB_RECORDINGS];

  /** Sequence for generated ids, so two uploads in one millisecond differ. */
  private nextId = 1;

  private progressStore: StoredProgress[] = [
    {
      recordingId: 'rec-1',
      studentId: 'student-1',
      watchedSeconds: 2400,
      completed: true,
      completedAt: '2026-02-04T19:00:00Z',
      updatedAt: '2026-02-04T19:00:00Z',
    },
    {
      recordingId: 'rec-2',
      studentId: 'student-1',
      watchedSeconds: 2100,
      completed: true,
      completedAt: '2026-02-11T19:00:00Z',
      updatedAt: '2026-02-11T19:00:00Z',
    },
    {
      recordingId: 'rec-3',
      studentId: 'student-1',
      watchedSeconds: 1980,
      completed: true,
      completedAt: '2026-02-18T19:00:00Z',
      updatedAt: '2026-02-18T19:00:00Z',
    },
    {
      recordingId: 'rec-4',
      studentId: 'student-1',
      watchedSeconds: 1800,
      completed: true,
      completedAt: '2026-02-25T19:00:00Z',
      updatedAt: '2026-02-25T19:00:00Z',
    },
    {
      recordingId: 'rec-5',
      studentId: 'student-1',
      watchedSeconds: 2700,
      completed: true,
      completedAt: '2026-03-04T19:00:00Z',
      updatedAt: '2026-03-04T19:00:00Z',
    },
    {
      recordingId: 'rec-6',
      studentId: 'student-1',
      watchedSeconds: 1140,
      completed: false,
      completedAt: null,
      updatedAt: '2026-03-11T19:00:00Z',
    },
  ];

  async findByCourse(
    courseId: string,
    studentId: string,
    filter?: RecordingFilter,
  ): Promise<RecordingWithProgress[]> {
    return this.recordings
      .filter((r) => r.courseId === courseId)
      .filter((r) => !filter?.chapter || r.chapter === filter.chapter)
      .filter((r) => !filter?.topic || r.topics.includes(filter.topic))
      .sort((a, b) => a.order - b.order)
      .map((r) => {
        const progress = this.progressStore.find(
          (p) => p.recordingId === r.id && p.studentId === studentId,
        );
        return {
          ...r,
          watchedSeconds: progress?.watchedSeconds ?? 0,
          completed: progress?.completed ?? false,
          completedAt: progress?.completedAt ?? null,
        };
      });
  }

  async upsertProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress> {
    const recording = this.recordings.find((r) => r.id === recordingId);
    const cappedSeconds = recording
      ? Math.min(watchedSeconds, recording.durationSeconds)
      : watchedSeconds;
    const completed = recording
      ? cappedSeconds >= recording.durationSeconds * COMPLETION_THRESHOLD
      : false;

    const existing = this.progressStore.find(
      (p) => p.recordingId === recordingId && p.studentId === studentId,
    );

    // Watch progress only ever moves forward, so a seek backwards or a
    // late-arriving update cannot undo a completion the student already earned.
    const nextWatchedSeconds = Math.max(cappedSeconds, existing?.watchedSeconds ?? 0);
    const now = new Date().toISOString();
    const nextCompleted = completed || (existing?.completed ?? false);
    const progress: StoredProgress = {
      recordingId,
      studentId,
      watchedSeconds: nextWatchedSeconds,
      completed: nextCompleted,
      // Set on the transition into completion and never rewritten afterwards.
      completedAt: existing?.completedAt ?? (nextCompleted ? now : null),
      updatedAt: now,
    };

    if (existing) {
      Object.assign(existing, progress);
      return existing;
    }
    this.progressStore.push(progress);
    return progress;
  }

  async findRecordingById(recordingId: string): Promise<Recording | null> {
    const recording = this.recordings.find((r) => r.id === recordingId);
    // A copy, so a caller holding a "before" snapshot cannot watch it change
    // underneath them when `update` writes. Without it the audit entry for
    // `recording.updated` reads its before and after off the same object and
    // records a change that looks like it never happened (§5.4).
    return recording ? { ...recording, topics: [...recording.topics] } : null;
  }

  async findByCourseForStaff(courseId: string): Promise<Recording[]> {
    return this.recordings
      .filter((r) => r.courseId === courseId)
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ ...r, topics: [...r.topics] }));
  }

  async countByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = new Set(courseIds);
    const counts: Record<string, number> = {};
    for (const recording of this.recordings) {
      if (wanted.has(recording.courseId)) {
        counts[recording.courseId] = (counts[recording.courseId] ?? 0) + 1;
      }
    }
    return counts;
  }

  async create(input: NewRecording): Promise<Recording> {
    // Appended to the end of the course's running order. Derived from the
    // course's own rows rather than the array length, so a course with no
    // recordings starts at 1 instead of inheriting another course's count.
    const highestOrder = this.recordings
      .filter((r) => r.courseId === input.courseId)
      .reduce((max, r) => Math.max(max, r.order), 0);

    const recording: Recording = {
      id: `rec-${Date.now()}-${this.nextId++}`,
      courseId: input.courseId,
      moduleId: input.moduleId,
      lessonId: input.lessonId,
      title: input.title,
      chapter: input.chapter,
      // Copied, not aliased: the caller's array must not stay writable through
      // the stored row.
      topics: [...input.topics],
      videoUrl: input.videoUrl,
      durationSeconds: input.durationSeconds,
      lessonDate: input.lessonDate,
      order: highestOrder + 1,
    };
    this.recordings.push(recording);
    return recording;
  }

  async update(
    recordingId: string,
    patch: RecordingUpdate,
  ): Promise<Recording | null> {
    const existing = this.recordings.find((r) => r.id === recordingId);
    if (!existing) {
      return null;
    }
    // Field by field rather than a spread of `patch`, so an explicit
    // `undefined` on the wire cannot blank a column.
    if (patch.title !== undefined) existing.title = patch.title;
    if (patch.chapter !== undefined) existing.chapter = patch.chapter;
    if (patch.topics !== undefined) existing.topics = [...patch.topics];
    if (patch.videoUrl !== undefined) existing.videoUrl = patch.videoUrl;
    if (patch.durationSeconds !== undefined) {
      existing.durationSeconds = patch.durationSeconds;
    }
    if (patch.lessonDate !== undefined) existing.lessonDate = patch.lessonDate;
    return existing;
  }

  async remove(recordingId: string): Promise<boolean> {
    const index = this.recordings.findIndex((r) => r.id === recordingId);
    if (index === -1) {
      return false;
    }
    this.recordings.splice(index, 1);
    // Postgres does this through ON DELETE CASCADE on recording_progress; the
    // memory driver has to do it by hand or the next student read joins onto
    // progress rows for a recording that no longer exists.
    this.progressStore = this.progressStore.filter(
      (p) => p.recordingId !== recordingId,
    );
    return true;
  }
}
