# Review — unit 4, slice 4c: marketing/auth port, SHELL-5, and a real live-browser gate

**Reviewer/finisher:** Claude (orchestrator) · **Implementer:** Antigravity
(`claude-opus-4-6-thinking`, quota-exhausted mid-run) for the initial port, finished directly by
Claude per the user's standing instruction to do the remaining implementation work itself rather
than delegate further once Antigravity is unavailable · **Date:** 2026-09-21

## Verdict: **APPROVED**

## What happened

Antigravity's dispatch got a real, substantial start — all 4 `(auth)` pages and 5 `components/site/*`
files correctly identified and mostly ported (touched 10 files, matching its own error-category
breakdown of 16 distinct fix types) — before hitting its account quota again mid-fix (cut off
mid-edit on `contact-form.tsx`, no gate run, no live check). Rather than wait out another ~4.5-hour
reset or dispatch a further agent, I finished the remainder directly in this session:

- Fixed the `Button`/`ButtonLink` API mismatches Antigravity's work-in-progress left behind: no
  `loading` prop exists on the new `Button` (mirrored the disabled+label-swap pattern across all 4
  auth pages and `contact-form.tsx`), `size="lg"` doesn't exist (batch-fixed 11 occurrences to
  `"medium"` across 6 files), the leftover half-applied `Callout`/`InlineBanner` swap, `IconButton`'s
  children-based old API vs. the new required `icon` prop, and the last `@phosphor-icons/react`
  import outside `components/app`/`components/site`'s own legacy zone (`course-filters.tsx`'s search
  icon — swapped to the system's own `Icon` component, completing the "phosphor-icons fully
  retired" goal `redesign-mapping.md` states).
- **Found and removed a real dead feature, not a mechanical port**: `PublicCourseSummary`/
  `PublicCourseDetail` carry no learning-mode field at all (confirmed by reading `lib/types.ts`
  directly — retired by migration `012`), so the Recorded/Live filter on `/courses` and the
  `ModeBadge`/mode-dependent outcomes list on `/courses/[slug]` could never have matched real data.
  Removed both rather than leaving dead filtering logic or a badge for a field that doesn't exist —
  the same shape of call slice 4b-i made for Catalog/Achievements.
- **Fixed the `/catalog` dangling redirect** `PHASE_PLAN.md` flagged from slice 4b-i: dropped the
  `next=` mechanism from `courses/[slug]/page.tsx`'s register/login links entirely, since
  registration no longer creates a session to return anything to (`SHELL-5`).
- **Found and fixed a genuine, live-verified infinite-render-loop bug** in
  `components/app/page-chrome.tsx` — see below. This is the one file every slice's brief explicitly
  said not to touch structurally; this was a targeted bug fix, not a restructuring.

## Verification — done for real, not claimed

- `npx tsc --noEmit`: **30** errors (`grep -c "error TS"`), **exactly** the two pre-identified
  out-of-scope categories (22 `AUTH-2` domain drift in `manage/*`, 8 dead `components/app/{app-shell,
  page-parts}.tsx`) — **zero** remaining in `(site)/*`, `(auth)/*`, or `components/site/*`. `lib/`
  confirmed 0.
- `npx eslint .`: clean, no output (one leftover unused `cx` import in `course-card.tsx`, found and
  fixed during this check).
- `git status --porcelain`: scope is exactly the 16 files above plus `page-chrome.tsx` (the bug fix)
  — no `manage/*`, no `lib/`, no `components/shell/`/`components/student/` touched. Found and
  removed one piece of debris not mentioned in any report: an empty 0-byte file `frontend/1`,
  evidently the same kind of accidental shell-redirect residue as the `void` file slice 4b-ii's
  review caught. Neither slice's implementer flagged these — worth remembering that an empty
  stray file is easy to miss in a large diff and `git status --porcelain` should be checked for
  exactly this on every slice, not just skimmed.
- **A real live-browser session, not a claim** — this is the payoff every prior slice's review was
  explicitly working toward:
  - `npm run dev` (memory driver) actually served the app. `/login` rendered and — after some
    browser-automation click flakiness unrelated to the app itself (confirmed by triggering the same
    form via `form.requestSubmit()` when clicks weren't registering, which worked immediately with a
    real `201`/`200` from the backend) — signing in as the seeded `teacher@example.com` landed on a
    **fully working console shell with real data**: 2 courses, 2 students, 1 awaiting grading, 12
    recordings, a real course table, all six nav sections, the course switcher. `/manage/students`
    rendered a real two-row student directory through the new `Table` component.
  - Signing in as `student@example.com` landed on a **fully working student shell**: the flat IA nav,
    white-pill active state, real homework items with status tags (`Overdue`, `Scored 88%`, etc.),
    real Materials list. `/lessons` rendered the real curriculum with chapter progress and a working
    recording-player card, confirming the course-scoping infrastructure (`CourseProvider`) actually
    works end to end, not just in isolation. `/marks` rendered Performance (quiz/assignment averages,
    overall %) and Progress (course completion, "This is not a grade") as genuinely separate
    sections — `CLAUDE.md` §11.1 rule 2 held in a live render, not just in the code.
  - `/register` submitted for real (`POST /auth/register` → `201`) and rendered the exact `SHELL-5`
    waiting-state screen: "Your account is being reviewed... This usually takes one working day...
    Back to sign in" — no session, no dashboard, no redirect.

## The infinite-loop bug, in detail

Console showed **hundreds of "Maximum update depth exceeded" errors**, actively climbing, the moment
`/manage` first rendered with real navigation (a Next.js dev "1 Issue" badge was already visible on
first render, before any interaction). Traced to `components/app/page-chrome.tsx`'s `PageTitle` and
`PageActions`: both effects depended on `ctx` (the *entire* context value object from
`usePageChrome()`), but that object is rebuilt by `PageChromeProvider`'s own `useMemo` every time
`chrome`/`actions` state changes — which is exactly what these effects' own `setChrome`/`setActions`
calls do. `PageActions` in particular is called with a fresh JSX `children` element on every render
of its caller (`ManageLayout`, `dashboard/page.tsx`, `notifications/page.tsx` — three real call
sites, confirmed by grep, not a one-off) — React never memoizes JSX children automatically — so the
loop was: state update → new `ctx` object → effect re-fires (since `ctx` is in its deps) → calls
`setActions`/`setChrome` again → state update → forever.

**Fix**: depend on the individual `setChrome`/`setActions` function references (already wrapped in
`useCallback(..., [])` in the provider, and therefore genuinely stable across every provider
re-render) instead of the whole `ctx` object. This is the shared file both new shells depend on and
every caller uses the same pattern, so the fix belongs there once, not scattered across three call
sites — verified empirically: after the fix, the same live session showed **zero** console errors on
reload and on navigating between `/manage`, `/manage/students`, `/dashboard`, `/lessons`, `/marks`.

This bug **predates every slice in this unit** — `page-chrome.tsx` was explicitly untouched by 4a,
4b-i, and 4b-ii (all three briefs said so, and all three confirmed it), and it could not have
surfaced until this slice, because no route in the whole app had ever compiled cleanly enough to
render live before now. It is exactly the class of bug `CLAUDE.md` §13's "never declare completion on
the basis of compilation" rule exists to catch, and it only surfaced because this slice actually did
the live check rather than deferring it again.

## Outstanding, carried into slice 4d

- `components/app/app-shell.tsx` and `components/app/page-parts.tsx` are now the only files with
  real tsc errors outside the disclosed `AUTH-2` set — both are confirmed dead (zero real consumers
  anywhere in the tree, per 4b-ii's own grep and this slice's clean `(site)`/`(auth)` port). Ready
  for deletion.
- `components/app/page-chrome.tsx` **must move, not be deleted** in slice 4d — it is live,
  load-bearing shared infrastructure for both shells, now also carrying a real bug fix. Relocating it
  out of `components/app/` (e.g. to `components/shell/`) is 4d's job, not this one's.
- The 22 `AUTH-2` errors in `manage/groups`, `manage/courses/[id]/{groups,staff}` remain unit 5's
  (`PEOPLE-4`) to close, as recorded in `REVIEW_4BII.md`.
