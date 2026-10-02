-- 028_weekly_reports.sql
--
-- `REM-031`, `D-63`, `D-66`: one row per student per Saturday-Friday Cairo
-- week, holding that week's attendance/homework/marks as a frozen snapshot.
-- Drafts are generated and refreshed by the service in slice 12b; this slice
-- is the table and its two repositories only.
--
-- `id` is TEXT, minted by the application like every other table here (see
-- `015`'s note on `gen_random_uuid()`/`pgcrypto` availability not being
-- verified) - not a DB-side default. FK columns match the TEXT ids that
-- `users`, `courses` and `groups` actually use (001, 006).

CREATE TABLE weekly_reports (
  id            TEXT        PRIMARY KEY,
  group_id      TEXT        NOT NULL REFERENCES groups (id)  ON DELETE CASCADE,
  student_id    TEXT        NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
  course_id     TEXT        NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  -- The Saturday, as an Africa/Cairo calendar date - not an instant, so no
  -- timezone column is needed or correct here (`D-66`).
  week_start    DATE        NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('draft', 'published')),
  content       JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ(3) NOT NULL,
  published_at  TIMESTAMPTZ(3) NULL,
  published_by  TEXT        REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  UNIQUE (group_id, student_id, week_start),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);

-- The student's own list, newest week first (`GET /reports/weekly`), and the
-- teacher/admin's "which group-weeks have drafts" scan both filter on status.
CREATE INDEX weekly_reports_student_status_week_idx
  ON weekly_reports (student_id, status, week_start DESC);

-- A group-week's rows, for the publish review screen and for `publishGroupWeek`.
CREATE INDEX weekly_reports_group_week_idx
  ON weekly_reports (group_id, week_start);
