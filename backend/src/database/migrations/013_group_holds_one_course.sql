-- 013_group_holds_one_course.sql
--
-- **The one-way door.** `group_courses` collapses into `groups.course_id`, and
-- the join table is dropped. `DOM-1` + `DOM-2`.
--
-- Migration 006 argued the opposite case at length and it is worth restating
-- here rather than leaving it buried in an older file, because a reader of this
-- migration is the person who most needs to know the trade was made knowingly:
-- a join table lets a group study two courses and lets that be *undone*; a
-- `course_id` column cannot be reversed once the pairings are gone. The client
-- chose one course per group (`PRODUCT_SPEC.md:139`). `CLAUDE.md` §6.1 called
-- the column "the expensive mistake here"; the decision stands, and this
-- records that it was made with that sentence in front of us.
--
-- **There is no recovery from this file.** Everything below is forward-only
-- and the `DROP TABLE` discards the pairing history. Take a dump first.
--
-- `DOM-2`'s three new columns ride along because they are the same `ALTER
-- TABLE` on the same table in the same unit; splitting them would cost a
-- second migration number for three nullable columns.

-- ------------------------------------------------------------------
-- 1. The new columns, nullable for now.
-- ------------------------------------------------------------------

ALTER TABLE groups ADD COLUMN course_id TEXT REFERENCES courses (id);

-- **`assistant_id` is a DISPLAY field. It is never an authorization input.**
--
-- This is binding, not advisory. It answers "who runs this group?" for a
-- roster header and an admin list, and nothing more. What an assistant may
-- *reach* is decided by `assistant_group_assignments` + `assistant_scopes`
-- (`AUTH-2`, migration 015), through `StaffScopeService` and nowhere else.
--
-- The two columns record overlapping-looking facts, which is exactly why the
-- rule is written on the column: the moment a query reads `groups.assistant_id`
-- to decide access, the platform has two disagreeing answers to "may this
-- person see this group" and the authorization one silently stops being
-- authoritative. An assistant named here without an assignment row must be
-- refused, and an assistant assigned without being named here must be allowed.
--
-- RESTRICT by omission, like every other actor reference in this schema.
ALTER TABLE groups ADD COLUMN assistant_id TEXT REFERENCES users (id);

-- When the group meets, as free text - "Saturday 18:00". Not a schedule: the
-- sessions table owns actual times, and this is the label on the group card.
ALTER TABLE groups ADD COLUMN meets TEXT;

-- The physical room, nullable. Kept by ruling R-3 (2026-09-20): `D-9`'s "no
-- mode and no room" sentence sits under a **Sessions** heading and resolves a
-- session's "room or meeting link" to the link. A group's room comes from
-- `PRODUCT_SPEC.md:140` and `DOMAIN_MODEL.md:84`, neither of which `D-9`
-- amended. A nullable column nobody fills is cheaper than one added back.
ALTER TABLE groups ADD COLUMN room TEXT;

-- ------------------------------------------------------------------
-- 2. Refuse rather than guess. TWO abort paths, both reachable.
-- ------------------------------------------------------------------
--
-- This block runs before any write, and the whole file is one transaction
-- (`migration-runner.ts:89-99` wraps each file and writes the ledger only on
-- success), so a `RAISE` here leaves the schema exactly as it was - no
-- `course_id` column, `group_courses` intact, no ledger row.

DO $$
DECLARE
  offending TEXT;
BEGIN
  -- (a) A group studying more than one course. Silently picking one would
  -- corrupt every session, task and report hanging off that group, and nothing
  -- downstream would notice. The group's name is included because the operator
  -- who has to fix this by hand needs to know *which* group.
  SELECT string_agg(g.name, ', ') INTO offending
    FROM groups g
   WHERE (SELECT count(*) FROM group_courses gc WHERE gc.group_id = g.id) > 1;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'A group studies more than one course; collapse it by hand first: %',
      offending;
  END IF;

  -- (b) A group studying NO course. `DATABASE_PLAN.md` §4.1 did not name this
  -- path, and it is reachable: `GroupRepository.create` makes a group with no
  -- course at all, which is precisely the shape 006 was built for. Without
  -- this guard the `SET NOT NULL` below fails with a bare constraint violation
  -- that names a column and not a group.
  SELECT string_agg(g.name, ', ') INTO offending
    FROM groups g
   WHERE NOT EXISTS (SELECT 1 FROM group_courses gc WHERE gc.group_id = g.id);
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'A group studies no course; assign one by hand first: %',
      offending;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 3. The collapse.
-- ------------------------------------------------------------------

UPDATE groups g
   SET course_id = gc.course_id
  FROM group_courses gc
 WHERE gc.group_id = g.id;

ALTER TABLE groups ALTER COLUMN course_id SET NOT NULL;

DROP TABLE group_courses;

-- ------------------------------------------------------------------
-- 4. Indexes.
-- ------------------------------------------------------------------

-- **Required, not optional.** `groups.course_id` is the join the rewritten
-- `StaffScopeService.assertAssigned` runs on every assistant request once
-- `AUTH-2` lands (015): "does this assistant hold a group on this course?"
CREATE INDEX groups_course_id_idx ON groups (course_id);

-- "Which groups does this assistant run?" - the admin directory's group list.
CREATE INDEX groups_assistant_id_idx ON groups (assistant_id);
