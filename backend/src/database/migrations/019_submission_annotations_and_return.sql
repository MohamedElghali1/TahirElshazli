-- 019_submission_annotations_and_return.sql
--
-- Unit 7: marking and the mark book (`MARK-1`, `MARK-2`).
-- `DATABASE_PLAN.md` §2 (the `assessment_submissions` addition) and §3
-- (`submission_annotations`).
--
-- Additive, plus ONE data backfill (`returned_at := corrected_at`, below). No
-- destructive step: nothing existing is rewritten, only a new column filled.
--
-- Deliberately NOT here: any multi-file column. `MARK-6` (submission modes and
-- up to five photos) is open as B-1/B-2 and escalated to the user; whatever
-- they decide becomes 020. Annotations anchor on a file URL, so this table is
-- correct under any answer.
--
-- Deviations from `DATABASE_PLAN.md` §3's `submission_annotations` sketch, each
-- with `D-2` (annotations are data, freehand strokes included) as authority:
-- * `file_url` - which file the mark was drawn on. A resubmission replaces the
--   file, and `MARK-6` may give one submission several, so `(submission, page)`
--   alone cannot say where a mark belongs.
-- * `kind` adds `pen` and `highlight`, and `path` carries a stroke's points.
-- * `updated_at` - an annotation is editable (`D-2`).
-- * `TIMESTAMPTZ(3)` - a JavaScript `Date` is the reader (CLAUDE.md §9).
-- * No `include_in_report`: deferred to the weekly-reports unit (assumption
--   A-5 of the unit-7 plan), because nothing reads it before then.

-- ---------------------------------------------------------------------------
-- 1. Save is not return (`MARK-2`). NULL = not returned to the student.
-- ---------------------------------------------------------------------------

ALTER TABLE assessment_submissions ADD COLUMN returned_at TIMESTAMPTZ(3);

-- A-1: every mark that exists today is already visible to its student, because
-- `corrected_at` WAS the visibility switch until this migration. Preserve
-- exactly that and hide nothing retroactively: an existing mark is a returned
-- mark. The predicate is the old switch, so nothing unmarked becomes returned.
UPDATE assessment_submissions
   SET returned_at = corrected_at
 WHERE corrected_at IS NOT NULL;

-- A paper cannot be returned without a mark on it (assumption A-3). A re-grade
-- after return moves `corrected_at` past `returned_at`, so no ORDER between the
-- two is asserted - only that a return implies a mark.
ALTER TABLE assessment_submissions
  ADD CONSTRAINT assessment_submissions_returned_needs_mark
  CHECK (returned_at IS NULL OR corrected_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. Annotations as DATA (`D-2`). Never a flattened file.
-- ---------------------------------------------------------------------------

CREATE TABLE submission_annotations (
  id            TEXT PRIMARY KEY,
  -- CASCADE: an annotation means nothing without its paper. Submissions are not
  -- deleted by the product (delete is refused once anything is submitted), so
  -- this fires only when a task with no submissions - hence no annotations -
  -- is removed, or an account is deleted.
  submission_id TEXT NOT NULL REFERENCES assessment_submissions (id) ON DELETE CASCADE,
  -- Which file the mark was drawn on (assumption A-11). Survives a
  -- resubmission, which is what makes a mark on a replaced file detectable as
  -- stale rather than silently re-anchored onto the new one (`D-42` (c)).
  file_url      TEXT NOT NULL CHECK (length(file_url) BETWEEN 1 AND 2048),
  -- Storage bounds, not product rules (A-11).
  page          INTEGER NOT NULL CHECK (page BETWEEN 1 AND 500),
  kind          TEXT NOT NULL
                CHECK (kind IN ('comment', 'tick', 'cross', 'pen', 'highlight')),
  -- Percent of the page box, from its physical top-left. NUMERIC arrives in
  -- node-pg as a string; the repository parses it (unit-7 plan, finding 7).
  x_percent     NUMERIC(5, 2) NOT NULL CHECK (x_percent BETWEEN 0 AND 100),
  y_percent     NUMERIC(5, 2) NOT NULL CHECK (y_percent BETWEEN 0 AND 100),
  text          TEXT NOT NULL DEFAULT '' CHECK (length(text) <= 2000),
  -- A freehand stroke's points, `[[x%, y%], ...]`. Present exactly for a
  -- stroke kind, enforced by the constraint below.
  path          JSONB
                CHECK (path IS NULL OR (jsonb_typeof(path) = 'array'
                                        AND jsonb_array_length(path) BETWEEN 2 AND 2000)),
  -- No ON DELETE clause - default RESTRICT, same as 017's `invited_by` and
  -- 018's `created_by`: who marked a paper survives that account changing.
  created_by    TEXT NOT NULL REFERENCES users (id),
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- A stroke without points draws nothing; a pin with points is two kinds at
  -- once. Either would render as something other than what was stored.
  CONSTRAINT submission_annotations_path_iff_stroke
    CHECK ((kind IN ('pen', 'highlight')) = (path IS NOT NULL)),
  -- A comment pin with no words is an empty speech bubble on a child's paper.
  CONSTRAINT submission_annotations_comment_has_text
    CHECK (kind <> 'comment' OR length(btrim(text)) > 0)
);

-- The marking view reads one paper's annotations, page by page
-- (`DATABASE_PLAN.md` §5). It also serves the FK and the per-submission counts.
CREATE INDEX submission_annotations_submission_id_page_idx
  ON submission_annotations (submission_id, page);
