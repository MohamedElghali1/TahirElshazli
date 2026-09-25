# Review — unit 13, STU-1 (commit 02a0ca7)

**VERDICT: APPROVED**

## Scope reviewed

Commit `02a0ca7` on `redesign`, diffed against `d95a509` (the handoff commit). Files: `backend/src/dashboard/{dashboard.service,dashboard.module,dashboard.controller.spec,student-home.service}.ts`, `backend/src/live-sessions/{live-sessions.module,student-sessions.service}.ts`, `backend/src/recordings/recordings.service.ts`, `backend/test/{app.e2e-spec.ts,drift/mirror-drift.check.ts}`, `frontend/app/(app)/{dashboard,marks}/page.tsx`, `frontend/lib/types.ts`, `docs/{API_SPEC.yaml,IMPLEMENTATION_PLAN.md,PHASE_ROADMAP.md,CHANGELOG.md,PRODUCT_SPEC.md}`, `project_log.md`. Also read `docs/phases/unit-13/HANDOFF.md` and `CLAUDE.md` in full.

Suites actually executed on this tree (not trusted from the commit message):
- `npm test --workspace=backend` → **804 passed, 48 files** (confirmed).
- `npm run test:e2e --workspace=backend` → **404 passed, 5 files**, each file printed its own `N passed` summary via `run-e2e.mjs` (confirmed).
- `npm run lint` → 0 errors; the same 4 pre-existing oxlint warnings (`announcements.controller.spec.ts:132`, `dashboard.controller.spec.ts:19`, `postgres-announcement.repository.ts:130`, `upload-types.ts:81`) — none touch this change (confirmed).
- `frontend: npx tsc --noEmit` → 0 (confirmed).
- `backend: npx tsc --noEmit -p tsconfig.json` → 0 (confirmed).
- `npm run typecheck:drift` → clean (confirmed).

Did not re-run `npm run test:integration` (needs `TEST_DATABASE_URL`; no schema/migration touched by this commit, and none was added — verified `ls backend/src/database/migrations` still ends at `026`).

## Did this move toward the NEW product?

Yes, on the two questions that matter for `[CHANGED]` requirement `STU-1`:

1. **"No mark anywhere on this page."** Verified the mark left every path, not just the render. `overallReportPercentage` is gone from `DashboardStats` (`dashboard.service.ts`), `deriveStats` dropped its third parameter and both call sites (`getDashboard`, `entryFor`) stopped calling `ReportsService.getPerformanceFor`; `ReportsModule` is no longer imported by `DashboardModule`, and `ReportsService` is no longer injected into either `DashboardService` or `StudentHomeService`. Grepped the Overview file (`dashboard/page.tsx`) for `overallReportPercentage`/`scorePercentage`/`formatPercent`: the only survivors are a comment explaining the removal (line 650) and a comment noting the field is deliberately not read (line 180) — the corrected-task row prints a fixed `'Result ready'` string, and the "Marks" quick-access card is gone outright, replaced by the Timetable card's attendance count. No route back to a grade on this screen.
2. **D-55 / D-56 implemented faithfully.** Attendance appears once, at the student grain, with its denominator (`${attendance.present} of ${attendance.expected} attended`, em-dash-equivalent `null` when `expected === 0`) — matches D-55. The three action cards are Recordings/Work/Timetable, Marks demoted to the rail only — matches D-56. Neither ruling was relitigated; both were checked as-implemented, not as-decided.
3. **D-54 (retired-axis heuristic deletion)** removed character-for-character from both `dashboard/page.tsx`'s `CourseCard` and `marks/page.tsx`'s `ProgressSummary` — confirmed by reading both diffs; the replacement logic (`hasLessons`, completion-only, em-dash when no lessons published) is identical reasoning in both files.

## Findings

None that block. Two observations, both non-blocking:

1. **Confidence: confirmed, severity: none (informational).** Untracked junk files `0\`` , `backend/r.id`, `r.id` sit in the working tree (`git status --porcelain`) — the exact shell-quoting-accident pattern §3.5 of the handoff warned about, one of which got committed in a prior unit's merge. They are **not** part of commit `02a0ca7` (confirmed via `git show --stat`), so they do not affect this verdict, but they should be deleted before the next commit touches this tree.
2. **`CourseWatchState.resume` ordering** (`recordings.service.ts`, `getWatchState`): picks the first `watchedSeconds > 0 && !completed`, else the first `!completed`, in `findByCourse`'s array order (course/`order` order per the file's own `ponytail:` comment, not recency). The handoff asked this be checked in both repository drivers — confirmed both `InMemoryRecordingRepository` and `PostgresRecordingRepository`'s `findByCourse` order by the same `recordings.order` column/field in both drivers (not a per-driver divergence), so the resume pick is deterministic and consistent across drivers. The known limitation (no recency ordering) is disclosed inline with an upgrade path, per Ponytail convention — not a defect.

## Definition of Done (`PHASE_ROADMAP.md` §"Phase completion protocol", as applied by the handoff's §6)

1. `STU-1` built, with both §2.1 defects ruled on rather than inherited — **holds**. Both defects (mark leak, retired-axis heuristic) are gone from the code, not just flagged.
2. Every gate green, no test deleted or weakened — **holds**. `it(`/`test(` counts in `dashboard.controller.spec.ts` went from N to N+1 (one renamed, one added); `app.e2e-spec.ts` went from N to N+2 (one strengthened in place, two added). No deletions found in either file's diff.
3. `IMPLEMENTATION_PLAN.md` `STU-1` → `[x]`, `PHASE_ROADMAP.md` unit 13 → `[x]` — **holds** (both confirmed by grep).
4. `CHANGELOG.md` entries `D-53`…`D-56`, `F13-7` — **holds**, all present with reasoning.
5. `API_SPEC.yaml` updated for `/dashboard`'s new shape, drift proven — **holds**. The spec's `stats` schema correctly omits `overallReportPercentage` and documents `continueWatching`/`attendance`; `mirror-drift.check.ts` gained three new `Check_StudentAttendance*` pins plus the implicit re-check of `DashboardStats`/`StudentHomeEntry`/`StudentHomeResponse`, and `npm run typecheck:drift` is clean.
6. `project_log.md` entry — **holds** (confirmed, `~line 4252`).
7. Reviewer verdict `APPROVED` — this document.

All applicable points hold. No security, authorization, or requirements finding stands.

## Verified claims (handoff §1 and commit message)

- 804 unit / 48 files, 404 e2e / 5 files, lint 0 errors / 4 pre-existing warnings, both `tsc --noEmit` 0, drift clean — **all re-run and matched exactly**.
- "One performance read per enrolled course" removed from the home endpoint — confirmed: `entryFor`'s `Promise.all` dropped `this.reportsService.getPerformanceFor(...)`, one call site per course.
- `StudentSessionsService.getAttendanceSummary(studentId)` can only ever be the caller's own — confirmed. Its only caller is `StudentHomeService.getHome(studentId)` (`student-home.service.ts:101`), whose only caller is `StudentHomeController.getHome`, which passes `req.user.sub` and takes no id parameter at all (`student-home.controller.ts:27-31`) — structurally, there is no id in the request that could name somebody else, matching the file's own doc comment about `POST /courses/:id/enroll`.
- `collect()` refactor did not change `getAttendance`'s output — confirmed by reading the diff: `present`/`late`/`absent`/`expected`/`percentage` computation is moved verbatim into the private `collect()`, and `getAttendance` reassembles `{ ...summary, history }` from the same `expectedSessions`/`markBySession` it always used. `getAttendance`'s own spec (`student-sessions.service.spec.ts`) was not touched by this commit, and it still passed.
- `getWatchState` is one read, not two — confirmed: a single `findByCourse` call, filtered/found twice in memory.
- No migration needed/added — confirmed, `026` remains the last migration.

## Remediation checklist

None required for approval. Housekeeping only: delete the untracked `0\``, `backend/r.id`, `r.id` files before the next commit (not part of this change; flagged for hygiene per the handoff's own recurring warning).

## Open decisions

None raised by this commit that are mine to surface — D-53 through D-56 were all closed by ruling in this same commit, not left open.

## Follow-ups

None generated by this review. Unit 13 is complete; the phase's own exit criteria (`docs/PHASE_ROADMAP.md`) should be checked by the coordinator against the full unit-13 scope (`STU-2`…`STU-7`, `SITE-1`…`SITE-5`) which this review did not re-verify — those were already `[x]` before this commit and are outside `STU-1`'s diff.
