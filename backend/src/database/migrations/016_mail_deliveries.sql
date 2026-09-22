-- Migration 016: mail_deliveries table (MAIL-2)
--
-- Append-only delivery log. Stores recipient and template only - never the
-- rendered body or the `data` payload (SECURITY.md §5). No foreign key on
-- recipient: it is a plain email string, not necessarily a live users.id.

CREATE TABLE IF NOT EXISTS mail_deliveries (
  id          TEXT           PRIMARY KEY,
  recipient   TEXT           NOT NULL,
  template    TEXT           NOT NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_deliveries_recipient_created
  ON mail_deliveries (recipient, created_at DESC);
