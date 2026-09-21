# Review — unit 4, slice 4a: new console + student shells

**Reviewer:** Claude (orchestrator, same continuous session) · **Implementer:** Claude Code
subagent, `model: sonnet` (Antigravity unavailable — account quota exhausted, see unit 3's
`REVIEW.md`) · **Date:** 2026-09-21

## Verdict: **APPROVED**, with one disclosed, structural verification gap

## What was actually checked

- Read every new file (`components/shell/{nav-active.ts,course-switcher.tsx,shell-header.tsx,
  console-shell.tsx,student-shell.tsx}`) and the one modified file
  (`app/(app)/layout.tsx`) line by line against `PHASE_PLAN.md` §2/§3's slice-4a scope.
- Independently re-ran `npx tsc --noEmit` in `frontend/`: **401 total, unchanged from the 401
  baseline**, zero errors under `components/shell`, `lib/` still 0. Independently re-ran
  `npx eslint .`: clean, no output.
- Spot-checked that the primitives and utility classes used actually exist rather than trusting
  the agent's word: `StaffCourseSummary`/`ManageOverview` (`lib/types.ts`) carry the fields the
  new shell reads (`id`/`title`, `studentCount`); the Tailwind utilities used
  (`bg-surface`/`bg-surface-2`/`bg-surface-3`/`border-border-light`/`bg-surface-overlay` etc.) are
  already in real use elsewhere in the tree, not invented — the exact silent-failure trap
  `CLAUDE.md` §11 warns about (`text-[var(--x)]`) does not appear anywhere in the new files.
- `git status --porcelain`: only `components/shell/` (new) and `app/(app)/layout.tsx` (modified) —
  nothing under `components/app/`, `components/site/`, `(site)/`, `(auth)/`, or `lib/` touched, as
  required for an additive-only slice.

## The judgment calls, adjudicated

1. **Student nav kept at today's content, not the target flat IA.** Correct call — `SHELL-3` (the
   flat IA) is explicitly slice 4b's ticket in `PHASE_PLAN.md`, and its target routes don't exist
   yet. Wiring them now would ship dead links.
2. **Console nav links to routes chat units 5-10 haven't built.** Expected and unavoidable at this
   point in the roadmap — flagged rather than silently pointed elsewhere, which is the right
   default.
3. **Added "Courses" and "Blog" to the console nav**, beyond `redesign-mapping.md`'s literal list.
   Correct call for an additive-only slice — the alternative orphans two real, working screens.
   Recorded as B-6-adjacent for a later unit's IA pass, which is the honest way to leave it.
4. **Fixed the `role === 'teacher'` vs. `isAdminRole` bug** while reproducing `navFor`. This is
   exactly right: the instruction was to reproduce the shell's *behavior*, not its literal bug, and
   `isAdminRole` already exists in `lib/roles.ts` for this. Confirmed by reading `lib/roles.ts` —
   `isAdminRole` returns true for `admin` and `teacher`, matching the intent. Still courtesy-only,
   not a security fix — correctly labeled as such.
5. **Only "Students" gets a live count.** Correct — `redesign-mapping.md`'s own "Designed, but no
   backend" table lists `ReportRun` as unbuilt; inventing a Reports count would be exactly the kind
   of guess `CLAUDE.md` §13 forbids.
6. **`md:` (768px) instead of `lg:`.** Confirmed against `CLAUDE.md` §11 and `redesign-mapping.md`
   §"Still open" 6 — the system's one declared breakpoint is 768px. Correct.
7. **Course switcher is inert (local state only).** Correct scope discipline — no console/student
   screen is course-scoped until a later unit reads the selection; building that wiring now would
   be exactly the "configuration nobody sets" `CLAUDE.md` §13 warns against.

No corrections needed to any of the seven.

## The one real gap: live browser verification was structurally blocked, not skipped

`CLAUDE.md`'s own instruction is to check UI changes in a real browser, not just by reading code.
I attempted this properly rather than waiving it:

- Started the real dev stack (`npm run dev`, memory driver, no database needed) and opened it in
  Chrome.
- The actual `/login` page 500s immediately — a **pre-existing, out-of-scope** breakage (it still
  imports `Field`/`Input`/`FormError` from the retired system), so I could not sign in through the
  UI. Bypassed it legitimately: called `POST /auth/login` directly for the seeded
  `teacher@example.com` account and injected the returned token into `sessionStorage` under the
  keys `lib/session.tsx` actually uses (`te.token`/`te.user`), then navigated straight to `/manage`.
- `/manage`'s own content (`app/(app)/manage/page.tsx`) also 500s — again pre-existing: it imports
  `Chip`/`Metric`/`RowsSkeleton`/`ErrorState` from the retired system. This is precisely the
  breakage slice 4b exists to fix, not a defect in this slice.
- To isolate the new shell from that unrelated breakage, I added two throwaway scratch routes with
  no legacy imports (`app/(app)/manage/__shell-check/page.tsx`,
  `app/(app)/__shell-check-student/page.tsx`) — deleted immediately after use, never committed.
- **Even the scratch routes 500'd**, and `curl`ing the raw SSR HTML confirmed why: Turbopack's dev
  server in this setup returns the app's *global* `_error` page (with the `/login` stack trace)
  for **every** route the instant any page in the tree fails to resolve its imports — the failure
  is not isolated per-route. With 401 pre-existing errors spread across nearly the whole `app/`
  tree, there is currently no route in this app that can render live in dev mode, new shell or old.

**This means no code change in slice 4a could have passed a live-render check right now** — the
blocker is the aggregate state of the unported pages, which is exactly what `PHASE_PLAN.md` §0
already named as the reason this unit needed splitting. Forcing the check today would either be
impossible (confirmed) or would require prematurely doing slice 4b's work first. **Verification
strategy going forward:** the first real, meaningful live-browser check happens naturally at the
end of slice 4b, once enough pages are ported that at least one route survives Turbopack's
whole-app compile — at that point I will look at both shells for real, in a browser, with actual
content, before that slice is approved. Recording this now rather than glossing over it, per
`CLAUDE.md` §13: "written but never verified" is worth more than a false green checkmark.

## Outstanding from this slice, carried into 4b

- `B-5`, `B-6` (both already logged in `PHASE_PLAN.md` §6) stand as recorded.
- The live visual check above is now a **named, tracked action for slice 4b's own review**, not
  dropped.
