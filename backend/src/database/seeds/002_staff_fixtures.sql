-- 002_staff_fixtures.sql
--
-- Development fixtures for the TA surface. Runs after 001 and, like it, is
-- idempotent - the seeder re-runs every file on every invocation.
--
-- `assistant-1` holds course-1 and NOT course-2, on purpose. A fixture where
-- the only assistant is assigned to every course cannot fail the scoping test
-- (CLAUDE.md §5.11), which is the one thing worth testing here. The gap is the
-- fixture.

-- `admin-1` is the Full admin (AUTH-1) - the teacher's permission under her
-- own identity. She needs migration 011 to have run: before it, `users_role_check`
-- refuses the value `'admin'` and this INSERT aborts the seed.
--
-- Same bcrypt hash of "password123" as every other seeded account. That hash is
-- published, which is why `resolveAutoSeed` refuses to seed in production
-- (CLAUDE.md §8) - seeding a real database would hand out a full-admin login.
INSERT INTO users (id, email, password_hash, role, name, status, created_at) VALUES
  ('admin-1',     'admin@example.com',      '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'admin',     'Mona Saleh',  'active', '2026-01-20T09:00:00Z'),
  ('assistant-1', 'assistant@example.com',  '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'assistant', 'Nour Hassan', 'active', '2026-01-25T09:00:00Z'),
  ('assistant-2', 'assistant2@example.com', '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'assistant', 'Omar Fathy',  'active', '2026-02-10T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_staff_assignments (id, user_id, course_id, assigned_at, assigned_by) VALUES
  ('staff-assignment-1', 'assistant-1', 'course-1', '2026-02-01T09:00:00Z', 'teacher-1')
ON CONFLICT (course_id, user_id) DO NOTHING;

-- audit_log is intentionally left empty. A seeded entry describes an action
-- nobody took, and the first thing anyone does with an audit log is trust it.
