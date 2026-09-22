# Unit 5 — closing the two environment follow-ups

**Date:** 2026-09-22 · **Base:** `redesign` @ `e9f7f15` · **Scope:** only the two items
`REVIEW_5D.md` §"Outstanding, carried forward" left open. No new feature work.

## Environment

- Node **v22.22.2** (the repo targets 24; nothing below depended on the difference).
- **No Docker daemon.** PostgreSQL **16** from the container's own packages, a throwaway cluster on
  port 5433. Production is 15. Nothing in 001–017 uses a 16-only feature, but this is a 16 run,
  not a 15 run.
- Chromium via `playwright-core`, driven headless. This is not the Chrome extension tool that failed
  in 5c/5d. The same flows that tool could not click through were clicked through here.

## Baseline, before touching anything

| Check | Result |
|---|---|
| `npm test` | **573 / 36 files**, pass |
| `npm run test:e2e` | **244 / 4 files**, pass |
| `frontend: npx tsc --noEmit` | **0** |
| `npm run lint` | clean (one pre-existing oxlint warning, `dashboard.controller.spec.ts:17`) |

## Follow-up 1 — integration against real Postgres, including migration 017

`TEST_DATABASE_URL=… npm run test:integration` from an empty schema: **001–017 all applied, then
re-applied as a no-op; 112/112 pass.**

This did not close the follow-up by itself. The suite had **no test touching `assistant_invitations`**,
and none for `PostgresStudentRepository.updateByUserIdAsStaff` (5b). Those are the only two
`Postgres*` changes in unit 5 (`git show --stat` across `a8e6d57..e9f7f15`). A run that never
reaches the new SQL is not evidence about it. Added to `backend/test/postgres-repositories.integration-spec.ts`:

- **`student profiles, staff edit`** (3): staff-owned fields are written and omitted fields left
  alone; an explicit `null` clears exactly one field; an unknown user returns `null`.
- **`assistant_invitations`** (10): the full column round trip, including `TEXT[]` group ids,
  millisecond `expires_at` and an Arabic name; `group_ids` defaults to `{}` and not `NULL`;
  pending rows list newest first; `reissue` rotates the token (the old one stops resolving);
  `updateDetails` works while pending; **once accepted**, the row drops out of both pending
  reads and `reissue`/`updateDetails`/`remove` each refuse in SQL; cancel works once and then
  reports `false`; a duplicate token is refused by the UNIQUE constraint; the role and scope CHECKs
  refuse out-of-range values; an unknown inviter is refused by the FK, and **the inviting admin
  cannot be deleted** (default RESTRICT, as the migration's comment intends); both indexes exist,
  and the email one is partial on `accepted_at IS NULL`.

**Result: 125/125, from an empty schema.** All 13 new tests passed on their first run. Unlike every
earlier migration, 017's first real run found nothing.

The dev stack was also booted against a fresh Postgres database with `PERSISTENCE_DRIVER=postgres
DB_AUTO_MIGRATE=1 DB_AUTO_SEED=1`: 017 applied at boot, and everything below ran against it.

## Follow-up 2 — interactive browser verification of 5a–5d

Signed in as the seeded teacher, on the Postgres-backed stack:

| Flow | Result |
|---|---|
| Student directory (`PEOPLE-1`) renders the seeded students | pass |
| Student detail (`PEOPLE-2`) renders; **staff notes edited in the UI**, confirmed in `student_profiles` with `psql` | pass |
| Assistants list (`PEOPLE-5`) | pass |
| Groups, course groups (`GROUP-1..3`), group report (`GROUP-4`) | pass |
| **Invite an assistant through the UI** (`PEOPLE-4`), with the name `ليلى فهمي` | pass |
| **Accept the invitation through the UI** in a fresh browser context (`AUTH-4`), then sign in as the new account | pass |
| New account has an `assistant_scopes` row (`all_groups`), which closes `F2B2-3` | pass (`psql`) |
| Audit trail shows `assistant.invited` (teacher) and `assistant.invitation_accepted` (assistant) | pass (`psql`) |
| Spent token, then made-up token, against `POST /auth/invitations/:token/accept` | both **401**, byte-identical body |
| Console errors or uncaught page errors across all of the above | **0** |

### What the browser found that curl and `tsc` could not

Three defects, found by screenshot and confirmed with `getComputedStyle`. The first two are in
unit-4 shell/token code, not in unit-5 code. They are fixed here because every unit-5 screen
renders inside that shell, and none of those screens can pass a visual check while they stand.

1. **Every `<a>` took the accent colour over its own utility.** `semantic.css` carried the handoff's
   `a { color: var(--fg-accent) }` *unlayered*. Tailwind v4 puts utilities in `@layer utilities`,
   and an unlayered rule beats every layered one whatever its specificity. Result: the whole
   sidebar was indigo, and the header's primary link-button (`+ Live Session`) was indigo text on
   an indigo fill, i.e. an empty blue pill. **Fix:** the two `a` rules moved into `@layer base`.
   `:focus-visible` was deliberately **left unlayered**: `course-filters.tsx` pairs `outline-none`
   with a box-shadow ring, and today only the unlayered global outline keeps that element's focus
   visible. Layering it would have removed a focus indicator. Verified afterwards: nav links compute
   to `fg-2`, the active item to `fg`, and the header button to white on accent.
2. **Under `dir="rtl"` the console and student sidebars vanished on desktop.** `md:translate-x-0`
   and `rtl:translate-x-full` both match a wide RTL page at equal specificity, and Tailwind emits
   `rtl:` later, so the closed-state transform won. **Fix:** the closed transform is now
   `max-md:`-scoped, so nothing competes at `md` and above. Verified at 1360px and 420px, LTR and
   RTL, in both shells: visible on desktop; off-screen on mobile until toggled, then on-screen from
   the correct edge. Latent today, because `app/layout.tsx` hard-codes `dir="ltr"`, but CLAUDE.md
   §11 requires every screen to survive RTL.
3. **A missing mark rendered as `--`.** `formatPercent(null)` in `lib/format.ts` broke the §11.1
   copy rule (a missing mark is an em-dash). It showed on the group report and also on the student
   marks page and the course page. **Fix:** `—`.

### Found and recorded, not fixed (out of this closure's scope)

- **`F5-1` (high, unit 4's port): no `text-[var(--fs-*)]` class sets a font size.** Tailwind v4
  compiles `text-[var(--x)]` as **`color:`**, confirmed in the production CSS
  (`.text-\[var\(--fs-h2\)\]{color:var(--fs-h2)}`). There are 113 such classes across `(site)`,
  `(auth)`, `components/site` and `components/blog`. Every marketing and auth heading renders at
  inherited size: the accept-invitation `h1` computes to 17px. On top of that, 6 of the referenced
  tokens (`--fs-h1/h2/h3`, `--fs-body`, `--fs-lead`, `--fs-display`, 87 uses) **are not defined
  anywhere**. The marketing tokens that do exist are named `--fs-marketing-*`. The mechanical half
  is `text-(length:--x)`; the other half is a token-mapping decision (`--fs-h3` has no marketing
  equivalent), which is why it is not guessed at here. This is CLAUDE.md §11 rule 1 happening
  to sizes, and the §"Verification" design check #4 in `IMPLEMENTATION_PLAN.md` should have caught it.
- `F5-2` (low): the console's role chip renders **"Teacher" in amber**. §11.1 reserves amber for a
  queue. This is a design question, not a bug.
- `F5-3` (low): the assistants list's Reach column reads `groups 0` / `group 1`. The copy reads
  backwards, and `0` for an assigned-groups assistant with none is ambiguous with "not set up".

## After

| Check | Result |
|---|---|
| `npm test` / `npm run test:e2e` | 573 / 244, unchanged (no backend source touched) |
| `npm run test:integration` (real Postgres 16, empty schema) | **125 / 125** (+13) |
| `frontend: npx tsc --noEmit` | **0** |
| `npm run lint` (frontend eslint + backend oxlint) | clean, same pre-existing warning |
| `npm run build:frontend` | pass, 33/33 pages |
| Browser pass, repeated on the fixed build | 13/13, 0 console errors |

## Security areas considered

Authentication (invite/accept flow run for real; replay and unknown token give identical 401s) ·
authorization (a new assistant is fail-closed until its scope row exists, and the row was written) ·
audit logging (both entries present, correctly attributed) · SQL injection (no SQL changed) ·
XSS (no rendering sink changed) · focus visibility (deliberately preserved, see fix 1). Nothing
else in the §8 list is touched by a CSS layer, two class strings and a format string.
