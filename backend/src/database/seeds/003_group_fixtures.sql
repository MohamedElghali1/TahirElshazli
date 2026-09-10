-- 003_group_fixtures.sql
--
-- Development fixtures for groups (CLAUDE.md §5.16). Runs after 001 and 002
-- and, like them, is idempotent - the seeder re-runs every file on every
-- invocation.
--
-- These mirror `InMemoryGroupRepository`'s seed exactly, ids included. The two
-- drivers backing the same interface should show a developer the same screen,
-- and a fixture that differs between them turns "does this work?" into "which
-- driver am I on?".
--
-- Why groups are seeded at all when announcements and the audit log are not:
-- after 2026-09-10 an unplaced student's course is empty by design, so a
-- database with enrollments and no groups looks broken rather than empty. A
-- seeded group is furniture; a seeded announcement would be words in Dr.
-- Tahir's mouth.
--
-- `student-1` sits in both groups, `student-2` only in group-1 - so the
-- classmate list (§5.17) has something to return, and so the two groups are
-- *not* interchangeable. A fixture where every student is in every group cannot
-- fail the "two groups on one course must not see each other" test, the same
-- way 002's unassigned course is what makes the TA scoping test meaningful.

INSERT INTO groups (id, name, teacher_id, created_at) VALUES
  ('group-1', 'IGCSE Chemistry — Saturday 18:00', 'teacher-1', '2026-01-15T09:00:00Z'),
  ('group-2', 'IGCSE Chemistry — Tuesday 20:00',  'teacher-1', '2026-05-20T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- group-1 studies course-1 from recordings; group-2 studies course-2 live.
-- Between them they cover both branches of §5.2's dashboard, which is the point
-- of having two.
INSERT INTO group_courses (id, group_id, course_id, learning_mode, enrolled_at, enrolled_by) VALUES
  ('group-course-1', 'group-1', 'course-1', 'recorded', '2026-01-15T09:00:00Z', 'teacher-1'),
  ('group-course-2', 'group-2', 'course-2', 'live',     '2026-05-20T09:00:00Z', 'teacher-1')
ON CONFLICT (group_id, course_id) DO NOTHING;

-- `assigned_by` differs across these rows on purpose: one placement by the
-- teacher and one by an assistant is what makes an audit-log read of §5.4's
-- "which assistant did what" show two different answers.
INSERT INTO group_memberships (id, group_id, student_id, assigned_by, assigned_at) VALUES
  ('group-membership-1', 'group-1', 'student-1', 'teacher-1',   '2026-01-20T09:00:00Z'),
  ('group-membership-2', 'group-1', 'student-2', 'assistant-1', '2026-03-15T09:00:00Z'),
  ('group-membership-3', 'group-2', 'student-1', 'teacher-1',   '2026-06-01T09:00:00Z')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- assessment_targets is deliberately left empty. The table exists (migration
-- 006) but nothing reads it yet - targeting lands with the authoring surface
-- (§5.18), and a seeded target would make the student assessment list look
-- filtered by something no code consults.
