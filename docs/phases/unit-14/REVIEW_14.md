# Unit 14 — review

**Reviewer:** the coordinator, as a separate pass after execution (no agent harness, per the user).
**Against:** `PHASE_PLAN.md`, rulings `D-49`…`D-52`, `SECURITY.md` §2.6, `CLAUDE.md` §§6–10, and the
Definition of Done. **Diff:** `36bcc28..HEAD`, slices 14a–14g.

## Verdict: `APPROVED WITH FOLLOW-UP`

The security rules for this unit hold, and each one is proven by a test that fails in the
unauthorized direction. Two conditions stay open, and neither is a code defect. **The unit stays
`[~]` until both close**, the same way unit 7 closed on the user's browser check:

1. **C-1 — the two account panels are not browser-verified.** Staff *Account* and student *Settings*
   were not seen in a browser, because signing in would mean typing a password into the form. The
   user should check both: status, *Connect Google*, *Disconnect Google*, and the unavailable text.
   Also check in `dir="rtl"`.
2. **C-2 — `.env.example` lacks `GOOGLE_SIGN_IN_REDIRECT_URI` and `STAFF_GOOGLE_DOMAINS`.** The
   session's permission rules deny reading `.env*`; the variables are documented in
   `google-forms-setup.md` §A5a. The user adds them.

**Recorded, not a condition:** no live round trip with Google was performed. It needs the client's
Google Cloud OAuth client with the second redirect URI (`CLAUDE.md` §1: the client's subscription, not
assumed). Everything on our side of Google runs for real in e2e, including signature verification with
a real RSA key. Only Google's two HTTP endpoints are stood in for.

## The non-negotiables, checked

| Rule | Held by | Proven by (fails in the unauthorized direction) |
|---|---|---|
| Never auto-link by email | Sign-in resolves **only** `user_google_identities.google_sub`; `users.findByEmail` chooses the refusal text and nothing else; the link is written only by `POST /auth/google/link` under a session whose `sub` equals the state's | e2e: a matching email → 401 `D-49` text **and no row for either sub or user**; case-insensitive variant; a `users.google_email` planted and asserted stored → still `noAccount` |
| Linking requires proof of control of the existing account | Link state carries `sub`; completion requires the session's `sub` to match | e2e: a link started as student-2, completed as assistant-1 → 401, nothing written |
| Validate `state` with the existing pattern | Same `JwtService` and secret, 10-minute expiry, `purpose` claim; plus nonce and `sha256(browserKey)` | e2e: other purpose, a session token as state, a state signed with another secret, expired, wrong or missing browser key → 401 or 400 |
| …and a state must never be a session | `JwtStrategy` refuses any `purpose` (F-1) | e2e: **was 200 before the fix, 401 after**, for the existing Forms state; the link state too; an ordinary session still admitted |
| Verify `id_token` signature and `aud` | `GoogleIdTokenVerifier`, RS256 pinned | 12 unit cases, each asserted **by reason**, including `alg: none`, HS256 keyed with the public JWK, forged payload, stranger key, unknown `kid`, `aud`, `iss`, `exp`, future `iat`, `nonce`, `email_verified`. e2e repeats four through the whole stack |
| Pin `hd` for staff | `staffRefusal` at link and **every** sign-in, against the presented token's `hd` | e2e: consumer and other-domain links → 403, nothing written; a linked assistant presenting without `hd` → 401; empty list → `available: false`, `link/start` 403, sign-in refused. Students not pinned |
| Password path intact | No change to `login`/`register`/reset/invitation; `issueSession` reuses `issueToken` | All 354 pre-existing e2e and 771 pre-existing unit tests pass **unedited**; after unlinking, password login still works (asserted) |
| Link collision | `UNIQUE (google_sub)` + `PRIMARY KEY (user_id)`, mapped to 409 | e2e 409 with neither account changed; integration: both constraints refuse on Postgres, and the refusals write nothing |
| Audit | Two union entries, both `Record`s, target type; mutation and entry in one `runInTransaction` | e2e reads both entries back from `/admin/audit-log` (actor, role, target, `after`/`before`), and asserts the Google `sub` is **not** in them |
| New table ⇒ both drivers + integration | `InMemory*`/`Postgres*`, one interface | unit spec for memory, integration spec for Postgres; migration `001`–`023` into a database created empty, **182 passed, 0 skipped** (run 4 more times, see below) |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| R-1 | Low | A failed **link** reused the sign-in text "Start again from the sign-in page". | **Fixed** — `MESSAGES.linkRejected`; e2e updated |
| R-2 | Low | `account.google_linked` records the linked address in `after`: for a student, possibly a personal Gmail, readable by teacher and admin in the audit log. | **Accepted, recorded.** Same class as `assistant.invitation_accepted`'s email; the audit log is `STAFF_ADMIN`-only; the `sub` is excluded |
| R-3 | Low | The panel told staff "not enabled for staff accounts" even when the real cause was an unconfigured server. | **Fixed** — neutral copy |
| R-4 | Low | A test used `as never` to send a malformed body. | **Fixed** — a direct request, no cast |
| R-5 | Medium, pre-existing | **`RC-F4` root-caused.** `announcements` "newest first" integration test: two inserts in the same millisecond of `TIMESTAMPTZ(3)` `created_at` tie, broken by `id DESC` over random UUIDs, so the test failed about half the time a tie occurred. It reproduced once in this review (`1 failed \| 181 passed`). The query is correct; the fixture was not. | **Fixed** (test only): the "older" row is made a minute older. Three further runs from empty: 182/182 each |
| R-6 | Info | `lib/types.ts` mirrors were wrong in four places the new check found (plan §4 anticipated finding some). | **Fixed** in 14f; see `EXECUTION_NOTES.md` |
| R-7 | Info | Existing auth pages use `text-[var(--fs-*)]`, which sets a colour, not a size (`CLAUDE.md` §11). The new code uses `text-(length:--…)`. | **Out of scope**, not changed; recorded for `SITE-5` |

**Checked and found sound:** login-CSRF and link-CSRF (the browser key; the `sub` binding);
open redirect (sign-in `next` through `resolvePostAuthPath`; link returns only to an allow-list);
the web app does not sign a user out on a refused link (only `useApi` reads do that on 401);
`id_token` claims are trusted only after the signature; refusal reasons are logged, never returned;
both public routes are throttled; no new `any`, no disabled lint rule, no commented-out test; the
`@Public()` list grew by exactly the two intended routes and the guard spec pins it; `STAFF_ADMIN`
untouched; no fourth `@Global()`.

## `OPS-1`

Meets `D-52`. The check is in CI, compares both directions on the wire form, and was **seen failing**
on a deliberately broken mirror. It covers 119 of 139 mirror types; the 20 it cannot cover are listed
with reasons in the check file itself. Known limit, stated in the file: an optional field present on
one side only does not fail.

## Final gates (after the fixes above)

| Gate | Result |
|---|---|
| `npm test` | 790 passed / 47 files |
| `npm run test:e2e` | 386 passed / 5 files |
| `npm run test:integration` | 182 passed, 0 skipped, `001`–`023` from empty (×3 after R-5) |
| `npm run typecheck:drift` | exit 0 |
| `frontend: npx tsc --noEmit` / `npm run lint` / `nest build` | 0 / exit 0 (4 pre-existing warnings) / exit 0 |
