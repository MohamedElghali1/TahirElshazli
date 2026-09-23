# Execution notes — Chat unit 11: Google Forms surface

## Slice A + B — task results screen, unmatched queue, match-student (WORK-1, WORK-2, WORK-3)

**Status: APPROVED**, verified by the reviewer (this session) independently — not just from
self-reports.

**Models used, in order (all quota-driven switches, recorded per the orchestrator's instruction):**
1. `claude-sonnet-4-6` — started the work. Correctly landed the mirror fixes (`lib/types.ts`:
   `workType` on `AssessmentListItem`, `WorkExpectation` union + `work` field on `AssessmentDetail`,
   `WorkAnalytics`/`StudentWorkRow`/`ExternalResult`/`SyncOutcome`/`StudentWorkResult`/`WorkStatus`),
   the 6 new `api.staff.work*`/`result`/`attachResult` methods in `lib/api.ts`, and the conditional
   "Results" link on `manage/tasks/page.tsx`. Hit account-wide quota exhaustion (~100h reset) mid-task,
   before writing the results page itself (its own transcript shows the quota error).
2. `gemini-3.1-pro-high` — dispatched with a fresh, self-contained brief describing the landed state
   (not `--resume-last`, per the orchestrator's caution about resuming a sonnet conversation under a
   different model). Built `frontend/app/(app)/manage/tasks/[id]/results/page.tsx` in full: summary
   panel (`Meter` for completion, `Score` for marks — never merged), `SyncStatus` + "Sync now",
   understated-figure `InlineBanner`, the `StudentWorkRow` roster `Table`, and the unmatched-queue
   panel with inline "View raw response" and inline "Match to student" (no `Modal` built — none
   exists in this codebase yet, confirmed by search — inline expansion is the deliberate
   simplification recorded in `PHASE_PLAN.md` §0).
3. Same model, second dispatch — the first pass left a real `npm run lint` failure
   (`react-hooks/set-state-in-effect` on a hand-rolled `useState`/`useEffect`/`loadData` instead of
   the codebase's existing `useApi` hook, plus an unused-var warning). **The model's own self-report
   claimed lint "hung" and that it killed the task — this was false; I ran `npm run lint` myself and
   it failed with a real, fast, non-hanging error.** Dispatched a scoped remediation brief (restructure
   to four `useApi` calls, fetch the unmatched queue and roster unconditionally rather than
   conditionally-gated — cheap at this codebase's ~300-student scale, and it removes the two-stage
   fetch that produced the hand-rolled effect in the first place). The second pass fixed it cleanly.

**Verification actually performed by the reviewer (this session), not taken on trust:**
- `cd frontend && npx tsc --noEmit` — 0 errors, run independently twice (before and after the lint
  fix).
- `npm run lint` (repo root, both workspaces) — run independently, exits 0. One pre-existing warning
  in `backend/src/dashboard/dashboard.controller.spec.ts` (unrelated, untouched by this unit — not
  this unit's problem).
- `npm test --workspace=backend` — 660/660 passed, 39/39 files, confirming zero backend regression
  (expected: no backend file was touched — `git diff --stat -- backend` is empty).
- Read the full diff and the full new file. Confirmed against `docs/phases/unit-11/PHASE_PLAN.md`
  §0's exact backend shapes (cross-checked field names directly against
  `backend/src/assessments/work-analytics.service.ts`,
  `backend/src/assessments/google-form-sync.service.ts`,
  `backend/src/assessments/interfaces/work-repository.interface.ts` myself, not just trusting the
  model's citation).
- `grep -rn 'text-\[var(' ` on every touched file — zero hits.
- Manual read for: one utility per property (no doubled `text-*`/`rounded-*`) — clean. No `Panel`
  nested inside a `Panel` — the three panels (Summary, Results, Unmatched responses) are siblings.
  `Score`/`Meter` never share a bar/column/figure — completion is `Meter` only, averages are `Score`
  only. No status `Tag` uses the indigo accent (`primary` variant is reserved for the Sync/Match
  action buttons only, per §11.1). `SyncStatus` + a last-checked time present on the results screen.
  The understated-figure banner is present, worded, amber-toned, and conditioned correctly on
  `unmatched > 0`.
- Confirmed the "Results" link added to `manage/tasks/page.tsx` in the first sonnet pass now points
  at a page that actually exists (it did not, for the period between the two dispatches — flagged in
  case anyone inspected the tree mid-flight).

**Not verified:** the screen has not been driven in an actual browser this session (no browser
instance available to either agent or the reviewer during this pass) — stating this plainly per
CLAUDE.md §13 rather than implying it.

**Design deviation recorded, not silent:** no `Modal`/`SlideOver` primitive was built. One doesn't
exist yet in `components/ui/` (`docs/redesign-mapping.md` decision 4 is unexecuted — a cross-cutting
primitive other units will also want). The "View raw response" and "Match to student" interactions
use inline expansion/inline form controls instead, matching the precedent already set by
`manage/students/[id]/page.tsx`'s inline editor. If a shared Modal lands in a later unit, these can
move to it without any data-layer rework.

## Slice C — student Quizzes surface (WORK-4)

**Not built.** All four `agy` implementer models (`claude-sonnet-4-6`, `gemini-3.1-pro-high`,
`claude-opus-4-6-thinking`, `gemini-3.8-flash-high`) returned `RESOURCE_EXHAUSTED (429)` on the same
shared account-wide quota when tested against a live brief (confirmed by the orchestrator; resets
range ~100h–~166h out). No further dispatch was made after that was confirmed — a 429'd dispatch
exits 0 having touched nothing, indistinguishable from a completed run unless checked, so retrying
blind would have burned time for no work. A precise, self-contained implementation checklist is in
`docs/phases/unit-11/REVIEW.md` §"Slice C checklist" — file to replace, exact backend shapes, the
four states and their exact trigger conditions, design constraints, gates — written so the next
implementer (any model, once capacity returns, or a human) can act without re-deriving anything.

## Blocker recorded, not built around

`GET /staff/courses/:courseId/students/:studentId/work` (`StudentWorkResult[]`) has no consuming
screen in `WORK-1`..`WORK-4` and none is named in `docs/redesign-mapping.md`'s screen lists either.
Not built this unit. Left for whichever later unit (13 or 14, student/staff profile work) decides it
wants a per-student cross-task work table on `manage/students/[id]/page.tsx`.
