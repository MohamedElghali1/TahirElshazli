-- 003_course_catalog.sql
--
-- Opens the course catalog to signed-in students and lets them enroll
-- themselves. Until now `GET /courses` answered only with the courses a
-- student already held, and nothing in the product could create that
-- enrollment - the seed fixtures were the only way in.
--
-- Enrollment is free for the moment. Payment is a later phase (CLAUDE.md §7,
-- "Later / on request"); when it lands it gates the same POST rather than
-- replacing it.

-- ============================================================
-- 1. COURSES: the mode a self-enrollment lands in
-- ============================================================

-- `enrollments.learning_mode` is per-student (CLAUDE.md §5.2), and it stays
-- that way - a student could be moved from the live cohort to the recordings
-- without the course changing. But a student enrolling themselves has no way
-- to know which mode a course is taught in, and asking them would be asking
-- them to guess. The course carries the default; the enrollment still owns
-- the answer.
ALTER TABLE courses
  ADD COLUMN default_learning_mode TEXT NOT NULL DEFAULT 'recorded'
    CHECK (default_learning_mode IN ('recorded', 'live'));

-- The two seeded courses predate the column and its default is wrong for one
-- of them. Matched on the mode their existing enrollments already use rather
-- than on the id, so this is correct whatever the fixtures are called.
UPDATE courses c
   SET default_learning_mode = 'live'
 WHERE EXISTS (
   SELECT 1 FROM enrollments e
    WHERE e.course_id = c.id AND e.learning_mode = 'live'
 );
