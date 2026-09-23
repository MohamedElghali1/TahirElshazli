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

-- group-1 studies course-1; group-2 studies course-2. Two groups on two
-- different courses is what makes 002's unassigned third course a meaningful
-- TA-scoping fixture.
--
-- `course_id` is a column here rather than a `group_courses` row: migration 013
-- collapsed the join table. `learning_mode` is gone with migration 012 (`D-9`).
--
-- **`assistant_id` on group-1 is a DISPLAY fact and grants nothing.** The
-- authorization fact is the `assistant_group_assignments` row below, and the
-- two are separate columns in separate tables that happen to agree here.
-- `assistant-2` is where they disagree: named on no group, holding no group,
-- and the specs name them on one to prove that still grants nothing (`AUTH-2`,
-- ruling R-1). If the two facts were ever derived from each other, the test
-- that would have caught them being conflated stops being able to.
INSERT INTO groups (id, name, teacher_id, course_id, assistant_id, meets, room, created_at) VALUES
  ('group-1', 'IGCSE Chemistry — Saturday 18:00', 'teacher-1', 'course-1', 'assistant-1', 'Saturday 18:00', NULL, '2026-01-15T09:00:00Z'),
  ('group-2', 'IGCSE Chemistry — Tuesday 20:00',  'teacher-1', 'course-2', NULL,          'Tuesday 20:00',  NULL, '2026-05-20T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- The authorization grant (`AUTH-2`): `assistant-1` reaches group-1, and
-- through it course-1 - and nothing else. `assistant-2` holds nothing at all,
-- which is what makes the scoping test able to fail. Their `assistant_scopes`
-- rows are in 002; these reference `groups`, so they wait for the insert above.
INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_at, assigned_by) VALUES
  ('assistant-group-1', 'assistant-1', 'group-1', '2026-02-01T09:00:00Z', 'teacher-1')
ON CONFLICT (user_id, group_id) DO NOTHING;

-- `assigned_by` differs across these rows on purpose: one placement by the
-- teacher and one by an assistant is what makes an audit-log read of §5.4's
-- "which assistant did what" show two different answers.
INSERT INTO group_memberships (id, group_id, student_id, assigned_by, assigned_at) VALUES
  ('group-membership-1', 'group-1', 'student-1', 'teacher-1',   '2026-01-20T09:00:00Z'),
  ('group-membership-2', 'group-1', 'student-2', 'assistant-1', '2026-03-15T09:00:00Z'),
  ('group-membership-3', 'group-2', 'student-1', 'teacher-1',   '2026-06-01T09:00:00Z')
ON CONFLICT (group_id, student_id) DO NOTHING;

-- Targeting (CLAUDE.md §5.16, wired 2026-09-10). All eight seeded assessments
-- belong to course-1, and group-1 is the group that studies it, so all eight
-- are set for group-1.
--
-- These rows are not decoration. After targeting, an assessment set for nobody
-- is visible to nobody - so without them the whole student assessment surface
-- renders empty against a seeded database, which looks like a bug rather than
-- like the (correct) statement that no work has been set.
--
-- No window overrides on any of them: the common case is one deadline for
-- everyone, and a seed that overrode it would leave the inherit path - the
-- COALESCE every student read goes through - unexercised by hand.
INSERT INTO assessment_targets (id, assessment_id, group_id, available_from, available_to, due_at)
SELECT 'assessment-target-' || a.id, a.id, 'group-1', NULL, NULL, NULL
  FROM assessments a
 WHERE a.course_id = 'course-1'
ON CONFLICT (assessment_id, group_id) DO NOTHING;

-- ============================================================
-- Live sessions and attendance (`SESS-1`, `SESS-3` - migration 019)
-- ============================================================
--
-- Moved here from 001: group-keyed since the re-parent, so the rows they
-- reference must already exist. group-1 studies course-1, group-2 studies
-- course-2 - the same 1:1 mapping the old `course_id` values encoded.

INSERT INTO live_sessions
  (id, group_id, title, meeting_link, scheduled_at, ends_at, state, is_visible) VALUES
  ('sess-1', 'group-1', 'Revision: Moles & Titrations',     'https://zoom.us/j/98765432101', '2026-08-20T18:00:00Z', '2026-08-20T19:30:00Z', 'published', true),
  ('sess-2', 'group-1', 'Organic Chemistry Q&A',            'https://zoom.us/j/98765432102', '2026-08-27T18:00:00Z', '2026-08-27T19:30:00Z', 'published', true),
  ('sess-3', 'group-1', 'Past Paper Walkthrough - Paper 1', 'https://zoom.us/j/98765432103', '2026-09-03T18:00:00Z', '2026-09-03T20:00:00Z', 'published', true),
  ('sess-4', 'group-2', 'IELTS Speaking Practice',          'https://zoom.us/j/12345678901', '2026-08-29T16:00:00Z', '2026-08-29T17:00:00Z', 'published', true),
  ('sess-5', 'group-2', 'IELTS Writing Task 2 Clinic',      'https://zoom.us/j/12345678902', '2026-08-15T16:00:00Z', '2026-08-15T17:00:00Z', 'published', true),
  ('sess-6', 'group-2', 'IELTS Listening Strategies',       'https://zoom.us/j/12345678903', '2026-08-08T16:00:00Z', '2026-08-08T17:00:00Z', 'published', true)
ON CONFLICT (id) DO NOTHING;

-- `marked_by` is teacher-1 on every row: both seeded groups are theirs
-- (`groups.teacher_id` above), matching migration 019's own backfill rule for
-- the rows this replaces.
INSERT INTO attendance (session_id, student_id, status, marked_at, marked_by) VALUES
  ('sess-1', 'student-1', 'present', '2026-08-20T18:02:00Z', 'teacher-1'),
  ('sess-5', 'student-1', 'present', '2026-08-15T16:01:00Z', 'teacher-1'),
  ('sess-6', 'student-1', 'absent',  '2026-08-08T16:05:00Z', 'teacher-1')
ON CONFLICT (session_id, student_id) DO NOTHING;
