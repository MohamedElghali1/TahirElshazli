-- 023_user_google_identities.sql
--
-- Google sign-in (`GAUTH-1`, unit 14): which Google account may sign in as
-- which user.
--
-- A table of its own, not columns on `users`, because `users.google_email`
-- (migration 010) already exists and means something else: an address the
-- student typed, or staff set while matching a Forms response, and nothing
-- ever verified. Sign-in must never read it. This table is written only by the
-- link flow, which proves control of the account twice - a signed-in session
-- and Google's own verified `id_token` - and is keyed by the OIDC `sub`, which
-- survives an email change where the address does not.
--
-- `user_id` is the primary key: one Google account per user. `google_sub` is
-- UNIQUE: one user per Google account - the link-collision refusal, held here
-- so that it survives a race and not only the service's pre-check.

CREATE TABLE user_google_identities (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  -- The verified address when linked, and the Workspace domain if any. Display
  -- and audit only; the staff domain pin reads the `hd` of the token presented
  -- at each sign-in, never this copy.
  email      TEXT NOT NULL,
  hd         TEXT,
  linked_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CHECK (google_sub <> ''),
  CHECK (email <> '')
);
