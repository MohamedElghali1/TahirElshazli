-- 005_announcements.sql
--
-- Announcements, and the delivery channel that makes them readable.
--
-- CLAUDE.md §6.1 names the entity: `id, audience (all_students|course:<id>|
-- all_tas), title, body, posted_by, posted_at`. §5.14 sets the rule that
-- governs the whole design - the audience is *computed at send time* and never
-- stored as a frozen list of user ids, because a list drafted on Monday
-- silently misses the assistant hired on Tuesday.
--
-- Same conventions as 001-004: TEXT primary keys, TIMESTAMPTZ stored UTC.

-- ============================================================
-- 1. ANNOUNCEMENTS  (CLAUDE.md §5.14, §6.1)
-- ============================================================

CREATE TABLE announcements (
  id            TEXT PRIMARY KEY,

  -- §6.1 writes the audience as one value, `course:<id>` included, and the API
  -- still speaks that single string. Storage splits it in two.
  --
  -- The reason is that `course:course-1` as a text blob cannot carry a foreign
  -- key to `courses` and cannot be filtered on without a LIKE against a prefix.
  -- Splitting it gives both, at the cost of one CHECK keeping the pair honest.
  -- `announcement-audience.ts` is the only place that converts between the two
  -- forms, in either direction.
  audience_type TEXT NOT NULL
                CHECK (audience_type IN ('all_students', 'course', 'all_tas')),
  -- Nullable, and non-null exactly when the audience is one course. CASCADE
  -- because a course announcement has no meaning once its course is gone -
  -- unlike an audit entry, which must outlive what it describes.
  course_id     TEXT REFERENCES courses (id) ON DELETE CASCADE,
  -- The pair, enforced rather than trusted. Without this a `course` row with a
  -- NULL course_id would address nobody, and an `all_students` row carrying a
  -- course_id would read as scoped to a course it never went to.
  CHECK ((audience_type = 'course') = (course_id IS NOT NULL)),

  title         TEXT NOT NULL,
  body          TEXT NOT NULL,

  -- No ON DELETE clause: the default RESTRICT means an account that posted an
  -- announcement cannot be hard-deleted out from under it. Same reasoning as
  -- `course_staff_assignments.assigned_by`.
  posted_by     TEXT NOT NULL REFERENCES users (id),

  -- Millisecond precision, deliberately, rather than the default microsecond
  -- TIMESTAMPTZ that `live_sessions` and `notifications` use.
  --
  -- Nothing pages on this column today - both reads are LIMIT/OFFSET, which a
  -- handful of announcements a term does not outgrow. But this is a
  -- monotonically growing feed ordered by exactly this column, so a keyset
  -- cursor is the obvious next change, and migration 002 records in detail what
  -- that costs on a microsecond column: a JS Date carries only milliseconds, so
  -- the cursor hands back a strictly smaller timestamp and the feed silently
  -- ends after page one. Matching the storage to the precision the reader can
  -- represent costs nothing now and removes the trap.
  posted_at     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- How many people it reached, counted at send time.
  --
  -- A count and *not* a recipient list, which is §5.14's actual prohibition.
  -- The count records what happened; a stored list would be a membership set
  -- someone would eventually query as if it were still true.
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0)
);

-- "What has been posted to this course?" - the course console's tab. Partial,
-- because platform-wide rows have no course_id and no query wants them here.
-- Ends with the read's sort key so the ORDER BY is served by the index; the id
-- breaks ties, as two announcements can share a millisecond.
CREATE INDEX announcements_course_posted_at_idx
  ON announcements (course_id, posted_at DESC, id DESC)
  WHERE course_id IS NOT NULL;

-- The admin's sent history, across every audience.
CREATE INDEX announcements_posted_at_idx
  ON announcements (posted_at DESC, id DESC);

-- ============================================================
-- 2. NOTIFICATIONS: the delivery channel
-- ============================================================

-- An announcement nobody can read is not a feature, and the platform already
-- has the mailbox one needs - unread badge, read state, and a page. Delivery is
-- therefore one `notifications` row per resolved recipient, which needs one new
-- member on a union the 001 CHECK constraint mirrors.
--
-- The constraint name is Postgres's own for a column-level CHECK on `type` in
-- 001. Dropped by name without IF EXISTS on purpose: if the name were ever
-- different, adding the new constraint beside the old one would leave the old
-- one still rejecting 'announcement', and every fan-out would fail at runtime
-- instead of this migration failing loudly here.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('grade_posted', 'new_recording', 'live_session_soon',
                  'assessment_available', 'announcement'));
