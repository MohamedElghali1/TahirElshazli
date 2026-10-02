/**
 * `REM-031`, `D-63`, `D-66`: the weekly report snapshot and its repository.
 *
 * `content` is frozen at generation/publish time - counts and per-task rows,
 * never an average or a merged figure (`CLAUDE.md` §11.1: progress and
 * performance never share a bar, column or average).
 */
export interface WeeklyReportContent {
  attendance: {
    present: number;
    late: number;
    absent: number;
    unmarked: number;
    expected: number;
    sessions: {
      sessionId: string;
      title: string;
      scheduledAt: string;
      status: 'present' | 'late' | 'absent' | null;
    }[];
  };
  homework: {
    due: number;
    submitted: number;
    tasks: {
      assessmentId: string;
      title: string;
      type: string;
      dueAt: string;
      status: string;
      score: number | null;
      maxScore: number;
    }[];
  };
}

export interface WeeklyReport {
  id: string;
  groupId: string;
  studentId: string;
  courseId: string;
  /** YYYY-MM-DD, the Saturday, Africa/Cairo calendar date. */
  weekStart: string;
  status: 'draft' | 'published';
  content: WeeklyReportContent;
  generatedAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

/** One row of the teacher/admin's group-weeks list. */
export interface WeeklyReportWeek {
  groupId: string;
  weekStart: string;
  drafts: number;
  published: number;
}

export interface WeeklyReportRepository {
  /**
   * Insert, or refresh `content`/`generatedAt` of a DRAFT. Never touches a
   * published row - the guard is in SQL on the Postgres side, not only here.
   */
  upsertDraft(input: {
    groupId: string;
    studentId: string;
    courseId: string;
    weekStart: string;
    content: WeeklyReportContent;
    generatedAt: string;
  }): Promise<'inserted' | 'updated' | 'skipped'>;

  findByGroupWeek(groupId: string, weekStart: string): Promise<WeeklyReport[]>;

  /** Newest week first, then groupId. */
  listWeeks(): Promise<WeeklyReportWeek[]>;

  /** Flips every DRAFT of the group-week to published; returns the rows it flipped. */
  publishGroupWeek(
    groupId: string,
    weekStart: string,
    publishedBy: string,
    at: string,
  ): Promise<WeeklyReport[]>;

  /** The student's published reports, newest week first. */
  findPublishedForStudent(studentId: string): Promise<WeeklyReport[]>;
}

export const WEEKLY_REPORT_REPOSITORY = Symbol('WEEKLY_REPORT_REPOSITORY');
