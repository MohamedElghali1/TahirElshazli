-- Tahirelshazli LMS - Seed Data (SUPERSEDED - NOT APPLIED)
--
-- The fixtures the application actually loads are in
-- backend/src/database/seeds/, run by `npm run db:seed`, which refuses to run
-- in production. This file targets the outline in schema.sql, not the applied
-- migration, and would fail against it (no `first_name`/`last_name` columns,
-- and `password_hash` is NOT NULL). Kept only as scaffold history.

-- Sample users (passwords should be hashed in production)
INSERT INTO users (email, role, first_name, last_name, is_active) VALUES
('tahir@tahirelshazli.com', 'teacher', 'Dr. Tahir', 'Elshazli', true),
('ali.esam@example.com', 'student', 'Ali', 'Esam', true),
('admin@tahirelshazli.com', 'assistant', 'Admin', 'User', true)
ON CONFLICT (email) DO NOTHING;

-- Note: Full seeding requires actual password hashing.
-- Use database migration tools (Prisma, TypeORM) for proper seeding with transactions.
