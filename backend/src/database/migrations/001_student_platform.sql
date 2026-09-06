-- 001_student_platform.sql
--
-- The tables behind the ten repository interfaces the student surface uses.
-- Derived from those interfaces rather than from database/schema.sql at the
-- repo root, which is an aspirational outline covering roles that have no
-- backend yet (CLAUDE.md §7.1). What is not built is not migrated.
--
-- Two conventions worth stating once:
--
--   * Primary keys are TEXT, not UUID. CLAUDE.md §6 asks for UUIDs and every
--     row this application creates gets one, but the seed fixtures use
--     readable ids ("course-1", "assess-3") that the interfaces type as plain
--     `string` and that appear in the frontend's own fixtures. TEXT holds both;
--     UUID would force renaming the fixtures for no gain.
--   * Timestamps are TIMESTAMPTZ, stored UTC (CLAUDE.md §6), rendered in the
--     user's timezone by the client.

-- ============================================================
-- 1. ACCOUNTS
-- ============================================================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN ('visitor', 'student', 'parent', 'assistant', 'teacher')),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login normalises the address before lookup, so uniqueness has to be
-- case-insensitive or two accounts can exist that no one can tell apart.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE password_reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

CREATE TABLE student_profiles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- `enrolledCourseCount` is deliberately not a column. It is COUNT(*) over
-- enrollments; storing it would be a second source of truth that drifts the
-- first time an enrollment is written by anything but the profile code.

-- ============================================================
-- 2. COURSES
-- ============================================================

CREATE TABLE courses (
  id                       TEXT PRIMARY KEY,
  title                    TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  thumbnail_url            TEXT,
  teacher_name             TEXT NOT NULL,
  -- CLAUDE.md §5.3: an admin toggle, never hardcoded logic.
  sequential_lock_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_modules (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  chapter   TEXT NOT NULL,
  -- "order" is a reserved word; quoting it everywhere is a permanent tax.
  position  INTEGER NOT NULL
);

CREATE INDEX course_modules_course_id_position_idx
  ON course_modules (course_id, position);

CREATE TABLE lessons (
  id               TEXT PRIMARY KEY,
  module_id        TEXT NOT NULL REFERENCES course_modules (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  position         INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX lessons_module_id_position_idx ON lessons (module_id, position);

CREATE TABLE enrollments (
  student_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id     TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  -- CLAUDE.md §5.2: the enrollment carries the mode; the dashboard branches on it.
  learning_mode TEXT NOT NULL CHECK (learning_mode IN ('recorded', 'live')),
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)
);

-- Every course-scoped read starts with "is this student enrolled here".
CREATE INDEX enrollments_course_id_idx ON enrollments (course_id);

-- ============================================================
-- 3. CONTENT
-- ============================================================

CREATE TABLE materials (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL
                  CHECK (category IN ('course_notes', 'study_materials', 'important_files')),
  chapter         TEXT,
  file_url        TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX materials_course_id_category_idx ON materials (course_id, category);

CREATE TABLE recordings (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  module_id        TEXT NOT NULL REFERENCES course_modules (id) ON DELETE CASCADE,
  lesson_id        TEXT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  chapter          TEXT NOT NULL,
  topics           TEXT[] NOT NULL DEFAULT '{}',
  -- A Bunny Stream identifier. The signed playback URL (CLAUDE.md §8) is minted
  -- per request and never stored.
  video_url        TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  lesson_date      TIMESTAMPTZ NOT NULL,
  position         INTEGER NOT NULL
);

CREATE INDEX recordings_course_id_position_idx ON recordings (course_id, position);
-- The topic filter is `topics @> ARRAY[$1]`, which needs GIN to avoid a seq scan.
CREATE INDEX recordings_topics_idx ON recordings USING GIN (topics);

CREATE TABLE recording_progress (
  recording_id    TEXT NOT NULL REFERENCES recordings (id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  completed       BOOLEAN NOT NULL DEFAULT false,
  -- Stamped once on the transition into completion, never rewritten: this is
  -- the checkpoint date the course view reads, and a rewatch must not move it.
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recording_id, student_id)
);

CREATE INDEX recording_progress_student_id_idx ON recording_progress (student_id);

-- ============================================================
-- 4. LIVE SESSIONS AND ATTENDANCE
-- ============================================================

CREATE TABLE live_sessions (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  -- Whatever meeting link the teacher pastes. No Zoom API automation in this
  -- phase (CLAUDE.md §11, still an open decision).
  zoom_link        TEXT NOT NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL
);

CREATE INDEX live_sessions_course_id_scheduled_at_idx
  ON live_sessions (course_id, scheduled_at);

-- CLAUDE.md §6.1 settled the keying question: attendance hangs off the session,
-- not off a bare date. The `present|absent|late` question is still open (§11),
-- so this keeps the shipped boolean rather than pre-empting it.
CREATE TABLE attendance (
  session_id  TEXT NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  attended    BOOLEAN NOT NULL DEFAULT false,
  attended_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX attendance_student_id_idx ON attendance (student_id);

-- ============================================================
-- 5. ASSESSMENTS
-- ============================================================

CREATE TABLE assessments (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lesson_id           TEXT REFERENCES lessons (id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  instructions        TEXT NOT NULL DEFAULT '',
  type                TEXT NOT NULL CHECK (type IN ('homework', 'assignment', 'quiz')),
  topics              TEXT[] NOT NULL DEFAULT '{}',
  -- CLAUDE.md §5.10: Locked/Available/Submitted/Corrected is derived from these
  -- three timestamps plus the submission row. There is no status column, so
  -- there is nothing for a client to supply.
  available_from      TIMESTAMPTZ NOT NULL,
  available_to        TIMESTAMPTZ NOT NULL,
  due_at              TIMESTAMPTZ NOT NULL,
  max_score           INTEGER NOT NULL,
  -- CLAUDE.md §5.8: configurable per assessment, never a global whitelist.
  allowed_file_types  TEXT[] NOT NULL DEFAULT '{}',
  max_file_size_bytes BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assessments_course_id_due_at_idx ON assessments (course_id, due_at DESC);

CREATE TABLE assessment_submissions (
  id                 TEXT PRIMARY KEY,
  assessment_id      TEXT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  student_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  file_url           TEXT,
  answer_text        TEXT,
  -- The start of the history. Never moves.
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the content currently being graded arrived. Advances on resubmission,
  -- so lateness is judged on the work actually marked.
  last_submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  score              INTEGER,
  corrected_at       TIMESTAMPTZ,
  feedback           TEXT,
  -- CLAUDE.md §5.5: the teacher's annotated copy is a separate artifact beside
  -- the original, which stays immutable.
  annotated_file_url TEXT,
  -- One submission row per student per assessment; resubmission edits it and
  -- archives the old content into submission_revisions.
  UNIQUE (assessment_id, student_id)
);

CREATE INDEX assessment_submissions_student_id_idx
  ON assessment_submissions (student_id);

CREATE TABLE submission_revisions (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assessment_submissions (id) ON DELETE CASCADE,
  file_url      TEXT,
  answer_text   TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL,
  replaced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX submission_revisions_submission_id_replaced_at_idx
  ON submission_revisions (submission_id, replaced_at);

-- ============================================================
-- 6. REPORTS AND NOTIFICATIONS
-- ============================================================

CREATE TABLE report_documents (
  id                 TEXT PRIMARY KEY,
  course_id          TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  student_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  period             TEXT NOT NULL,
  file_url           TEXT NOT NULL,
  overall_percentage INTEGER,
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_documents_course_student_issued_idx
  ON report_documents (course_id, student_id, issued_at DESC);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL
             CHECK (type IN ('grade_posted', 'new_recording', 'live_session_soon',
                             'assessment_available')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  -- An in-app deep link such as /assessments/assess-3. Never an absolute URL:
  -- rendering one as an href would make notification content an open-redirect.
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);

-- The unread badge is a COUNT on every page load; a partial index keeps it off
-- the read rows, which are the ones that accumulate.
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE NOT read;
