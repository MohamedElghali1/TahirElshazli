-- 004_public_catalog.sql
--
-- Opens the course catalog to *visitors*. Migration 003 opened it to signed-in
-- students; this one puts it on the public internet, which is a different
-- question and is why it needs its own gate.
--
-- CLAUDE.md §11 left "whether courses need a published / open_for_enrollment
-- flag" open, noting it was "worth one question before the catalog holds
-- anything he would not want shown". Going public is that moment: without a
-- flag, every row in `courses` is a page Google can index the day it is
-- created, and Dr. Tahir has no way to draft one.

-- ============================================================
-- 1. COURSES: a public identity and a public gate
-- ============================================================

ALTER TABLE courses
  -- The URL a marketing page is linked and shared under. Ids are internal and
  -- ugly ('course-1'); slugs are the SEO-friendly public pages §4 asks for.
  ADD COLUMN slug TEXT,
  -- Defaults TRUE so this migration changes nothing about what is already
  -- visible - the courses students can see today stay visible. The flag exists
  -- so the NEXT course can be drafted, not to retroactively hide these.
  ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT true;

-- Backfill slugs from titles, deterministically and without collisions:
-- lowercase, non-alphanumerics collapsed to '-', edges trimmed, and any
-- duplicate base suffixed with its row number.
UPDATE courses c
   SET slug = s.slug
  FROM (
    SELECT id,
           CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS slug
      FROM (
        SELECT id,
               base,
               row_number() OVER (PARTITION BY base ORDER BY id) AS rn
          FROM (
            SELECT id,
                   NULLIF(
                     trim(BOTH '-' FROM
                       regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')),
                     ''
                   ) AS base
              FROM courses
          ) normalized
      ) numbered
  ) s
 WHERE c.id = s.id;

-- A title that is entirely punctuation normalizes to NULL. The id is never
-- null and is already unique, so it is the safe fallback.
UPDATE courses SET slug = id WHERE slug IS NULL;

ALTER TABLE courses ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX courses_slug_key ON courses (slug);

-- Partial index: the public list reads published courses only, ordered by
-- title. Unpublished rows never appear in it and so do not belong in it.
CREATE INDEX courses_published_title_idx
  ON courses (title, id) WHERE is_published;
