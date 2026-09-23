# Execution notes — chat unit 12: Settings and account

Two Antigravity passes. Model 1 (`claude-sonnet-4-6`) hit its account quota before touching any
production file (0 files, "Individual quota reached… Resets in 100h1m5s"). Per the standing
quota-fallback rule, re-dispatched immediately with **`gemini-3.1-pro-high`**, same brief (with the
two client rulings on assumptions folded in — see below), no `--effort` flag. That pass did the real
work but hit its 30-minute print timeout mid-turn with "turn in progress" and never printed a final
report — everything below is from the reviewer's own inspection of the diff and gate runs, not from
Antigravity's self-report, which does not exist for this pass.

**Model that authored the work: `gemini-3.1-pro-high`.**

## Rulings folded into the single dispatch

Both were decided before the diff existed, so no separate `--resume-last` delta was needed:

1. **Notification-preference default: all four `true` (opt-out)** — confirmed by the client, not just
   assumed. Recorded as a decision, not a labelled assumption, from this point forward.
2. **Notifications tab visible to every staff role; Google tab stays admin-only, gated per-tab in the
   frontend** (`isAdminRole`), with the server-side boundary already proved by
   `backend/src/auth/role-guards.spec.ts:107` (`AdminGoogleIntegrationController: STAFF_ADMIN`, unchanged
   by this unit).

## What was found already built (confirmed, not rebuilt)

- `/admin/courses` create/edit, `/admin/groups` CRUD, and the Google integration's 5 routes were all
  already shipped before this unit. **SET-3's backend, SET-4's backend (`DOM-5`), and all of SET-5**
  needed no new engineering server-side.
- `frontend/app/(app)/manage/groups/page.tsx` already has full create/edit, shipped in unit 5 slice 5d.
  **SET-5 has no engineering gap at all**, frontend or backend — closed on that basis, not duplicated.

## What was actually built this unit

- Migration `022_notification_preferences.sql` — the reserved number, no collision.
- `backend/src/settings/` — `SettingsController` (`GET/PATCH /me/profile`,
  `GET/PUT /me/notification-preferences`), `SettingsService`, both repository drivers for
  `notification_preferences`, DTOs.
- `UserRepository.updateName`, both drivers.
- `POST /students/me/avatar` on the existing `StudentsController`, reusing
  `StudentsService.updateProfile`'s existing `avatarUrl` write path. `UploadsService.store()` extended
  with an optional `{ maxBytes, allowedTypes }` override rather than duplicated.
- `frontend/app/(app)/manage/account/page.tsx` (profile), `manage/settings/page.tsx` (Notifications +
  Google tabs), create/edit forms added to `manage/courses/page.tsx`, an avatar panel added to
  `app/(app)/profile/page.tsx`. One-line nav change in `console-shell.tsx` (Settings item no longer
  admin-gated).

## Verification performed by the reviewer (not self-reported)

- `npm test --workspace=backend`: **664 passed (40 files)** — up from the 660/39 baseline, consistent
  with the new unit tests.
- `npm run test:e2e --workspace=backend`: **5 failed** (see REVIEW.md — the four avatar-upload tests
  and one unrelated timeout, the latter a side effect of the avatar bugs destabilising the shared app
  instance, not a separate regression).
- `npm run lint`: clean (0 errors, 2 pre-existing-style warnings unrelated to this unit).
- `cd frontend && npx tsc --noEmit`: **1 error**, `manage/settings/page.tsx:26` — not 0.
- Migration `022`: **run against real PostgreSQL 15-alpine from an empty schema**, by the reviewer,
  reusing the already-running `tahirelshazli-db` container shared by sibling worktrees (a fresh
  `unit12_test` database created inside it, per the precedent `PHASE_ROADMAP.md` §4 unit 0 set — "a
  fresh database created beside the dev one rather than wiping it"). **001–022 applied in order,
  seeded, schema up to date.** The integration suite itself then failed on the two new
  notification-preferences tests with `ReferenceError: db is not defined` — a scoping bug in the test
  file, not a migration or repository defect; see REVIEW.md finding 6.
- Stray fixture files (`avatar.png`, `avatar.svg`, `large.jpg` at the repo root and duplicated under
  `backend/`) were left uncommitted in the worktree by the Antigravity pass. Confirmed by grep that
  `backend/test/app.e2e-spec.ts`'s avatar tests depend on them by relative path
  (`.attach('file', 'avatar.svg')` etc.) — **this is the "test depends on a file left in the working
  tree" case**, not a false alarm. The reviewer deleted the stray files; the remediation brief tells
  Antigravity to replace the path-based `.attach()` calls with in-memory buffers so the tests carry
  their own fixtures and cannot pass locally while failing in CI (or a fresh clone) again.

## Verdict

**REJECTED.** Six findings below, three of them causing real, reproduced test failures (not
theoretical), including one functional bug (the course edit form calls a student-only endpoint and
will 403 for every real user of that screen). Full list in `docs/phases/unit-12/REVIEW.md`. A remediation
brief has been dispatched to Antigravity with `--resume-last`.
