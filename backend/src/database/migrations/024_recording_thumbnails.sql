-- 024_recording_thumbnails.sql
--
-- Nullable, no default, no backfill: every recording that exists today has no
-- thumbnail, so the null path is the normal path, not an edge case. The
-- student lesson library falls back to a plain icon block wherever this is
-- null. No index - nothing reads or filters on it.

ALTER TABLE recordings ADD COLUMN thumbnail_url TEXT;
