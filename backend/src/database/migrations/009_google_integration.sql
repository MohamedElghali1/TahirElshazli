-- 009_google_integration.sql
--
-- The connected Google account, and nothing else.
--
-- This migration deliberately stops at authentication. Work types, form
-- bindings and response data are the next migration's job; this one exists on
-- its own so the OAuth round trip can be set up, connected and verified against
-- a real Google project *before* anything depends on it. The setup has an
-- external lead time (a Cloud project, a consent screen, credentials) and it is
-- the part most likely to be misconfigured, so it is worth being able to prove
-- it works in isolation.
--
-- Conventions follow 001-008: TEXT primary keys, TIMESTAMPTZ(3) stored UTC
-- (millisecond precision, so a keyset cursor over these columns pages correctly
-- - the lesson migration 002 learned the hard way).

-- ============================================================
-- GOOGLE_OAUTH_CREDENTIALS
-- ============================================================

-- One row per staff account that has connected a Google account.
--
-- In practice there is exactly one - Dr. Tahir's - because the forms belong to
-- him and reading a form's responses requires edit access to that form. It is
-- keyed by user rather than built as a singleton anyway, because a singleton
-- table ("id = 1, don't ask") is a shape that has to be migrated away from the
-- moment a second account is wanted, and this costs nothing today.
CREATE TABLE google_oauth_credentials (
  id            TEXT PRIMARY KEY,

  -- CASCADE: a deleted account must not leave a live credential for a Google
  -- account behind it. This is the one place in the schema where the
  -- "RESTRICT on actor references" habit is wrong - the row is not history
  -- about what someone did, it is an active key belonging to them.
  user_id       TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,

  -- Which Google account this is, for the admin screen to display. Shown so
  -- that "why can't it see my form?" has an obvious first answer: because the
  -- app is connected as a different account than the one that owns the form.
  google_email  TEXT NOT NULL,

  -- The stable Google account identifier (the OIDC `sub`). Kept alongside the
  -- email because an email address can be changed on the Google side while the
  -- subject cannot, so this is what actually identifies the account across a
  -- rename. Nothing keys on it today; it is here so that a future "you
  -- reconnected as a different account" check has something truthful to
  -- compare, which an email cannot provide.
  google_sub    TEXT NOT NULL,

  -- The refresh token, AES-256-GCM encrypted (CLAUDE.md §8: sensitive data
  -- encrypted at rest). This is a long-lived bearer credential for a real
  -- third-party account that does not expire on its own, which makes it the
  -- most sensitive single value in this database - a leaked backup containing
  -- a usable one is worse than the same backup's password hashes.
  --
  -- The ciphertext is self-describing (`v1.<iv>.<tag>.<data>`) so the format
  -- can be rotated without guessing what an existing row was written by.
  refresh_token TEXT NOT NULL,

  -- What the user actually consented to, as returned by Google rather than as
  -- requested by us. A consent screen where the user unticks a box returns a
  -- narrower grant than was asked for, and the failure that produces is a 403
  -- on a later API call with nothing to explain it. Stored so the admin screen
  -- can say "connected, but without permission to read responses" instead.
  scopes        TEXT[] NOT NULL DEFAULT '{}',

  connected_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- Stamped whenever the refresh token is successfully exchanged. Purely
  -- diagnostic: Google expires a refresh token that has gone unused for six
  -- months, and this is what makes that visible before it happens.
  last_used_at  TIMESTAMPTZ(3),

  -- The last refresh failure, or NULL when the last attempt succeeded.
  --
  -- This exists because the failure mode it describes is silent. A refresh
  -- token stops working for reasons entirely outside this application - the
  -- user revoked access in their Google account settings, changed their
  -- password, or the OAuth consent screen is still in "Testing" status, where
  -- Google expires refresh tokens after seven days. In every one of those cases
  -- the row still looks perfectly healthy. Without somewhere to put the error,
  -- the symptom is analytics that quietly stop updating.
  last_error    TEXT
);

-- There is deliberately **no `revoked_at` and no soft delete.**
--
-- CLAUDE.md §6 says soft-delete where history matters, and history does matter
-- here - but the history worth keeping is "who connected and disconnected this
-- account, and when", which is precisely what the audit log records
-- (`google.connected` / `google.disconnected`, §5.4). Keeping the row itself
-- would mean keeping a revoked credential in the database forever, which is a
-- liability rather than a record. Disconnecting deletes the row and revokes the
-- token with Google; the audit entry is the history.
