-- 002_staff_and_audit.sql
--
-- The two tables every Teaching Assistant and admin surface is built on.
-- Nothing here serves the student surface; 001 stands unchanged.
--
-- Same conventions as 001: TEXT primary keys, TIMESTAMPTZ stored UTC.

-- ============================================================
-- 1. COURSE STAFF ASSIGNMENT  (CLAUDE.md §5.11, §6.1)
-- ============================================================

-- The RBAC table. Every TA-facing query joins through it before returning or
-- mutating anything; an admin's queries never touch it. That asymmetry is the
-- design, and getting it in place before the TA surface exists is the whole
-- reason this migration comes first - retrofitting the join is how the leak
-- happens.
CREATE TABLE course_staff_assignments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  -- Microsecond precision is fine here only because nothing pages on this
  -- column. If `course_staff_assignments` ever gets a keyset cursor over
  -- `assigned_at`, it needs TIMESTAMPTZ(3) for the reason spelled out on
  -- `audit_log.created_at` below - a JS Date cannot represent microseconds, so
  -- the cursor silently excludes every row in its own millisecond.
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The admin who granted it. No ON DELETE clause on purpose: the default
  -- RESTRICT means an account that granted access cannot be hard-deleted out
  -- from under the record. CASCADE would silently revoke a TA's access because
  -- an admin left, and SET NULL would erase who granted it.
  assigned_by TEXT NOT NULL REFERENCES users (id),
  -- One row per pair. This is what makes `create` idempotent under a race
  -- rather than under a hopeful SELECT-then-INSERT, and it is the index the
  -- hot `find(course_id, user_id)` check uses.
  UNIQUE (course_id, user_id)
);

-- "Which courses does this TA hold" - the other direction, used by every scoped
-- list. The UNIQUE index above leads with course_id and cannot serve it.
CREATE INDEX course_staff_assignments_user_id_idx
  ON course_staff_assignments (user_id);

-- ============================================================
-- 2. AUDIT LOG  (CLAUDE.md §5.4)
-- ============================================================

-- Append-only history: actor, action, target, before/after, timestamp.
--
-- No foreign keys, and that is deliberate rather than an oversight. An audit
-- entry has to outlive the thing it describes - deleting a course is itself an
-- auditable action, and a FK would either cascade the evidence away with it or
-- block the deletion the log exists to record. Referential integrity is the
-- right default everywhere else in this schema and the wrong one here.
--
-- There is no UPDATE or DELETE path in the repository either. A trigger
-- enforcing that at the database level was considered and left out: it would
-- also block the GDPR redaction path (§8), which should arrive as its own
-- named and itself-audited operation rather than be pre-emptively forbidden.
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL,
  -- The actor's role *at the time of the action*. Read from `users` at display
  -- time it would follow their current role, and a TA later promoted would
  -- retroactively appear to have acted as an admin.
  actor_role  TEXT NOT NULL
              CHECK (actor_role IN ('visitor', 'student', 'parent', 'assistant', 'teacher')),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  -- Nullable: a platform-wide action (an account change, a CMS edit) belongs to
  -- no course.
  course_id   TEXT,
  before      JSONB,
  after       JSONB,
  -- Millisecond precision, deliberately, rather than the default microsecond
  -- TIMESTAMPTZ.
  --
  -- This column is half of the feed's keyset cursor `(created_at, id)`, and the
  -- cursor is built in JavaScript from the value read back. A JS Date carries
  -- only milliseconds, so a microsecond column hands 22:31:29.889842 out as
  -- 22:31:29.889 and receives it back as a strictly *smaller* timestamp. The
  -- row-wise `(created_at, id) < (cursor)` comparison then matches nothing in
  -- that millisecond and paging stops dead after the first page - with no
  -- error, which is an audit trail quietly hiding its own entries (§5.4).
  --
  -- Matching the column to the precision the reader can represent is also what
  -- makes the Postgres and in-memory drivers page identically, which
  -- audit-cursor.ts's `sortsAfter` already assumes. Ordering *within* a
  -- millisecond is not lost: audit ids are `<ms>-<sequence>-<uuid>` exactly so
  -- the id breaks the tie.
  created_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- Every index below leads with the filter and ends with the feed's sort key,
-- `(created_at DESC, id DESC)`. The id is part of the sort because timestamps
-- tie - two entries written in one millisecond are ordinary here - and a
-- keyset cursor on a non-unique key skips rows. See audit/audit-cursor.ts.
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC, id DESC);

-- "What did this assistant do?" - the §5.4 question, and the one the admin
-- screen leads with.
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC, id DESC);

-- "What happened in this course?" Partial, because platform-wide entries have
-- no course_id and there is no query that wants them mixed in here.
CREATE INDEX audit_log_course_idx
  ON audit_log (course_id, created_at DESC, id DESC)
  WHERE course_id IS NOT NULL;

-- "Show me the history of this one submission / payment / account."
CREATE INDEX audit_log_target_idx
  ON audit_log (target_type, target_id, created_at DESC, id DESC);
