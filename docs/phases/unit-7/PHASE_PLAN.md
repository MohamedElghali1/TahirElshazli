# Phase plan: unit 7, Marking and the mark book

**Planner:** `redesign-planner` · **Date:** 2026-09-23 · **Branch:** `redesign` · **Base:** `6657c7a`
(working tree clean: `git status --porcelain` printed 0 lines).

**Input read:**
- `CLAUDE.md` in full.
- `PHASE_ROADMAP.md` §1–§3, §5, §6, and units 6 and 7.
- `IMPLEMENTATION_PLAN.md`: the Definition of Done, Phases 7–9 (`TASK-*`, `MARK-1`…`MARK-6`, `BOOK-1`…`BOOK-3`), `TASK-F1`…`TASK-F4`, the Decisions table (`D-2`), and Verification.
- `PRODUCT_SPEC.md` in full.
- `DOMAIN_MODEL.md` §4, §8 and §9.
- `DATABASE_PLAN.md` §2, §3, §5 and §7.
- `API_SPEC.yaml`: the header conventions, the enums, the tasks and marking schemas, and every path from `/courses/{courseId}/assessments` to `/staff/groups/{groupId}/markbook`.
- `API_GAP_ANALYSIS.md` A4, A7, A8, B4 and B5.
- `AUTHORIZATION_MODEL.md` §3, §4, §6 and §7.
- `SECURITY.md` §2.4, §2.5 and §3.
- `ARCHITECTURE.md` §2 and §6.
- `redesign-mapping.md`: the component map, the IA and coverage.
- `CHANGELOG.md`: `D-2`, `D-28`…`D-37`, the unit-6 assumptions, and the `R1-1` clarification.
- `docs/phases/unit-6/`: `PHASE_PLAN.md`, `EXECUTION_NOTES.md` (rulings and gate procedure), and `REVIEW.md` (out-of-scope and follow-ups).

**Code read:**
- `manage/grading.service.ts` and `manage/dto/grade-submission.dto.ts` in full.
- `assessments/assessments.service.ts` in full.
- `assessments/interfaces/assessment-repository.interface.ts` in full.
- `postgres-assessment.repository.ts`: `gradeSubmission` and the student-read column lists.
- `manage/assessment-authoring.service.ts`: `loadInScope`, `remove`, and the imports.
- `staff/staff-scope.service.ts`: every public method.
- `groups/groups.service.ts`: `requireGroup` and `report`.
- `groups/interfaces/group-repository.interface.ts`.
- `reports/reports.service.ts`: the `getPerformanceEntries` consumers.
- `manage/work-analytics-gate.service.ts`: `studentWork`.
- `common/storage/*` and `common/config/env.ts`: `resolveStorageDriver`.
- `main.ts`: helmet, CORS, and static `/uploads`.
- `common/validators/is-public-http-url.validator.ts`.
- `assessments/dto/submit-assessment.dto.ts`.
- `audit/interfaces/audit-log-repository.interface.ts`: the union and the target types.
- `audit/dto/list-audit-log-query.dto.ts`.
- Migrations `001` (`assessment_submissions`, `submission_revisions`), `002` (the audit columns) and `018` (the header).
- Seeds `001` (the submissions) and `003` (groups and memberships).
- `test/postgres-repositories.integration-spec.ts`: setup, the `describe` list, and the `migration 015` pattern.
- `test/staff.e2e-spec.ts:1045` (the `TASK-F3` assertion).

**Frontend read:**
- `package.json` and `next.config.ts`.
- `components/ui/index.ts`, `score.tsx`, `table.tsx`, and `icon-data.ts` (the glyph list).
- `components/shell/console-shell.tsx` (the nav).
- `app/(app)/manage/courses/[id]/grading/page.tsx` and `app/(app)/manage/tasks/[id]/page.tsx`.
- `app/(app)/homework/[assessmentId]/page.tsx`: the submit form and the marking block.
- `lib/api.ts` and `lib/types.ts`: grading.
- `lib/format.ts`: `formatPercent`.
- `frontend/AGENTS.md`: Next 16 is not the Next.js of training data, so read `node_modules/next/dist/docs/` before writing a route.

**Ground truth re-established by the planner:**
- `node -v` is **v26.8.1**, not the project's 24.
- `npm test --workspace=backend`: **660 passed, 39 files.**
- `ls backend/src/database/migrations/`: the last migration is `018_task_drafts_and_task_settings.sql`, so this unit's migration is **`019`**.

The coordinator's figures for e2e (297), integration (146, 0 skipped, PG 15.19, container
`tahir-unit7-pg`) and frontend `tsc` (0) are taken as given, not re-run.

**Not read, and why:** the Claude Design handoff (project `59f824fd`) is not in this repository and
not reachable from here. The `MarkingView` and mark-book screens must be built against it by whoever
has access. Where no one does, build to `PRODUCT_SPEC.md` §2.2/§2.3 and the constraints in §4
*Frontend*, and record which source was used in `EXECUTION_NOTES.md`.

---

## 0. Headline

**Where the work splits:** annotations, save versus return, the per-task queue with non-submitters,
the student's read of a returned copy, and the mark-book grid and CSV are all fully specified and
executable. **The submission modes (`MARK-6`) are not.** Every question that decides them invents
business behaviour, so they are escalated as `B-1` and `B-2`. Seven further questions, `B-3`…`B-9`,
are scoped out the same way. Each gated slice is specified under its recommended reading, so it can
run once its question is answered.

**The finding that matters most: in-platform annotation cannot work end to end yet, in any
environment. It can only draw over a file the platform itself serves. No such submission can be
created today.** Three facts, each checked:

1. **A student cannot upload a file.**
   - `POST /staff/uploads` is `@Roles(...STAFF_ALL)` (`uploads.controller.ts:43-44`).
   - A student submission is a pasted `fileUrl`, validated by `@IsPublicHttpUrl()`
     (`submit-assessment.dto.ts:13`), which refuses loopback.
   - So even in development a submission cannot point at a local `/uploads/…` file
     (`local-disk-storage.service.ts:51` mints relative `/uploads/<uuid>.<ext>`).
   - The student page says so itself: *"Uploads are a URL field for now: the R2 signed-upload flow
     does not exist yet"* (`homework/[assessmentId]/page.tsx:159-161`).
2. **Production stores nothing.**
   - `resolveStorageDriver` defaults to `none` in production and refuses `local` there
     (`common/config/env.ts:355-377`).
   - **No R2 driver exists.** `r2` is "the value this grows to" (`env.ts:349`).
3. **A pasted third-party URL cannot be drawn over safely.**
   - A PDF needs its bytes, and most hosts refuse a cross-origin fetch.
   - A proxy through the API is an SSRF surface (`CLAUDE.md` §8).
   - An arbitrary image URL auto-loaded into staff browsers leaks their IPs to a host the student
     chose (`B-4`).

So the marking view is built and tested against a **manufactured** development fixture (§4,
*Frontend*, browser pass). It becomes real for students only when `B-1`/`B-2` (a student upload
path) land. In production it additionally needs `B-4`: a storage driver the client has not
provisioned.

**Other findings the documents do not record. Each is cited in §3 or §4.**
1. **`correctedAt` is today's student-visibility switch, in five places.** Returning must move all
   five to `returnedAt` at once, or a saved mark leaks:
   - `computeStatus` (`assessments.service.ts:230`);
   - the detail's `score` (`:441`);
   - `feedback` and `annotatedFileUrl` (`:443-444`, **unconditional today**);
   - `getPerformanceEntries` (`:559`), which feeds the student Marks summary
     (`reports.service.ts:159`), the dashboard (`dashboard.service.ts:113`) and student home
     (`student-home.service.ts:111`);
   - `answersAvailable` (`dashboard.service.ts:44`).
2. **The seeds regress silently.** Fixtures `sub-1`, `sub-3`…`sub-6` are corrected
   (`seeds/001_development_fixtures.sql:176-182`). Migrations run **before** seeds
   (`integration-spec.ts:89-90`), so `019`'s backfill never sees them. Without a seed edit, student-1
   loses every mark on screen, and no test would notice.
3. **`POST /staff/submissions/:id/grade` is course-grained** (`grading.service.ts:194`,
   `assertAssigned(assessment.courseId)`). It is **not on `AUTH-6`'s remainder list**
   (`AUTHORIZATION_MODEL.md` §4, `CLAUDE.md` §7). It is an unlisted course door, and this unit
   changes that route's response (`B-7`).
4. **"Claim on open" cannot happen on a `GET`.** `D-32` hands "whoever opens it first" to unit 7.
   `CLAUDE.md` §6 says `GET` never mutates (`B-6`).
5. **The `/manage/marks` nav item 404s today** (`console-shell.tsx:95`, no page). This is the same
   finding unit 6 made for `/manage/tasks`.
6. **`helmet()` runs with defaults** (`main.ts:48`), so `Cross-Origin-Resource-Policy: same-origin`
   is on every API response, `/uploads/*` included.
   - The web app (`:3000`) and the API (`:3001`) are different origins.
   - A no-cors `<img>` of an API-served file may therefore be blocked by the browser.
   - **Unverified: no browser was run.** This is Risk 2, with a first-hour check.
7. **Postgres `NUMERIC` arrives in node-pg as a string.** `DATABASE_PLAN.md` §3 specifies
   `x_percent NUMERIC(5,2)`, so the repository must parse, or the memory and Postgres drivers
   disagree on type.
8. **`GROUP-4`'s `assessmentCount` includes hidden tasks.**
   - `report` calls `findByCourseForGroups` without `isVisibleToStudents` (`groups.service.ts:507`).
   - Pre-existing. A hidden task has no submissions (`D-28`), so only the count is inflated.
   - **Out of scope.** Filed as a follow-up (§8, *Follow-ups to file*).
9. **The icon set has no `Eraser`, `Highlight` or `Download` glyph** (`icon-data.ts`, 115 names).
   The handoff's readme allows adding a Tabler glyph at matching weight, provided "the team" is told.

---

## 1. Scope

**IN:**
- `MARK-1`…`MARK-4` and `BOOK-1`…`BOOK-3`, per the roadmap.
- **`MARK-5`: not blocked.** `D-2` closed on 2026-09-20 as a rendered overlay (`CHANGELOG.md:472`,
  `PHASE_ROADMAP.md` §6). The unit-7 line *"Blocked within scope `MARK-5` — decision `D-2`"* is
  stale, and correcting it is an executor doc update (§7).
- **`MARK-6`, moved here from unit 6** (`IMPLEMENTATION_PLAN.md:293`). Gated by `B-1`/`B-2`.
- **`TASK-F3`**: included. It is the same `remove` method this unit's reads touch, it is a one-line
  status change plus one moved e2e test, and unit 6's review named unit 7 as its home.
- **`TASK-F4`, partially**: `PostgresWorkRepository.tallyResults` and `countResultsByAssessments`
  only.
  - `tallyResults` guards the `remove` path `TASK-F3` edits (`D-36`), and it has never run against
    real Postgres.
  - `countResultsByAssessments` feeds the student read this unit re-gates (`assessments.service.ts:363`).
  - `findResultsForStudent` joins them only if `B-9` puts form results into the mark book.
  - `PostgresGoogleCredentialRepository` stays **out**: nothing in unit 7 touches it. `TASK-F4`
    stays open, narrowed.

**Executable now:**

| Slice | Tasks | Content |
|---|---|---|
| 7a | `TASK-F3`, `TASK-F4` (part) | 400 → 409 on delete-with-submissions; Postgres integration for `tallyResults` and `countResultsByAssessments` |
| 7b | `MARK-1`/`MARK-2` plumbing | Migration `019`; `SubmissionAnnotationRepository` (**both drivers**); `returned_at` in both assessment drivers; `GroupRepository.findMembersForGroups` (both); seeds; integration |
| 7c | `MARK-2` | `POST /staff/submissions/:id/return`, one student-visibility predicate across all five reads, `submission.returned` audit, the group-grain submission loader |
| 7d | `MARK-3` | `GET /staff/assessments/:id/submissions`, including non-submitters, at the group grain |
| 7e | `MARK-1` | The four annotation routes, `submission.annotated` audit, and interim fail-closed rules pending `B-5` |
| 7f | `MARK-5` (backend) | `GET /assessments/:id` carries the annotations of a **returned** submission only, minimised |
| 7g | `BOOK-1`, `BOOK-3` | `GET /staff/groups/:id/markbook` and `…/markbook.csv`: in-platform work columns, no total column (pending `B-8`/`B-9`) |
| 7h | `MARK-3`, `MARK-4`, `MARK-5` (frontend), `BOOK-2` | Per-task submissions screen, marking view (images; pins and strokes; eraser), student returned-copy view, `/manage/marks` with CSV, returned state on the course grading tab, activity labels |

**Gated. Each is specified in §4 and becomes executable when its blocker closes:**

| Slice | Task | Gate |
|---|---|---|
| 7i | `MARK-6`: mode enforcement, student upload, multi-file | `B-1`, `B-2` |
| 7j | Group grain on `/grade` and the course queue; Return on the course grading tab | `B-7` |
| 7k | PDF pages in the marking view and the student view | `B-3` |
| 7l | Marker semantics and claim | `B-6` |
| 7m | Mark-book total column | `B-8` |
| 7n | Mark-book Google Form columns | `B-9` |
| 7o | Relaxing the interim annotation rules | `B-5` |

`B-4` gates no slice. Its recommended reading is the interim behaviour, the only one that adds no
surface. What it decides is whether this unit's marking is *production-real*, which is a statement
the executor must make honestly in `EXECUTION_NOTES.md` either way.

**OUT, and why:**

| Item | Reason |
|---|---|
| `F5-1`: 114 broken `text-[var(--fs-*)]` classes on marketing and auth pages | Coordinator instruction. Awaits a `--fs-h3` ruling. New screens must not add to it. |
| `AUTH-6` remainder (roster, the analytics pair, the per-course assessment list, `PATCH`/`DELETE` of a shared task) | Not touched by any unit-7 route. `/grade` and the course queue are raised as `B-7` precisely because this unit touches them. |
| `TASK-F1` (admin cannot name the teacher as marker) | Accepted by the user for now. `B-6` does not depend on it. |
| `TASK-F2` (retire the course assessments page) | Unit 7 does not touch that page. |
| `includeInReport` | See assumption A-5. No reader exists until unit 9 (`RPT-2`). A column with no reader and a toggle with no effect is a mock presented as working (DoD 9). |
| An R2 storage driver | New infrastructure against a client subscription (`CLAUDE.md` §1). Raised in `B-4`. Filed as a new task if the user wants it, not built here. |
| A flattened PDF download of the marked copy | Additive and out of scope (`D-2`, user brief). |
| Notifying a student when work is returned | Not in any document. Teacher notification preferences are unit 12. |
| `GROUP-4` hidden-task count (finding 8) | Pre-existing, unrelated route. Filed as a follow-up. |

---

## 2. Entry criteria: verified

| Criterion | Evidence |
|---|---|
| Branch is `redesign`, and `git status` has been inspected | `git rev-parse --abbrev-ref HEAD` gives `redesign`. HEAD is `6657c7a`. The porcelain output is 0 lines. |
| Unit 6 (the only dependency) is `[x]` | `PHASE_ROADMAP.md:440`: "Chat unit 6 … `[x]` **`COMPLETE` 2026-09-22**". `REVIEW.md` recorded `APPROVED` after re-check 2. |
| No open blocker in `IMPLEMENTATION_PLAN.md` gates an in-scope task | §Decisions: "all closed" (`D-2` closed 2026-09-20). `MARK-*`/`BOOK-*` are `[ ]`, none `[!]`. The nine blockers in §8 are **new**, and each is scoped out below. |
| Backend suite green at start | `npm test`: **660/660, 39 files**, re-run by the planner. e2e 297 and integration 146/0 skipped are the coordinator's figures. |
| Migrations 001–018 verified on real PostgreSQL | `CLAUDE.md` §9 and `unit-6/EXECUTION_NOTES.md:318,648`: from an empty schema on `postgres:15-alpine` 15.19. `019` is authored on a verified base. |

**Environment caveats to record in `EXECUTION_NOTES.md`, not to hide:**
- Node is v26.8.1, not 24.
- The handoff is unreachable from this environment.
- The browser pass needs a **manufactured** platform-stored submission, because no route can create
  one (§0).

---

## 3. Reconciliation

| Question | Finding, with citation |
|---|---|
| **Remains unchanged: do not touch** | See the list below this table. |
| **Changed** | See the list below this table. |
| **Removed** | Nothing is `[REMOVED]` in `PRODUCT_SPEC` §2.2/§2.3. `annotatedFileUrl` (the teacher-supplied copy URL, `grade-submission.dto.ts:36-39`) is **kept**: superseded in practice by the overlay, but no document retires it, and `sub-1` carries one. |
| **New** | `SubmissionAnnotation` (table, both drivers, four routes). The per-task queue (`API_GAP_ANALYSIS.md` B4 `[MISSING]`). The return route (B4 `[MISSING]`). The mark book and its CSV (B5 `[MISSING]` ×2). A marking-view frontend (`redesign-mapping.md` "Designed, but no backend": MarkingView). |
| **Missing APIs** | `GET /staff/assessments/:id/submissions` · `GET`/`POST /staff/submissions/:id/annotations` · `PATCH`/`DELETE /staff/submissions/:id/annotations/:aid` · `POST /staff/submissions/:id/return` · `GET /staff/groups/:id/markbook` · `GET /staff/groups/:id/markbook.csv`. The last is named in `API_GAP_ANALYSIS.md` B5 but **absent from `API_SPEC.yaml`**. |
| **APIs to modify** | See the list below this table. |
| **Obsolete APIs** | None retired. `GET /staff/courses/:id/submissions` stays: the course grading tab is its sole consumer (`manage/courses/[id]/grading/page.tsx:45`). |
| **Domain changes** | `AssessmentSubmission` gains `returnedAt`. `SubmissionAnnotation` is new and **wider than `DOMAIN_MODEL.md` §4 says**: a `fileUrl` anchor, the kinds `pen` and `highlight`, a `path` of stroke points, and `updatedAt` (`D-2`). `includeInReport` is deferred (A-5). |
| **Database changes** | Migration **`019`**. Additive DDL, plus **one data backfill** (`returned_at := corrected_at`, A-1). No destructive step. See §4, *Database*. |
| **Authorization changes** | See the list below this table. |
| **Security implications** | See §4, *Security*. |
| **Frontend/backend dependencies** | 7h needs 7c–7g merged. The PDF half of the marking view needs `B-3`. Real student files need `B-1`/`B-2`. The course-tab Return button needs `B-7`. No control may post a field the API does not accept: `forbidNonWhitelisted` is off (`SECURITY.md` §6), so a drop would be silent. |
| **Architectural risks** | See the list below this table. |
| **Migration risks** | See the list below this table. |
| **Testing requirements** | See §4, *Tests*. |
| **Unresolved product decisions** | `B-1`…`B-9` (§8). |

**Remains unchanged.** The executor must not touch:
- The student submit rules: the `file_upload`-only gate (`assessments.service.ts:471-479`), the
  window, "one of `fileUrl`/`answerText`", the `allowResubmission` 409, and the freeze once
  corrected (`:511-515`). **This holds until 7i.**
- `gradeSubmission`'s write semantics (`postgres-assessment.repository.ts:662-670`): score,
  feedback, `COALESCE` on `annotated_file_url`, and `corrected_at = now()`.
- Work analytics (A8 `[KEEP]` ×7).
- The authoring service beyond `TASK-F3`.
- `StaffScopeService`: **no new method.** Its contract spec stays untouched, and the grain is built
  from `reachableGroupIds` and `mayReachGroup`.
- `/staff/uploads`.

**Changed** (`PRODUCT_SPEC` §2.2 `[CHANGED]`):
- **Old:** a mark is visible the moment it is saved (`correctedAt`).
- **New:** saved (`correctedAt`) and returned (`returnedAt`) are two states. The student sees the
  score, feedback, annotated URL, annotations and `corrected` status only after return.
- **Old:** the queue lists only submissions (`grading.service.ts:100`).
- **New:** a per-task queue lists every targeted student, submitted or not.

**APIs to modify:**
- `POST /staff/submissions/:id/grade`: the response gains `returnedAt`. **Additive.** Its grain is
  `B-7`.
- `GET /staff/courses/:id/submissions`: each item gains `returnedAt`. **Additive.**
- `GET /assessments/:id` (student):
  - `submission` gains `returnedAt` and `annotations`;
  - `score`, `feedback` and `annotatedFileUrl` become null until return.
  - **This is a behaviour change, not a shape break.** `lib/types.ts` gains fields and loses none.
- `DELETE /staff/assessments/:id`: 400 → **409** for submissions (`TASK-F3`). **Breaking** for
  anything branching on 400. The only consumer found is the e2e test at `staff.e2e-spec.ts:1045`.

**Authorization changes:**
- **Submission-named routes get a group-grain gate** (`D-23`): return, and the annotations ×4.
  `/grade` joins them under `B-7`.
- **The task-named queue is group grain.**
- **The group-named mark book uses the existing `requireGroup`** (`D-10`).
- **A student reads annotations** only on their own submission, and only after `returnedAt`.
- **Two new refusal classes:**
  - annotating someone else's annotation → **403** (interim, `B-5`);
  - returning an unmarked submission → **409**.

**Architectural risks:**
- **No new pattern, no new port, no fourth `@Global()`.** The work follows these patterns:
  - pattern 2.1 (driver-selected persistence) for one new repository;
  - 2.2/2.3 (ambient transaction, audit as mechanism) for two new actions;
  - 2.4 (scope chokepoint) through existing methods;
  - 2.5 (honest degradation) for unannotatable files.
- **One placement refinement:** the annotation **repository** lives in `assessments/`, beside the
  submission aggregate, with its token exported. The **service** lives in `manage/`.
  - `ARCHITECTURE.md` §6 puts "Annotations" in `manage/`.
  - But `AssessmentsModule` must read annotations for the student route, and `manage/` "provides no
    repositories of its own" (`assessments.module.ts` exports comment, `CLAUDE.md` §7.1: a
    re-provided token builds a second in-memory store).
  - Recorded as A-13.

**Migration risks:**
- **The backfill is the only data write.** It rewrites nothing that exists; it fills a new column.
- A wrong predicate would either hide existing marks from students (too narrow) or mark unsaved work
  returned. The CHECK `returned_at IS NULL OR corrected_at IS NOT NULL` makes the second impossible.
- **The backfill never runs under the integration suite**, because seeds follow migrations. It needs
  a one-off populated-database run (§6, step 7b.4).

---

## 4. Changes by layer

### Database: migration `019_submission_annotations_and_return.sql`

**Additive, plus one backfill. Not destructive.** Follow `018`'s form:
- a header citing `MARK-1`/`MARK-2` and the `DATABASE_PLAN.md` rows;
- one comment per constraint giving its reason;
- the deviations from `DATABASE_PLAN.md` §3 listed in the header, with `D-2` as their authority.

```sql
-- 1. Save is not return (MARK-2). NULL = not returned.
ALTER TABLE assessment_submissions ADD COLUMN returned_at TIMESTAMPTZ(3);

-- A-1: every mark that exists today is already visible to its student, because
-- correctedAt was the visibility switch. Preserve exactly that; hide nothing retroactively.
UPDATE assessment_submissions SET returned_at = corrected_at WHERE corrected_at IS NOT NULL;

-- A paper cannot be returned without a mark on it (A-3). Re-grading after return
-- moves corrected_at past returned_at, so no ordering is asserted.
ALTER TABLE assessment_submissions
  ADD CONSTRAINT assessment_submissions_returned_needs_mark
  CHECK (returned_at IS NULL OR corrected_at IS NOT NULL);

-- 2. Annotations as DATA (D-2). Never a flattened file.
CREATE TABLE submission_annotations (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assessment_submissions (id) ON DELETE CASCADE,
  -- Which file the mark was drawn on (A-11). Survives resubmission and multi-file.
  file_url      TEXT NOT NULL CHECK (length(file_url) BETWEEN 1 AND 2048),
  page          INTEGER NOT NULL CHECK (page BETWEEN 1 AND 500),
  kind          TEXT NOT NULL CHECK (kind IN ('comment','tick','cross','pen','highlight')),
  x_percent     NUMERIC(5,2) NOT NULL CHECK (x_percent BETWEEN 0 AND 100),
  y_percent     NUMERIC(5,2) NOT NULL CHECK (y_percent BETWEEN 0 AND 100),
  text          TEXT NOT NULL DEFAULT '' CHECK (length(text) <= 2000),
  -- Freehand strokes: [[x%,y%], ...]. Present exactly for pen/highlight.
  path          JSONB CHECK (path IS NULL OR (jsonb_typeof(path) = 'array'
                              AND jsonb_array_length(path) BETWEEN 2 AND 2000)),
  CONSTRAINT submission_annotations_path_iff_stroke
    CHECK ((kind IN ('pen','highlight')) = (path IS NOT NULL)),
  CONSTRAINT submission_annotations_comment_has_text
    CHECK (kind <> 'comment' OR length(btrim(text)) > 0),
  created_by    TEXT NOT NULL REFERENCES users (id),   -- RESTRICT, as 017/018
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX submission_annotations_submission_id_page_idx
  ON submission_annotations (submission_id, page);
```

**Deliberately not in `019`:**
- `include_in_report` (A-5).
- Any multi-file column or table (`B-2`).

If `B-1`/`B-2` are ruled **before `019` first runs anywhere**, their DDL is folded in, as unit 6 did
with `018`. Otherwise it becomes `020`, and `DATABASE_PLAN.md` §7 is renumbered again.

**Refusing bad data:**
- The two CHECKs refuse an incoherent stroke or comment.
- The FK `CASCADE` removes annotations with their submission. Submissions themselves are never
  deleted by the product: delete is refused once submitted.
- `RESTRICT` on `created_by` refuses deleting a staff user who marked. `D-26` makes remove
  invitation-only, so no current path deletes such a user.

### Repositories: every new table costs two implementations

**New: `SubmissionAnnotationRepository`** (`assessments/interfaces/submission-annotation-repository.interface.ts`)
- **Both drivers:** `InMemorySubmissionAnnotationRepository` **and**
  `PostgresSubmissionAnnotationRepository`, wired through `repositoryProvider` in
  `AssessmentsModule`, token exported.
- Methods:
  - `findBySubmission(submissionId): Promise<StoredAnnotation[]>` — ordered `(page, created_at, id)`;
  - `findById(annotationId): Promise<StoredAnnotation | null>`;
  - `create(input): Promise<StoredAnnotation>` — `id`, `createdAt` and `updatedAt` are the
    repository's to assign;
  - `update(annotationId, patch): Promise<StoredAnnotation | null>`;
  - `remove(annotationId): Promise<boolean>`;
  - `countBySubmission(submissionId): Promise<number>` — for the A-11 cap.
- **The in-memory `findById` returns a copy** (`CLAUDE.md` §9): it feeds the audit `before`, and
  aliasing shipped twice.
- **The Postgres driver parses `x_percent` and `y_percent` with `Number(...)`** (finding 7). An
  integration test asserts `typeof === 'number'`.
- **`path` round-trips as `number[][]`**, asserted in the integration spec.

**Changed: `AssessmentRepository`**, in both drivers:
- `StoredSubmission` gains `returnedAt: string | null`.
- Add it to `SUBMISSION_COLUMNS`, and to **every** submission read. Grep both drivers for each
  `SubmissionRow` mapping. This repeats unit 6's Risk 2 (column lists kept separately).
- New `returnSubmission(submissionId): Promise<StoredSubmission | null>`:
  - Postgres: `UPDATE … SET returned_at = COALESCE(returned_at, now()), updated_at = now() WHERE id = $1 AND corrected_at IS NOT NULL RETURNING …`;
  - null when absent or unmarked; the service tells these apart by reading first;
  - the memory driver mirrors it and returns a copy.
- `gradeSubmission` **does not touch `returned_at`** (A-4).
- The in-memory fixtures for `sub-1`, `sub-3`…`sub-6` gain `returnedAt = correctedAt`, matching
  the seed edit.

**Changed: `GroupRepository`**, in both drivers (`GroupDataModule`):
- New `findMembersForGroups(groupIds): Promise<GroupMembership[]>`: one query, `WHERE group_id = ANY($1)`.
- It replaces a per-group `findMembers` loop in the queue. The loop is bounded by targets (≤ 10),
  but `CLAUDE.md` §1 still counts it as a daily-screen fan-out.

**Seeds** (`001_development_fixtures.sql:176`): add `returned_at` to the column list, equal to
`corrected_at` for the five corrected rows and `NULL` for `sub-2`. **`D-5` (regenerate) is the
authority.**

**TASK-F4 (7a):** no repository code changes. Only integration coverage is added.

### Services: business rules, transactions and audit (patterns 2.2, 2.3 and 2.4)

**One grain helper, used by every submission-named route** (in `manage/marking.service.ts`,
exported):
- `SUBMISSION_NOT_FOUND = 'Submission not found'`, one exported `const`. It **equals** the
  existing literal at `grading.service.ts:181`, so the grade route's body is unchanged either way.
- `loadSubmissionInScope(submissionId, actor)`:
  1. Read the submission and its assessment. Either missing → 404 `SUBMISSION_NOT_FOUND`.
  2. `reach = scope.reachableGroupIds(actor)`. `null` (admin or `all_groups`) → allowed.
  3. Otherwise:
     - `targets = assessmentRepo.findTargets(assessmentId)`;
     - `studentGroups = groupRepo.findStudentGroups(studentId, courseId)`;
     - allowed iff some group is in **all three** sets.
     - If not → 404 `SUBMISSION_NOT_FOUND`, identical to a genuine miss.
  - A missing scope row gives `[]` and refuses (fail closed, inherited).
  - A student who left every held group after submitting is unreachable to a scoped assistant and
    still reachable to the teacher. Stated, not a bug.

**`MarkingService.returnSubmission(id, actor)`** (7c), inside `runInTransaction`:
1. Load via `loadSubmissionInScope`.
2. `correctedAt === null` → **409** `Enter a mark before returning this work.`
3. Already returned → **200** with the current state. **No second audit entry**, and `returnedAt`
   is unchanged (A-3).
4. Otherwise `returnSubmission`, then `audit.record`:
   - action `submission.returned`, target `assessment_submission`/`submissionId`;
   - `courseId`;
   - `before: { returnedAt: null }`, `after: { returnedAt, score }`.
5. Return the `GradingQueueItem` shape, which gains `returnedAt`.

**The student-visibility predicate** (7c), in `assessments.service.ts` beside `isVisibleToStudents`:
- `export function isReturnedToStudent(s: { returnedAt: string | null }): boolean`.
- **One predicate, five reads:**

| Read | Location | Change |
|---|---|---|
| `computeStatus` | `:230` | `corrected` iff returned. A saved-not-returned paper stays `submitted`. |
| detail `score` | `:441` | Null unless returned. |
| detail `feedback` and `annotatedFileUrl` | `:443-444` | Null unless returned. **Today they are unconditional**, so feedback shows even before a mark. |
| `toListItem` `score` | `:275` | Unless returned. |
| `getPerformanceEntries` `score` | `:559` | Unless returned. Feeds the Marks summary, the dashboard and student home. |

- `answersAvailable` follows automatically, because it counts `status === 'corrected'`.
- `canSubmit` **stays keyed on `correctedAt`**, the existing freeze (A-2). The UI copy explains it.

**`MarkingService.queue(assessmentId, actor)`** (7d), no transaction (read-only):
1. `assessment = findById`. Missing → 404 `ASSESSMENT_NOT_FOUND` (the unit-6 `const`).
2. `reach = reachableGroupIds(actor)`;
   `targets = findTargetsForAssessments([id], reach)`, narrowed **in the query** (existing method).
   Empty for a scoped caller → 404 `ASSESSMENT_NOT_FOUND`, byte-identical.
3. `workType !== 'file_upload'` → **409** `This task is not handed in here. Its results are on the task's results page.` (A-6).
4. Read the members of the reachable targeted groups (`findMembersForGroups`), the submissions
   (`findSubmissionsForAssessments([id])`, then filtered to those members), the users
   (`findByIds`) and the group names (`groupRepo.findByIds`).
5. **One row per student**, even if they sit in two reachable targeted groups:
   - `groupId`/`groupName`: their earliest placement among the reachable targeted groups (A-7);
   - `submissionId | null`;
   - `status: 'not_submitted' | 'submitted' | 'marked' | 'returned'`, derived:
     - no row → `not_submitted`;
     - `correctedAt` null → `submitted`;
     - `returnedAt` null → `marked`;
     - else `returned`;
   - `isLate`: `lastSubmittedAt > effective dueAt`;
   - `isOverdue`: no submission and `now > effective dueAt`;
   - the effective `dueAt` comes from the target override of the **student's own** resolving group:
     their earliest placement among **all** targeted groups, the tie-break `findByIdForGroups` uses
     (`assessment-repository.interface.ts:281-284`), so staff and student agree on a deadline;
   - `fileUrl`, `answerText`, `lastSubmittedAt`, `score`, `feedback`, `correctedAt`, `returnedAt`;
   - `fileAnnotatable`: server-derived, `isPlatformStored(fileUrl)`, a new helper in
     `common/storage/upload-types.ts`, true iff the URL starts with `UPLOAD_URL_PREFIX`;
   - `annotationCount` (current file only) and `staleAnnotationCount` (annotations anchored to a
     file this submission no longer carries, `B-5`(c)). One `findBySubmission` per **submitted** row
     is a fan-out; instead add `countBySubmissions(ids)` to the annotation repository (**both
     drivers**), returning `{ current, stale }` per id.
6. **`groups[]`:** per reachable targeted group, `{ groupId, groupName, memberCount, notSubmitted, submitted, marked, returned }`.
   Each is a fact about **that group**, identical for every viewer who can see it, so `D-23`'s
   viewer-dependent-denominator trap does not arise. **There is no cross-group total** in the
   response.
7. Rows are ordered by `groupName`, then `studentName`, with `localeCompare` (Arabic-safe).

**`MarkingService` annotations** (7e). Every write runs in `runInTransaction`, loads through
`loadSubmissionInScope`, and audits as `submission.annotated`:
- **`list(submissionId, actor)`:** everything on the submission, each with `createdByName`, resolved
  in one `findByIds` batch.
- **`create`:**
  - `fileUrl !== submission.fileUrl` → **400** `That file is not part of this submission.`
  - `!isPlatformStored(fileUrl)` → **400** `This file is not stored by the platform and cannot be marked up here. Grade it with a mark and feedback.`
  - `returnedAt !== null` → **409** (interim `B-5`(b)).
  - `countBySubmission ≥ 500` → **400** (A-11).
  - Otherwise create. Audit `before: null`, `after: { annotationId, kind, page }`.
- **`update(sid, aid)`:**
  - The annotation is missing, **or its `submissionId !== sid`** → **404** `ANNOTATION_NOT_FOUND = 'Annotation not found'`.
  - `createdBy !== actor.id` → **403** (interim `B-5`(a)). **403, not 404**: the annotation is drawn
    on the caller's own screen.
  - Returned → **409**.
  - `kind` is **not patchable**. Changing a tick into a stroke is delete-and-create; the DTO omits it.
  - Coherence is re-checked against the stored kind. For example, `path` on a `comment` → 400.
  - Audit `before` is a copy.
- **`remove(sid, aid)`:** the same 404, 403 and 409 as `update`, then a hard delete (annotations are
  not history-bearing, `D-2`: "editable and deletable"). Audit `after: null`.
  **This is the eraser.** The UI calls it per stroke touched; there is no server-side hit-testing.

**`GroupsService.markbook(groupId, actor)`** (7g), beside `report`, which reuses the private
`requireGroup`:
1. `requireGroup` → 404 `GROUP_NOT_FOUND` for unreachable or missing (`D-10`, unchanged).
2. **Tasks:**
   - `findByCourseForGroups(courseId, [groupId])`, windows resolved for this group;
   - `.filter(isVisibleToStudents)` (A-8);
   - ordered `dueAt` ascending, then `id`;
   - interim `B-9`: keep `workType === 'file_upload'`, and return `omittedTasks: { id, title, workType }[]`
     for the rest, so the screen can say what it is not showing.
3. **Members:** `findMembers`, then `findByIds` users, ordered by name with `localeCompare`.
4. **Submissions:** `findSubmissionsForAssessments`, filtered to the members.
5. **Cells:** `{ score: number | null, status }`, same status derivation as the queue.
   - `score` is set iff `correctedAt` is set. Staff see a saved mark, flagged `marked`, not yet
     returned (A-8).
   - **A missing mark is `null`, never `0`.**
6. **No total column** (interim `B-8`).
7. **Performance only:** no completion figure anywhere in the response (`CLAUDE.md` §11.1, rule 2).

**`toMarkbookCsv(markbook): string`** (7g), a pure function in `groups/markbook-csv.ts`:
- Starts with a UTF-8 BOM (`﻿`) so Excel reads Arabic names and the em-dash.
- RFC 4180: CRLF line ends; a field containing `"` `,` CR or LF is quoted, with `"` doubled.
- **Formula-injection neutralisation:** any field whose first character is `=` `+` `-` `@` TAB or
  CR is prefixed with `'` before quoting. This applies to student names (**student-supplied at
  registration**) and task titles alike. Scores are non-negative integers, so they never trigger it.
- Header row: `Student`, then `<title> (/<maxScore>)` per task (A-9).
- Missing mark: `—` (U+2014). Never `0`, never empty.

**`TASK-F3` (7a):** `assessment-authoring.service.ts:939`, `BadRequestException` →
`ConflictException`, message unchanged. `D-36`'s own 409 is right below it, so the two refusals now
agree.

**Audited actions: every one costs three things.** The table below enumerates each.

| Action | 1. Backend union (`audit-log-repository.interface.ts`) | 2. `Record<AuditAction, true>` (`list-audit-log-query.dto.ts`) | 3. Spec asserting the entry |
|---|---|---|---|
| `submission.returned` | add | add (compile error otherwise) | `marking.service.spec.ts`: one entry with before and after on first return, **none** on a re-return; e2e: the activity log shows it with the actor |
| `submission.annotated` | add | add | spec: create, update and delete each write one entry; `before` on update is **not** the post-update object (aliasing); e2e: the entry is present |

The frontend mirror also moves in the same commit:
- `frontend/lib/types.ts` `AuditAction`;
- `manage/activity/page.tsx` `ACTION_LABEL` and `ACTION_TONE`, both `Record<AuditAction, …>`.
  They fail `tsc` if missed, which is the point.

The target type stays `assessment_submission` for both actions (A-12), so no new `AuditTargetType`
is needed.

### Authorization: role gates, scope and 404-versus-403, per route

| Route | Role gate | Scope | Out-of-scope or missing | Other refusals |
|---|---|---|---|---|
| `GET /staff/assessments/:id/submissions` | `STAFF_ALL` (class) | group grain: reachable targets, narrowed in SQL | 404 `ASSESSMENT_NOT_FOUND`, identical | 409 non-`file_upload` |
| `GET /staff/submissions/:sid/annotations` | `STAFF_ALL` | `loadSubmissionInScope` | 404 `SUBMISSION_NOT_FOUND`, identical | — |
| `POST /staff/submissions/:sid/annotations` | `STAFF_ALL` | same | 404, identical | 400 file mismatch, not stored, or cap; 409 returned |
| `PATCH …/annotations/:aid` | `STAFF_ALL` | same, then annotation ∈ submission | 404 `SUBMISSION_NOT_FOUND`, or 404 `ANNOTATION_NOT_FOUND` for wrong or missing `aid` | **403 not the author** (interim); 409 returned |
| `DELETE …/annotations/:aid` | `STAFF_ALL` | same | same | same |
| `POST /staff/submissions/:sid/return` | `STAFF_ALL` | `loadSubmissionInScope` | 404 `SUBMISSION_NOT_FOUND`, identical | 409 unmarked |
| `POST /staff/submissions/:sid/grade` | `STAFF_ALL` | **unchanged: course grain** until `B-7` | 404 `Submission not found` (already identical) | 400 score range |
| `GET /staff/groups/:gid/markbook` and `.csv` | `STAFF_ALL` | `requireGroup` → `mayReachGroup` | 404 `GROUP_NOT_FOUND`, identical | — |
| `GET /assessments/:id` (student) | `Role.Student` | unchanged (`loadForStudent`) | 404 `Assessment not found` | Annotations only on **own** submission (`findSubmission(id, jwt.sub)`) **and only if returned** |
| `DELETE /staff/assessments/:id` | unchanged | unchanged | unchanged | **409** submissions (`TASK-F3`) |

- **Order inside each handler:** scope first, then object-level checks, then state. An out-of-scope
  caller must hit the 404 before any 403 or 409, or the status becomes an oracle.
- **Student rule:**
  - The student route never takes a submission id; it resolves from `jwt.sub`.
  - Before `returnedAt`: `annotations: []`, and score, feedback and annotated URL are all null.
  - After: annotations **without `createdBy`** (field minimisation).
- **What a role gate alone would leak:** assistant-2 (no scope row) and assistant-1 on a group-3
  submission must both 404. Every row above has a refusal test in both directions (§4, *Tests*).

### API: `API_SPEC.yaml` delta. Every new or changed route is updated in the same change.

**Schemas:**
- `AnnotationKind`: `[comment, tick, cross, pen, highlight]`.
- `Annotation`:
  - add `fileUrl`, `path` (`[array, null]` of `[x,y]` number pairs, each 0–100), `createdByName`
    and `updatedAt`;
  - `text` becomes `minLength 0` except for `comment` (described).
- `AnnotationWrite`:
  - `fileUrl` (≤ 2048), `page` (1–500), `kind`, `xPercent`, `yPercent`;
  - `text` (≤ 2000, optional, default `''`);
  - `path` (2–2000 points; required iff `pen`/`highlight`).
- **New `AnnotationPatch`:** every field of `AnnotationWrite` except `kind` and `fileUrl`, all
  optional, none nullable.
- **New `StudentAnnotation`:** `Annotation` minus `createdBy` and `createdByName`.
- **New `TaskSubmissionRow` and `TaskSubmissionGroup`**, and **`TaskSubmissions`**
  (`{ assessmentId, title, maxScore, dueAt, workType, groups[], rows[] }`).
- **New `MarkBook`:**
  `{ groupId, groupName, courseId, courseTitle, tasks[], omittedTasks[], students: [{ studentId, name, cells: [{ assessmentId, score, status }] }] }`.
- **`SubmissionStatus` enum:** `[not_submitted, submitted, marked, returned]`.
- **`GradingQueueItem`** gains `returnedAt`. Specify it if it is not already there: `/grade` is now
  `[MODIFY]`.

**Paths:**
- `/staff/assessments/{id}/submissions`: 200 `TaskSubmissions`, 404, 409; describes the grain and
  the per-group counts.
- `/staff/submissions/{id}/annotations`, `GET` and `POST`:
  - 201 `Annotation`;
  - 400, 404, 409;
  - `x-audit: submission.annotated`.
- `…/annotations/{annotationId}`:
  - `PATCH` takes `AnnotationPatch` → 200 `Annotation`;
  - `DELETE` → 204;
  - both: 400, 403, 404, 409; `x-audit`.
- `/staff/submissions/{id}/return`:
  - **remove the `includeInReport` request body** (A-5);
  - 200 `GradingQueueItem`;
  - 404, **409**.
- **`/staff/submissions/{id}/grade`: add the path** (it is `[MODIFY]` in `API_GAP_ANALYSIS.md` A7 and
  was never restated). Body per `GradeSubmissionDto`; response `GradingQueueItem`; note the grain.
- `/staff/groups/{id}/markbook`: 200 `MarkBook`.
- **New path `/staff/groups/{id}/markbook.csv`:** 200 `text/csv; charset=utf-8`, with
  `Content-Disposition: attachment; filename="markbook-<groupId>.csv"`. The filename is
  server-minted and **never the group name** (header injection; non-ASCII names).
- `/assessments/{id}`: describe `submission.returnedAt`, `submission.annotations`
  (`StudentAnnotation[]`, empty until returned), and the null-until-returned rule.
- `DELETE /staff/assessments/{id}`: 409 description now covers submissions.

**`lib/api.ts` and `lib/types.ts`**, mirrored in the same commits:
- New methods:
  - `taskSubmissions`;
  - `annotations.{list, create, update, remove}`;
  - `returnSubmission`;
  - `markbook`;
  - `markbookCsv`, which **returns a `Blob`**: add a small non-JSON variant of `request` that still
    sends the bearer token and maps errors identically.
- New types for everything above.
- `GradingQueueItem.returnedAt`.
- `SubmissionView.returnedAt` and `annotations`.
- `AuditAction` gains the two new actions.

### Frontend: slice 7h

- **Rules for every new file:**
  - named utilities only; **never** `text-[var(--x)]` or `text-[var(--fs-*)]`;
  - console 13px scale, where heading and caption differ by tint;
  - one `Panel` level;
  - sentence case, no emoji;
  - `Score` for marks, **no `Meter`**;
  - em-dash via `Score`/`formatPercent`, never a hand-typed `0`;
  - no `dangerouslySetInnerHTML`, because annotation text renders as text nodes.
- **Feature components go in `components/marking/`**, not `components/ui/`, because they import
  `lib/types`.

**1. Per-task submissions: `app/(app)/manage/tasks/[id]/submissions/page.tsx`.**
- Reached from a new "Submissions" action on `file_upload` rows of `manage/tasks/page.tsx`.
- Shows the `groups[]` summaries as `StatNumber`s, each labelled with its group, **never summed**.
- Rows go in a `Table` with a status `Tag`:
  - `not_submitted` is neutral, or amber when `isOverdue`: a queue, not a failure;
  - `submitted` is amber;
  - `marked` and `returned` are distinct tags;
  - the score is `<Score value of={maxScore} />`.
- `onRowClick` goes to the marking view for submitted rows.
- There is a group filter and **no pagination** (thirty rows).

**2. Marking view: `app/(app)/manage/tasks/[id]/submissions/[submissionId]/page.tsx`.**
- It loads **from the per-task queue**; there is no one-submission `GET` (A-14). That gives
  previous/next student for free.
- **Page surface** (`components/marking/marking-surface.tsx`):
  - If `fileAnnotatable` and the file is an **image** (by extension from the whitelist), render an
    `<img>` inside a positioned box.
  - If it is a PDF, show the `B-3` gate: until it is ruled, a `Callout` reading "PDF pages can't be
    marked up here yet" plus "Open original".
  - If it is not annotatable, a `Callout` explains, with "Open original" (`rel="noopener noreferrer"`,
    `target="_blank"`). Grading still works.
- **Overlay** (`components/marking/annotation-layer.tsx`, shared read-only with the student view):
  - An absolutely positioned SVG, `viewBox="0 0 100 100" preserveAspectRatio="none"`, over the page
    box.
  - Strokes are `<polyline>` with `vector-effect="non-scaling-stroke"`.
  - Pins are absolutely positioned buttons.
  - **The page box carries `dir="ltr"` and uses physical `left`/`top`, never `start-*`.** `x%` is
    measured from the page's physical left edge. Under `dir="rtl"`, a logical `start-[x%]` would
    mirror every mark onto the wrong side of the paper (`CLAUDE.md` §11: a layout-critical position
    needs an RTL browser check).
- **Toolbar** (`ButtonGroup` of `IconButton`s): comment, tick, cross, pen, highlight and eraser, plus
  Select (the default).
  - Pen and highlight capture pointer events: `setPointerCapture`, and `touch-action: none` on the
    surface only.
  - Points are decimated client-side, dropping a point < 0.25% from the previous one, and capped at
    2000 per stroke (the server bound).
  - **Each finished stroke or pin is persisted immediately** (`POST`), so no important state lives
    only in the browser (DoD 9). A failed write shows an `InlineBanner` and keeps the stroke visibly
    unsaved, never silently dropped.
  - The eraser deletes the stroke or pin it touches, by client-side hit-test against the loaded
    annotations. It shows a 403 as "You can only erase your own marks" (interim `B-5`).
- **Annotation list:** a side column in the same `Panel` (not a nested one), grouped by page, each
  with its author and a delete for the caller's own.
- **Mark and feedback:**
  - a `TextInput` score with a `/max` suffix, and a `TextArea` for feedback;
  - **Save** → `POST /grade`, which requires a score, as today;
  - **Save and return** → `POST /grade`, then `POST /return`. Two calls, two operations (roadmap
    care note). If the second fails, the paper is saved-not-returned and the screen says so;
  - a paper that is already returned shows "Returned <date>", and further edits are refused by the
    server (interim `B-5`(b)).
- **Stale annotations:** if `staleAnnotationCount > 0`, a `Banner` says "The student resubmitted
  after marking began. N marks are on the previous version." Nothing is deleted.
- **Icons:** add `Eraser`, `Highlight` and `Download` to `icon-data.ts` from Tabler at the handoff's
  weight (stroke 1.6), and record it in `redesign-mapping.md` ("tell the team").
- **Marker colour:** use one existing token. Pick the handoff's if reachable, and record the choice.
  §11.1 reserves red for failure and indigo for "the one action here", so this is a design point for
  the reviewer, not a silent pick.

**3. Student returned copy: `app/(app)/homework/[assessmentId]/page.tsx`**, the marking block at
`:263-304`:
- Key it on `submission.returnedAt`, not `correctedAt`.
- Copy: "Returned <returnedAt>".
- Saved-not-returned shows "Your teacher is marking this" (A-2).
- When `annotations.length > 0` and the file is annotatable, render the original with
  `AnnotationLayer`, read-only.
- Comment text renders as text.

**4. Mark book: `app/(app)/manage/marks/page.tsx`** (the nav item exists):
- A course `Select` (`GET /staff/courses`), then a group `Select` (`GET /staff/courses/:id/groups`,
  held groups, `D-33`), then the grid.
- **Extend `Table`** with an optional `stickyFirstColumn` prop: `sticky start-0` plus the row
  background, so it covers scrolled cells.
  - **Logical `start` is correct here**: the student column belongs at inline-start in RTL. This is
    the opposite of the overlay rule, and deliberate.
  - It is one prop on the one primitive, **not a fork**.
- A horizontal scroll container, and task columns with a title plus `/max`.
- Cells: `<Score>` plus a small tag for `marked` (not yet returned).
- **One footnote per screen:** "— means not marked yet".
- The `omittedTasks` line, when non-empty: "2 Google Form tasks are not shown here yet".
- "Export CSV" calls `api.staff.markbookCsv` → `Blob` → an object URL → download, with the filename
  from the header.

**5. Course grading tab** (`manage/courses/[id]/grading/page.tsx`):
- Show a returned or not-returned `Tag` per row, from `returnedAt`.
- A `Banner`: "Saved marks reach students when returned from the task's Submissions page."
- **No Return button here until `B-7`** (7j). An `assigned_groups` assistant can see another
  cohort's rows here (course grain) and would meet a 404 on a group-grain Return: a UI lie.

**6. Activity page:** labels and tones for the two new actions.

### Security: the `CLAUDE.md` §8 items this unit touches

| Item | Handling |
|---|---|
| Authorization and object-level access | Every route in the table above; group grain from `D-23`; the student resolves from `jwt.sub`; annotations checked against the path's submission. |
| Input validation | `class-validator` on every DTO field. `ArrayMinSize`/`ArrayMaxSize` on `path`, each point `[number, number]` in 0–100, via a custom `IsPointList` validator in `common/validators/`. The service re-checks kind/path/text coherence. Integer `page`. |
| Output filtering and field minimisation | The student annotation view drops `createdBy`/`createdByName`. Queue rows carry name, not email. The CSV carries name, not email (A-9). |
| Sensitive-data exposure | A saved mark never reaches a student before return: one predicate over five reads, e2e-asserted. |
| XSS | Annotation text, names and task titles render as React text. **No `dangerouslySetInnerHTML`**, grep-checked (§7). `SECURITY.md` §2.5. |
| CSV / formula injection | `'`-prefixing plus RFC 4180 quoting; unit-tested with `=HYPERLINK(...)`, `+1`, `-2`, `@SUM`, a leading tab, an embedded quote and comma, and `ليلى فهمي`. |
| Header injection | The CSV filename is minted from `groupId` only. |
| File upload and path traversal | **No new upload route in the executable scope.** The student upload route is `B-2` (7i), specified there against `SECURITY.md` §2.4. |
| SSRF | No server-side fetch of any submission URL. Rendering only platform-stored files (`B-4` reading A) keeps the browser from auto-loading student-chosen hosts. |
| Unauthenticated `/uploads/*` | **Known, not solved** (`D-29`'s note, `SECURITY.md` §4). A submitted file at a UUID URL is readable by anyone holding the URL. Closed by signed URLs on R2 (`B-4`). Say so in `SECURITY.md`. |
| Rate limiting | Annotation writes are staff-only and authenticated. No new limiter: `CLAUDE.md` §8 forbids a fourth per-process structure. |
| Error leakage | 404 bodies are `===`-asserted. The 409 messages name no other resource. |
| Audit | Two new actions, each committing with its mutation (`AuditService.record` throws outside a transaction). |
| Dependency security | **No new dependency in the executable scope.** `pdfjs-dist` is `B-3`, with the CVE note there. |
| CORS and CORP | Finding 6: verify before 7h builds on it (Risk 2). |
| Secrets, CSRF, token/session, brute force, env config | Unchanged. Bearer auth (no cookies, so no CSRF surface). No new env var in the executable scope. |

### Tests, per level and named

**Unit** (memory driver, no database):
- `marking.service.spec.ts` (new):
  - return: happy; 409 unmarked; idempotent re-return (same `returnedAt`, **one** audit entry);
  - 404 === genuine miss for assistant-2 and for assistant-1 on a group-3 student (spec-created
    group-3 on course-1, as unit 6 did);
  - teacher and admin allowed.
  - queue:
    - non-submitters present;
    - the four statuses;
    - `isLate`/`isOverdue` with a per-group override;
    - a student in two reachable groups appears once;
    - an unheld group's members, id and name are absent;
    - `groups[]` counts per group;
    - 409 on `google_form`;
    - 404 === for an unreachable task.
  - annotations:
    - create/list/update/delete;
    - 400 file mismatch and 400 not platform-stored;
    - 400 cap at 500;
    - 409 after return;
    - 403 on another author's annotation;
    - 404 `ANNOTATION_NOT_FOUND` for an `aid` of another submission, === a missing `aid`;
    - the audit entry per write, and `before` not aliasing `after`.
- `assessments.service.spec.ts` (extend) — **the visibility predicate, per read:**
  - graded-not-returned → status `submitted`, score/feedback/annotatedFileUrl null, performance
    entry `score: null`, `answersAvailable` unchanged;
  - after return → all visible;
  - `canSubmit` false while saved-not-returned (the freeze is unchanged);
  - `annotations` empty before return and populated after, **without `createdBy`**.
- `markbook-csv.spec.ts` (new): the BOM; CRLF; quoting; each injection prefix; the em-dash for null;
  Arabic round-trip; a zero score renders `0`, not `—`.
- `groups.service.spec.ts` (extend) markbook:
  - hidden excluded;
  - `file_upload` columns only, with `omittedTasks` listed;
  - `null` cells for non-submitters;
  - a `marked` cell carries its score;
  - 404 === for an unheld group.
- `assessment-authoring` spec: `TASK-F3`, delete with submissions → `ConflictException`.
- DTO specs: `AnnotationWriteDto` (path bounds, points out of range, `page: 0`, `kind: 'eraser'`
  rejected); `AnnotationPatchDto` (strips `kind`).

**Integration** (real PG 15, `test/postgres-repositories.integration-spec.ts`):
- `describe('migration 019')`:
  - both CHECKs on `submission_annotations` reject bad rows (`pen` without a path, `comment` with
    blank text, `x_percent` 100.01, `page` 0);
  - `returned_at` without `corrected_at` is rejected;
  - the index `submission_annotations_submission_id_page_idx` exists;
  - `ON DELETE CASCADE` from the submission is **exercised**, not merely declared;
  - `RESTRICT` on `created_by` refuses a user delete;
  - seeds: `sub-1` `returned_at = corrected_at`, `sub-2` null.
- `describe('submission annotations')`: CRUD; `findBySubmission` order; `countBySubmission`;
  `countBySubmissions` current/stale; numbers are `number`; `path` round-trips.
- `describe('assessments: returned_at')`:
  - `returnSubmission` sets once and keeps the first time on a second call;
  - null for an unmarked submission;
  - `gradeSubmission` **named test**: a pre-existing gap, and its `RETURNING` list changes;
  - it leaves `returned_at` alone;
  - every submission read carries `returnedAt`.
- `describe('groups: findMembersForGroups')`.
- `describe('work results (TASK-F4)')`:
  - `tallyResults`: matched, unmatched and total, against seeded or inserted `external_results`;
  - `countResultsByAssessments`: per-student, and empty ids → `{}`.
- **Gate:** `skipped 0` in the summary, and `select version()` = 15.x recorded.

**e2e** (`test/staff.e2e-spec.ts`, `test/app.e2e-spec.ts`). **One refusal test per permission, both
directions:**
- queue: teacher 200 · admin 200 · assistant-1 200 on a group-1 task (rows only group-1) ·
  assistant-1 on a group-3-only task 404 with a body **equal** to a nonexistent id ·
  assistant-2 404 equal · student 403.
- annotations `GET`/`POST`/`PATCH`/`DELETE`:
  - teacher happy path;
  - assistant-1 happy path on a group-1 submission;
  - assistant-1 on a group-3 submission: 404 equal to a missing submission;
  - assistant-2: 404 equal;
  - student: 403;
  - assistant-1 deleting the teacher's annotation: **403**;
  - wrong-submission `aid`: 404 equal to a missing `aid`;
  - after return: 409.
- return: happy · 409 unmarked · 404 equal (both scoped assistants) · student 403 ·
  **the end-to-end visibility proof:** grade `sub-2` → the student `GET /assessments/assess-4`
  shows score null, status `submitted` and no feedback → return → the student sees score, feedback
  and `corrected`; the activity log has `submission.returned` with the actor.
- student annotations: student-1 sees annotations on their own returned `sub-*`; there is no route by
  which student-2 can name student-1's submission, so assert the detail for student-2 on the same
  task carries only their own (null) submission.
- markbook `GET` and `.csv`:
  - teacher 200;
  - assistant-1 group-1 200, and group-3 404 equal to a missing group;
  - assistant-2 404 equal;
  - student 403;
  - the CSV `content-type`, BOM, `content-disposition` filename, and `—` for `sub-2`.
- **`TASK-F3`:** move `refuses to delete a task that has submissions` from `.expect(400)` to
  **`.expect(409)`**, and assert the message.
- **Role parity:** the new routes join the admin/teacher parity table where `/staff/*` routes are
  enumerated, if one exists (check `role-guards.spec.ts`: no new `@Public()`, no new `@AnyRole()`).

**Database:** `019` from a database **created empty immediately before the run** (§7), plus the
one-off backfill verification (§6, 7b.4).

**Frontend:**
- `tsc` 0 and `eslint` 0.
- **The browser pass,** performed by the user or reported honestly if not:
  - both themes, `dir="rtl"`, `ليلى فهمي`;
  - pins and strokes land on the same paper spot in LTR and RTL;
  - the grid's sticky column in RTL;
  - the CSV opened in a spreadsheet shows Arabic and `—` correctly;
  - the §Verification eight questions.

---

## 5. Files

**Expected to create:**

*Backend:*
- `src/database/migrations/019_submission_annotations_and_return.sql`
- `src/assessments/interfaces/submission-annotation-repository.interface.ts`
- `src/assessments/repositories/in-memory-submission-annotation.repository.ts`
- `src/assessments/repositories/postgres-submission-annotation.repository.ts`
- `src/manage/marking.service.ts`
- `src/manage/marking.service.spec.ts`
- `src/manage/marking.controller.ts`: or methods on `staff-manage.controller.ts`; pick whichever
  keeps `@Roles(...STAFF_ALL)` class-level.
- `src/manage/dto/annotation.dto.ts`: write and patch.
- `src/common/validators/is-point-list.validator.ts`
- `src/groups/markbook-csv.ts`
- `src/groups/markbook-csv.spec.ts`

*Frontend:*
- `app/(app)/manage/tasks/[id]/submissions/page.tsx`
- `app/(app)/manage/tasks/[id]/submissions/[submissionId]/page.tsx`
- `app/(app)/manage/marks/page.tsx`
- `components/marking/marking-surface.tsx`
- `components/marking/annotation-layer.tsx`
- `components/marking/marking-toolbar.tsx`

**Expected to change:**

*Backend:*
- `assessments/interfaces/assessment-repository.interface.ts`
- Both assessment drivers.
- `assessments/assessments.service.ts`
- `assessments/assessments.module.ts`: provide and export the annotation token.
- `groups/interfaces/group-repository.interface.ts`, plus both group drivers.
- `groups/groups.service.ts`: `markbook`.
- `groups/staff-groups.controller.ts`: two routes.
- `manage/grading.service.ts`: `returnedAt` on items; import `SUBMISSION_NOT_FOUND`.
- `manage/assessment-authoring.service.ts`: `TASK-F3` only.
- `manage/manage.module.ts`
- `common/storage/upload-types.ts`: `isPlatformStored`.
- `audit/interfaces/audit-log-repository.interface.ts`
- `audit/dto/list-audit-log-query.dto.ts`
- `database/seeds/001_development_fixtures.sql`
- `test/staff.e2e-spec.ts`
- `test/app.e2e-spec.ts`
- `test/postgres-repositories.integration-spec.ts`
- The existing unit specs named above.

*Frontend:*
- `lib/api.ts`
- `lib/types.ts`
- `components/ui/table.tsx`: the `stickyFirstColumn` prop.
- `components/ui/icon-data.ts`: three glyphs.
- `app/(app)/manage/tasks/page.tsx`: the Submissions action.
- `app/(app)/manage/courses/[id]/grading/page.tsx`
- `app/(app)/homework/[assessmentId]/page.tsx`
- `app/(app)/manage/activity/page.tsx`

*Docs* (§7).

**NOT to touch:**

| File | Why not |
|---|---|
| `staff/staff-scope.service.ts` and its spec | No new method is needed; its contract is load-bearing (`CLAUDE.md` §7) |
| `common/storage/uploads.*` | No upload change outside 7i |
| `assessments/dto/submit-assessment.dto.ts` and `submitAssessment` | The submit rules change only under `B-1` (7i) |
| `manage/work-analytics*`, `assessments/work-analytics.service.ts`, `google-form-sync.service.ts` | A8 `[KEEP]`; `B-9` reads, never writes |
| `postgres-work.repository.ts` | `TASK-F4` adds tests, not SQL. If a test fails, record it as a finding, and treat a fix as a deviation with its own named test |
| `groups.service.ts` `report` | Finding 8 is a follow-up, not this unit |
| `components/site/*` and marketing/auth pages | `F5-1` is out of scope |
| `manage/courses/[id]/assessments/page.tsx` | `TASK-F2` |
| `main.ts` helmet config | Only if Risk 2's check proves CORP blocks the render. Then it is a **recorded** change scoped to the static route (`crossOriginResourcePolicy: { policy: 'same-site' }` for `/uploads` only), flagged to the reviewer as a security-relevant change |

---

## 6. Sequencing

One slice at a time, each ordered migration → both repositories → service → authorization → API →
tests → frontend → check. Run `npm test` after each slice. Run the e2e suite after 7a and after each
of 7c–7g. Run integration after 7a and 7b.

**7a: `TASK-F3`, `TASK-F4` (part).**
1. Integration tests for `tallyResults` and `countResultsByAssessments`. Run them on a fresh DB.
   They go **first**, so `D-36`'s guard is pinned against real SQL before `remove` is edited.
2. The 400 → 409 change, the unit spec, the moved e2e test and the `API_SPEC` description.
   - **The order is load-bearing:** editing `remove` before the Postgres tally is proven would tie a
     status change to an unverified count.

**7b: plumbing.**
1. Write `019`.
2. **Run it against real PG from an empty database *before* writing repository code** (unit 6's
   step 1.2). Drop and create the DB, then run integration: existing 146 pass, `skipped 0`.
3. The annotation repository in both drivers, `returnedAt` in both assessment drivers,
   `findMembersForGroups` in both group drivers, the seed edit, then the integration tests.
4. **One-off backfill check:**
   - create DB `tahir_019_backfill`;
   - apply `001`–`018` with `psql -f` in order, then seeds `001`–`004`;
   - confirm `sub-1` has `corrected_at` and no `returned_at` column yet;
   - `psql -f 019_…sql`;
   - assert `returned_at = corrected_at` for the five corrected rows and NULL for `sub-2`.
   - Paste the output into `EXECUTION_NOTES.md`, then drop the database.
   - *Why:* the suite's migrate-then-seed order never exercises the `UPDATE`.

**7c: return and the visibility predicate.**
- The service, then the predicate across the five reads, then the route, then the tests.
- **The predicate change and the return route must land in the same commit.** With only the
  predicate, every mark saved after the deploy is invisible to students with no way to show it. With
  only the route, returning changes nothing.

**7d: the per-task queue.**

**7e: annotations.** This depends on 7b's repository and on 7c's `loadSubmissionInScope` and the
returned state.

**7f: the student annotations read.** It depends on 7e.

**7g: mark book and CSV.** Independent of 7d–7f, but after 7c, because cell status reads
`returnedAt`.

**7h: frontend.** Order within it:
1. `lib/` mirrors, and the `tsc` 0 gate.
2. The **CORP check** (Risk 2): render one `/uploads` image cross-origin in the dev stack before
   building the surface on it.
3. The per-task page.
4. The marking view.
5. The student view.
6. The mark book.
7. The course tab and the activity page.

**Gated slices** run in the order their blockers close:
- 7i should also re-evaluate 7h's surface for multiple files.
- 7j before any Return on the course tab.
- 7k only after `B-3`.

**Close:** update the docs (§7), run the full verification, write `EXECUTION_NOTES.md`, and send
`SendMessage` to the reviewer.

---

## 7. Definition of Done for this unit

The applicable `IMPLEMENTATION_PLAN.md` points, made concrete:

| # | Concrete for unit 7 |
|---|---|
| 1 | Each piece in the layer `ARCHITECTURE.md` §6 names, with the one refinement A-13 records. |
| 2 | `019` run against real PG 15 from a database **created empty immediately before**, plus the 7b.4 backfill run, both with output recorded. |
| 3 | `SubmissionAnnotationRepository` has **both** drivers. `returnSubmission`, `countBySubmission(s)` and `findMembersForGroups` exist in both drivers of their repositories. |
| 4 | Every new field has `class-validator` decorators; points are validated per element. |
| 5 | Every route in the §4 authorization table enforces in the service, not only via `@Roles`. |
| 6 | `submission.returned` and `submission.annotated`: union, `Record`, frontend mirror, and a spec asserting the entry. Each write happens inside `runInTransaction`. |
| 7 | Unit, integration and e2e as named in §4, with a refusal test per permission in both directions. |
| 8 | Not-found; out-of-scope (404 `===`); conflict (409 return/unmarked/after-return/delete); unconfigured storage (the not-annotatable path). |
| 9 | Screens against the real API. Each stroke is persisted as drawn. No mock. |
| 10 | `API_SPEC.yaml` updated for every route in §4 *API*. |
| 11 | Commands below. |
| 12 | The eight questions, reported per screen. |
| 13 | Docs below. |

**Commands that must pass, with the expected result:**
```
git rev-parse --abbrev-ref HEAD                          # redesign
npm test --workspace=backend                             # all pass; > 660, 0 failed, 0 skipped
npm run test:e2e --workspace=backend                     # all pass; > 297
docker exec tahir-unit7-pg psql -U dev -d postgres \
  -c "DROP DATABASE IF EXISTS tahirelshazli_test" -c "CREATE DATABASE tahirelshazli_test"
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:55432/tahirelshazli_test \
  npm run test:integration --workspace=backend           # > 146 passed, 0 skipped
docker exec tahir-unit7-pg psql -U dev -d tahirelshazli_test -tAc "select version()"   # PostgreSQL 15.x
docker exec tahir-unit7-pg psql -U dev -d tahirelshazli_test -tAc \
  "select count(*) from schema_migrations where name like '019%'"   # 1 (use the runner's ledger table name)
npm run lint                                              # 0 errors
cd frontend && npx tsc --noEmit                           # 0 errors
cd frontend && npx eslint .                               # 0 errors
grep -rnE "text-\[var\(" frontend/app/\(app\)/manage/marks frontend/app/\(app\)/manage/tasks/\[id\]/submissions frontend/components/marking   # no output
grep -rn "dangerouslySetInnerHTML" frontend/components/marking frontend/app/\(app\)/manage frontend/app/\(app\)/homework   # no output
```
Record `node -v` beside the output.

**Documentation the executor owes** (`CLAUDE.md` §12):

- **`PHASE_ROADMAP.md`:**
  - delete the stale unit-7 line "Blocked within scope `MARK-5` — decision `D-2`", and replace it
    with "`D-2` closed (rendered overlay)";
  - list the `B-n` gates;
  - status `[~]`, and `[x]` only per §2.
- **`IMPLEMENTATION_PLAN.md`:**
  - `MARK-*`/`BOOK-*` statuses, with gated parts `[!]` naming their `B-n`;
  - `TASK-F3` `[x]`;
  - `TASK-F4` narrowed to `PostgresGoogleCredentialRepository` plus the remaining work methods;
  - new follow-ups (§8).
- **`CHANGELOG.md`:**
  - the rulings on `B-n` as `D-38`…, when made;
  - the assumptions A-1…A-14;
  - `TASK-F3` (the `D-36` inconsistency closed).
- **`PRODUCT_SPEC.md`:**
  - §2.2: remove the `[UNCERTAIN]` bullet (`D-2` closed); tools = comment/tick/cross/pen/highlight
    and eraser; save versus return;
  - §10: mark #1–#5 closed. **The whole table is stale**, and all five are closed in
    `PHASE_ROADMAP.md` §6.
- **`DOMAIN_MODEL.md`:**
  - §4: `SubmissionAnnotation` (`fileUrl`, kinds, `path`, `updatedAt`, delete semantics); strike
    "whether the student receives a rendered PDF … is open"; `returnedAt` semantics;
    `includeInReport` deferred to unit 9;
  - §8: the two actions built.
- **`DATABASE_PLAN.md`:**
  - §2: `returned_at` applied; `include_in_report` moved to the weekly-reports migration;
  - §3: the real `submission_annotations` shape;
  - §7: `019` applied and verified, and renumbered if `B-2` adds `020`.
- **`API_SPEC.yaml`:** §4 *API*.
- **`API_GAP_ANALYSIS.md`:**
  - B4/B5 → built;
  - A7: `/grade` and the course queue as built (non-submitters live on the per-task route, **not**
    the course queue; see the conflicts);
  - A4 `/assessments/:id`.
- **`AUTHORIZATION_MODEL.md`:**
  - §4: rows for staff submission, annotation, the per-task queue, the mark book, and the student
    returned copy;
  - §6: the "no gate for annotations" row closed;
  - the `AUTH-6` list gains `/grade` if `B-7` is not taken.
- **`SECURITY.md`:**
  - §2.5: annotations as built;
  - a CSV-export paragraph;
  - submissions under unauthenticated `/uploads`.
- **`ARCHITECTURE.md` §6:** annotations = service in `manage/`, repository in `assessments/`.
- **`redesign-mapping.md`:** MarkingView moves to "maps"; the three glyphs added; the `Table`
  sticky prop.
- **`CLAUDE.md`:**
  - §4.1 test counts;
  - §9 "001–019 have run";
  - §7 if `B-7` changes the course-door statement.
- **`project_log.md`:** one entry.

---

## 8. Blockers and decisions required

Each blocker names the slice it gates. Every recommendation is an **assumption**, not a decision.

### `B-1`: What does each submission mode admit at submit time? Blocks 7i (`MARK-6`)

**Sources:**
- `PRODUCT_SPEC.md` §2.1: "PDF upload / Google Doc link / photo of written work (≤5)".
- `D-31`: stored; "empty is not stated".
- `IMPLEMENTATION_PLAN.md:293`: "does `doc_link` accept a student URL as the submission? does
  `pdf_upload` narrow `allowedFileTypes`?"
- Today: a pasted `fileUrl` plus `answerText`, with per-task `allowedFileTypes`/`maxFileSizeBytes`
  that nothing enforces at submit time (the URL is a URL).

**Questions no document answers:**
- (a) Is `pdf_upload` a file **uploaded to the platform**, or may it be a URL to a PDF?
- (b) Is `doc_link` a student-supplied URL? Any `https` URL, or Google Docs hosts only? Must the
  staff side see it as "open original" only (it cannot be annotated)?
- (c) Is `photo_upload` 1–5 **uploaded** images?
- (d) **Typed answers** (`answerText`) belong to none of the three modes. Do they survive on a task
  that states modes?
- (e) With several modes on one task, does the student pick one per submission, or may they combine
  (a PDF plus photos)?
- (f) Is `allowedFileTypes` still authored, or derived from the modes? Two sources for "what types
  are allowed" will disagree.

**Readings:**
- **A.** The modes are the rule.
  - `pdf_upload` → exactly one uploaded `application/pdf`;
  - `photo_upload` → 1–5 uploaded images;
  - `doc_link` → one `https` URL (`IsPublicHttpUrl`, any host);
  - one mode per submission;
  - `answerText` is allowed alongside any mode as a note, but never alone when modes are stated;
  - empty modes = today's rule, unchanged;
  - `allowedFileTypes` is derived from the modes for new tasks and kept as-is for legacy.
- **B.** The modes are presentation only. `allowedFileTypes` stays authoritative, and the UI offers
  inputs by mode.
  - Impact: a staff-side label that promises what the server does not enforce.
- **C.** The modes are advisory; enforce nothing.
  - Impact: `MARK-6` closes as "display only", and multi-file is still needed for photos.

**Impact of A:**
- a submit-time validation branch;
- a new student upload route (`B-2`);
- the authoring form's file-type control hides for tasks with modes;
- `API_SPEC` `AssessmentWrite` describes the derivation.

**Recommendation (assumption): A.** Only A makes the stored modes mean something the server
guarantees (`CLAUDE.md` §5: a rule lives in exactly one place).

**The one question that closes it:** *"When a task says 'PDF upload', 'Google Doc link' or 'photo of
written work', must the student hand in exactly that — an uploaded PDF, a link, or up to five
uploaded photos — and can they still type an answer?"*

### `B-2`: Student uploads and the multi-file submission. Blocks 7i (`MARK-6`)

**Sources:**
- `SECURITY.md` §2.4: a student-reachable upload needs "its own tighter contract — images only,
  smaller cap, its own rate limit — rather than widening `@Roles` on the staff endpoint".
- `PRODUCT_SPEC` §2.1 "≤5".
- `submission_revisions` holds one `file_url` (`001:247-254`).
- No upload works in production (§0).

**Questions:**
- (a) Approve a student upload route. Proposed: **`POST /assessments/:assessmentId/files`**,
  `@Roles(Student)`, gated by `loadForStudent` (so it names a task the student may submit to, and
  storage is not free-for-all).
  - The MIME set is derived from the task's modes: PDF, or JPEG/PNG/WebP.
  - The cap is `min(task.maxFileSizeBytes, 20 MB)`.
  - Its own `RateLimit`.
  - Otherwise identical validation to `UploadsService`: server-minted name, whitelist, no SVG.
- (b) What happens with `STORAGE_DRIVER=none` (production today)? Options:
  - 503, with the task unusable for `pdf_upload`/`photo_upload`;
  - fall back to a pasted URL;
  - refuse to **author** upload-mode tasks while storage is off.
- (c) Photos: when a student resubmits, is the set replaced whole, or can a single photo be
  replaced? Do revisions archive the whole set?
- (d) HEIC: iPhones produce it. It is not on the whitelist. Accept it (the staff browser may not
  render it), or rely on the browser's conversion on selection?

**Readings for storage of the set:**
- **A.** A `files JSONB` array on `assessment_submissions` **and** on `submission_revisions` (≤ 5
  elements `{url, mimeType, sizeBytes, position}`).
  - This is the unit-6 attachments precedent (`018` header: "a handful … JSONB rather than a child
    table").
  - No new table, so **no new repository pair**.
- **B.** A `submission_files` child table (and one for revisions).
  - It is indexable per file, but it **costs two tables × two repository implementations** plus
    integration.

**Recommendation (assumption):**
- (a) yes, as proposed;
- (b) author-time refusal: an upload mode cannot be chosen while `enabled: false`, and the authoring
  form already reads `GET /staff/uploads/config`. It never quietly accepts a URL where a file was
  promised;
- (c) replace whole, archive whole;
- (d) no HEIC;
- storage A.

Annotations already anchor on `file_url` (A-11), so **7b needs no change** under either reading.

**The one question that closes it:** *"May students upload files directly (PDFs and up to five
photos per submission), what should happen while file storage is not yet set up on the live server,
and does a resubmission replace all the photos at once?"*

### `B-3`: May the frontend take a PDF renderer (`pdfjs-dist`) as a dependency? Blocks 7k

**Sources:**
- `D-2`: a rendered overlay with **no server-side** PDF library. It does not say *no client-side*
  renderer.
- `redesign-mapping.md`: "Two runtime dependencies come out … and none go in".
- Drawing at a page coordinate needs the page rasterised in the browser. An `<iframe>`/`<embed>` of
  the native viewer gives no page geometry.

**Readings:**
- **A.** Add `pdfjs-dist` (Mozilla, Apache-2.0):
  - pinned **≥ 4.2.67** (CVE-2024-4367: arbitrary JavaScript via a crafted font in earlier
    versions);
  - `isEvalSupported: false`;
  - worker served from the app's own origin;
  - lazy-loaded on the two marking routes only.
- **B.** No dependency. Images are annotatable; PDFs are grade-and-feedback only ("Open original").
  - Impact: `pdf_upload` work, the single most common homework format, is never marked up in-platform.
- **C.** Server-side rasterisation. **Rejected by `D-2`.**

**Recommendation (assumption): A.** It is the only reading under which `D-2`'s "draw over the PDF"
is buildable.

**The one question that closes it:** *"May the web app include Mozilla's PDF viewer library so
teachers can draw on PDF pages?"*

### `B-4`: What can be annotated, and is marking meant to be production-real in this unit? Gates no slice (the interim is reading A)

**Sources:**
- §0: production `STORAGE_DRIVER=none`; no R2 driver.
- `CLAUDE.md` §1: subscriptions are the client's, and no paid tier may be assumed.
- `CLAUDE.md` §8: SSRF.

**Readings:**
- **A.** Only platform-stored files are annotatable (`isPlatformStored`, server-derived). A pasted
  URL is graded with a mark and feedback, and shown with "Open original".
  - Consequence: **no production submission is annotatable** until an R2 driver exists **and** the
    client provisions R2.
- **B.** Also render external `https` **images** by `<img>`.
  - Impact: staff browsers auto-fetch student-chosen hosts: an IP leak and a tracking pixel.
    Broken links and mixed content are shown as "the paper".
- **C.** An API proxy fetch. **Rejected:** SSRF.

**Recommendation (assumption):** A, plus file **a new task, "R2 storage driver"** (outside unit 7),
because `B-1`/`B-2` without it leave production marking empty.

**The one question that closes it:** *"Is it acceptable that in-platform mark-up works only on files
stored by the platform — which on the live server means not until Cloudflare R2 is set up — or
should an R2 storage driver be scheduled now?"*

### `B-5`: Annotation authorship and lifecycle. Blocks 7o (the interim is fail-closed)

**Sources:**
- `D-2`: "the eraser removes *the teacher's own strokes*, never page content".
- The user brief for this unit: "The eraser clears the teacher's own strokes only".
- `AUTHORIZATION_MODEL.md` §3: assistants "grade, annotate, return".

**Questions:**
- (a) Is "own" **author-only**, so an assistant cannot erase the teacher's tick and the teacher cannot
  erase an assistant's? Or does it only contrast strokes with page content, so any staff member who
  may mark the paper may erase any stroke?
- (b) May annotations be added or changed **after return**? The student sees the change immediately.
  Today a **re-grade** after correction is allowed.
- (c) If the student resubmits after marking began (allowed until a mark is saved, the existing
  rule), are the annotations kept on the superseded file, or is resubmission refused once any
  annotation exists? The latter narrows `D-31`'s rule.

**Interim, executable (fail-closed and relaxable):**
- (a) author-only, 403 otherwise;
- (b) 409 after return;
- (c) resubmission unchanged; annotations stay on their file and are counted as stale.

**Recommendation (assumption):**
- (a) author-only, the literal reading, and what the interim builds;
- (b) allow, audited, matching re-grade;
- (c) as the interim.

**The one question that closes it:** *"Can one staff member erase another's marks on a paper, may a
paper be marked up further after it's returned, and should a student still be able to resubmit once
marking has started?"*

### `B-6`: What does the task's marker mean when marking? Blocks 7l

**Sources:**
- `D-32`: "`markerId: null` means 'whoever opens it first'. The claim-on-open is unit 7's."
- `D-32`: "an assistant may not change the marker" (`R1-1`).
- `CLAUDE.md` §6: "`GET` never mutates".

**Questions:**
- (a) Is the marker **exclusive**, so only the marker (plus teacher and admin) may grade, annotate
  and return? Or **advisory**, where anyone in scope may, and the marker only filters "assigned to
  me"?
- (b) When exactly is a task "claimed"? It cannot be on opening a screen. It could be on the first
  saved mark or annotation, per task, or never.
- (c) A claim by an assistant sets `markerId`, which `D-32` forbids an assistant to change. Is
  self-claim the exception?

**Readings:**
- **A.** Advisory. The claim happens on the first `grade`/annotation write when `markerId` is null,
  sets it to the actor, and is audited as `assessment.updated`. Self-claim is permitted to
  assistants.
- **B.** Exclusive, plus A's claim. Everyone else is refused with 403 (the task is on their screen).
- **C.** Advisory, with no claim at all in this unit.

**Interim:** the marker is displayed on the queue; nothing is enforced or written. This is today's
behaviour.

**Recommendation (assumption): A.** It needs no new audit action and refuses nobody.

**The one question that closes it:** *"When a task says who marks it, may anyone else mark it? And
when no marker is named, should the first person to save a mark become its marker?"*

### `B-7`: Does unit 7 move `/grade` and the course queue to the group grain? Blocks 7j. This is scope, for the user

**Sources:**
- `D-23` (closed: narrow the course doors to held groups).
- `CLAUDE.md` §7: "do not add a new course-grained staff route without saying which grain it is on".
- Finding 3: `/grade` is course-grained **and absent from `AUTH-6`'s list**.

**Readings:**
- **A (recommended).** Three changes, which close the submissions half of `AUTH-6`:
  1. `/grade` uses `loadSubmissionInScope`.
  2. `GET /staff/courses/:id/submissions` narrows its **items** to students of held groups, in the
     query.
  3. The course tab gains **Save and return**.

  The course queue's `assessments[]` averages stay course-wide, **recorded as the residue**, as
  unit 6 recorded `D-35`'s.
- **A+.** A, plus the averages omitted or narrowed for scoped callers. Narrowing is the `D-23`
  denominator trap: the average changes with the viewer.
- **B.** Leave both. `AUTH-6` gains `/grade` explicitly. The course tab stays display-only for
  return.

**Impact of B:** an `assigned_groups` assistant can save, but not return, another cohort's paper
through the course tab. And the same submission sits on two grains depending on the verb.

**Recommendation (assumption):** A.

**The one question that closes it:** *"Should assistants who hold only some groups stop being able to
see and grade other groups' submissions on the course grading tab, as `D-23` already decided for other
screens?"*

### `B-8`: What is the mark book's "term total"? Blocks 7m

**Sources:** `PRODUCT_SPEC` §2.3: "Student × task grid per group, with a term total". **No `Term`
entity, no term dates, anywhere** (`DOMAIN_MODEL.md` §9).

**Questions:**
- What bounds a term?
- Is the total a sum of scores over a sum of maxima, or a mean of per-task shares (`GROUP-4`'s
  arithmetic, `API_SPEC` `GroupReport`)?
- Does it count saved-not-returned marks?
- Is a non-submission past due an em-dash, excluded, or a 0? `CLAUDE.md` says a missing mark is never
  `0`, and in a total that choice is the whole number.

**Readings:**
- (a) Course-to-date mean of per-task shares over marked cells, non-submissions excluded, labelled
  "Average of marked work". This is `GROUP-4`'s arithmetic, so the two screens agree.
- (b) A term entity with dates: new schema and a settings screen.
- (c) No total.

**Interim:** no total column.

**Recommendation (assumption):** (a), without the word "term" until a term exists.

**The one question that closes it:** *"What period is the mark book's total over, and should a task a
student didn't hand in count against them in it?"*

### `B-9`: Does the mark book show work not marked in the platform? Blocks 7n

**Sources:**
- `PRODUCT_SPEC` §2.3: "Derivable from the existing grading queue", which holds in-platform
  submissions only.
- Quizzes **are** Google Forms (`CHANGELOG` 2026-09-19); their scores live in `external_results`,
  mirrored, and matched or unmatched.
- `link` tasks have no mark anywhere.

**Readings:**
- (a) `file_upload` columns only.
- (b) Plus Google Form columns: the matched result's score over its own `maxScore`, labelled mirrored
  with the last sync time, and the unmatched count shown as "understated" (`PRODUCT_SPEC` §2.5's rule).
- (c) Plus link columns, all em-dash.

**Interim:** (a), plus `omittedTasks` named on screen.

**Recommendation (assumption):** (b). A teacher's mark book without quiz scores is the wrong book;
(c) adds only dashes.

**The one question that closes it:** *"Should Google Form quiz scores appear in the mark book beside
the marked homework?"*

### Assumptions taken without a blocker, stated so the reviewer can overrule

- **A-1.** `019` backfills `returned_at := corrected_at`, and the seeds match. Existing marks are
  already visible, so hiding them retroactively would be a regression nobody asked for.
- **A-2.**
  - The student sees the mark only after return.
  - The **resubmission freeze stays on `correctedAt`** (the existing rule), so a saved-not-returned
    paper shows `submitted`, `canSubmit: false`, and "Your teacher is marking this".
- **A-3.**
  - Return needs a saved mark (409 otherwise).
  - A re-return is 200, a no-op, with no second audit entry; `returnedAt` keeps the first return's
    time.
  - There is no "un-return": no document mentions one.
- **A-4.** A re-grade after return stays allowed, as today, is visible immediately, and is audited as
  `submission.graded`. `gradeSubmission` never touches `returned_at`.
- **A-5.** `includeInReport` is deferred to unit 9. `019` has no column. The `/return` body is
  removed from `API_SPEC`.
- **A-6.** The per-task queue answers 409 for `link`/`google_form` tasks. The UI offers
  "Submissions" only on `file_upload` rows.
- **A-7.**
  - A student appears once in the queue, under their earliest reachable targeted placement.
  - Lateness uses the window the student sees: their earliest placement among **all** targeted
    groups.
- **A-8.**
  - The mark book shows staff saved-not-returned marks, flagged `marked`.
  - Hidden tasks are excluded.
  - Tasks are ordered by due date ascending, students by name (`localeCompare`).
- **A-9.** CSV columns: the student's name only (no email); headers `Title (/max)`; cells are an
  integer or `—`. Not audited: a read, and `CLAUDE.md` §9 audits mutations.
- **A-10.** Kinds are `comment | tick | cross | pen | highlight`. `D-2`'s "marker" is read as
  pen/highlight, matching `PRODUCT_SPEC` §2.2's toolbar. The eraser is a `DELETE`, not a kind.
- **A-11.** Annotations anchor to `(file_url, page)`. Bounds are storage bounds, not product rules:
  - page 1–500;
  - text ≤ 2000;
  - 2–2000 points;
  - ≤ 500 per submission.
- **A-12.** One action, `submission.annotated`, for create, update and delete. The target is the
  submission. `before`/`after` carry `{annotationId, kind, page}`, not the path.
- **A-13.** The annotation repository lives in `assessments/` (token exported); `MarkingService` lives
  in `manage/`.
- **A-14.** The marking view reads the per-task queue. No `GET /staff/submissions/:id` is added.

### Follow-ups to file (`IMPLEMENTATION_PLAN.md`), not built

- `GROUP-4` report counts hidden tasks in `assessmentCount` (finding 8).
- An R2 storage driver, if the user chooses that under `B-4`.

---

## 9. Risks, ranked

1. **A saved mark leaks to a student before return.**
   - **Cause:** one of the five reads keeps `correctedAt`, or a new student read is added without
     the predicate.
   - **How it shows:** a score on the student dashboard or Marks page before return. It is silent
     and PII-grade.
   - **Detect early:**
     - one exported predicate;
     - the 7c e2e proof across detail, list and performance;
     - the reviewer greps `assessments.service.ts`, `reports/` and `dashboard/` for `correctedAt`.
2. **CORP blocks the page image** (finding 6), or pdf.js cannot fetch it cross-origin.
   - **How it shows:** a blank marking surface in the browser; `tsc` and every test green.
   - **Detect early:**
     - `curl -sI http://localhost:3001/uploads/<file>` shows the `Cross-Origin-Resource-Policy`
       header;
     - render one image before building 7h;
     - any `main.ts` change is recorded as security-relevant.
3. **Overlay coordinates mirror under RTL,** or drift with zoom.
   - **How it shows:** a tick lands on the wrong answer for an Arabic-UI teacher. Wrong marks look
     right.
   - **Detect early:** physical `left`/`top` inside `dir="ltr"`; a browser check in `dir="rtl"` at
     two zoom levels (`CLAUDE.md` §11).
4. **The backfill is untested,** or the seed is not updated (finding 2).
   - **How it shows:** student-1's marks vanish in dev; or, in a populated production, every existing
     mark hides.
   - **Detect early:** the 7b.4 run, and the integration assertion on `sub-1`.
5. **An existence oracle on the new routes.** A submission-named route leaks `COURSE_NOT_IN_SCOPE`,
   or a 403/409 fires before the scope check.
   - **Detect early:** an `===` body comparison in every e2e refusal; handler order is scope first.
6. **Memory versus Postgres type drift:** `NUMERIC` as a string, or a `path` shape mismatch.
   - **How it shows:** unit tests pass while production returns `"12.50"` and the overlay computes
     `NaN`.
   - **Detect early:** the integration assertion `typeof === 'number'`.
7. **Audit noise.** One entry per stroke is ~20 per paper, ~600 per task.
   - **How it shows:** the activity log becomes stroke-by-stroke.
   - **Detect early:** watch the volume in the browser pass. The remedy, if needed, is a later
     batch-write route, a decision not taken here.
8. **Scope creep into `B-1`/`B-2`** under pressure to demo a real student upload.
   - **How it shows:** a student upload route without the §2.4 contract.
   - **Detect early:** the reviewer checks that no student-reachable `FileInterceptor` exists
     outside 7i.
9. **The manufactured fixture is mistaken for a working feature.**
   - **How it shows:** `EXECUTION_NOTES` says "marking works".
   - **Detect early:** the notes must state that production annotation needs `B-1`/`B-2` + `B-4`.
10. **The environment.**
    - Node 26 versus 24: record `node -v`.
    - PG must be the 15 container: record `select version()`.
    - The handoff is unreachable: state the source for each screen.

---

## Conflicts between documents found while planning

1. **`PHASE_ROADMAP.md` unit 7** says "Blocked within scope `MARK-5` — decision `D-2`". The same file,
   §6, and `IMPLEMENTATION_PLAN.md:294,414` say `D-2` is closed. The line is stale.
2. **`PRODUCT_SPEC.md` §2.2** still marks flattened-versus-overlay `[UNCERTAIN]`, and **§10** lists
   all five decisions as open. **`DOMAIN_MODEL.md` §4** says the delivery "is open". All three are
   stale against `D-1`…`D-5`.
3. **`DATABASE_PLAN.md` §3, `DOMAIN_MODEL.md` §4 and `API_SPEC.yaml` `AnnotationKind`** give kinds
   `comment | tick | cross` and no stroke path. **`D-2`** says annotations include freehand strokes.
   `D-2` is later and a decision, so it wins, and all three documents are amended.
4. **`includeInReport`:**
   - `API_SPEC.yaml` puts it on `POST …/return`.
   - `API_GAP_ANALYSIS.md` A7 puts it on `/grade`, and B4 models save-without-return as
     `/grade` `+return:false`, **a flag**.
   - The roadmap care note and `API_SPEC` make them two operations.
   - The plan follows two operations and defers `includeInReport` (A-5).
5. **Non-submitters:** `API_GAP_ANALYSIS.md` A7 wants them on `GET /staff/courses/:id/submissions`;
   B4 and `API_SPEC` put them on the per-task route. The plan puts them on the per-task route only.
6. **`markbook.csv`** is in `API_GAP_ANALYSIS.md` B5 and missing from `API_SPEC.yaml`.
7. **Route count:** `IMPLEMENTATION_PLAN.md` `MARK-1` says "4 routes"; `API_GAP_ANALYSIS.md` counts 6
   for marking and annotations. Both are right about different sets. Recorded to avoid a false
   discrepancy.
8. **`AUTHORIZATION_MODEL.md` §4 and `CLAUDE.md` §7** enumerate `AUTH-6`'s remainder without
   `POST /staff/submissions/:id/grade`, which is course-grained (finding 3).
9. **Tool names:** `PRODUCT_SPEC.md` §2.2 says "pen and highlight"; `D-2` says "marker and eraser".
   Reconciled by A-10.
10. **Dependencies:** `redesign-mapping.md` says "none go in", which pdf.js would contradict (`B-3`).
11. **Student uploads:** `PRODUCT_SPEC.md` §2.1 promises "PDF upload" and "photo … (≤5)" while
    `SECURITY.md` §2.4 and the code provide no student upload at all (`B-2`).
12. **`ARCHITECTURE.md` §6** places annotations in `manage/`. The module wiring rule (`manage/`
    provides no repositories) places the repository in `assessments/` (A-13).
