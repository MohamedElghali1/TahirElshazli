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
  thumbnailUrl: string | null;
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

/**
 * What the teacher supplies when publishing a recording.
 *
 * `id` and `order` are the repository's to assign - a client that could pick
 * either could collide with an existing row or reorder the course by
 * submitting a number. `moduleId` and `lessonId` are required because the
 * `recordings` table's FKs are NOT NULL: a recording always hangs off a lesson
 * in the course outline, which is what lets the student's course view line
 * recordings up against checkpoints (CLAUDE.md §5.1).
 */
export interface NewRecording {
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  chapter: string;
  topics: string[];
  videoUrl: string;
  durationSeconds: number;
  lessonDate: string;
  thumbnailUrl?: string | null;
}

/**
 * A partial edit. `undefined` leaves a field alone - the same convention
 * `AssessmentRepository.updateSubmission` uses, and for the same reason: a
 * form that posts only the title must not blank out the topics.
 *
 * `courseId`, `moduleId` and `lessonId` are absent on purpose. Moving a
 * recording between courses would move it out from under the enrollment check
 * that gates every read of it, so a move is a delete and a re-create, not a
 * PATCH.
 */
export interface RecordingUpdate {
  title?: string;
  chapter?: string;
  topics?: string[];
  videoUrl?: string;
  durationSeconds?: number;
  lessonDate?: string;
  thumbnailUrl?: string | null;
}

export interface RecordingRepository {
  findByCourse(
    courseId: string,
    studentId: string,
    filter?: RecordingFilter,
  ): Promise<RecordingWithProgress[]>;
  /**
   * The staff read: every recording on a course, with no student's progress
   * joined onto it.
   *
   * Separate from `findByCourse` rather than a nullable `studentId`, because
   * the two answer different questions. This one is reached by a TA or admin
   * who is not enrolled and has no progress row, and passing their own id into
   * the student query would quietly return a column of zeroes that a UI could
   * render as "nobody has watched this".
   */
  findByCourseForStaff(courseId: string): Promise<Recording[]>;
  /**
   * How many recordings each of these courses holds. Absent means zero.
   *
   * The staff overview wants one integer per course and had been calling
   * `findByCourseForStaff` per course to length the array - every row, every
   * title and topic array, materialized on the console's landing page to
   * produce a number. Same count-only shape as
   * `EnrollmentRepository.countByCourses`, and the same reason.
   */
  countByCourses(
    courseIds: readonly string[],
  ): Promise<Record<string, number>>;
  upsertProgress(
    recordingId: string,
    studentId: string,
    watchedSeconds: number,
  ): Promise<RecordingProgress>;
  findRecordingById(recordingId: string): Promise<Recording | null>;
  /** Appends a recording to the end of its course's running order. */
  create(input: NewRecording): Promise<Recording>;
  /** Null when the recording does not exist; the caller turns that into a 404. */
  update(recordingId: string, patch: RecordingUpdate): Promise<Recording | null>;
  /** False when there was nothing to remove, so a double-delete is not a lie. */
  remove(recordingId: string): Promise<boolean>;
}

export const RECORDING_REPOSITORY = Symbol('RECORDING_REPOSITORY');
