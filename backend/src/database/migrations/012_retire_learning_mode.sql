-- 012_retire_learning_mode.sql
--
-- Removes the learning-mode axis from the model entirely (`DOM-0`, decision
-- `D-9`, `docs/CHANGELOG.md`).
--
-- **What changed, and why this is a deletion rather than a redesign.** Every
-- course is now taught the same way: recordings to watch *and* live sessions to
-- attend. The mode was never a property a student or a group *chose* - it was a
-- switch deciding which half of the product a screen rendered. With both halves
-- always present there is nothing left for it to switch, and a column whose
-- every value is read but never branched on is worse than no column: it invites
-- a future branch.
--
-- The consequence downstream is the one worth naming here, because it is the
-- part a schema diff does not show: the course-progress response was a
-- discriminated union, `{type:'recorded', …} | {type:'live', …}`, and it
-- collapses into **one** shape carrying completion *and* attendance side by
-- side. `CLAUDE.md` §11.1 non-negotiable 2 applies to that shape and is
-- restated where it is declared: progress (completion) and performance never
-- merge, and the two halves are never averaged into one number.
--
-- **Data risk, stated plainly.** The dropped values are not recoverable and
-- that is intended - `D-9` discards them by decision, not by accident. Nothing
-- computes from them after this migration; `LearningModeService`, the only
-- reader, is deleted in the same change.
--
-- Forward-only, like every file here (§8): a rollback is a restore from backup.

-- `group_courses.learning_mode` - added by 006, the last live copy.
--
-- `group_courses` itself is collapsed into `groups.course_id` by the very next
-- migration. Dropping the column here rather than letting 013 carry it is
-- deliberate: 013 is the project's one **one-way** migration and it does
-- exactly one thing, so that an operator reading a failure knows which half
-- aborted (`migration-runner.ts:89-99` writes the ledger only on success).
ALTER TABLE group_courses DROP COLUMN learning_mode;

-- `courses.default_learning_mode` - added by 003 as the fallback for a student
-- enrolled but not yet placed in a group. There is no mode left to fall back
-- to; the unplaced-student case survives as "no group, so no attendance rows",
-- which the collapsed progress shape renders as 0 of 0 rather than throwing.
ALTER TABLE courses DROP COLUMN default_learning_mode;

-- `enrollments.learning_mode` was already removed by 007. Assert rather than
-- drop: a second `DROP COLUMN` would be a no-op at best and, if 007 were ever
-- reordered, would silently hide that this file expects it gone.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'enrollments' AND column_name = 'learning_mode'
  ) THEN
    RAISE EXCEPTION 'enrollments.learning_mode still exists; 007 did not run.';
  END IF;
END $$;
