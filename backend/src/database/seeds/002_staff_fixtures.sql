-- 002_staff_fixtures.sql
--
-- Development fixtures for the TA surface. Runs after 001 and, like it, is
-- idempotent - the seeder re-runs every file on every invocation.
--
-- `assistant-1` holds group-1 (which studies course-1) and NOTHING else;
-- `assistant-2` holds nothing at all. A fixture where the only assistant is
-- assigned to every group cannot fail the scoping test (CLAUDE.md §7), which is
-- the one thing worth testing here. The gap IS the fixture.
--
-- `assistant-1` is also named on group-1's `assistant_id` in 001 - the DISPLAY
-- field. The two are deliberately allowed to disagree, and `assistant-2` is the
-- proof: naming them on a group grants them nothing.

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

-- EVERY assistant gets an explicit scope row, for the reason migration 015
-- backfills one: an absent row means "never configured", and the admin screen
-- must never be ambiguous between that and "sees everything".
INSERT INTO assistant_scopes (user_id, scope) VALUES
  ('assistant-1', 'assigned_groups'),
  ('assistant-2', 'assigned_groups')
ON CONFLICT (user_id) DO NOTHING;

-- The group grants themselves are in 003, not here: they reference `groups`,
-- which 003 seeds. Splitting them across two files is the FK ordering, not a
-- change of intent.

-- audit_log is intentionally left empty. A seeded entry describes an action
-- nobody took, and the first thing anyone does with an audit log is trust it.
