# Execution notes: unit 7, Marking and the mark book

**Executor:** the coordinator, working directly (the user asked for the pipeline without the agent
harness, 2026-09-23). **Branch:** `redesign`. **Range:** `6657c7a..c86f511`, plus the documentation
commit that carries this file. Local, not pushed.

**Read this first. No real student submission can be marked up yet, in any environment.** Mark-up
works only on a file the platform stores (`D-41`). No student route can store one while `MARK-6` is
open (`B-1`/`B-2`, escalated), and production stores nothing until an R2 driver exists (`MARK-F1`).
The marking surface, image and PDF, was proven against a **manufactured** fixture: a submission
whose `file_url` was set directly in a throwaway database to a file uploaded through the staff route.
The unit tests and e2e place such files through the repository for the same reason.

---

## 1. How the work was done

1. **Planning.** The `redesign-planner` agent wrote `PHASE_PLAN.md`. The coordinator then did its own
   read-only pass, spot-checked the plan's §0 findings against the code, and added **Revision 1**:
   rulings, the withdrawal of `D-38`/`D-39`, and revised scope.
2. **Prior work kept and verified.** A `redesign-executor` agent had been started and was stopped
   when the user changed approach. It had committed `9add020..22de559` (7a–7f, with 7o folded into
   7e) and left uncommitted 7j/7l edits. The user chose to keep them. What was checked, not taken on
   trust:
   - `SubmissionAccessService.loadInScope`: scope first, one exported 404 body, fail-closed on a
     missing scope row.
   - `MarkingService`: order of checks (scope 404 → ownership 404/403 → state), each write in one
     transaction with its audit entry, no second audit on a re-return, `before` copies not aliases.
   - Driver parity: `findMembersForGroups` ordered by `(assigned_at, id)` in both; the in-memory
     annotation repository returns copies.
   - The five student reads: grepped `assessments.service.ts`, `reports/`, `dashboard/`,
     `students/` — the only `correctedAt` reads left are the resubmission freeze (A-2) and the field
     itself.
   - The e2e coverage the plan names: present, including an `it.each` over all four annotation
     routes for both scoped assistants and the moved `TASK-F3` assertion.
3. **Implementation** of what remained, slice by slice, then the documentation.
4. **Review** as a separate pass afterwards (`REVIEW_7.md`).

## 2. Commits

| Commit | Slice | What |
|---|---|---|
| `9add020` | 7a | `TASK-F3` 409; `TASK-F4` integration for `tallyResults`, `countResultsByAssessments`, `findResultsForStudent`, `findResults` (agent) |
| `c53b63d` | 7b | Migration `019`, annotation repository (both drivers), `returned_at`, seeds (agent; its `MARK-6` part later removed) |
| `8871cb6` | 7c | Return route, one visibility predicate across five reads (agent) |
| `212b334` | 7d | Per-task queue with non-submitters (agent) |
| `2878dff` | 7e + 7o | Four annotation routes, `D-42` rules (agent) |
| `22de559` | 7f | The student's returned copy carries its marks (agent) |
| `220f838` | — | **`MARK-6` taken out**; plan Revision 1 |
| `7f53c1e` | 7j + 7l | `/grade` and the course queue at the group grain (`D-44`); the first mark claims (`D-43`) |
| `e46c5ea` | 7g + 7m + 7n | Mark book, CSV, average of marked work (`D-45`), Google Form columns (`D-46`) |
| `c86f511` | 7h + 7k | Frontend: per-task list, marking view, returned copy, mark book, course tab, tasks list; `pdfjs-dist` (`D-40`) |

## 3. Scope delivered

Built: `MARK-1`…`MARK-5`, `BOOK-1`…`BOOK-3`, `TASK-F3`, `TASK-F4` (narrowed). Slices 7a–7h and 7j–7o.
**Not built: 7i (`MARK-6`)** — blocked on `B-1`/`B-2`, escalated. Nothing of it remains in the code.

## 4. Deviations from the plan, and why

1. **`MARK-6` removed after being built.** The agent executor folded `D-38`/`D-39` into `019` (a
   `files JSONB` column on submissions and revisions) and into both drivers, the service, the API spec
   and the frontend types. The user then withdrew those rulings. Everything was reverted in
   `220f838`; `createSubmission`/`updateSubmission` are back to their `6657c7a` signatures. `019` had
   run only on disposable test databases, so it was edited in place, as the plan allows.
2. **`D-43` claims on the first annotation too**, not only the first grade — the ruling says "first
   grade or annotation write"; the agent's in-progress code covered only grading. One definition
   (`GradingService.claimIfUnmarked`), called from both paths.
3. **A new repository method, `WorkRepository.findLatestScoresForStudents`** (both drivers, integration
   test). The plan said `postgres-work.repository.ts` takes tests, not SQL. `D-46` needs a roster-wide
   read, and the only existing one is per student (a fan-out of ~30 queries per screen, `CLAUDE.md`
   §1). Existing SQL is unchanged; the method is additive with a named test.
4. **`submissionStatusOf` moved** from `manage/marking.service.ts` to `assessments/assessments.service.ts`
   (beside `isReturnedToStudent`), re-exported from marking, so the mark book and the queue share it.
5. **CORP handled in the frontend, not in `main.ts`.** Risk 2 was confirmed with `curl -I`: every API
   response, `/uploads/*` included, carries `Cross-Origin-Resource-Policy: same-origin`. The plan's
   fallback was to relax helmet for `/uploads`. Instead the marking screens fetch the file through CORS
   (not subject to CORP; the allow-list names the web origin — `Access-Control-Allow-Origin` was
   confirmed on an upload) and draw from a `blob:` URL. No security header changed.
6. **pdf.js has no `isEvalSupported` in v6.** The plan named that flag; the eval font path it guarded
   was removed upstream in v5. Pinned at 6.3.289. The worker is created with
   `new Worker(new URL(…, import.meta.url))`, the form Next's Turbopack guide says it bundles.
7. **No new glyphs.** The plan suggested adding Eraser/Highlight/Download to the generated
   `icon-data.ts`. The toolbar uses labelled buttons with existing glyphs instead; nothing to "tell
   the team".
8. **Course grading tab: the "Late" tag turned amber** while adding the returned state to that row —
   red is reserved for failure (`CLAUDE.md` §11.1), and the new screens use amber for late.
9. **`GET /staff/courses/{courseId}/submissions` added to `API_SPEC.yaml`.** It was never in the spec;
   its behaviour changed here, so it is now specified.

## 5. Decisions and interpretations to check

- **`D-45` × `D-46`:** the average covers platform-marked work only (`GROUP-4`'s arithmetic, as `D-45`
  says), so Google Form scores are shown but not averaged. The screen and the CSV say so. If quizzes
  belong inside the average, that is a new ruling.
- **`D-43` partial reach:** an assistant who reaches only some of a task's groups saves the mark but
  does not claim — the claim never writes a marker `D-32` would refuse.
- **Mark ink:** pen violet, highlight amber wash, tick green, cross red text. A design point.
- **The handoff was not reachable**; the screens follow `PRODUCT_SPEC` §2.2/§2.3 and the kit.

## 6. Findings, recorded not fixed

- `MARK-F1` — an R2 storage driver (`D-41`).
- `MARK-F2` — `WorkAnalyticsService.forStudent` shows a student's **oldest** form response on Postgres
  and the newest in memory (`findResultsForStudent` orders `DESC` in SQL, by insertion in memory; a
  `Map` keeps the last). Pre-existing; the mark book does not share it.
- `MARK-F3` — `GROUP-4`'s `assessmentCount` counts hidden tasks.
- `MARK-F4` — CORP likely blocks other `<img src={mediaSrc(...)}>` uses of uploaded files; needs a
  browser check.
- Pre-existing lint **warning** (not error): unused `EXTERNAL_WORK_BINDER` import in
  `dashboard.controller.spec.ts`, present at `6657c7a`. Not touched.

## 7. Verification — real output (2026-09-23, after `c86f511`)

```
node v26.8.1
redesign
c86f511
== unit
 Test Files  43 passed (43)
      Tests  735 passed (735)
== e2e
 Test Files  4 passed (4)
      Tests  330 passed (330)
== integration (fresh db)
0                                   <- public tables in tahirelshazli_test immediately before the run
[MigrationRunner] Applied 019_submission_annotations_and_return.sql
 Test Files  1 passed (1)
      Tests  173 passed (173)       <- no "skipped" line: 0 skipped
PostgreSQL 15.19 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
== schema_migrations
019_submission_annotations_and_return.sql|2026-09-23 20:59:05.896105+00
== tsc
tsc exit 0
== lint
lint exit 0
```

Baseline at `6657c7a`: 660 unit / 39 files, 297 e2e, 146 integration / 0 skipped, `tsc` 0. No test was
deleted or skipped. Two integration cases the agent added for the `MARK-6` file set were removed with
`MARK-6` itself (they tested code that no longer exists).

**The `019` backfill on a populated database** is an integration case (`returns every existing mark, and leaves unmarked work unreturned`): it applies
001–018 to a fresh database, inserts a marked and an unmarked submission, applies `019`, and asserts
`returned_at = corrected_at` for the marked row and `NULL` for the other. It ran in the 173.

**Rule greps** — no output from either:
```
grep -rnE "text-\[var\(" <marks, tasks, components/marking, homework, courses/[id]/grading>
grep -rn "dangerouslySetInnerHTML" frontend/components/marking frontend/app/(app)/manage frontend/app/(app)/homework
```

**Dependency:** `npm audit --workspace=frontend` → `found 0 vulnerabilities` after adding `pdfjs-dist`.

## 8. Browser pass — PENDING

A stack for it is running from a scratch build (API on `:3101`, Postgres database `tahir_browser`,
web on `:3100`), with a manufactured image submission and a two-page PDF submission for student-1 on
two new group-1 tasks. It stopped at sign-in: entering a password into the sign-in form is something
the coordinator does not do, so **the user signs in**. Checks to make, and not yet made:

1. Teacher: `/manage/tasks` → a task's Submissions → non-submitters listed; group figures not summed.
2. Marking view, image: tick, cross, comment, pen, highlight land where drawn; eraser removes only
   one's own; a reload keeps every mark.
3. Marking view, PDF: both pages render; marks stay on their page.
4. Save, then Save and return; the student page says "Your teacher is marking this", then shows the
   mark, the feedback and the marked paper.
5. `dir="rtl"` and `ليلى فهمي`: marks land on the same spot of the paper; the mark book's sticky
   column pins to the right.
6. `/manage/marks`: em-dash for no mark; CSV opens in a spreadsheet with Arabic and `—` intact.
7. Both themes.

## 9. Documents updated

`IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `CHANGELOG.md`, `API_SPEC.yaml`, `API_GAP_ANALYSIS.md`,
`DATABASE_PLAN.md`, `DOMAIN_MODEL.md`, `PRODUCT_SPEC.md`, `AUTHORIZATION_MODEL.md`, `SECURITY.md`,
`ARCHITECTURE.md`, `redesign-mapping.md`, `project_log.md`, `CLAUDE.md` (§3 count, §4.1 counts and the
stale "unit 6 awaiting review", §7 scope callers and `AUTH-6`, §9 migrations through `019`).
