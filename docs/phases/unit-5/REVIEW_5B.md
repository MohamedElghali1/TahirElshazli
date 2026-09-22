# Review — unit 5, slice 5b: `PEOPLE-2` (detail + edit) and `PEOPLE-3` (create directly)

**Implementer/reviewer:** Claude (orchestrator, done directly — Antigravity's dispatch for slice 5a
failed immediately on quota, and per the user's instruction the work continues as one agent) ·
**Date:** 2026-09-21

## Verdict: **APPROVED**

## What was built

**Backend**, genuinely new this time (unlike 5a's finding that the backend already existed):
- `students/interfaces/student-repository.interface.ts`: a new `AdminStudentProfileUpdate` type
  (all six `StudentProfile` fields, including the three staff-owned ones) and
  `updateByUserIdAsStaff`, kept **separate** from the existing self-service `StudentProfileUpdate`/
  `updateByUserId` rather than widening them — preserves the compile-time guarantee that
  self-service can never even express a write to `staffNotes`. Implemented on both
  `InMemoryStudentRepository` and `PostgresStudentRepository` (the same boolean-flag-per-field CASE
  pattern the existing `updateByUserId` already uses, extended to six fields).
- `common/config/env.ts`: `resolveFrontendUrl` — a new small config (mirrors `resolveCorsOrigins`'s
  shape: throws if unset in production, defaults to `http://localhost:3000` otherwise). Needed
  because nothing in this codebase previously built a real clickable link into a mail template;
  `LoggingPasswordResetNotifier` only ever logged a bare token.
- `manage/admin-students.service.ts` (new): `detail`, `update`, `create`. `create` reuses the
  **existing password-reset-token mechanism** (`userRepo.createPasswordResetToken` +
  `MailService.send({template: 'sign-in-link'})`) rather than inventing new auth — the account gets
  a real bcrypt hash of a random UUID nobody holds (not null, not empty; `password_hash` is
  `NOT NULL`), so no password-based login can succeed until the student actually uses the link.
- Three new routes on `AdminManageController` (already `@Roles(...STAFF_ADMIN)` at the class
  level, so no new authorization code needed): `GET/PATCH /admin/students/:id`,
  `POST /admin/students`.
- Two new `AuditAction`s: `student.updated` (before/after built from only the fields a given call
  actually changed, not the whole row), `student.created`. Added to both the union and the
  exhaustive `Record<AuditAction, true>` in the same commit.

**Frontend**: `lib/api.ts`/`lib/types.ts` mirror extended (`StudentDetail`, `AdminStudentUpdate`,
`CreateStudentInput`, three new `api.admin.*` methods). New
`app/(app)/manage/students/[id]/page.tsx` (detail + edit form). `manage/students/page.tsx` gained a
"Create student" inline panel and turned each name into a link to its detail page.

## Verification

- `npm test --workspace=backend`: **548 passed, 35 files** (12 new: `admin-students.service.spec.ts`
  covers detail 404s, update's before/after snapshot precision, null-clears-a-field, the placeholder
  password hash being real and non-trivial, the sign-in-link mail's actual data shape including a
  round-trip through a real stored reset token, duplicate-email 409, and that the creation audit
  entry never carries the password hash).
- `npm run lint --workspace=backend`: clean (one pre-existing, unrelated warning untouched).
- `npm run test:e2e --workspace=backend` (invoked via `npx vitest` directly, **not** the `npm`
  wrapper — `project_log.md` already recorded that wrapper's teardown occasionally aborts with a
  Windows-specific exit code that must not be read as a failure; running vitest directly avoids the
  ambiguity entirely): **234 passed, 4 files** (up from 228 — 6 new: 3 assistant-refusal 403 tests
  in `registration.e2e-spec.ts`, 3 new entries in `staff.e2e-spec.ts`'s exhaustive admin-route parity
  table, whose own count assertion was updated from 23 to 26 and caught by the suite itself when I
  forgot to update it the first time — exactly the mechanism it's designed to be).
- **Integration suite: not run.** Docker was not running in this environment and starting it was
  judged not worth the time for a change that adds no migration and extends an already
  integration-tested query pattern (the same boolean-flag CASE structure `updateByUserId` already
  uses, now on six columns instead of three, all pre-existing NOT NULL/nullable columns from
  migration 014). Recorded as a real, disclosed gap, not silently skipped.
- `npx tsc --noEmit` in `frontend/`: **22**, unchanged — every error is the same pre-existing
  `AUTH-2` set from `REVIEW_4BII.md`. `lib/` still 0. `npx eslint` on the touched files: clean (one
  real `react-hooks/set-state-in-effect` error was caught and fixed — the detail page's form-reset
  logic was initially written as a `useEffect`, converted to the derive-during-render pattern the
  shells already established for `lastPathname`).

## Live-verified end to end, not just compiled

Ran the real dev stack, signed in as the seeded teacher:
- Opened `/manage/students/student-1`, confirmed the real seed profile fields render (phone, school,
  parent email, staff notes — matching the fixture exactly), edited `staffNotes` and saved, then
  confirmed the write actually persisted via a direct API read (not just trusting the UI).
- Used the real "Create student" panel to create `livetest@example.com`; confirmed via a direct API
  read that the account exists, is `active` immediately (no queue), and confirmed in the dev
  server's own log that `LogMailSender` actually fired with `template=sign-in-link` — the real mail
  path, exercised for the first time by an actual user action rather than a unit test's stub.
- Zero console errors throughout.

**One real, disclosed tooling snag, not an app bug**: adding the new `[id]` dynamic-route folder
while the frontend dev server was already running produced a genuine 404 from Next's own router
until the dev server was restarted — a known Turbopack limitation (new route segments need a
restart to be indexed; edits to existing files hot-reload fine). Confirmed by restarting and
re-testing; not present in any file this session wrote incorrectly.

## Outstanding

- Integration coverage for the two new repository methods, once Docker/Postgres is available in
  this environment again.
- Slice 5c (`PEOPLE-4`/`5`/`6`/`AUTH-4` — assistants) is next, and is the largest remaining piece of
  this unit.
