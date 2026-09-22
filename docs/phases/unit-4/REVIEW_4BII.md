# Review — unit 4, slice 4b-ii: console/manage surface port

**Reviewer:** Claude (orchestrator) · **Implementer:** Claude Code subagent, `model: sonnet` ·
**Date:** 2026-09-21

## Verdict: **APPROVED**

## What was actually checked

- Independently re-ran `npx tsc --noEmit 2>&1 | grep -c "error TS"` (correct metric, per the
  correction recorded in `REVIEW_4BI.md`): **82**, matching the implementer's figure exactly.
  `lib/` independently confirmed 0. `npx eslint .`: clean, no output.
- `git status --porcelain`: exactly the 16 `manage/*` files claimed, all modified in place — no
  creates/deletes/renames, consistent with a pure port (unlike 4b-i, which restructured routes).
  **Found and removed one piece of debris not mentioned in the report:** an empty 0-byte file named
  `void` at the repo root, evidently accidental shell-redirect residue from this run. Deleted before
  landing; not part of the implementation.
- **Re-checked the B-6 claim rather than accepting "turned out not to apply" at face value**: grep
  for `components/site` under `manage/*` does return one hit
  (`manage/blog/[id]/page.tsx:324`), but reading it shows it's a **code comment** citing
  `components/site/site-header.tsx` as a *pattern reference* ("matching
  `components/site/site-header.tsx`: an effect would paint..."), not an import. The claim holds:
  there is no real cross-surface dependency to resolve.
- **Independently re-verified the "22 pre-existing AUTH-2 errors, not mine to fix" claim** — the
  single highest-risk claim in this report, since it's easy for an agent to mislabel its own gap as
  someone else's. Read `lib/types.ts:614-619` and `lib/api.ts:898` directly: both carry an existing
  comment, dated to `AUTH-2` (commit `2abd54b`, already on this branch before unit 3 started this
  session), stating in the codebase's own words that `CourseStaffMember`, `LearningMode`,
  `GroupSummary.courses`, and the `admin.courseStaff`/`assignStaff`/`unassignStaff`/
  `addGroupCourse`/`removeGroupCourse` methods are gone, and that "the shape the admin screen will
  read is unit 5's." This is a real, pre-existing, already-disclosed-in-the-codebase gap — not
  something introduced by this slice or reasonably closeable within a mechanical port. Correctly
  left alone rather than papered over with invented business logic.
- Read `manage/courses/[id]/layout.tsx` in full: the `CourseTabs`→inline `TabList` migration is
  correct — active tab is driven by `usePathname()` (a real hook), not a static string, which the
  implementer's own report flagged as a genuine bug the mechanical port would otherwise have
  shipped. Role-gating on the "Assistants" tab correctly uses `isAdminRole` and is commented as
  courtesy-only, consistent with every other nav decision this unit has made.
- Read the `courses/[id]/page.tsx` roster-column removal: the comment correctly attributes the
  missing `entry.learningMode` field to the same `AUTH-2` migration, and dropping a column for a
  field that no longer exists on the wire is the right call, not scope creep — keeping dead-field
  code would not be "verbatim," it would be silently broken.

## Judgment calls, adjudicated

All hold. The `Table`/`onRowClick`-vs-per-cell-`Link` split (whole-row nav where every row goes one
place; per-cell links where permissions vary per row, e.g. the blog list) is the right distinction
and matches how `components/ui/table.tsx` is documented to be used elsewhere.

## Live browser verification — still structurally blocked, as anticipated

Same root cause as both prior slices, re-confirmed independently by the implementer via the same
zero-import-scratch-route technique. `(auth)/login` (slice 4c's scope) is the one remaining piece
standing between this app and an actual live render — every other structural blocker this unit
named is now cleared. The live check happens at the end of 4c.

## Remaining, for slice 4c and 4d

- 61 of the 82 remaining errors are `(site)/*`, `(auth)/*`, and the now-fully-dead
  `components/app/app-shell.tsx`/`components/site/*` — 4c's and 4d's scope respectively.
- 22 are pre-existing `AUTH-2` domain-model drift in `manage/groups`, `manage/courses/[id]/groups`,
  `manage/courses/[id]/staff` — **not this unit's to close**; `lib/types.ts:618` already names this
  as unit 5's (`PEOPLE-4`) work. Recording explicitly here so it isn't mistaken for a unit-4 defect
  when unit 4 closes with a nonzero error count in these three files.
- `components/app/page-parts.tsx` and `components/app/table.tsx` now have zero real consumers
  anywhere — ready for slice 4d's deletion pass.
