import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import type {
  Recording,
  RecordingFilter,
  RecordingProgress,
  RecordingRepository,
  RecordingWithProgress,
} from '../interfaces/recording-repository.interface.js';

/** A recording counts as completed once the student has watched this share of it. */
const COMPLETION_THRESHOLD = 0.9;

interface RecordingRow {
  id: string;
  course_id: string;
  module_id: string;
  lesson_id: string;
  title: string;
  chapter: string;
  topics: string[];
  video_url: string;
  duration_seconds: number;
  lesson_date: Date;
  position: number;
}

interface RecordingWithProgressRow extends RecordingRow {
  watched_seconds: number | null;
  completed: boolean | null;
  completed_at: Date | null;
}

interface ProgressRow {
  recording_id: string;
  student_id: string;
  watched_seconds: number;
  completed: boolean;
  completed_at: Date | null;
  updated_at: Date;
}

function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    lessonId: row.lesson_id,
    title: row.title,
    chapter: row.chapter,
    topics: row.topics,
    videoUrl: row.video_url,
    durationSeconds: row.duration_seconds,
    lessonDate: iso(row.lesson_date),
    order: row.position,
  };
}

function toProgress(row: ProgressRow): RecordingProgress {
  return {
    recordingId: row.recording_id,
    studentId: row.student_id,
    watchedSeconds: row.watched_seconds,
    completed: row.completed,
    completedAt: isoOrNull(row.completed_at),
    updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class PostgresRecordingRepository implements RecordingRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByCourse(
    courseId: string,
    studentId: string,
    filter?: RecordingFilter,
  ): Promise<RecordingWithProgress[]> {
    // One query joining this student's progress onto the recordings, instead of
    // the list-then-lookup-per-row shape the in-memory stub uses. That shape is
    // the N+1 CLAUDE.md §7.1 catalogues, and it is cheapest to not write here.
    const rows = await this.db.query<RecordingWithProgressRow>(
      `SELECT r.id, r.course_id, r.module_id, r.lesson_id, r.title, r.chapter,
              r.topics, r.video_url, r.duration_seconds, r.lesson_date, r.position,
              p.watched_seconds, p.completed, p.completed_at
       FROM recordings r
       LEFT JOIN recording_progress p
         ON p.recording_id = r.id AND p.student_id = $2
       WHERE r.course_id = $1
         AND ($3::text IS NULL OR r.chapter = $3)
         AND ($4::text IS NULL OR r.topics @> ARRAY[$4]::text[])
       ORDER BY r.position`,
      [courseId, studentId, filter?.chapter ?? null, filter?.topic ?? null],
    );

    return rows.map((row) => ({
      ...toRecording(row),
      // No progress row means the student has never opened it.
      watchedSeconds: row.watched_seconds ?? 0,
      completed: row.completed ?? false,
      completedAt: isoOrNull(row.completed_at),
    }));
  }

  async upsertProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress> {
    const recording = await this.db.queryOne<{ duration_seconds: number }>(
      'SELECT duration_seconds FROM recordings WHERE id = $1',
      [recordingId],
    );
    const cappedSeconds = recording
      ? Math.min(watchedSeconds, recording.duration_seconds)
      : watchedSeconds;
    const completed = recording
      ? cappedSeconds >= recording.duration_seconds * COMPLETION_THRESHOLD
      : false;

    // GREATEST and OR against the excluded row do in SQL what the in-memory
    // version does in JavaScript: progress only ever moves forward, so a seek
    // backwards or a late-arriving ping cannot undo a completion. Doing it in
    // one statement also removes the read-modify-write race between two tabs.
    //
    // completed_at is COALESCE'd onto the existing value, so it is stamped once
    // on the transition into completion and never rewritten by a rewatch.
    const row = await this.db.queryOne<ProgressRow>(
      `INSERT INTO recording_progress
         (recording_id, student_id, watched_seconds, completed, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END, now())
       ON CONFLICT (recording_id, student_id) DO UPDATE
         SET watched_seconds = GREATEST(recording_progress.watched_seconds,
                                        EXCLUDED.watched_seconds),
             completed       = recording_progress.completed OR EXCLUDED.completed,
             completed_at    = COALESCE(recording_progress.completed_at,
                                        EXCLUDED.completed_at),
             updated_at      = now()
       RETURNING recording_id, student_id, watched_seconds, completed,
                 completed_at, updated_at`,
      [recordingId, studentId, cappedSeconds, completed],
    );
    return toProgress(row!);
  }

  async findRecordingById(recordingId: string): Promise<Recording | null> {
    const row = await this.db.queryOne<RecordingRow>(
      `SELECT id, course_id, module_id, lesson_id, title, chapter, topics,
              video_url, duration_seconds, lesson_date, position
       FROM recordings WHERE id = $1`,
      [recordingId],
    );
    return row ? toRecording(row) : null;
  }
}
