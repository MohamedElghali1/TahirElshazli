-- 018_task_drafts_and_task_settings.sql
--
-- Unit 6: tasks and the draft library (`TASK-1` .. `TASK-6`).
-- `DATABASE_PLAN.md` §2 (the `assessments` additions) and §3 (`task_drafts`).
--
-- Additive. No backfill, no data movement, no destructive step: every default
-- below reproduces exactly what an existing row means today - published,
-- resubmission allowed until window end, no attachments, no marker, no draft
-- provenance, no stated submission modes.
--
-- Two user rulings are folded in here rather than given a 019, because this
-- file had not yet run anywhere when they arrived (`CHANGELOG.md`):
--
-- * `D-28` (B-1): `visibility` stores only `published | hidden`. `scheduled`
--   is NOT stored - it is the derived label for `published AND now <
--   available_from`, which the student read already renders as locked-with-a-
--   date. No `publish_at`.
-- * `D-31` (B-4): `submission_modes TEXT[]`. The multi-file (up to five
--   photos) model is unit 7's; this column records which modes a task accepts.
--
-- Deviations from `DATABASE_PLAN.md`'s terse lists, each deliberate:
-- * `task_drafts.created_at` - the CLAUDE.md §9 convention; §3's list is
--   shorthand, as 017 recorded for `name`.
-- * `TIMESTAMPTZ(3)` - a JavaScript `Date` is the reader (CLAUDE.md §9).
-- * `assessments.attachments JSONB` - not in §2. A task's attachments are
--   copied from a draft's JSONB and a task has a handful, so a child table
--   would be a third repository surface for no read that filters on it.

-- `task_drafts` FIRST: `assessments.draft_id` below references it, and the
-- reverse order aborts this file.
CREATE TABLE task_drafts (
  id           TEXT PRIMARY KEY,
  -- Same cascade as `assessments.course_id`: a draft belongs to its course.
  course_id    TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('homework', 'assignment', 'quiz')),
  work_type    TEXT NOT NULL DEFAULT 'file_upload'
               CHECK (work_type IN ('file_upload', 'link', 'google_form')),
  -- A draft nobody can name is a row nobody can pick from the library.
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  -- An array of `{url, name, mimeType, sizeBytes, audience}`. The shape of each
  -- element is the DTO's job; the CHECK refuses the one thing the readers
  -- cannot survive - an object or a scalar where they iterate an array.
  attachments  JSONB NOT NULL DEFAULT '[]'
               CHECK (jsonb_typeof(attachments) = 'array'),
  -- Server-owned: incremented atomically when a task is authored from this
  -- draft, never written by a client.
  used_count   INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  -- No ON DELETE clause - default RESTRICT, same as 017's `invited_by`: who
  -- wrote the draft survives that account changing.
  created_by   TEXT NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- The library's read: drafts on a course, optionally of one type
-- (`DATABASE_PLAN.md` §5).
CREATE INDEX task_drafts_course_id_type_idx ON task_drafts (course_id, type);

ALTER TABLE assessments
  -- `D-28`: two stored values. `hidden` removes the task from every student
  -- read (list 404-identical, detail and submit 404) and is refused by the
  -- service once anything is submitted.
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'published'
      CHECK (visibility IN ('published', 'hidden')),
  -- "Who marks this" (`D-32`, B-5). NULL is "whoever opens it first"; the
  -- claim-on-open is unit 7's. No ON DELETE clause, as `DATABASE_PLAN.md` §2
  -- writes it: no product path deletes a `users` row.
  ADD COLUMN marker_id TEXT REFERENCES users (id),
  -- `true` is today's rule: resubmission is allowed until the window ends.
  ADD COLUMN allow_resubmission BOOLEAN NOT NULL DEFAULT true,
  -- `D-31` (B-4). Empty is "not stated", which is every existing row: the
  -- task's `allowed_file_types` govern the upload exactly as before.
  ADD COLUMN submission_modes TEXT[] NOT NULL DEFAULT '{}'
      CHECK (submission_modes <@ ARRAY['pdf_upload', 'doc_link', 'photo_upload']::TEXT[]),
  -- Provenance only - a task is COPIED from a draft, never linked live
  -- (`DOMAIN_MODEL.md` §4). Deleting the draft leaves the task intact.
  ADD COLUMN draft_id TEXT REFERENCES task_drafts (id) ON DELETE SET NULL,
  ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'
      CHECK (jsonb_typeof(attachments) = 'array');
