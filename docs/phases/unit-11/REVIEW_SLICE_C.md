# Independent review — unit 11 slice C (WORK-4, student Quizzes surface)

**VERDICT: APPROVED**

## Scope reviewed
Single commit `5886078` ("feat(quizzes): student Google Forms quiz surface"). `git show --stat`
confirms exactly one file changed: `frontend/app/(app)/quizzes/page.tsx` (256 insertions, 11
deletions). No `backend/` file, no `homework/page.tsx`, no `manage/tasks/[id]/results/page.tsx`
touched — verified directly, not taken from the commit message.

Gates re-run independently in this worktree:
- `cd frontend && npx tsc --noEmit` — 0 errors (empty output).
- `npm run lint` (repo root) — exit 0. Same one pre-existing, unrelated warning noted in slice A/B's
  review (`dashboard.controller.spec.ts:17`, unused `EXTERNAL_WORK_BINDER` import) — not touched by
  this commit.

Not driven in a real browser this session — stating this plainly per CLAUDE.md §13; no browser
instance was available.

## Did this move toward the NEW product?
Yes. It replaces the honest placeholder `EmptyState` (which slice-C's own predecessor left as a
documented "designed, but no backend" stub) with a real screen driven entirely by server-derived
`AssessmentStatus` + `WorkExpectation`, matching `docs/PRODUCT_SPEC.md` §6 and the `CLAUDE.md` §5.8
boundary: no first-party quiz engine, no iframe, no answer capture — the only interactive surface is
an outbound link to Google.

## Checklist verification (docs/phases/unit-11/REVIEW.md "Slice C checklist")

1. **Seven build steps, four states, nothing invented.** All seven followed:
   - Step 1 (model on `homework/page.tsx`): confirmed — `CourseGate`/`useSelectedCourse` wiring
     (`quizzes/page.tsx:53-64` vs `homework/page.tsx:46-57`), identical `Group`/`Panel`/`Loader`/
     `EmptyState`+retry structure.
   - Step 2 (list + client filter on `workType === 'google_form'`, no backend filter param): exactly
     this, no new query param invented.
   - Step 3 (N+1 detail fetch via `Promise.all(api.assessments.get(...))`): present, matches the
     checklist's explicit exemption from a batch endpoint at this scale.
   - Step 4 (four states via `isAvailable`/`isBeingMarked`/`isMarked`/`isLocked`): all four are
     mutually exclusive by construction, no fifth state. Verified against the backend's actual status
     derivation (`assessments.service.ts:224-254`, `hasExternalResult = work.completed` at
     `assessments.service.ts:407-408`): because `computeStatus` returns `'submitted'` (never
     `'available'`) the instant `work.completed` is `true`, the frontend's state partition can never
     see an impossible combination (e.g. `status: 'available'` with `work.completed: true`). The
     `item.status === 'corrected'` branch inside the "Marked" label ternary (`quizzes/page.tsx`,
     `statusLabel`) is consequently unreachable for google_form work — harmless dead branch, not a
     bug, and it degrades safely to the literal `'Marked'` label it would have produced anyway.
   - Step 5 (empty state with quiz-specific copy): present ("Nothing set yet" / "Quizzes appear here
     as they are set"), distinct from homework's copy as intended.
   - Step 6 (design constraints): see §3 below — all held.
   - Step 7 (gates stay clean): confirmed above.
2. **Faithful to `homework/page.tsx`.** Compared side by side. `CourseGate`, `useSelectedCourse`,
   `Panel`+`action` count badge, `divide-y divide-border-light` list, the locked-row `opacity-60` +
   `aria-disabled` treatment, and the `w-[72px]` score column width are all reused verbatim or with
   the same values. No invented Tailwind class name found anywhere in the diff (checked every class
   string in the added code).
3. **Design rules.**
   - `grep -n 'text-\[var('` on the file: zero hits.
   - One utility per property: every class string read; the only lines carrying two `text-*` tokens
     pair a size utility (`text-base`, `text-xs`) with a color utility (`text-fg`, `text-fg-3`) —
     different CSS properties, not a duplicate, and this is the identical pattern already present in
     `homework/page.tsx:195,201` (the reused idiom, not a new risk).
   - No `Panel` nested in a `Panel`: the three `Panel`s (`Open now`, `Submitted…`, `Marked and
     locked`) are siblings inside a plain `flex flex-col` wrapper.
   - Status colour never the accent: the `statusTone` map uses `green`/`amber`/`gray`/`blue` only;
     `variant="primary"` (indigo) is reserved for the "Open quiz" `ButtonLink`, which is the one
     action the screen wants to draw the eye to — matches §11.1's rule 3 exactly.
   - Missing mark: the locked state renders `<Score value={null} />`, which `components/ui/score.tsx`
     (lines 45-56) renders as an em-dash with `aria-label="Not marked"` — no hand-written `'—'`
     anywhere in the new file, and no literal `0`.
4. **`Score` vs `Meter`.** `Meter` is not imported or used anywhere in this file — there is no
   completion concept on this screen (a quiz has no lesson/video progress), so nothing to merge.
   Marks render exclusively through `Score`. Respected trivially, correctly.
5. **Mirrored-data timestamp.** Every state that shows synced Google data carries a `SyncStatus`
   stamp fed by `formatRelative(work.lastSyncedAt)`: the "being marked" state always renders
   `SyncStatus` (unconditional), and the "marked" state renders it whenever `work.lastSyncedAt` is
   non-null. The "available" (not yet answered) state correctly shows no stamp — there is nothing
   mirrored yet to date. Consistent with the checklist's requirement.
6. **Scope discipline.** `git show --stat` confirms only the one file changed. `homework/page.tsx`
   and `manage/tasks/[id]/results/page.tsx` are untouched (verified by diff, not by trusting the
   commit message). No backend file in the diff.
7. **Data fetching.** Uses `useApi` (the same hook `homework/page.tsx` uses), not a hand-rolled
   `useEffect`+`useState` — the `react-hooks/set-state-in-effect` failure class this codebase has
   shipped before is not present here (confirmed no `useEffect` in the file). The N+1 detail fetch is
   explicitly authorized by the checklist at this scale (~20 tasks/course, a handful of which are
   quizzes) and is bounded by the already-scoped course list, not global.

## Type-mirror cross-check
`WorkExpectation`'s `google_form` variant and `AssessmentListItem.workType`
(`frontend/lib/types.ts:294-354`) were compared field-for-field against the checklist's specified
shape and against `api.assessments.list`/`api.assessments.get` (`frontend/lib/api.ts:463-475`) — exact
match, nothing invented, nothing missing. These mirror types were not touched by this commit (already
landed in slice A/B) but the new file's usage of them was verified to be correct.

## Findings
None that block. No security surface here (student-scoped read-only screen, no new route, no new
DTO, no new mutation) — `StaffScopeService`/authorization model is not implicated since this is a
frontend-only change against already-existing, already-reviewed backend endpoints.

## Definition of Done
- Seven build steps: hold.
- Four states, no invented fifth, no embed, no first-party engine: holds.
- Faithful to model file, no invented utility classes: holds.
- Design rules (§11, §11.1): hold.
- Score/Meter separation: holds (trivially — no Meter use).
- Sync timestamp on mirrored data: holds.
- Scope discipline (backend, homework, results untouched): holds.
- Gates (`tsc`, `lint`): hold, re-run independently.
- Browser-driven verification: **not performed**, stated plainly, not gating per prior slice's
  precedent (no browser instance available to any agent this session).

## Verified claims
The commit message's claims ("frontend tsc 0 errors", "npm run lint exit 0", "backend untouched",
"not yet driven in a real browser") were all re-derived independently in this review, not accepted on
report. All held.

## Remediation checklist
None — no blocking or follow-up items.

## Open decisions
None raised by this slice.

## Follow-ups for IMPLEMENTATION_PLAN.md / PHASE_ROADMAP.md
`WORK-4` can be marked complete. With slice A/B already `APPROVED` and this slice C now `APPROVED`,
unit 11 (`docs/PHASE_ROADMAP.md`) should move from `[~]` to complete, subject to whatever other
per-unit conditions the roadmap's completion protocol names beyond the reviewer verdict (not
re-verified here — out of this slice's scope).
