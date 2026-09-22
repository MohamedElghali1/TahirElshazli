-- 011_full_admin_role.sql
--
-- The Full admin becomes a real role (CLAUDE.md §2.1 as amended, CHANGELOG
-- 2026-09-19). Identical permission to the teacher, distinct identity - which is
-- the entire reason it is a role and not a second teacher account: an audit
-- entry that says `teacher` when the admin acted answers nobody's question.
--
-- Non-destructive. Two CHECK constraints widen; no column is added, dropped or
-- rewritten, and no existing row can fail the new constraint because the new
-- constraint is strictly looser.
--
-- The widening does **not** open either column to free text. Both stay
-- constrained to six literals, so a typo'd 'admln' is still refused by the
-- database rather than stored.

-- `DROP CONSTRAINT` without `IF EXISTS`, deliberately. If Postgres named the
-- inline CHECK from 001 something other than `users_role_check`, this aborts
-- loudly and the whole migration rolls back. With `IF EXISTS` it would silently
-- drop nothing, then ADD a second constraint - and the *intersection* of the old
-- narrow one and the new wide one is still narrow, so inserting an `admin` would
-- fail later with an error naming a constraint nobody knew was still there.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('visitor', 'student', 'parent', 'assistant', 'admin', 'teacher'));

-- The same widening on the audit log's actor role, and it must land in this
-- migration rather than a later one. This column records the role *at the time
-- of the action* (002_staff_and_audit.sql:62-64), and `AuditService.record` runs
-- inside the acting transaction (audit.service.ts:54-62). An admin who can be
-- *created* but whose actions cannot be *logged* is worse than no admin: the
-- CHECK violation at the audit INSERT rolls the action back, so the admin gets
-- an opaque 500 on every single write.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_role_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_role_check
  CHECK (actor_role IN ('visitor', 'student', 'parent', 'assistant', 'admin', 'teacher'));
