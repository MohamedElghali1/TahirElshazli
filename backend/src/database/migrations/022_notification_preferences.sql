-- 022_notification_preferences.sql

CREATE TABLE notification_preferences (
  user_id        TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  submissions    BOOLEAN NOT NULL DEFAULT true,
  registrations  BOOLEAN NOT NULL DEFAULT true,
  unmatched      BOOLEAN NOT NULL DEFAULT true,
  weekly_summary BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
