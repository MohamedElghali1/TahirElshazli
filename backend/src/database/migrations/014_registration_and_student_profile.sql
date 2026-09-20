-- 014_registration_and_student_profile.sql
--
-- `DOM-3` + `DOM-4`: the registration queue, and the three staff-owned fields
-- on a student's record.
--
-- **Purely additive.** Four nullable-or-defaulted columns and one partial
-- index; no existing row can violate anything added here, so there is nothing
-- to validate before writing and no abort path to write (contrast 013).
--
-- **No `mode` column** - ruling R-2 / `CHANGELOG.md` `D-4`. `students.mode` is
-- not built, so there is no conditional CHECK here and the five documents that
-- still required it are amended in the same change.

-- ------------------------------------------------------------------
-- 1. The registration queue.
-- ------------------------------------------------------------------

-- **`DEFAULT 'active'` is deliberate, and it is right only for the rows that
-- already exist.** Every account predating this migration was created before
-- there was a queue to wait in; defaulting them to anything else locks out the
-- whole platform in one statement.
--
-- **It is wrong for every row written after it.** `AuthService.register` sets
-- `'waiting'` EXPLICITLY, and a unit test asserts the value passed to
-- `UserRepository.create` rather than the row that comes back - because if the
-- service ever leans on this default, the waiting queue is silently always
-- empty and an account that should need approval simply does not. That is an
-- authorization hole, not a cosmetic bug, and it fails silently in both
-- directions, which is why the check is on the argument.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('waiting', 'active', 'rejected'));

-- Partial, because the only query that filters on this column asks for the
-- queue: `status = 'waiting'` is a handful of rows out of ~300 (`CLAUDE.md`
-- §1), and a full index on a three-value column would be read past anyway.
CREATE INDEX users_waiting_idx ON users (status) WHERE status = 'waiting';

-- ------------------------------------------------------------------
-- 2. Staff-owned fields on the student record.
-- ------------------------------------------------------------------

-- All three are nullable: they are filled in by staff over time, and a student
-- who has none of them is the normal case, not an incomplete record.
ALTER TABLE student_profiles ADD COLUMN school_name TEXT;

-- **A third party's PII, on a child's record.** Never logged, never in an
-- audit payload, never in an error message, and never in a student-facing
-- response (`DOMAIN_MODEL.md:35`). `StudentsService` returns an explicitly
-- built student view rather than the stored row, so this column cannot reach
-- `GET /students/me/profile` by someone adding a field upstream.
ALTER TABLE student_profiles ADD COLUMN parent_email TEXT;

-- Staff's notes *about* the student. Same rule: never student-facing. A
-- student reading a staff note about themselves is the failure this column is
-- one careless spread operator away from.
ALTER TABLE student_profiles ADD COLUMN staff_notes TEXT;
