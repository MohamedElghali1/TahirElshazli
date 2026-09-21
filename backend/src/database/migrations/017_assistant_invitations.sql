-- 017_assistant_invitations.sql
--
-- `AUTH-4` / `PEOPLE-4`: an assistant is invited by email, sets their own
-- password, and is given a scope - `DATABASE_PLAN.md` §"assistant_invitations".
--
-- No `user_id` column, deliberately: accepting an invitation is what CREATES
-- the user and its scope, in one transaction (`AuthService.acceptInvitation`).
-- Before that, no account exists for this row to reference.
--
-- `name` is not in `DATABASE_PLAN.md`'s terse column list, but `AssistantWrite`
-- (`API_SPEC.yaml`) requires it on the invite body, and the pending-invitation
-- row is what the admin screen displays a name for before any account exists -
-- there is nowhere else it could live. Treated as an omission in that list's
-- shorthand, not a decision to leave it out.

CREATE TABLE assistant_invitations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('assistant', 'admin')),
  scope       TEXT NOT NULL CHECK (scope IN ('all_groups', 'assigned_groups')),
  -- `assigned_groups` only; empty for `all_groups` or `role = 'admin'`, same
  -- rule `AssistantWrite` validates on the request body.
  group_ids   TEXT[] NOT NULL DEFAULT '{}',
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  -- NULL until accepted. Single-use: `AuthService.acceptInvitation` requires
  -- this to be NULL and sets it in the same transaction that creates the
  -- account, so a token cannot be replayed after acceptance.
  accepted_at TIMESTAMPTZ,
  -- The admin who sent it. No ON DELETE clause - default RESTRICT, same
  -- reasoning as `assistant_group_assignments.assigned_by`: who invited whom
  -- must survive that admin's own account changing.
  invited_by  TEXT NOT NULL REFERENCES users (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Is there already a pending invitation for this email" - the invite route's
-- own 409 check - and "list every pending invitation" for the admin screen.
CREATE INDEX assistant_invitations_email_idx
  ON assistant_invitations (email)
  WHERE accepted_at IS NULL;

-- The accept route's lookup, by definition unique and hot.
CREATE INDEX assistant_invitations_token_idx ON assistant_invitations (token);
