# Unit 14 — execution notes

**Executor:** the coordinator itself. The user asked for no agent harness, and for this unit to run in
the same conversation as the units 10–12 reconciliation. **Plan:** `PHASE_PLAN.md`. It was shaped by
the user's four rulings `D-49`…`D-52` and then executed; **no separate plan-approval step took
place**, which is recorded here rather than implied.

## What was built, by slice

| Slice | Commit | What |
|---|---|---|
| 14a | `e274a48` | F-1: `JwtStrategy` refuses any token carrying `purpose`. A failing e2e came first: a Google Forms connect `state` presented as a bearer token got **200** on `/admin/students`; after the fix, 401 |
| 14b | `93de139` | Migration `023_user_google_identities`; `GoogleIdentityRepository` with `InMemory*` and `Postgres*`; integration spec (uniqueness both ways, FK, cascade, `TIMESTAMPTZ(3)`); in-memory spec for the same contract |
| 14c | `03cbe79` | `resolveGoogleSignInConfig` (+ spec); `GoogleIdTokenVerifier` (12 cases, each asserted by reason); `HttpGoogleSignInClient`; `test/support/fake-google.ts` (a real RSA key pair) |
| 14d | `1706abf` | `GoogleSignInService`, `GoogleSignInController` (six routes), `GoogleSignInModule`, `CompleteGoogleDto`; audit actions `account.google_linked`/`account.google_unlinked` and target `user_google_identity` (union + both `Record`s); `AuthService.issueSession`; `role-guards.spec.ts` updated deliberately; 32 e2e |
| 14e | `13ce1cc` | Login button, `/google/callback`, `lib/google-flow.ts`, `GoogleSignInPanel` on the staff Account and student Settings screens, mirror types, activity-log labels |
| 14f | `759d6ee` | `OPS-1`: `backend/test/drift/mirror-drift.check.ts` + `tsconfig.drift.json`, `npm run typecheck:drift`, a CI step. Four drifts found and fixed |
| 14g | this commit | Documents |

## Deviations from the plan, and why

1. **Plan §3.5 put the controller "wired in `AuthModule`".** Built as its own `GoogleSignInModule`
   importing `AuthModule` instead. `AuthModule` now exports `AuthService` so sign-in can call
   `issueSession`. Same boundary and no cycle; the Google providers stay out of every module that
   imports `AuthModule`. Not a fourth `@Global()`.
2. **Plan §3.1 said a staff member outside the domain gets 401 on sign-in and 403 on link.** Built
   that way. `link/start` also refuses staff with **403** before the round trip when the list is
   empty, so nobody is sent through a consent screen only to be told no.
3. **Plan §4 said "first pass: unions and this unit's routes".** The check covers **every** mirror
   type with a backend counterpart (119 of 139); the other 20 are listed in the file's header with
   the reason. Name-pairing was wrong once (`StudentProfile` is the repository row; the route returns
   `StudentProfileView`, which minimises it, so there was no leak) and was corrected.
4. **`.env.example` was not edited.** The session's permission rules deny reading `.env*` files, so
   the two new variables are documented in `docs/google-forms-setup.md` §A5a instead. **The user
   should add `GOOGLE_SIGN_IN_REDIRECT_URI=` and `STAFF_GOOGLE_DOMAINS=` to `.env.example`.**
5. **A unit-level spec for `GoogleSignInService` was not written.** Its rules are covered by 32 e2e
   tests that run the whole module, the real verifier and the memory driver. The audit writes are
   proven to be in a transaction because `AuditService.record` throws outside one and those tests
   pass.

## Drift the `OPS-1` check found on its first run (all fixed in 14f)

- `AuditAction` lacked `announcement.created/updated/deleted` (unit 10) and `group.updated`. The
  activity log rendered those entries with **no label**: the defect `CLAUDE.md` §6 cites, back again.
- `AuditLogEntry.targetType` was `string`; `AuditTargetType` is now mirrored.
- `Assistant.role` was wider than the backend's `'assistant' | 'admin'`.
- `Markbook.omittedTasks[].workType` was `string` on the **backend**; now `WorkType`.

The check was **verified to fail**: deleting an `AuditAction` member and a required field from the
mirror failed exactly `Check_AuditAction`, `Check_AuditLogEntry`, `Check_AuditLogPage` and
`Check_GoogleLinkStatus`, and restoring them passed.

## Tests, real output (on `759d6ee`)

| Gate | Result | Baseline |
|---|---|---|
| `npm test` | **790 passed / 47 files** | 771 / 45 (+19: config 5, verifier 12, in-memory repo 2) |
| `npm run test:e2e` | **386 passed / 5 files** | 354 / 4 (+32, all new; **every pre-existing e2e unedited**) |
| `npm run test:integration` | **182 passed, 0 skipped**; PostgreSQL 15.19, **001–023** into a database created empty immediately before | 179 |
| `npm run typecheck:drift` | exit 0 | — |
| `frontend: npx tsc --noEmit` | 0 | 0 |
| `backend: nest build` | exit 0 | exit 0 |
| `backend: npx tsc --noEmit` | 11 errors, all in `announcements.controller.spec.ts` (`RC-F1`, unchanged) | same |
| `npm run lint` | exit 0 | exit 0 |

**Test changes to existing files:** `role-guards.spec.ts` (33 controllers; `GoogleSignInController`
per-method; the `@Public()` list plus exactly `start` and `signIn`; `unlink` added to the assistant
`DELETE` list, since it acts only on the caller's own link) and `postgres-repositories.integration-spec.ts`
(new block appended). No existing assertion was changed or removed.

**One e2e was vacuous and was fixed before commit:** "never consults `users.google_email`" first set
the column through `PATCH /students/me/profile`, which does not accept it. It now sets it through the
repository and asserts the value is stored before signing in.

## Browser verification

Against the real API on an unconfigured server (no Google client): the login page's "Continue with
Google" shows the server's 503 message ("…Sign in with your password."), and password sign-in is
unaffected. `/google/callback` with no flow started in the tab shows "started in another tab or has
expired", and with `error=access_denied` shows "cancelled. Nothing has changed."

**Not verified in a browser:** the Account and Settings panels, because signing in would mean typing a
password into the form, which the coordinator does not do. **Also not performed:** a live round trip
with Google. It needs the client's Google Cloud OAuth client with the second redirect URI (§A5a). Both
are left for the user.

## Security checklist (CLAUDE.md §8), for the areas touched

Authentication, token/session security, CSRF (browser key), input validation (DTO caps), error leakage
(one refusal message, reasons logged not returned), rate limiting (both public routes throttled),
audit logging, secrets (no token stored; client secret from env), environment configuration (boot
refusals), output minimisation (the audit entry carries email/hd, never `sub`). Not applicable: SQL
injection beyond parameterised queries, uploads, SSRF (the only outbound calls go to fixed Google
endpoints).

## Documents updated

`API_SPEC.yaml` (six operations, three schemas) · `SECURITY.md` §1 and §2.6 · `AUTHORIZATION_MODEL.md`
(public surface, capability row) · `DATABASE_PLAN.md` §7 · `google-forms-setup.md` §A5a ·
`PHASE_ROADMAP.md` note. `CHANGELOG.md`, `IMPLEMENTATION_PLAN.md`, the unit status, `project_log.md` and
`CLAUDE.md` are finalised after the review verdict.
