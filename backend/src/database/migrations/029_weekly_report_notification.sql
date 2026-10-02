-- 029_weekly_report_notification.sql
--
-- `REM-031`, `D-63`, `D-66`, slice 12c: a published weekly report notifies the
-- student in-app ("Your weekly report is ready", `/marks`). `notifications.type`
-- is a CHECK constraint (001, widened once already by `005` for 'announcement'),
-- so a new `NotificationType` member needs its own migration or every fan-out
-- insert fails under Postgres while the memory driver accepts it silently -
-- exactly the two-driver mismatch the integration suite exists to catch.
--
-- Dropped by name without IF EXISTS, as `005` did: if the name were ever
-- different this fails loudly here rather than leaving the old constraint
-- silently rejecting 'weekly_report' at fan-out time.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('grade_posted', 'new_recording', 'live_session_soon',
                  'assessment_available', 'announcement', 'weekly_report'));
