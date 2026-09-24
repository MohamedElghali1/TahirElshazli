-- 021_announcement_drafts.sql

-- 1. `created_at`: add nullable, backfill from `posted_at`, then NOT NULL + DEFAULT now()
ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ(3);
UPDATE announcements SET created_at = posted_at;
ALTER TABLE announcements ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE announcements ALTER COLUMN created_at SET DEFAULT now();

-- 2. Rename `posted_at` -> `published_at`; drop NOT NULL and now()
ALTER TABLE announcements RENAME COLUMN posted_at TO published_at;
ALTER TABLE announcements ALTER COLUMN published_at DROP NOT NULL;
ALTER TABLE announcements ALTER COLUMN published_at DROP DEFAULT;

-- 3. `audience_type` CHECK widens to 'all_students' | 'course' | 'all_tas' | 'group'
ALTER TABLE announcements DROP CONSTRAINT announcements_audience_type_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_type_check 
  CHECK (audience_type IN ('all_students', 'course', 'all_tas', 'group'));

-- 4. `group_id` TEXT REFERENCES groups (id) ON DELETE CASCADE, nullable. 
-- New CHECK: (audience_type = 'group') = (group_id IS NOT NULL)
ALTER TABLE announcements ADD COLUMN group_id TEXT REFERENCES groups (id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT announcements_group_id_check 
  CHECK ((audience_type = 'group') = (group_id IS NOT NULL));

-- 5. `media_kind` TEXT CHECK (media_kind IN ('image','video','youtube','file')), nullable.
-- `media_url` TEXT, nullable.
-- CHECK (media_kind IS NULL) = (media_url IS NULL).
ALTER TABLE announcements ADD COLUMN media_kind TEXT CHECK (media_kind IN ('image','video','youtube','file'));
ALTER TABLE announcements ADD COLUMN media_url TEXT;
ALTER TABLE announcements ADD CONSTRAINT announcements_media_check 
  CHECK ((media_kind IS NULL) = (media_url IS NULL));

-- 6. Indexes: rename `announcements_course_posted_at_idx` / `announcements_posted_at_idx` 
-- to the `published_at` column name (same shape)
ALTER INDEX announcements_course_posted_at_idx RENAME TO announcements_course_published_idx;
ALTER INDEX announcements_posted_at_idx RENAME TO announcements_published_idx;

-- Add announcements_group_published_idx
CREATE INDEX announcements_group_published_idx 
  ON announcements (group_id, published_at DESC, id DESC) 
  WHERE group_id IS NOT NULL;
