-- 020_submission_files.sql
--
-- Unit 7, slice 7i: the multi-file submission (`MARK-6`, `D-47`, `D-48`).
-- `DATABASE_PLAN.md` §7. Additive: two columns with a default, nothing
-- existing rewritten.
--
-- `D-48` storage reading A: the set of uploaded files is a JSON list on the
-- submission and on each revision - the unit-6 attachments precedent (018:
-- "a handful ... JSONB rather than a child table") - not a child table that
-- would cost two more repository pairs for at most five rows.
--
-- Each element is `{url, mimeType}`. `url` is a platform-stored `/uploads/...`
-- path minted by the student upload route; `mimeType` is re-derived by the
-- server from that URL's server-minted extension, never taken from the client.
-- The element shape is the service's job; the CHECK refuses what a reader
-- cannot survive - a non-array - and the one bound the product states: at most
-- five (`PRODUCT_SPEC.md` §2.1, "photo ... (<=5)").
--
-- Empty for every row that predates this migration, for a `doc_link`
-- submission, and for any submission to a task that states no modes: those
-- keep their pasted URL in `file_url`, exactly as before.

ALTER TABLE assessment_submissions
  ADD COLUMN files JSONB NOT NULL DEFAULT '[]'
  CONSTRAINT assessment_submissions_files_is_list
  CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 5);

-- The superseded set, archived whole (`D-48` (c)): a revision is the history
-- of what was handed in, and a photo set is one hand-in.
ALTER TABLE submission_revisions
  ADD COLUMN files JSONB NOT NULL DEFAULT '[]'
  CONSTRAINT submission_revisions_files_is_list
  CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 5);
