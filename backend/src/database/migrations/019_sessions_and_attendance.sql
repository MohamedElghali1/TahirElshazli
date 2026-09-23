-- 019_sessions_and_attendance.sql
--
-- Unit 8: sessions and attendance (`SESS-1`, `SESS-3`). `PHASE_PLAN.md` §2.
--
-- Two destructive, one-way reshapes in one file, both re-derived rather than
-- guessed, both validated first:
--
-- 1. `live_sessions` re-parents from `course_id` to `group_id` and drops
--    `mode`/`location` in favour of one `meeting_link` (`D-9`, `CHANGELOG.md`).
--    A session's course is known; which of the course's groups it belongs to
--    is not, so this aborts on any course that does not hold **exactly one**
--    group rather than guess among several.
-- 2. `attendance.attended BOOLEAN` becomes a three-state `status`, and gains
--    `marked_by` (`DOMAIN_MODEL.md` §5).
--
-- `duration_minutes` is replaced by `ends_at` (`DOMAIN_MODEL.md` §5): a stored
-- end timestamp rather than a duration to add to `scheduled_at` on every read,
-- and what the T-30 join-link rule (`PHASE_PLAN.md` §3.4) tests against.

-- ============================================================
-- 1. live_sessions: re-parent to the group, reshape.
-- ============================================================

-- Nullable for now - populated by the backfill below, then locked down.
-- The FK tolerates NULL, so this can be declared inline rather than added
-- constraint-less and tightened in a second statement.
ALTER TABLE live_sessions
  ADD COLUMN group_id TEXT REFERENCES groups (id) ON DELETE CASCADE;

-- Abort rather than guess. A course with zero or several groups has no single
-- right answer for "which group does this session belong to", and silently
-- picking one - or, for the zero case, leaving the column NULL and letting the
-- NOT NULL below fail with a bare constraint violation - strands the
-- session's attendance rows against the wrong roster (or against none).
--
-- `PHASE_PLAN.md`'s own snippet joins with a plain `JOIN`, which only catches
-- the "several groups" half: a course holding zero groups produces no row at
-- all in that join and passes silently, then blows up in the plain
-- `SET NOT NULL` a few statements down as a bare constraint violation naming
-- a column and not a session. Migration 013 built two named abort paths for
-- exactly this shape of gap ("A group studies more than one course" /
-- "A group studies no course") rather than let the zero case surface as an
-- unattributed NOT NULL failure - this widens the join to `LEFT JOIN` so the
-- same guard catches both halves here too.
DO $$
DECLARE
  ambiguous INTEGER;
BEGIN
  SELECT count(*) INTO ambiguous
  FROM (
    SELECT s.id
    FROM live_sessions s
    LEFT JOIN groups g ON g.course_id = s.course_id
    GROUP BY s.id
    HAVING count(g.id) <> 1
  ) x;
  IF ambiguous > 0 THEN
    RAISE EXCEPTION
      'Cannot re-parent % live_sessions: their course holds zero or several groups. Assign each session a group by hand first.',
      ambiguous;
  END IF;
END $$;

-- The guard above guarantees every session's course holds exactly one group,
-- so this join is total.
UPDATE live_sessions s
   SET group_id = g.id
  FROM groups g
 WHERE g.course_id = s.course_id;

ALTER TABLE live_sessions ALTER COLUMN group_id SET NOT NULL;

-- `D-9`: no mode, no room, one link. Nullable - a planned session (`state`,
-- below) need not have one yet.
ALTER TABLE live_sessions RENAME COLUMN zoom_link TO meeting_link;
ALTER TABLE live_sessions ALTER COLUMN meeting_link DROP NOT NULL;

-- A stored end instant, backfilled from what every existing row already
-- states as a duration. `duration_minutes` is dropped once this is populated
-- - keeping both would let them disagree.
ALTER TABLE live_sessions ADD COLUMN ends_at TIMESTAMPTZ;
UPDATE live_sessions
   SET ends_at = scheduled_at + (duration_minutes * INTERVAL '1 minute');
ALTER TABLE live_sessions ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE live_sessions DROP COLUMN duration_minutes;

-- Display-only pairing with a co-teaching assistant, same rule as
-- `groups.assistant_id` (migration 013): never an authorization input.
ALTER TABLE live_sessions
  ADD COLUMN assistant_id TEXT REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE live_sessions ADD COLUMN description TEXT;

-- Staff-only (`PHASE_PLAN.md` §3.5). The student serializer is an explicit
-- allow-list precisely so a column like this cannot reach a student by a
-- later spread-minus-delete mistake.
ALTER TABLE live_sessions ADD COLUMN private_notes TEXT;

-- Existing rows are live today and must not be retroactively hidden or
-- demoted to a draft - both defaults reproduce exactly what a pre-migration
-- row already meant.
ALTER TABLE live_sessions ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE live_sessions
  ADD COLUMN state TEXT NOT NULL DEFAULT 'published'
  CHECK (state IN ('planned', 'published'));

ALTER TABLE live_sessions DROP COLUMN course_id;

DROP INDEX IF EXISTS live_sessions_course_id_scheduled_at_idx;
CREATE INDEX live_sessions_group_id_scheduled_at_idx
  ON live_sessions (group_id, scheduled_at);

-- ============================================================
-- 2. attendance: boolean -> three-state, gain marked_by.
-- ============================================================

ALTER TABLE attendance ADD COLUMN status TEXT;
UPDATE attendance SET status = CASE WHEN attended THEN 'present' ELSE 'absent' END;
ALTER TABLE attendance ALTER COLUMN status SET NOT NULL;
ALTER TABLE attendance
  ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'absent', 'late'));
ALTER TABLE attendance DROP COLUMN attended;

-- `marked_at` was already nullable, and a fixture row marks a student absent
-- with no timestamp at all (`seeds/001_development_fixtures.sql`:
-- `('sess-6', 'student-1', false, NULL)`). `now()` - the migration's own run
-- time - is the least-wrong stand-in for "no historical answer", the same
-- reasoning `marked_by` below states for itself; it is a visible placeholder
-- rather than a fabricated moment, and it is what the column's own new
-- `DEFAULT now()` would produce for a write made with no timestamp anyway.
ALTER TABLE attendance RENAME COLUMN attended_at TO marked_at;
UPDATE attendance SET marked_at = COALESCE(marked_at, now());
ALTER TABLE attendance ALTER COLUMN marked_at SET NOT NULL;
ALTER TABLE attendance ALTER COLUMN marked_at SET DEFAULT now();

-- No historical answer either - the boolean carried no actor. `DOMAIN_MODEL.md`
-- §5 names the group's own teacher as the backfill; `groups.teacher_id` is
-- NOT NULL and every `live_sessions.group_id` is NOT NULL as of step 1 above
-- (same file, so this join runs after the re-parent), so this is total - not
-- a real attribution of who took the register, but a defensible stand-in that
-- is honest about being one rather than an invented name.
ALTER TABLE attendance ADD COLUMN marked_by TEXT;
UPDATE attendance a
   SET marked_by = g.teacher_id
  FROM live_sessions s
  JOIN groups g ON g.id = s.group_id
 WHERE s.id = a.session_id;

-- Defensive, not expected to fire: the join above is total by construction
-- (every attendance row's session_id is FK-enforced, every session now has a
-- NOT NULL group_id, every group has a NOT NULL teacher_id). Validated anyway
-- rather than trusted, per CLAUDE.md §9 - a silent NULL here would surface
-- three statements down as a bare NOT NULL violation with no attendance row
-- named.
DO $$
DECLARE
  unattributed INTEGER;
BEGIN
  SELECT count(*) INTO unattributed FROM attendance WHERE marked_by IS NULL;
  IF unattributed > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill marked_by for % attendance rows: their session has no group teacher. Assign one by hand first.',
      unattributed;
  END IF;
END $$;

ALTER TABLE attendance ALTER COLUMN marked_by SET NOT NULL;
ALTER TABLE attendance
  ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES users (id);
