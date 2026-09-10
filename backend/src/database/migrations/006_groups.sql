-- 006_groups.sql
--
-- Groups: the cohort Dr. Tahir actually teaches.
--
-- CLAUDE.md §5.16 is the requirement and it turns on one distinction. A
-- **course** is curriculum; a **group** is a class of students. They are
-- different things, several groups are enrolled in the same course, and until
-- this migration the schema had only the first of them - `enrollments` said
-- which students held a course and nothing said which of them sit in a room
-- together on Saturday at six.
--
-- Four tables, and the shape of each was a client decision rather than a
-- modelling preference:
--
--   groups             a class of students, standing on its own
--   group_courses      "this group is enrolled in this course"
--   group_memberships  "this student is in this group", placed by staff
--   assessment_targets "this task was set for this group"
--
-- Conventions follow 001-005: TEXT primary keys, TIMESTAMPTZ stored UTC,
-- millisecond precision on anything a keyset cursor might later read.

-- ============================================================
-- 1. GROUPS  (CLAUDE.md §5.16, §6.1)
-- ============================================================

-- Deliberately **no course_id**.
--
-- The obvious model is `group.course_id` - a course has many groups, done. The
-- client ruled it out: *"no, I mean group of students."* A group has a name and
-- members and exists before any course is attached to it, and the same group
-- may be enrolled in more than one course. A `course_id` column here is a
-- one-way door; the join table below is not, and that asymmetry is the whole
-- reason this was worth asking before writing the DDL rather than after.
CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,

  -- Whose group it is. RESTRICT by omission, like every other actor reference
  -- in this schema: an account that owns groups full of students cannot be
  -- hard-deleted out from under them.
  teacher_id TEXT NOT NULL REFERENCES users (id),

  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- The admin's group list, newest first, with the id breaking a shared
-- millisecond the same way `announcements_posted_at_idx` does.
CREATE INDEX groups_created_at_idx ON groups (created_at DESC, id DESC);

-- ============================================================
-- 2. GROUP_COURSES: what the group is studying  (§5.16, §6.1)
-- ============================================================

-- The client's own verb - a group is *enrolled* in a course - and the busiest
-- new row in the model. Live sessions and the learning mode hang off it,
-- because both describe *this group studying this course* rather than either
-- half alone: a group taking two courses could take one live and one from
-- recordings.
--
-- What it does **not** do is create student enrollments. Answered 2026-09-10:
-- *"not necessary, maybe the assistants and teachers can add to specific
-- group."* Adding a group to a course enrolls nobody, `enrollments` stays the
-- access gate, and that is what keeps §5.12's payment question out of the group
-- work entirely - no placement action can ever hand out a course somebody has
-- not paid for.
CREATE TABLE group_courses (
  id            TEXT PRIMARY KEY,

  -- CASCADE both ways: this row is meaningless without either end of it,
  -- unlike an audit entry, which must outlive what it describes.
  group_id      TEXT NOT NULL REFERENCES groups (id)  ON DELETE CASCADE,
  course_id     TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,

  -- CLAUDE.md §5.2, moved here from `enrollments` on 2026-09-10. A group is
  -- *taught* one way and two students in the same room cannot be in different
  -- modes, which is what made the enrollment the wrong owner.
  --
  -- The union matches `courses.default_learning_mode` (migration 003), which
  -- remains the fallback for a student who is enrolled but not yet placed -
  -- §5.2 requires that the dashboard always have a mode to render.
  learning_mode TEXT NOT NULL
                CHECK (learning_mode IN ('recorded', 'live')),

  enrolled_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  enrolled_by   TEXT NOT NULL REFERENCES users (id),

  -- One row per pairing. Without this, adding a group to a course twice gives
  -- it two learning modes and every read has to pick one.
  UNIQUE (group_id, course_id)
);

-- "Which groups study this course?" - the course console, and the read behind
-- resolving a student's learning mode.
CREATE INDEX group_courses_course_id_idx ON group_courses (course_id);

-- ============================================================
-- 3. GROUP_MEMBERSHIPS: who is in the group  (§5.16, §5.4)
-- ============================================================

-- Placement is a **staff** action - a teacher or an assistant, never the
-- student (§5.16). So `assigned_by` is not decoration: it is what makes a
-- placement an auditable event under §5.4, and the `group.student_assigned`
-- action exists in `AuditAction` because of this column.
--
-- Its own table rather than a `group_id` column on `enrollments`. That column
-- was only ever coherent while a group belonged to one course, and it cannot
-- express a student being moved between groups without losing the history.
CREATE TABLE group_memberships (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,

  -- CASCADE on the student: a deleted account should not leave a ghost in a
  -- roster. RESTRICT on the actor, as everywhere else.
  student_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users (id),
  assigned_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- Placing the same student twice is the same true statement, so the write is
  -- idempotent against this constraint rather than raising.
  UNIQUE (group_id, student_id)
);

-- "Which groups is this student in?" - the read behind the classmate list
-- (§5.17), the learning-mode resolution (§5.2) and, once targeting lands, the
-- student's assessment list. The primary key leads with `id` and cannot serve
-- it.
CREATE INDEX group_memberships_student_id_idx ON group_memberships (student_id);

-- ============================================================
-- 4. ASSESSMENT_TARGETS: who a task was set for  (§5.16, §5.6)
-- ============================================================

-- CLAUDE.md §5.16, answered 2026-09-10: *"he could make a task then to submit
-- for one or more groups with his own selection."*
--
-- Read that carefully, because it decides the schema. "Per group" means the
-- **audience** is chosen per group - it does *not* mean the task is duplicated
-- per group. So `assessments.course_id` stays exactly where it is (a task is
-- course material) and gains this join: one `assessments` row, one row here per
-- targeted group.
--
-- The consequence worth noting is what it saves. If a task were copied per
-- group, "the average for this assignment" (§5.6) would be ten averages over
-- ten unrelated rows, and averaging those is wrong the moment group sizes
-- differ. With one row and a target join, the cross-group average is the
-- default and a per-group breakdown is a GROUP BY on this table.
CREATE TABLE assessment_targets (
  id             TEXT PRIMARY KEY,
  assessment_id  TEXT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  group_id       TEXT NOT NULL REFERENCES groups (id)      ON DELETE CASCADE,

  -- Nullable **overrides** of the assessment's own window, not a copy of it.
  --
  -- A teacher setting one deadline for everyone writes none of these three and
  -- the assessment's columns answer; a teacher running two cohorts a week apart
  -- overrides the later one. NULL therefore means "inherit", which is why these
  -- are nullable rather than NOT NULL with a default - a default would freeze
  -- the inherited value at targeting time and silently stop tracking edits to
  -- the assessment itself.
  --
  -- §5.10 is unaffected: status is still derived server-side, now from the
  -- override where one exists and from the assessment where it does not.
  available_from TIMESTAMPTZ,
  available_to   TIMESTAMPTZ,
  due_at         TIMESTAMPTZ,

  -- Targeting the same group twice is the same statement; the second write is
  -- an update of the window, not a second audience.
  UNIQUE (assessment_id, group_id)
);

-- "What was set for this group?" - the student's assessment list, joined
-- through their memberships.
CREATE INDEX assessment_targets_group_id_idx ON assessment_targets (group_id);
