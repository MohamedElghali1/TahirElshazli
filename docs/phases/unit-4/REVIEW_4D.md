# Review — unit 4, slice 4d: the deletion pass, and a correction to `SHELL-4`'s literal scope

**Implementer/reviewer:** Claude (orchestrator, done directly in this session — a small, bounded,
well-understood cleanup after three prior slices' worth of investigation, not delegated further)
· **Date:** 2026-09-21

## Verdict: **APPROVED** — unit 4 is COMPLETE

## What `SHELL-4` actually required, vs. its literal wording

`PHASE_PLAN.md`'s own §3 (written before any slice landed) carried `SHELL-4`'s literal text
forward: "Delete `components/app/*`, `components/site/*`." Verified before executing rather than
followed blindly, since deleting a directory by name regardless of its current contents is exactly
the kind of destructive action `CLAUDE.md`'s change-management rules ask to be checked, not assumed:

- **`components/app/*`**: grepped every file for real (non-comment) consumers.
  `page-parts.tsx`, `table.tsx`, `app-shell.tsx` — **zero consumers each**, confirmed dead.
  `page-chrome.tsx` — **25 consumers**, the shared chrome contract both new shells depend on
  (`ConsoleShell`, `StudentShell`, `ShellHeader`, and every ported page that renders
  `<PageTitle>`/`<PageActions>`). Deleting it would break the entire signed-in app.
- **`components/site/*`**: grepped all 8 files. **Every one has real consumers** — `catalog-states`,
  `contact-form`, `course-filters`, `course-card`, `site-header` were the exact files slice 4c ported
  onto the new `components/ui` API *in place* (not moved), so they are now the **current, correct**
  implementations, not legacy code; `reveal`, `site-footer`, `wordmark` were never touched at all
  because they never depended on the retired system.

**What was actually done**: deleted the three genuinely dead `components/app/*` files; relocated
`page-chrome.tsx` to `components/shell/page-chrome.tsx` (its real home, alongside the shells that
depend on it) and updated all 25 import sites; **left `components/site/*` in place** — nothing in
it is legacy, and deleting live code because a plan written before the port existed said to would be
following the letter of an instruction past the point it stopped matching reality. This is
disclosed here, in `CHANGELOG.md`, and in the roadmap entry — not a silent deviation.

## Verification

- `npx tsc --noEmit 2>&1 | grep -c "error TS"`: **22**, exactly the pre-identified, disclosed
  `AUTH-2` domain-model drift in `manage/groups`, `manage/courses/[id]/{groups,staff}`
  (`REVIEW_4BII.md`) — unit 5's (`PEOPLE-4`) to close, not this unit's. `lib/` confirmed 0.
- `npx eslint .`: clean.
- Grepped the whole tree for `components/app/page-parts`, `components/app/table`,
  `components/app/app-shell`, and `components/app/page-chrome` (the old path): **zero** real
  references remain (one historical code comment in `manage/courses/[id]/layout.tsx` correctly
  describes what was deleted in a *past* slice, in the past tense — not a broken reference).
- **Live browser re-check after the deletion**, not assumed safe from tsc alone: started the real
  dev stack again, signed in as the teacher, opened `/manage/courses` — renders cleanly, zero console
  errors, no dev-tools issue badge. The relocation of `page-chrome.tsx` did not break anything a
  static check alone could have missed (a runtime-only import-path bug is exactly the class of
  failure `CLAUDE.md` §13's live-check rule exists to catch).

## Unit 4 — closing account

All four `SHELL-1..5` requirements are built and verified, with every judgment call disclosed:
- `SHELL-1`/`SHELL-2`: new console and student shells, built on existing `components/ui` primitives,
  additive-only until this slice.
- `SHELL-3`: flat student IA, `/learn/[id]/*` collapsed into course-scoped top-level routes via a
  new shared `CourseProvider`.
- `SHELL-4`: legacy deletion done correctly — the dead 3/4 of `components/app/*`, not all of
  `components/site/*`, per the finding above. **Zero `tsc` errors outside the disclosed `AUTH-2`
  gap unit 5 owns.**
- `SHELL-5`: the registration waiting-state screen, live-verified end to end (`REVIEW_4C.md`).

**A real, live-verified bug was found and fixed along the way** (`page-chrome.tsx`'s infinite
render loop, `REVIEW_4C.md`) that could not have surfaced before this unit, because no route in the
app had ever rendered live in a browser until slice 4c cleared the last whole-app compile blocker.

**Process note**: this unit exercised the custom units-3-5 pipeline (`D-24`) fully — Antigravity as
primary implementer where its quota allowed, the orchestrator finishing directly when it didn't
(twice: slice 4c's port, and this entire slice 4d), per the user's explicit instruction to keep a
single agent doing the work rather than spawn further subagents once Antigravity is unavailable.
