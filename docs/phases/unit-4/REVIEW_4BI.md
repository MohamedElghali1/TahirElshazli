# Review — unit 4, slice 4b-i: flat student IA + student-surface port

**Reviewer:** Claude (orchestrator) · **Implementer:** Claude Code subagent, `model: sonnet` ·
**Date:** 2026-09-21

## Verdict: **APPROVED**

## What was actually checked

- Independently re-ran `npx tsc --noEmit` in `frontend/`. **Correction to methodology, noted for
  the record:** both this session's earlier baselines and the implementer's own comparison used
  `wc -l` on the raw `tsc` output, which counts snippet lines, not errors — a `tsc` error can print
  several lines of context. Re-counted with the correct metric, `grep -c "error TS"`: **245**,
  matching the implementer's own figure exactly once measured correctly. `lib/` independently
  confirmed 0 (directory match, unaffected by the line-vs-error distinction). Remaining errors are
  entirely `components/app/*` (including the now-fully-dead `app-shell.tsx`, correctly left for
  slice 4d), `components/site/*`, and `manage/*`/`(site)`/`(auth)` — none in the student surface or
  `components/{shell,student}` this slice touched.
- `npx eslint .`: independently confirmed clean, no output.
- `git status --porcelain`: every change is inside `frontend/app/(app)/{dashboard,notifications,
  profile,attendance,classmates,help,homework,lessons,marks,materials,quizzes,timetable}`,
  `components/shell/`, `components/student/`, and three tracked renames out of `components/app/*`.
  Nothing under `manage/*`, `(site)/`, `(auth)/`, or `lib/` touched — correct for this slice's
  boundary.
- **Independently verified the Catalog/Achievements deletion, rather than taking the stated
  reasoning on trust**, since deleting a whole feature is the single highest-consequence call in
  this report: `docs/PRODUCT_SPEC.md:206` reads verbatim *"Catalog / Achievements | `[REMOVED]` |
  Not in the design. `/catalog` goes with open enrolment; the blog stays public-facing but leaves
  the student rail."* `frontend/lib/api.ts:406`'s own comment confirms `enroll` was already retired
  by `DOM-4`. The deletion is correct, and it is also a correction to *my own* slice-4b-i brief,
  which told the implementer to "port" these — I hadn't checked `PRODUCT_SPEC.md`'s classification
  before writing that instruction. The implementer caught and fixed a mistake in the brief rather
  than executing it blindly, and disclosed exactly why. That is the right behavior, not scope creep.
- Read `components/shell/course-context.tsx`, `components/student/course-gate.tsx`, and
  `components/student/course-link.tsx` in full — the new course-scoping infrastructure `SHELL-3`
  actually needed. The `useSyncExternalStore` approach around `sessionStorage` (no native same-tab
  storage event) is correct and deliberately mirrors an existing pattern already in
  `dashboard/page.tsx` (`useNow`) rather than inventing a new one. `selectedId`'s fallback chain
  (stored id if still enrolled → first course → `null`) correctly handles a stale stored id from a
  course the student is no longer on.
- Read `app/(app)/marks/page.tsx` in full as the highest-risk file for `CLAUDE.md` §11.1 rule 2
  ("progress and performance never merge"): Performance and Progress are two clearly separate,
  separately-labelled sections (`StatNumber` for marks, `Meter` for completion/attendance) — the
  rule holds. The disclosed `CourseProgress` mode-inference gap (no discriminant field exists in
  `lib/types.ts`, confirmed by reading the interface directly — it unconditionally carries both
  completion and attendance figures) is handled defensively and identically at both of its two call
  sites, with the gap disclosed in a comment rather than silently guessed. Correct given `lib/` is
  explicitly out of scope for this redesign.

## Judgment calls, adjudicated

All seven route-mapping/placement decisions in the report are reasoned from an actual document
(`PRODUCT_SPEC.md`, `lib/roles.ts`, `redesign-mapping.md`) rather than invented, and each is
disclosed rather than silently folded in. No corrections needed. Two flagged items are real and
correctly deferred rather than fixed out-of-scope:
- `app/(site)/courses/[slug]/page.tsx:102` now redirects to a deleted `/catalog` — confirmed real.
  Carried into slice 4c's scope (it's a `(site)` file).
- `components/app/page-parts.tsx`'s `CourseTabs` export is now dead (only caller deleted) but still
  used elsewhere in that file by `manage/*` — correctly left for slice 4d's deletion pass rather
  than prematurely pruned mid-file.

## Live browser verification — still structurally blocked, as anticipated

Consistent with `REVIEW_4A.md`'s finding: Turbopack's dev server serves a global error page for
every route while any page in the whole tree fails to resolve, and `(auth)/login` (slice 4c's
scope) still does. The implementer verified this wasn't self-inflicted by adding and testing a
zero-import scratch route, which also 500'd, then deleting it — correct diagnostic method, not an
assumption. The live check remains a named action for the end of 4b-ii/4c, whichever lands enough
of the remaining broken surface first.

## Outstanding, carried forward

- Fix the `/catalog` dead redirect in slice 4c.
- Delete `components/app/*`/`components/site/*` (including now-fully-dead `app-shell.tsx`) in
  slice 4d, once 4b-ii confirms nothing else still imports them.
- `lib/api.ts`'s stale `dashboard.get` comment ("still serves `/learn/[id]`") — cosmetic, `lib/` is
  untouched by design; noted, not actioned.
