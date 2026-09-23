# Review — Chat unit 11: Google Forms surface

## Slice A + B (WORK-1, WORK-2, WORK-3): APPROVED

Scope: frontend mirror fixes (`lib/types.ts`, `lib/api.ts`) + the task results screen
(`frontend/app/(app)/manage/tasks/[id]/results/page.tsx`) + the "Results" link on
`manage/tasks/page.tsx`.

### Verification performed directly by this reviewer (not taken from any self-report)

| Check | Result |
|---|---|
| `cd frontend && npx tsc --noEmit` | 0 errors. Run independently, twice. |
| `npm run lint` (repo root) | Exit 0. One pre-existing, unrelated warning in `backend/src/dashboard/dashboard.controller.spec.ts` — not touched by this unit, not this unit's problem. |
| `npm test --workspace=backend` | 660/660 passed, 39/39 files. Confirms zero backend regression — expected, since `git diff --stat -- backend` is empty; no backend file was touched at any point in this unit. |
| Field-name cross-check | Every new type in `lib/types.ts` (`WorkAnalytics`, `StudentWorkRow`, `ExternalResult`, `SyncOutcome`, `StudentWorkResult`, `WorkStatus`, `WorkExpectation`) checked directly against `backend/src/assessments/work-analytics.service.ts`, `backend/src/assessments/google-form-sync.service.ts`, `backend/src/assessments/interfaces/work-repository.interface.ts`, `backend/src/assessments/assessments.service.ts` — exact match, no invented fields. |
| `grep -rn 'text-\[var('` on every touched file | Zero hits. |
| One utility per property | Read every class string in the new file — clean. |
| No `Panel` nested in a `Panel` | The three panels (Summary, Results, Unmatched responses) are siblings in a flex column. |
| `Score`/`Meter` never merged | Completion (`analytics.completionRate`) renders only via `Meter`; marks (`averageScore`/`averagePercentage`, per-row `score`/`maxScore`) render only via `Score`. Never the same bar/column. |
| Status colour never the accent | The `WORK_STATUS` tone map uses gray/amber/green only; `variant="primary"` (indigo) is reserved for the "Sync now" and "Match" action buttons, never a status `Tag`. |
| `SyncStatus` + last-checked | Present on the results screen, fed by `analytics.lastSyncedAt` via `formatRelative`. |
| Understated-figure banner | Present, `InlineBanner tone="amber"`, correctly conditioned on `analytics.unmatched > 0`, worded per `PRODUCT_SPEC.md` §2.5's own example phrasing. |
| No `Modal` built | Confirmed — no modal/dialog file exists anywhere under `frontend/components/`. "View raw response" and "Match to student" are inline, matching the precedent in `manage/students/[id]/page.tsx`. Recorded as a deliberate, non-blocking simplification in `PHASE_PLAN.md` §0. |
| Results link resolves | `manage/tasks/page.tsx` links to `/manage/tasks/${t.id}/results`; `manage/tasks/[id]/results/page.tsx` exists on disk. No dead link. |
| The `react-hooks/set-state-in-effect` failure a first pass shipped | Confirmed gone. The file now uses four `useApi` calls (`analyticsQuery`/`resultsQuery`/`unmatchedQuery`/`rosterQuery`) — no hand-rolled `useState`/`useEffect`/`loadData` remains (`grep -n "useEffect" results/page.tsx` returns nothing). |

### Finding, not a defect: a self-report was false
The implementer's own report on the first lint-fix attempt claimed `npm run lint` "hung
indefinitely" and that it "killed the task". This reviewer ran `npm run lint` directly and it
completed normally with a real, fast, non-hanging failure. The **second** dispatch (same model, a
scoped remediation brief) did fix the actual error. Recorded here per "trust but verify" — the
verdict above rests on this reviewer's own run, not on either self-report.

### Unverified
Never driven in an actual browser this session — no browser instance was available to either the
implementer or this reviewer. Stated plainly rather than implied otherwise (CLAUDE.md §13).

### Minor, non-blocking observation (not a design-rule violation, not gating APPROVED)
`handleSync`'s `catch` block calls `handleReload()` but surfaces no visible error to the user if the
sync POST itself fails at the network/HTTP layer (as opposed to a Google-side failure the backend
already captures in `lastSyncError`, which correctly surfaces via `SyncStatus`'s `'broken'` state).
A transport-level sync failure is currently silent beyond the loader disappearing. Not required by
any requirement in `PHASE_ROADMAP.md`'s unit-11 care note or `PRODUCT_SPEC.md` §2.5, so not filed as
a blocker — noted for whoever next touches this file.

**Verdict: APPROVED.**

## Slice C (WORK-4, student Quizzes surface): NOT BUILT — implementer capacity exhausted

Every available `agy` model (`claude-sonnet-4-6`, `gemini-3.1-pro-high`,
`claude-opus-4-6-thinking`, `gemini-3.8-flash-high`) is returning `RESOURCE_EXHAUSTED (429)` on a
shared account-wide quota (confirmed by the orchestrator testing all four against the same brief;
resets range ~100h–~166h out). No further dispatch will do work — it will exit 0 having touched
nothing, indistinguishable from a completed run unless `touchedFiles`/stderr is checked. This
reviewer was told to stop dispatching and did.

This unit is **`[~]` incomplete** — `PHASE_ROADMAP.md`'s completion protocol requires all of
`WORK-1`..`WORK-4` before the unit can close, and `WORK-4` has no code. See §"Slice C checklist"
below for exactly what the next implementer (once capacity returns, on any model, or a human) needs
— written so it can be acted on without re-deriving anything from this session.

---

## Slice C checklist — student Quizzes surface (WORK-4), ready to execute

**File to replace:** `frontend/app/(app)/quizzes/page.tsx` (currently a placeholder `EmptyState` —
its own comment already says it's waiting on this work).

**Do not touch:** `backend/`, `frontend/app/(app)/homework/page.tsx` (confirmed no change needed —
it filters by `AssessmentType`, a different axis from `WorkType`; a quiz-type task delivered as a
`file_upload` still belongs there unchanged), `manage/tasks/[id]/results/page.tsx` (a different
slice, already APPROVED — do not re-touch).

**Mirror types already landed in `lib/types.ts` (verify present, don't recreate):**
- `AssessmentListItem.workType: WorkType`
- `AssessmentDetail.work: WorkExpectation`, where:
  ```ts
  type WorkExpectation =
    | { kind: 'file_upload'; allowedFileTypes: string[]; maxFileSizeBytes: number }
    | { kind: 'link'; url: string }
    | { kind: 'google_form'; formUrl: string; completed: boolean;
        score: number | null; maxScore: number | null; lastSyncedAt: string | null };
  ```

**Build steps:**
1. Model the page on `frontend/app/(app)/homework/page.tsx`: same `CourseGate`/`useSelectedCourse`
   course-scoping, same `Panel`/grouping/`Loader`/`EmptyState`+retry conventions.
2. Fetch `api.assessments.list(token, courseId)` and filter client-side to `item.workType ===
   'google_form'`. No backend filter param exists and none is needed at this scale (~20 tasks/course,
   CLAUDE.md §1).
3. The list route does not return `work: WorkExpectation` (only `AssessmentDetail` does). For each
   quiz-type item, fetch `api.assessments.get(token, item.id)` to get its `work` field — acceptable
   N+1 at this scale (a handful of quizzes per course, not hundreds); do not build a batch endpoint
   for this.
4. Render four states, driven entirely by `AssessmentStatus` + `WorkExpectation`:
   - **Not started / available, not yet answered**: `status === 'available' && work.kind ===
     'google_form' && !work.completed` → primary `ButtonLink`/`<a>` to `work.formUrl`,
     `target="_blank" rel="noreferrer"`. This leaves the app deliberately — no first-party quiz
     engine, no iframe embed, no answer-capture UI (`CLAUDE.md` §5.8 boundary,
     `docs/PRODUCT_SPEC.md` §6).
   - **Being marked**: `work.completed === true && work.score === null` → `SyncStatus` only (state
     `'ok'`, fed by `formatRelative(work.lastSyncedAt)`), sentence-case copy like "Submitted —
     waiting on Google to mark it". Do NOT render `Score` with a `null` value here — that renders an
     em-dash, which would misleadingly read as "marked, nothing earned" instead of "not marked yet".
   - **Completed / graded**: `work.score !== null` → `Score value={work.score} of={work.maxScore}`
     plus `SyncStatus` with `lastSynced={formatRelative(work.lastSyncedAt)}` when non-null. Required:
     this is mirrored data, must carry the sync stamp (`PHASE_ROADMAP.md`'s unit-11 care note).
   - **Locked**: `status === 'locked'` → the same inert treatment `homework/page.tsx`'s
     `AssessmentRow` already uses for locked items (not a link, `opacity-60`, `aria-disabled`). Don't
     invent a fifth state.
5. Empty state: no quiz-type work on the course → reuse `homework/page.tsx`'s empty-list icon/style,
   with copy about quizzes appearing as they're set.
6. Design constraints (checked strictly, this codebase has shipped these bugs before): no
   `text-[var(--x)]` anywhere; one utility per property; no `Panel` nested in a `Panel`; console
   13px scale only; `Score`'s own em-dash for a missing mark, never a literal `0` or a hand-written
   `'—'`; status colour never the indigo accent (indigo reserved for "Open quiz").
7. Gates: `cd frontend && npx tsc --noEmit` must stay 0; `npm run lint` must stay clean.

This checklist plus `docs/phases/unit-11/PHASE_PLAN.md`'s §"Slice C" is everything needed to build
it without re-deriving anything from this session.
