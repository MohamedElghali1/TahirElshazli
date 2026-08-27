-- Tahirelshazli LMS - Seed Data (Development)
-- This file contains sample data for development and testing.

-- Sample users (passwords should be hashed in production)
INSERT INTO users (email, role, first_name, last_name, is_active) VALUES
('tahir@tahirelshazli.com', 'teacher', 'Dr. Tahir', 'Elshazli', true),
('ali.esam@example.com', 'student', 'Ali', 'Esam', true),
('admin@tahirelshazli.com', 'assistant', 'Admin', 'User', true)
ON CONFLICT (email) DO NOTHING;

-- Note: Full seeding requires actual password hashing.
-- Use database migration tools (Prisma, TypeORM) for proper seeding with transactions.
