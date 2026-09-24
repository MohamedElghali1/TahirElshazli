# Unit 14 — Google sign-in and contract hygiene: phase plan

**Tasks** `GAUTH-1`, `OPS-1` · **Branch** `redesign` · **Base** `36bcc28` (units 1–7 and 10–12 `[x]`;
8, 9, 13 `[ ]`, taken out of order deliberately by the user) · **Mode** the user asked for no agent
harness: the coordinator plans, executes and reviews in sequence, each as a separate pass with its own
artifact. The user also asked for this unit to continue in the same conversation as the units 10–12
reconciliation, which overrides `CLAUDE.md` §14's one-phase-per-chat rule for this unit.

## 0. Baseline (entry criterion)

Measured on `36bcc28`, whose tree is byte-identical to `ab473b4`
(`docs/phases/RECONCILE_UNITS_10_12.md`):

| Gate | Result |
|---|---|
| `npm test` | 771 passed / 45 files |
| `npm run test:e2e` | 354 passed / 4 files |
| `npm run test:integration` | 179 passed, **0 skipped**, PostgreSQL 15.19, 001–022 into a database created empty |
| `frontend: npx tsc --noEmit` | 0 |
| `npm run lint` | exit 0 (4 warnings) |
| `backend: nest build` | exit 0 |

## 1. Rulings taken for this unit (user, in chat, 2026-09-23)

The documents did not answer these. They were escalated before planning, as the brief requires.

| Id | Question | Ruling |
|---|---|---|
| `D-49` | A Google sign-in whose verified email matches an existing, unlinked account | **Refused.** The message tells them to sign in with their password and connect Google from their account. Linking happens only inside a signed-in session: a signed `state` naming that user, plus Google's proof of control of the Google account. **Never by email.** |
| `D-50` | A Google account that matches no user | **Refused.** No self-registration through Google. Sign-up stays on the register form and the waiting queue. No password-less account exists in this unit, so the design's "password is optional" is **deferred** — Google is additive. |
| `D-51` | What pinning `hd`/allowed domains for staff means | `STAFF_GOOGLE_DOMAINS` env allow-list, checked against the **verified** `id_token`'s `hd` claim, on link **and** on every sign-in, for teacher, admin and assistant. **Empty means staff Google sign-in is off** (staff keep passwords). Students are not pinned. |
| `D-52` | `OPS-1`, given `API_SPEC.yaml` excludes ~57 `[KEEP]` routes by design | A **backend↔mirror type check** in CI: a typecheck that imports backend types and asserts `frontend/lib/types.ts` matches them in both directions. The spec is not the source of the check. |

## 2. Findings from planning

**F-1 — the `state` pattern `SECURITY.md` §2.6 says to reuse has a hole (suspected; to be proven by a
failing test first).** `JwtStrategy.validate` (`auth/jwt.strategy.ts:34-60`) never checks a `purpose`
claim. The Forms connect state (`google-integration.service.ts:141-154`) is signed with the session
secret and carries `sub` set to the teacher's id. Nothing in the strategy stops it being presented as a
bearer token: no `jti` means the denylist is skipped, and with no password-change cutoff nothing
rejects a missing `iatMs`. The user lookup then succeeds. So a state token, which lives in a URL and
in browser history, looks like a working **10-minute teacher session**. The comment at `:136-137`
("a state token must not be usable as a session") is enforced only on the callback side. A link state
for this unit would name *any* user. **Fix first (slice 14a): the strategy refuses any payload that
carries `purpose`.** This is in scope because it is the pattern this unit is told to reuse.

**F-2 — `users.google_email` is not an identity.** Students type it into their own profile, and staff
set it when matching Forms responses (migration `010`). Nothing verifies it. Sign-in must never read
it. The sign-in identity lives in a table of its own, keyed by Google's `sub`, and is written only by
the link flow. Linking **does not** touch `google_email`; Forms matching is unchanged.

**F-3 — no JOSE library, and none is needed.** Node's `crypto.createPublicKey({ format: 'jwk' })` and
`crypto.verify('RSA-SHA256', …)` verify an RS256 `id_token` against Google's JWKS. This follows
`google-oauth.service.ts:14-18` (no `googleapis`, global `fetch`). JWKS is fetched on each sign-in and
**not cached**: sign-ins are rare at §1's numbers, and a key cache would be another per-process
structure (`CLAUDE.md` §8).

**F-4 — `OPS-1` versus the spec.** Recorded in `CHANGELOG.md` as a same-level document conflict
(`IMPLEMENTATION_PLAN.md` / `CLAUDE.md` §6 "generate from `API_SPEC.yaml`" against the spec header
"`[KEEP]` routes are not restated") and resolved by `D-52`.

## 3. Design

### 3.1 Flows

The Forms flow's redirect goes to an HTML page on the API. Sign-in has to hand a session to the web
app, so **Google redirects to a frontend page**, and the page `POST`s the code to the API. The session
JWT therefore never appears in a URL or in server-rendered HTML.

```
Sign in                                   Link (signed in)
POST /auth/google/start       (public)    POST /auth/google/link/start      (student + staff)
  <- { authUrl, browserKey }                <- { authUrl, browserKey }
browser keeps browserKey in sessionStorage, goes to authUrl
Google -> FRONTEND_URL/google/callback?code&state
POST /auth/google/sign-in      (public)   POST /auth/google/link            (student + staff)
  { code, state, browserKey }               { code, state, browserKey }
  <- AuthResult                             <- GoogleLinkStatus
                                          GET    /auth/google/link          (status for Account)
                                          DELETE /auth/google/link          (unlink)
```

**The `state`** is the existing pattern: `JwtService` (same secret), 10-minute expiry, a `purpose`
claim (`google_sign_in` | `google_link`), plus:
- `nonce`: random. Sent to Google as the OIDC `nonce` and required back in the `id_token`, so a
  replayed `id_token` from another flow is refused.
- `keyHash`: `sha256(browserKey)`. The `browserKey` is random and is returned **only** to the
  initiating page, never in a URL. The completing request must present it. This binds the flow to the
  browser that started it, which closes **login CSRF** (an attacker making a victim's browser finish
  the attacker's sign-in). It is enforced on the server, not only in the UI.
- Link state also carries `sub` (the user id), and the completing request's session `sub` must equal
  it.

With F-1 fixed, neither state token is a session, and a session token is not a state token
(`purpose` must match).

**`id_token` verification** (`GoogleIdTokenVerifier`, pure apart from the JWKS fetch):
`alg` = `RS256` with a `kid` found in the JWKS; the signature verifies; `iss` ∈ {`accounts.google.com`,
`https://accounts.google.com`}; `aud` = our client id; `exp` in the future and `iat` not in the future
(60 s skew); `nonce` = the state's nonce; `email_verified` = true; `sub` present. Every failure gives
one 401 message and no detail about which check failed.

**Sign-in resolution** (`POST /auth/google/sign-in`):
1. state, browserKey, code exchange, `id_token` verification (all above);
2. find the identity by `google_sub`;
3. none → 401. If an account uses the verified email (`D-49`): *"An account with this email already
   exists. Sign in with your password, then connect Google from your account settings."* Otherwise
   (`D-50`): *"No account uses this Google account. Sign in with your password, or register."* This
   reveals account existence **only for an email the caller has just proven they control** at Google,
   so it enumerates nobody else;
4. found → the user must be `active` (same generic refusal as `login`). A staff role must pass the
   domain pin (`D-51`). Then the session is minted by the same `issueToken` the password login uses.

**Link** (`POST /auth/google/link`): state `purpose` = `google_link` and `sub` = the caller's
session; browserKey; `id_token`; staff pin. The `google_sub` is already linked to **another** user →
**409** (the link-collision case). The caller already has a link → **409** ("disconnect first"). The
insert and the audit entry commit in one transaction. `UNIQUE (google_sub)` and `PRIMARY KEY (user_id)`
make both refusals hold under a race, not just in the service's pre-check.

**Unlink** (`DELETE /auth/google/link`): always allowed in this unit, because every account still has a
password (`D-50`). Audited. 204.

**Status** (`GET /auth/google/link`): `{ available, linked, email, linkedAt }`. `available` is false
when the server is unconfigured, or when the caller is staff and `STAFF_GOOGLE_DOMAINS` is empty.

**Unconfigured server:** `start` and `link/start` answer **503** with *"Google sign-in is not set up on
this server. Sign in with your password."* The web app shows that message beside the button. It is
never a silent no-op.

### 3.2 Configuration

`resolveGoogleSignInConfig(driver, env)` in `common/config/env.ts`. It returns `null` unless
`GOOGLE_DRIVER=google` (it reuses that client id and secret) **and** `GOOGLE_SIGN_IN_REDIRECT_URI` is
set. The URI must be absolute, and `https` in production. `STAFF_GOOGLE_DOMAINS` is comma-separated,
trimmed and lowercased, and each entry is validated as a bare domain; a malformed entry throws at boot.
`.env.example` and `docs/google-forms-setup.md` (the Google Cloud walkthrough) gain the second redirect
URI.

### 3.3 Data — migration `023_user_google_identities.sql`

```sql
CREATE TABLE user_google_identities (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,          -- the verified address at link time; display only
  hd         TEXT,                   -- the Workspace domain at link time, if any
  linked_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
```

A table, not columns on `users`, so it cannot be confused with the unverified `google_email` (F-2).
`GoogleIdentityRepository` (`findBySub`, `findByUser`, `create`, `removeForUser`) with `InMemory*` and
`Postgres*` implementations, plus an integration spec. That spec asserts both uniqueness constraints and
the cascade against the catalog and by offering bad rows. `DATABASE_PLAN.md` §7 renumbers again:
sessions `024`, attendance `025`, weekly reports `026`.

### 3.4 Audit

`account.google_linked` and `account.google_unlinked`, target type `user_google_identity`: the union
entry, the `Record<AuditAction, true>` entry, the target-type `Record`, and the frontend mirror
(activity-log labels). The actor is the account itself, via `actorRoleOf`, as with
`assistant.invitation_accepted`. `after`/`before` carry `{ email, hd }`, never the `sub` or a token.
Sign-in itself is **not** audited, consistent with password login.

### 3.5 Where the code goes

`backend/src/auth/google/`: `google-sign-in.controller.ts` (per-method decorators: two `@Public()`
routes and four `@Roles(Role.Student, ...STAFF_ALL)` routes), `google-sign-in.service.ts`,
`google-sign-in.client.ts` (auth URL and code exchange; returns `id_token`), `google-id-token.verifier.ts`,
`interfaces/google-identity-repository.interface.ts`, `repositories/{in-memory,postgres}-*`, and
`dto/`. Wired in `AuthModule`. **No fourth `@Global()`.** The Forms `GoogleOAuthService` is not
modified.

### 3.6 Frontend

- `app/(auth)/login/page.tsx`: a "Continue with Google" button beside the password form (password
  stays). On a 503, the server's message is shown in place.
- `app/(auth)/google/callback/page.tsx`: reads `code`/`state`/`error` from the query and
  `browserKey`/mode from `sessionStorage`. It posts to sign-in or link, then stores the session exactly
  as the password login does. An `error=access_denied` from Google gives a calm "cancelled" message.
  A missing browserKey means *"This sign-in was started in another tab or has expired."*
- `manage/account/page.tsx` (staff) and `profile/page.tsx` (student): a "Google sign-in" row showing
  status, the linked email, Connect and Disconnect. It is hidden when `available` is false; for staff
  the reason is shown ("not enabled for staff accounts on this server").
- `lib/api.ts` and `lib/types.ts` mirror the six routes.

## 4. `OPS-1` (per `D-52`)

`tsconfig.drift.json` at the repository root, run by `npm run typecheck:drift` and a CI step after
the lint steps. It compiles one file, `scripts/drift/mirror-drift.check.ts`, which `import type`s from
`backend/src/**` and `frontend/lib/types.ts` and asserts `Equal<Backend, Frontend>` for each mirrored
type. A mismatch in either direction is a **compile error**.

**Coverage, stated rather than implied.** First pass: every string-literal union the mirror copies
(`Role`, `AuditAction`, `AuditTargetType`, statuses, `SubmissionMode`, work kinds and similar), plus
the response types of the routes this unit adds. Beyond that, as many response shapes as match or can
be made to match in the time. Each mirror type the check does **not** cover is listed in the check
file's header, so the gap is visible. Mismatches found are fixed in the mirror when the mirror is
wrong. Any other mismatch is recorded, not papered over with a cast.

## 5. Slices

| Slice | Content |
|---|---|
| **14a** | F-1: a failing e2e proving a Forms state token works as a bearer session, then the strategy fix. Tests: a purpose-carrying token → 401; an ordinary session is unaffected |
| **14b** | Migration `023` + both repositories + integration spec (from an empty database) |
| **14c** | Config, `GoogleIdTokenVerifier` (unit tests with a test RSA keypair: good token; forged signature; unknown `kid`; `alg` none/HS256; wrong `aud`; wrong `iss`; expired; future `iat`; wrong `nonce`; `email_verified` false), the sign-in client |
| **14d** | Service + controller + DTOs + audit. Unit and e2e tests, with the Google client replaced by a fake that mints tokens signed by the test key, so the **real** verifier runs in e2e |
| **14e** | Frontend |
| **14f** | `OPS-1` drift check + CI step |
| **14g** | Documents |

## 6. Tests required: refusal tests in both directions

| Path | Authorized works | Unauthorized refused |
|---|---|---|
| sign-in | linked active student → session; linked staff on an allowed domain → session | unlinked with matching email → 401 with the `D-49` text **and no link written**; unknown → 401 `D-50`; waiting/rejected linked user → 401 generic; staff with `hd` absent or not in the list → 401; staff with the list empty → 401; state of the wrong purpose, expired, or unsigned → 401; missing or wrong browserKey → 401; a session JWT presented as state → 401; an `id_token` failing each check → 401 |
| link | student links; staff on an allowed domain links; audit entry written in the same transaction, asserted | state for another user → 401 (or 404); staff outside the domain → 403; `sub` already linked to another user → **409 and no change to either account** (link collision); caller already linked → 409; unauthenticated → 401; a parent/visitor role → 403 |
| unlink | removes it; audited | not linked → 404; unauthenticated → 401 |
| status | reports `available` correctly for student / staff-with-list / staff-empty / unconfigured | unauthenticated → 401 |
| config | unconfigured → 503 on both starts | malformed `STAFF_GOOGLE_DOMAINS` or non-https URI in production → throws at boot |
| password path | **every existing auth spec and e2e passes unedited** | — |
| guard spec | `role-guards.spec.ts`: 33 controllers, the new controller in `PER_METHOD_CONTROLLERS`, the `@Public()` list grows by exactly `GoogleSignInController.start` and `.signIn` | — |

## 7. Definition of done, applied

Points 1–8 and 10–13 of `IMPLEMENTATION_PLAN.md`. Point 9 applies to the frontend, but a real Google
round trip needs a configured Google Cloud client, which is the client's subscription. The frontend
is verified against the real API with the Google client faked at the API boundary. **A live Google
round trip is recorded as not performed** unless one becomes possible.

## 8. Out of scope, recorded

Password-less accounts and removing a password (`D-50`) · Google on the invitation-accept and register
screens · syncing `google_email` from the link (F-2) · `RC-F1`…`RC-F4` · device/session management
(`D-1`).
