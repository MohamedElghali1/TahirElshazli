import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, isoOrNull } from '../../database/database.types.js';
import type {
  NewRecording,
  Recording,
  RecordingFilter,
  RecordingProgress,
  RecordingRepository,
  RecordingUpdate,
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
  thumbnail_url: string | null;
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
    thumbnailUrl: row.thumbnail_url,
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
              r.topics, r.video_url, r.duration_seconds, r.lesson_date, r.position, r.thumbnail_url,
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
              video_url, duration_seconds, lesson_date, position, thumbnail_url
       FROM recordings WHERE id = $1`,
      [recordingId],
    );
    return row ? toRecording(row) : null;
  }

  async findByCourseForStaff(courseId: string): Promise<Recording[]> {
    const rows = await this.db.query<RecordingRow>(
      `SELECT id, course_id, module_id, lesson_id, title, chapter, topics,
              video_url, duration_seconds, lesson_date, position, thumbnail_url
       FROM recordings
       WHERE course_id = $1
       ORDER BY position`,
      [courseId],
    );
    return rows.map(toRecording);
  }

  async countByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>> {
    if (courseIds.length === 0) {
      return {};
    }
    const rows = await this.db.query<{ course_id: string; count: string }>(
      `SELECT course_id, COUNT(*) AS count
       FROM recordings
       WHERE course_id = ANY($1::text[])
       GROUP BY course_id`,
      [[...courseIds]],
    );
    // COUNT(*) arrives as a string; see EnrollmentRepository.countByCourses.
    return Object.fromEntries(
      rows.map((row) => [row.course_id, Number(row.count)]),
    );
  }

  async create(input: NewRecording): Promise<Recording> {
    // The position is chosen inside the INSERT rather than by a prior SELECT,
    // so two teachers publishing at once cannot both read the same max and
    // write the same position. COALESCE covers the first recording on a course,
    // where the subquery is NULL rather than 0.
    const row = await this.db.queryOne<RecordingRow>(
      `INSERT INTO recordings
         (id, course_id, module_id, lesson_id, title, chapter, topics,
          video_url, duration_seconds, lesson_date, position, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               COALESCE((SELECT MAX(position) FROM recordings WHERE course_id = $2), 0) + 1, $11)
       RETURNING id, course_id, module_id, lesson_id, title, chapter, topics,
                 video_url, duration_seconds, lesson_date, position, thumbnail_url`,
      [
        randomUUID(),
        input.courseId,
        input.moduleId,
        input.lessonId,
        input.title,
        input.chapter,
        input.topics,
        input.videoUrl,
        input.durationSeconds,
        input.lessonDate,
        input.thumbnailUrl ?? null,
      ],
    );
    return toRecording(row!);
  }

  async update(
    recordingId: string,
    patch: RecordingUpdate,
  ): Promise<Recording | null> {
    // COALESCE against the parameter leaves a column alone when the caller
    // omitted it, which keeps this one statement instead of a dynamic SET list
    // assembled by string concatenation (CLAUDE.md §8 - no string-built SQL).
    // The casts are needed because a bare NULL parameter has no type.
    //
    // thumbnail_url is the one nullable column here, so COALESCE can't tell
    // "leave it alone" from "clear it" - both arrive as a NULL parameter. $8
    // carries whether the caller supplied the field at all.
    const row = await this.db.queryOne<RecordingRow>(
      `UPDATE recordings SET
         title            = COALESCE($2::text, title),
         chapter          = COALESCE($3::text, chapter),
         topics           = COALESCE($4::text[], topics),
         video_url        = COALESCE($5::text, video_url),
         duration_seconds = COALESCE($6::integer, duration_seconds),
         lesson_date      = COALESCE($7::timestamptz, lesson_date),
         thumbnail_url    = CASE WHEN $8::boolean THEN $9::text ELSE thumbnail_url END
       WHERE id = $1
       RETURNING id, course_id, module_id, lesson_id, title, chapter, topics,
                 video_url, duration_seconds, lesson_date, position, thumbnail_url`,
      [
        recordingId,
        patch.title ?? null,
        patch.chapter ?? null,
        patch.topics ?? null,
        patch.videoUrl ?? null,
        patch.durationSeconds ?? null,
        patch.lessonDate ?? null,
        patch.thumbnailUrl !== undefined,
        patch.thumbnailUrl ?? null,
      ],
    );
    return row ? toRecording(row) : null;
  }

  async remove(recordingId: string): Promise<boolean> {
    // recording_progress rows go with it through ON DELETE CASCADE.
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM recordings WHERE id = $1 RETURNING id',
      [recordingId],
    );
    return rows.length > 0;
  }
}
