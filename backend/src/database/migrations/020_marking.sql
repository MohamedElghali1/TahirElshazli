-- 020_marking.sql
--
-- Unit 7: marking (`MARK-1`, `MARK-2`, `MARK-6`).
--
-- Additive. No backfill, no destructive step: every default below reproduces
-- what an existing submission means today - one file, no link, not yet
-- returned, no annotations.
--
-- The user's rulings of 2026-09-23, which this file is the first to record:
--
-- * `submission_files` is a table, not a `TEXT[]` on the submission. An
--   annotation has to say *which* file it sits on, and an array index is a
--   fragile target: deleting or reordering one photo silently re-aims every
--   stroke that followed it. A row id does not move.
-- * `doc_link` admits EITHER a file OR a link, so `link_url` is nullable and
--   sits beside the files rather than replacing them.
-- * `pdf_upload` admits pdf, docx and zip. `photo_upload` admits images, five
--   at most. Both are enforced at submit time in the service, not here - the
--   MIME whitelist lives in one place (CLAUDE.md §8) and a CHECK here would be
--   a second copy of it that silently disagrees.
--
-- `D-2` (closed): annotations are a rendered overlay, never a flattened file.
-- A stroke is freehand path data, so the shape is wider than {page,x,y,text}.
-- No server-side PDF library, and the original file is never touched.

-- Files hung off a submission. One row per file, ordered for display.
-- The pre-020 single `assessment_submissions.file_url` is NOT dropped: it is
-- still what every existing row and every existing read uses, and collapsing
-- the two is a destructive step this file deliberately does not take.
CREATE TABLE submission_files (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL
                REFERENCES assessment_submissions (id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL CHECK (length(btrim(file_url)) > 0),
  -- Server-minted name and its whitelisted extension (CLAUDE.md §8); the
  -- client filename is never stored, only shown back as `display_name`.
  display_name  TEXT NOT NULL DEFAULT '',
  -- 0-based, stable. What "photo 3 of 5" means.
  position      INTEGER NOT NULL CHECK (position >= 0),
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE (submission_id, position)
);

CREATE INDEX submission_files_submission_id_idx
  ON submission_files (submission_id);

-- The teacher's overlay. Never mutates the file it sits on.
CREATE TABLE submission_annotations (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL
                REFERENCES assessment_submissions (id) ON DELETE CASCADE,
  -- Which file the overlay belongs to. NULL means the submission's legacy
  -- single `file_url`, which has no `submission_files` row.
  file_id       TEXT REFERENCES submission_files (id) ON DELETE CASCADE,
  -- 0-based page within that file. Always 0 for an image.
  page          INTEGER NOT NULL DEFAULT 0 CHECK (page >= 0),
  -- `stroke` carries `path`; `pin` and `text` carry `x`/`y`. Kept as one table
  -- because they share every other column and are always read together.
  kind          TEXT NOT NULL CHECK (kind IN ('stroke', 'pin', 'text')),
  -- Percentages of the rendered page, so the overlay survives any zoom or
  -- viewport. NULL for a stroke, which carries its points in `path`.
  x             DOUBLE PRECISION CHECK (x IS NULL OR (x >= 0 AND x <= 100)),
  y             DOUBLE PRECISION CHECK (y IS NULL OR (y >= 0 AND y <= 100)),
  -- `[{x,y}, ...]` in the same percentage space. NULL for a pin.
  path          JSONB,
  colour        TEXT NOT NULL DEFAULT '#E5484D',
  -- Stroke width as a percentage of page width, for the same reason as x/y.
  width         DOUBLE PRECISION,
  body          TEXT NOT NULL DEFAULT '',
  -- Who drew it. The eraser clears the teacher's own strokes only (`D-2`),
  -- which needs the author on the row rather than inferred from the task.
  author_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  -- A stroke without a path and a pin without a point are both unreadable;
  -- refuse them at the boundary the service cannot bypass.
  CHECK (kind <> 'stroke' OR path IS NOT NULL),
  CHECK (kind = 'stroke' OR (x IS NOT NULL AND y IS NOT NULL))
);

CREATE INDEX submission_annotations_submission_id_idx
  ON submission_annotations (submission_id);

ALTER TABLE assessment_submissions
  -- `doc_link`: the student hands in a link instead of, or beside, a file.
  -- Scheme is checked in the service (https only) - a CHECK here would not
  -- cover the same ground and would be a second copy to keep in step.
  ADD COLUMN link_url TEXT,
  -- `MARK-2`: saving annotations is not returning the work. `corrected_at`
  -- says a mark exists; `returned_at` says the student may see it.
  ADD COLUMN returned_at TIMESTAMPTZ(3);

-- Backfill, and it is not optional. Student visibility moves from
-- `corrected_at` to `returned_at` in this unit. Leaving the column NULL on
-- rows that are already corrected would take away, on deploy, every mark
-- every student can see today - the marks were returned under the old rule,
-- which had no way to hold one back.
UPDATE assessment_submissions
   SET returned_at = corrected_at
 WHERE corrected_at IS NOT NULL;
