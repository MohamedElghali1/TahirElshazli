-- 025_material_lesson.sql
--
-- Tie a material to the lesson it belongs to, so the student's lesson detail
-- page can show "its material" (`docs/PRODUCT_SPEC.md` §6, `STU-3`).
--
-- Unit 13 raised this as a blocker rather than guessing: `materials` carried
-- `course_id` and `category` and nothing that named a lesson, so there was no
-- join to derive it from, and showing the whole course's materials as though
-- they were one lesson's would have been an invented relationship. Ruled on by
-- the client 2026-09-24: follow the design.
--
-- NULLABLE, and that is the normal case rather than an edge one. Most materials
-- belong to the course as a whole — a syllabus, a formula sheet, a past paper —
-- and have no lesson. Only some are "the handout from lesson 4". A NOT NULL
-- column would have forced every existing row to claim a lesson it does not
-- have.
--
-- `ON DELETE SET NULL`, matching `assessments.lesson_id` exactly: deleting a
-- lesson must not delete the course's materials. The file outlives the outline
-- entry that happened to reference it, and the material stays reachable on the
-- course's own Materials page.
--
-- The index carries `course_id` first because every read is already scoped to a
-- course before it filters by lesson — the same shape as
-- `materials_course_id_category_idx`, which this sits beside rather than
-- replaces. Partial on `lesson_id IS NOT NULL` because the rows that matter to
-- it are the minority; there is no reason to index the course-wide ones twice.

ALTER TABLE materials ADD COLUMN lesson_id TEXT REFERENCES lessons (id) ON DELETE SET NULL;

CREATE INDEX materials_course_id_lesson_id_idx
  ON materials (course_id, lesson_id)
  WHERE lesson_id IS NOT NULL;
