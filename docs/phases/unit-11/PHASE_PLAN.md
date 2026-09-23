# Phase plan — Chat unit 11: Google Forms surface

Status: planned. Scope `WORK-1` … `WORK-4`. **Frontend only — backend is complete and untouched.**

## 0. What already exists (read, not guessed)

Backend — `backend/src/manage/work-analytics.controller.ts`, `@Controller('staff')`,
`@Roles(...STAFF_ALL)`, gated by `WorkAnalyticsGateService.assertMayRead` (404-not-403 on an
out-of-scope assessment — anti-enumeration already enforced server-side, nothing to add). Seven
routes:

| Route | Returns |
|---|---|
| `GET /staff/assessments/:assessmentId/analytics` | `WorkAnalytics` |
| `GET /staff/assessments/:assessmentId/results` | `StudentWorkRow[]` |
| `GET /staff/assessments/:assessmentId/unmatched` | `ExternalResult[]` |
| `POST /staff/assessments/:assessmentId/sync` | `SyncOutcome` |
| `GET /staff/courses/:courseId/students/:studentId/work` | `StudentWorkResult[]` |
| `GET /staff/results/:resultId` | `ExternalResult` |
| `POST /staff/results/:resultId/attach` | `ExternalResult` (body `{ studentId }`) |

Exact shapes, quoted from `backend/src/assessments/work-analytics.service.ts` and
`backend/src/assessments/google-form-sync.service.ts` and
`backend/src/assessments/interfaces/work-repository.interface.ts`:

```ts
type WorkStatus = 'not_started' | 'submitted' | 'graded' | 'not_available';

interface WorkAnalytics {
  assessmentId: string; title: string; workType: WorkType;
  expected: number; completed: number; notCompleted: number;
  completionRate: number | null;          // 0-100, rounded; null if expected=0
  averageScore: number | null; averageMaxScore: number | null;
  averagePercentage: number | null;       // 0-100, rounded; null unless scores exist
  unmatched: number;                      // >0 ⇒ figures above are UNDERSTATED
  lastSyncedAt: string | null; lastSyncError: string | null;
  collectsEmail: boolean | null;
}

interface StudentWorkRow {
  studentId: string; studentName: string; status: WorkStatus;
  score: number | null; maxScore: number | null; submittedAt: string | null;
}

interface ExternalResult {
  id: string; assessmentId: string; provider: 'google_form'; externalId: string;
  studentId: string | null; respondentId: string | null;
  score: number | null; maxScore: number | null;
  submittedAt: string; raw: unknown; syncedAt: string;
}

interface SyncOutcome { fetched: number; matched: number; unmatched: number; syncedAt: string; }

interface StudentWorkResult {
  assessmentId: string; title: string; workType: WorkType; status: WorkStatus;
  score: number | null; maxScore: number | null; scorePercentage: number | null;
  submittedAt: string | null; hasDetail: boolean;
}
```

`AttachResultDto` body: `{ studentId: string }` (`^[A-Za-z0-9_-]+$`, ≤64 chars).

**Student-facing routes (already exist, already return the fields needed — the frontend mirror is
just stale):**

- `GET /courses/:id/assessments` → `AssessmentListItem[]`, backend interface already has
  `workType: WorkType` (`backend/src/assessments/assessments.service.ts:51`). **Frontend
  `AssessmentListItem` (`lib/types.ts:294`) is missing `workType` — mirror drift, in scope to fix.**
- `GET /assessments/:id` → `AssessmentDetail`, backend already returns a discriminated `work:
  WorkExpectation` field (`assessments.service.ts:100-137`):
  ```ts
  type WorkExpectation =
    | { kind: 'file_upload'; allowedFileTypes: string[]; maxFileSizeBytes: number }
    | { kind: 'link'; url: string }
    | { kind: 'google_form'; formUrl: string; completed: boolean;
        score: number | null; maxScore: number | null; lastSyncedAt: string | null };
  ```
  **Frontend `AssessmentDetail` (`lib/types.ts:337`) has no `work` field at all — this is the
  "runner" data WORK-4 needs, and it is not a backend change, only a mirror fix.**

Primitives that already exist and must be reused, not rebuilt:
- `SyncStatus` (`components/ui/feedback.tsx:290`) — states `ok|syncing|stale|broken`, already
  worded per the copy rule ("Synced 4 min ago" / "Sync failed — results are out of date").
- `Score` / `Meter` (`components/ui/score.tsx`) — `Score` renders an em-dash for `null`, never `0`;
  `Meter` is completion-only. `WorkAnalytics.completionRate` → `Meter`. `averageScore`/
  `averagePercentage` → `Score`. **Never the same bar/column** (§11.1).
- `InlineBanner tone="amber"` (`components/ui/feedback.tsx:81`) — the understated-figure banner.
- `Table`/`TableToolbar`, `Panel`, `Tag`, `EmptyState`, `Loader`, `Button`/`ButtonLink`, `Select`,
  `formatRelative`/`formatDate` (`lib/format.ts`).

No `Modal`/`SlideOver` primitive exists yet (`redesign-mapping.md` decision 4 is not yet executed —
that is a cross-cutting primitive other units also need, not this unit's job to build). **Deliberate
simplification:** the result-detail "View" and the "match student" action are built as inline
row-expansion / inline form controls, the same pattern `manage/students/[id]/page.tsx` already uses
for its editor — not a new modal. `ponytail:` if a later unit lands the shared Modal, these can move
to it; no rework of the data layer required.

## 1. Slices

### Slice A — frontend mirror + task results screen (WORK-1, WORK-3)
Files:
- `frontend/lib/types.ts` — add `workType` to `AssessmentListItem`; add `WorkExpectation` union +
  `work` field to `AssessmentDetail`; add `WorkAnalytics`, `StudentWorkRow`, `ExternalResult`,
  `SyncOutcome`, `StudentWorkResult`, `WorkStatus` (mirror of the backend interfaces above, verbatim
  field names).
- `frontend/lib/api.ts` — add `api.staff.workAnalytics(token, assessmentId)`,
  `api.staff.workResults(token, assessmentId)`, `api.staff.workUnmatched(token, assessmentId)`,
  `api.staff.workSync(token, assessmentId)`, `api.staff.result(token, resultId)`,
  `api.staff.attachResult(token, resultId, studentId)`. (`studentWork` deferred — see §3 below.)
- `frontend/app/(app)/manage/tasks/[id]/results/page.tsx` — **new**. Only rendered when the task's
  `workType === 'google_form'` (a `file_upload`/`link` task has no analytics to show; link from the
  task list/edit page is conditional on this). Layout: `PageTitle` with back to the task, a summary
  `Panel` (title/workType, `expected`/`completed`/`notCompleted` as plain numbers, `completionRate`
  as `Meter`, `averageScore`/`averagePercentage` as `Score`), `SyncStatus` + a "Sync now" `Button`
  calling `workSync` and reloading, the understated-figure `InlineBanner` when `unmatched > 0`
  ("N responses could not be attributed — every completion figure above is understated." — exact
  wording per `PRODUCT_SPEC.md` §2.5), then the `StudentWorkRow[]` roster in a `Table` (Score column
  using `Score`, status as a `Tag`, em-dash for `null` throughout).
- `frontend/app/(app)/manage/tasks/page.tsx` — add a "Results" row action/link to
  `/manage/tasks/:id/results`, shown only for `t.workType === 'google_form'`.

### Slice B — unmatched queue + match-student (WORK-2)
Same page (`results/page.tsx`) or a second `Panel` on it — a section titled "Unmatched responses",
listing `ExternalResult[]` from `workUnmatched`, each row: `respondentId` (the email Google gave),
`submittedAt`, `score`/`maxScore`, a "View" disclosure (expands to show `raw` — rendered as a plain
key/value list, not literal JSON dump, since `raw` is `unknown` provider payload) and a "Match to
student" inline `Select` (options from `api.staff.roster(token, courseId)`, using the task's
`courseId`) + `Button` calling `attachResult`, removing the row from the queue and reloading the
roster/analytics on success (a match changes counts). Empty state when the queue is empty — no
banner needed at zero.

### Slice C — Student Quizzes surface (WORK-4)
Files:
- `frontend/app/(app)/quizzes/page.tsx` — **replace the placeholder.** Course-scoped like
  `homework/page.tsx` (reuse `CourseGate`/`useSelectedCourse`). Lists `api.assessments.list(token,
  courseId)` filtered client-side to `item.workType === 'google_form'` (no new backend filter — the
  DTO has no `workType` query param and a ~20-task list does not need one, per §1's scale). Four
  states per the design's featured-quiz states, read off `AssessmentStatus`/`WorkExpectation.kind
  === 'google_form'`: **not started** (`status === 'available'`, no submission) → primary CTA "Open
  quiz" linking `formUrl` in a new tab (`target="_blank" rel="noreferrer"` — it leaves the app, per
  §5.8's boundary: no in-platform submission of form work); **being marked** (`completed === true`,
  `score === null`) → `SyncStatus` only, no score; **completed / graded** (`score !== null`) →
  `Score value={score} of={maxScore}` plus `SyncStatus` with `lastSyncedAt`; **locked**
  (`status === 'locked'`) → same locked treatment `homework/page.tsx` already uses (inert, no link).
  Reuses `Panel`/`EmptyState`/`Tag` patterns from `homework/page.tsx` rather than inventing new
  layout.
- `frontend/app/(app)/homework/page.tsx` — **no change required.** It already filters to `type`
  (homework/assignment/quiz as an `AssessmentType`), which is a different axis from `workType`; a
  `quiz`-type task delivered as a `file_upload` still belongs on Homework. Confirmed no overlap to
  resolve: `AssessmentType` (what it's for) and `WorkType` (how it's delivered) are independent per
  `PRODUCT_SPEC.md` §2.1's own note.

## 2. Design requirements checklist (CLAUDE.md §11, verified during review, not just during build)
- No `text-[var(--x)]` anywhere new.
- One `text-*`/`rounded-*` per class string.
- No card inside a card — `Panel` only, no nested `Panel`.
- Console 13px scale; no marketing typography.
- `Score` for marks, `Meter` for completion — never merged, never the same table column.
- Status colour never indigo; indigo is the "Sync now" / "Open quiz" primary action only.
- Missing mark → em-dash via `Score`, never a literal `0` anywhere new.
- `SyncStatus` + "last checked" wording on the results screen, the unmatched queue, and the student
  Quizzes screen — all three, per `PHASE_ROADMAP.md`'s explicit care note.
- Understated-figure banner present and worded, amber not red.
- Both themes (tokens only, no new literals) and RTL sanity on the new table/queue layout (no
  transform/position CSS to get wrong here — plain flex/grid — so a read is enough, no browser
  check strictly required, but the executor should still sanity-check `dir="rtl"` if convenient).

## 3. Blockers / findings — recorded, not built around silently

1. **`GET /staff/courses/:courseId/students/:studentId/work` (`StudentWorkResult[]`) has no named
   task and no consuming screen in scope.** It doesn't fit WORK-1..4 as written, and
   `docs/redesign-mapping.md`'s "Maps cleanly" / "Designed, but no backend" lists don't mention a
   per-student work table either. Not built this unit — recorded here rather than guessed into the
   student detail page. If wanted, it's a small addition to `manage/students/[id]/page.tsx` and can
   be its own follow-up task.
2. **No `Modal`/`SlideOver` primitive exists** (`redesign-mapping.md` decision 4, unexecuted). Slice
   B's "match student" and "view raw response" are built inline instead (see §0). Not a blocker —
   a documented simplification.
3. **`lib/types.ts` mirror drift found and fixed as part of this unit** (`AssessmentListItem`
   missing `workType`, `AssessmentDetail` missing `work`) — both are pre-existing gaps in fields the
   backend already returns on routes this unit's own screens call, not scope creep.

## 4. Tests

Frontend has no component test runner wired into these screens' precedent (`homework/page.tsx`,
`manage/students/[id]/page.tsx` carry none) — consistent with `CLAUDE.md` §10's frontend row
("Typecheck and lint clean; integrated against the real API"). Definition of done for this unit:
- `cd frontend && npx tsc --noEmit` → 0.
- `npm run lint` (frontend eslint + backend oxlint) clean.
- `npm test --workspace=backend` still green (proves nothing backend broke, since nothing backend
  should have changed).
- Manual/browser verification of the three new-or-changed screens is unverified unless actually
  driven in a browser during review — say so plainly if it wasn't.

## 5. Definition of done for this unit
- Slices A, B, C built against the exact shapes in §0.
- Blockers in §3 recorded in this file and reported, not silently resolved.
- `docs/IMPLEMENTATION_PLAN.md` WORK-1..4 statuses updated.
- `docs/PHASE_ROADMAP.md` unit 11 status updated.
- `docs/CHANGELOG.md` entry for the mirror-drift fix and the no-Modal decision.
- `project_log.md` entry.
