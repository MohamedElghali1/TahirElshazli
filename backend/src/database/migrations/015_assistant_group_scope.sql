-- 015_assistant_group_scope.sql
--
-- **The second one-way door in unit 2.** An assistant's reach moves from the
-- *course* grain to the *group* grain, and `course_staff_assignments` is
-- dropped. `AUTH-2` + `D-10`.
--
-- **Why the grain moves.** A course-grained grant handed an assistant every
-- cohort on that course - migration `013` made a group study exactly one
-- course, so a course is derivable from a group but a group was never derivable
-- from a course. That gap is the leak `D-10` names: any assistant could read
-- any group's roster, every member's name and email included.
--
-- **There is no recovery from this file.** The drop discards the course-grained
-- pairings; the backfill below is the only thing that carries them forward.
-- Take a dump first.
--
-- **The audit history stays.** `course_staff.assigned`, `course_staff.unassigned`
-- and the `course_staff_assignment` target type remain in the `AuditAction` and
-- `AuditTargetType` unions with the table gone. `audit_log` has no foreign keys
-- precisely so it outlives what it describes, and `AUDIT_ACTION_VALUES` is built
-- from the union - removing a member would make every historical row of that
-- action unfilterable with a 400.

-- ------------------------------------------------------------------
-- 1. How wide an assistant's reach is.
-- ------------------------------------------------------------------

-- A row, not an inference from the assignment count. "No assignment rows" must
-- never be ambiguous between *everything* and *not set up yet*
-- (`AUTHORIZATION_MODEL.md` §3); a missing row here is the third state - never
-- configured - and `StaffScopeService` refuses on it.
--
-- No DEFAULT on `scope`, deliberately: seeing every group is an admin's
-- explicit act, and a column default would let a row be created that granted it
-- by omission.
CREATE TABLE assistant_scopes (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('all_groups', 'assigned_groups')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- 2. Which groups, when the scope is `assigned_groups`.
-- ------------------------------------------------------------------

CREATE TABLE assistant_group_assignments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  -- The admin who granted it. No ON DELETE clause, so the default RESTRICT
  -- holds: CASCADE would silently revoke an assistant's reach because an admin
  -- left, and SET NULL would erase who granted it. The same call 002 made.
  assigned_by TEXT NOT NULL REFERENCES users (id),
  -- Microsecond precision is fine here only because nothing pages on this
  -- column. A keyset cursor over it would need TIMESTAMPTZ(3), for the reason
  -- `audit_log.created_at` records: a JS Date cannot represent microseconds, so
  -- the cursor silently excludes every row in its own millisecond.
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per pair, which is what makes `assignGroup` idempotent under a race
  -- rather than under a hopeful SELECT-then-INSERT.
  UNIQUE (user_id, group_id)
);

-- "Which groups does this assistant hold" - the hot read on every scoped
-- request. The UNIQUE index leads with user_id and serves it, but is named for
-- the constraint; an explicit index keeps the intent legible and costs one page
-- at this scale.
CREATE INDEX assistant_group_assignments_user_id_idx
  ON assistant_group_assignments (user_id);
-- "Who holds this group" - the admin screen's direction, and the one the
-- UNIQUE index cannot serve.
CREATE INDEX assistant_group_assignments_group_id_idx
  ON assistant_group_assignments (group_id);

-- ------------------------------------------------------------------
-- 3. Backfill, before the drop.
-- ------------------------------------------------------------------

-- A course assignment becomes an assignment to every group studying that
-- course. `groups.course_id` is NOT NULL as of `013`, so the join is total: no
-- assignment can be silently lost to a group with no course.
--
-- The derived id is deterministic - `<assignment>:<group>` - rather than
-- `gen_random_uuid()`, because `pgcrypto`'s availability in the target image is
-- assumed and not verified, and because a deterministic id makes this file
-- re-runnable in review. It cannot collide with the UNIQUE (user_id, group_id)
-- constraint: a group holds one course (`013`), so one assignment row maps to a
-- given group at most once.
INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by, assigned_at)
SELECT csa.id || ':' || g.id, csa.user_id, g.id, csa.assigned_by, csa.assigned_at
  FROM course_staff_assignments csa
  JOIN groups g ON g.course_id = csa.course_id;

-- **Every** assistant gets an explicit scope row, including one who held
-- nothing at all - that is the whole point of the row existing (§1 above).
--
-- `'assigned_groups'` for all of them, and a migration must not decide
-- otherwise: "sees everything" is a deliberate admin act
-- (`AUTHORIZATION_MODEL.md` §3), never a migration default. An assistant who
-- should see everything is widened by hand, which is one action a human took
-- rather than a silent widening nobody reviewed.
INSERT INTO assistant_scopes (user_id, scope)
SELECT id, 'assigned_groups' FROM users WHERE role = 'assistant'
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------------------
-- 4. The drop.
-- ------------------------------------------------------------------

-- Last, and after the backfill has read it. `MigrationRunner` wraps this file
-- in one transaction, so a failure anywhere above leaves the table intact and
-- writes no ledger row.
DROP TABLE course_staff_assignments;
