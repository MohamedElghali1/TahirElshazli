# Review: unit 6, tasks and the draft library

**VERDICT: APPROVED WITH FOLLOW-UP**

**Unit 6 may not be marked `COMPLETE` yet.** The backend is correct and safe.
- Migration `018` runs clean from an empty schema on PostgreSQL 15.19.
- `task_drafts` has both drivers, and every new or changed `Postgres*` method has an integration test.
- Every new authorization boundary has refusal tests in both directions and `===` body assertions.
- Status and publication time are server-derived.
- Targeting stays multi-group.

I found **no security or authorization finding.**

The verdict is held back by two things:
- **Two correctness bugs in the new edit screen** (`F-1`, `F-2`). Each is a few lines to fix.
- **One ruling that needs the user** (`F-3`).

The real-browser pass is also still outstanding. None of this blocks unit 7. Condition 3 of `PHASE_ROADMAP.md` §2 needs `APPROVED`, so the unit stays `[~]`.

**Does the verdict depend on the coordinator's browser pass?** Yes, in one direction only.
- The pass cannot raise the verdict to `APPROVED` on its own, because `F-1` and `F-2` stand either way.
- It could lower the verdict. A layout that breaks under `dir="rtl"`, or a draft prefill that doesn't fire, would be a requirement not met on `TASK-7`.
- I did not assume its result. It is listed under *Outstanding verification*.

## Scope reviewed

**Revision.** `redesign` at `791ea7c`, range `6dabdb8..791ea7c`: 14 commits, 57 files, +8483/−134. The working tree was clean apart from this file.

**Read in full:**
- `018_task_drafts_and_task_settings.sql`
- the `task-draft` interface and both drivers
- `task-drafts.{service,controller}.ts`
- `dto/{task-draft,attachment,staff-tasks-query,assessment}.dto.ts`
- `assessment-authoring.service.ts`
- the unit-6 hunks of:
  - `assessments.service.ts`
  - `postgres-assessment.repository.ts` and the in-memory `findForStaff`/`findTargetsForAssessments`
  - `staff-scope.service.ts`
  - `groups.service.ts`
  - `work-analytics-gate.service.ts`
  - `staff-manage.controller.ts`
  - `upload-types.ts` and `uploads.service.ts`
  - the audit union and its `Record`
  - `role-guards.spec.ts`
  - `manage.module.ts`
- `main.ts` (the `ValidationPipe` whitelist and `/uploads` static serving)
- `DatabaseService.transaction`/`runInTransaction` (nested calls join the outer transaction)
- all four screens, plus `task-form.tsx`
- the `lib/{types,api}.ts` diff and `activity/page.tsx`
- the doc diffs: `API_SPEC.yaml` routes and schemas, `DATABASE_PLAN.md` §2/§3/§7, `DOMAIN_MODEL.md` §4, `AUTHORIZATION_MODEL.md` §3/§4/§6, `IMPLEMENTATION_PLAN.md` (TASK-1..7, `TASK-F1`, `MARK-6`, `AUTH-6`), `PHASE_ROADMAP.md`, `CHANGELOG.md` `D-28`…`D-35`, and `CLAUDE.md`

**Suites I ran myself** (Node v26.8.1):

| Suite | Result |
|---|---|
| `TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:55432/tahirelshazli_test npm run test:integration` | **145 / 145, 1 file, 0 skipped.** It really executed: the log shows `Applied 001_student_platform.sql` … `Applied 018_task_drafts_and_task_settings.sql` (18 `Applied` lines) against `tahir-unit6-pg`. `select version()` gives `PostgreSQL 15.19 on aarch64-unknown-linux-musl`. |
| `npm test` | **653 / 39 files**, exit 0 |
| `npm run test:e2e` | **292 / 4 files**, exit 0 |
| `frontend: npx tsc --noEmit` | exit 0, **0 errors** |
| `frontend: npx eslint .` | exit 0, no output |
| `npm run lint` (oxlint) | clean. The one warning is pre-existing (`dashboard.controller.spec.ts:17`). |
| `grep -rn 'text-\[var(--' 'frontend/app/(app)/manage/tasks'` | **0** |
| `next build` (production, Turbopack) | **exit 0.** It ran on an APFS clone of the tree in my scratchpad, so the running dev stack's `.next` was untouched. All four new routes build. `new/page.tsx` uses `useSearchParams` without a `Suspense`, which does not break the build. |

**Catalog check after the run.** `\d task_drafts` and `pg_constraint` on `assessments` match the DDL:
- five CHECKs;
- `TIMESTAMPTZ(3)`;
- `task_drafts_course_id_type_idx`;
- `draft_id … ON DELETE SET NULL`;
- `visibility IN ('published','hidden')`;
- `submission_modes <@ ARRAY[…]`.

The dev stack on :3000/:3001 was not touched.

## Did this move toward the NEW product?

**Yes, substantially.** Each ruling is implemented as ruled, not as the old code behaved:

- **`D-28` (C + iii).**
  - Only `published | hidden` is stored (`018` CHECK, DTO `@IsIn`). `scheduled` is refused with a 400 and derived by `visibilityStateOf` (`assessment-authoring.service.ts:120-128`).
  - A hidden task falls through `loadForStudent` to the same 404 as a miss (`assessments.service.ts:200-202`). The e2e test asserts this with `===` (`staff.e2e-spec.ts:2176`, and again for submit).
  - Hiding a task that has a submission returns 409 (`:474-484`).
- **`D-29`.**
  - `audience` is required with no default (`attachment.dto.ts:52-58`).
  - The student detail maps field by field and keeps only `students` attachments (`assessments.service.ts:412-421`). The e2e test proves `scheme.pdf` is absent.
  - `audio/mpeg` and `audio/mp4` are whitelisted. `UploadKind` is decoupled from the blog, and the whitelist finally has a spec.
- **`D-30`/`D-34`/`D-35`.**
  - `staffTaskStatusOf` (`:157-177`) is total, uses the latest resolved due date, and gives `closed` for zero submissions.
  - The status is never client-supplied: it appears only on the query DTO's `@IsIn` filter, never on a write DTO.
- **`D-31`.** The modes are stored, deduped and bounded. Enforcement is placed as `MARK-6`.
- **`D-32`.**
  - An assistant setting or clearing a marker gets 403 (`:343-347`).
  - A named marker must be the teacher, an admin, or an active assistant who reaches every target; anyone else gets 400 (`:300-322`). Reach is decided by `StaffScopeService`.
  - Drift is shown as `markerDrift`, and `setTargets` never touches `marker_id`.
- **`D-33` (A+).**
  - `assertTargets` puts every id through `mayReachGroup`, with the byte-identical not-enrolled template (`:436-449`).
  - `setTargets` refuses with 403 before the new set is even considered (`:859-863`).
  - `listForCourse` is narrowed in the read (`groups.service.ts:572-585`).
- **The oracle is closed.** `loadInScope` rethrows the scope 404 as `ASSESSMENT_NOT_FOUND` (`:494-513`).
- **`TASK-2`/`TASK-3`/`TASK-6`.**
  - The draft library is built with an atomic, course-scoped `incrementUsedCount` taken before the insert, and rolled back with the transaction on Postgres (integration test "runInTransaction: authoring from a draft").
  - `GET /staff/tasks` is group-grain in SQL (`EXISTS` with `ANY($1)`), and the targets are narrowed with the same ids.

**Where it falls short of the new product:**
- The edit screen defeats `D-32`'s "drift is displayed, never cleared" (`F-1`).
- The edit screen silently erases per-group windows when the audience changes (`F-2`).

## Findings

### F-1: a task whose marker has drifted cannot be saved from the edit form without changing the marker

- **Severity:** medium. **Confidence:** confirmed by reading; not exercised in a browser.
- **Where:**
  - `frontend/app/(app)/manage/tasks/task-form.tsx:290`: `...(canChooseMarker ? { markerId: form.markerId || null } : {})`. It is sent on every save by the teacher or an admin, changed or not.
  - `backend/src/manage/assessment-authoring.service.ts:752-761` → `:349-355`. Any non-`undefined` `markerId` is re-validated against the current audience.
- **Scenario:**
  1. The teacher names `assistant-1` (who holds group-1) as marker on a group-1 task.
  2. The teacher later adds group-3 to the audience. `setTargets` correctly leaves the marker alone, and the list shows *"No longer reaches every group"*.
  3. The teacher opens `/manage/tasks/<id>`, fixes a typo in the title and presses *Save changes*.
  4. The PATCH carries `markerId: 'assistant-1'` → `markerQualifies` is false → **400** *"markerId must name the teacher, an admin, or an active assistant…"*. Nothing is saved.

  The only way to save anything is to change or clear the marker. `D-32` says drift is displayed and **never cleared**, and the screen forces the teacher to clear it. The same happens when a marker's account is deactivated.
- **Fix (either):**
  - The form sends `markerId` only when `form.markerId !== (task?.markerId ?? '')`.
  - Or the service skips re-validation when `update.markerId === before.markerId`.

  The server-side fix is the more robust, because it also covers API clients. Add a test either way: *"PATCH title on a drifted task succeeds and leaves markerId"*.

### F-2: changing the audience from the edit form deletes every per-group window override

- **Severity:** medium. **Confidence:** confirmed.
- **Where:**
  - `task-form.tsx:295-302` posts `form.groupIds.map((groupId) => ({ groupId }))`.
  - `setTargets` replaces the whole set (`postgres-assessment.repository.ts:450`, `DELETE` then `INSERT`), so a group that stays in the audience loses its `availableFrom`/`availableTo`/`dueAt` override.
  - The form neither shows nor preserves overrides, although `StaffTask.targets` carries them.
- **Scenario:**
  1. A task set for group-1 (with a later `dueAt` override, e.g. a Saturday class) and group-2.
  2. The teacher ticks group-4 and saves.
  3. Group-1's override is gone. Its students see the task's own due date, which may already be past, so they drop from *available* to *locked*.
  4. `D-35`'s status moves with it.
  5. The audit entry records only `targetGroups` ids (`:874-875`), so the log shows nothing lost.
- **Why it is not pre-existing:** the old per-course page never re-targets. This is new surface in unit 6.
- **Fix:** build the new target list by carrying over each retained group's override from `task.targets`, and send `{ groupId }` only for groups being added. Show a read-only line with the override where one exists.
- **Test:** an e2e test that re-targets a task with an override, adding a group, and asserts the retained override survives.

### F-3: a Google Form task with synced results can be hidden, which takes the student's completed work out of their sight and out of the weekly report

- **Severity:** medium. **Confidence:** confirmed. **Needs a user ruling, not a code guess.**
- **Where:**
  - `assertMayHide` (`assessment-authoring.service.ts:474-484`) counts only `assessment_submissions` (the executor's deviation 8, mirroring the delete guard).
  - The student list and `getPerformanceEntries` treat a mirrored external result as *submitted* (`assessments.service.ts` `countResultsByAssessments` → `computeStatus`).
- **Scenario:**
  1. Thirty students answer the Google Form, and the results sync.
  2. The teacher sets `visibility: hidden` → 200.
  3. The task vanishes from each student's list, from `studentWork`, and from the weekly report's entries.
- **Why it matters:** `D-28`'s reading (iii) was chosen because it *"loses no student-visible history"*. For external work, this build loses exactly that. The interpretation is recorded in `EXECUTION_NOTES.md` but not in `CHANGELOG.md`.
- **Not ruled here** (see *Open decisions*). If the answer is "external results count", `assertMayHide` should also consult `work.countResultsByAssessments`. The delete guard carries the same gap, and it pre-exists unit 6.

### F-4: the form defaults every new attachment to *Students*, weakening `D-29`'s deliberate no-default

- **Severity:** low. **Confidence:** confirmed.
- **Where:**
  - `task-form.tsx:580`: an upload is added with `audience: 'students'`.
  - `task-form.tsx:615`: *Add a link* does the same.
  - Compare `attachment.dto.ts:52-58`: *"defaulting a mark scheme to `students` is exactly the mistake this field exists to prevent, so the author has to say."*
- **Scenario:** a teacher uploads `mark-scheme.pdf`, doesn't notice the pre-filled select, and saves. Students get the mark scheme.
- **Why it is not higher:** the select is visible on every row.
- **Fix:** start the row with no audience (a "Choose…" option) and disable Save until every row has one.

### F-5: the memory driver diverges from Postgres on draft deletion

- **Severity:** low. **Confidence:** confirmed.
- **Where:** `in-memory-task-draft.repository.ts:84-91`.
- **What differs:** Postgres sets `assessments.draft_id` to NULL (`018`, and integration-tested). The memory driver leaves a dangling id, and the code says so.
- **Why it is low:** no reader dereferences `draftId` today; it is provenance only. It is recorded because `CLAUDE.md` §9 treats the two drivers as one contract.
- **Fix:** accept it and record it in `IMPLEMENTATION_PLAN.md`, or have `TaskDraftsService.remove` null the provenance through `AssessmentRepository` (a service-level join, which keeps repositories from calling each other).

### F-6: the documentation is slightly behind the build

- **Severity:** low. **Confidence:** confirmed.
- `CHANGELOG.md:1356-1361`: `D-30`'s last bullet still says *"A task in an unruled state carries `status: null`"* and cites a `§Blockers` section that `EXECUTION_NOTES.md` doesn't have (it is §Rulings after execution). `D-35` supersedes it, but the `D-30` entry reads as current. Add a "superseded by `D-34`/`D-35`" note.
- Two decisions made in code are not in `CHANGELOG.md`:
  - deviation 2: hidden tasks are also dropped from `getPerformanceEntries` and `studentWork`. `DOMAIN_MODEL.md:146` says *"absent from every student read"*, which covers the report but not the staff `studentWork` read.
  - deviation 8: the external-result reading behind `F-3`.
- **`AUTH-6` (`IMPLEMENTATION_PLAN.md:101`)** should say that the `setTargets` 403 on a task set only for unheld groups must become the `ASSESSMENT_NOT_FOUND` 404 once the per-course list is narrowed. See the ruling on deviation 7 below.

### F-7: nits, not findings

- **Orphaned JSDoc blocks:**
  - `staff-scope.service.ts:242-251`: the `mayReachGroup` doc now sits above `reachableGroupIds` (two consecutive doc blocks).
  - `staff-manage.controller.ts:149-157`: the authoring doc sits above `listTasks`.
- **The edit form saves in two requests** (PATCH, then `POST …/targets`, `task-form.tsx:294-303`), so a refused re-target leaves the PATCH applied. The error banner shows. This is acceptable at this scale, but worth knowing when `F-2` is fixed.
- **The visible label beside each `Checkbox` is not clickable** (`task-form.tsx:451`, `:501`). This is the existing primitive's `aria-label` pattern.

## Rulings on the executor's self-declared interpretations

| # | Interpretation | Ruling |
|---|---|---|
| **Deviation 2** | Hidden tasks are dropped from `getPerformanceEntries` (reports) and the staff `studentWork` read | **Endorsed.** A hidden task was not work the student could see, so averaging it would count "not submitted" against them. `studentWork` is documented as agreeing with the student's own screen. One predicate, `isVisibleToStudents`, serves all five reads, so they cannot disagree. I checked every other student-facing assessment read: `dashboard.service`, `student-home.service` and `reports.service` all go through the filtered `AssessmentsService` methods. **Record it in `CHANGELOG.md`** (`F-6`). |
| **Deviation 4** | `status` and `markerDrift` are judged over the whole audience, including unheld targets | **Accepted. No id, name or count leaks.**<br>• The `StaffTask` row carries only task-level columns, `targets` narrowed in SQL (`findTargetsForAssessments(…, groupIds)`), `markerName` (a staff name), and two derived scalars.<br>• The unrestricted audience read (`:582-588`) and the counts (`:589-591`) are never returned. The e2e test asserts the unheld group id is absent from the body (`staff.e2e-spec.ts:2078`).<br>• The residue is enum- or boolean-sized. An assistant can infer that *some* unheld group has a later due date (`open` while theirs is past) or ungraded work (`marking`), and a drift tag on a task whose visible targets their own marker covers reveals that an unheld target exists.<br>• That residue is exactly what `D-35` ("latest due date across the targeted groups") and `D-30`'s viewer-independence require. The per-course list, `AUTH-6`'s remainder, exposes far more today. |
| **Deviation 7** | `setTargets` 403 on a task not on `/staff/tasks` | **Accepted for now, with a follow-up.**<br>• A task set only for unheld groups on a course the assistant reaches is not on `/staff/tasks`. It **is** listed, with its targets, on `GET /staff/courses/:id/assessments`, which `AUTH-6` leaves course-grained, and PATCH on it succeeds. So "the resource is on the caller's own screen" holds, and the 403 body confirms nothing that list does not.<br>• **When `AUTH-6` narrows the per-course list**, that basis disappears and this 403 becomes an existence oracle. It must then turn into `ASSESSMENT_NOT_FOUND`. Add this to `AUTH-6` (`F-6`).<br>• The message's *"also set for"* is slightly inaccurate for a task set *only* for unheld groups. Cosmetic. |
| **Google Form `closed`** | A Google Form task with synced results reads `closed` past due | **Correct as ruled.** `D-34`'s text names it explicitly: *"That includes link and Google Form work, which has no submission rows of its own."* It is not a defect; `F-3` is the related open question. |
| **Old per-course page** | `manage/courses/[id]/assessments/page.tsx` now needs `audience` for attachments | **Accepted.** That page sends no `attachments` today (`grep`: no match), so nothing breaks. `D-29`'s required `audience` is the point. Keep it as the plan's retire-after-consumer-count follow-up. |

## Definition of Done (`PHASE_PLAN.md` §7)

| # | Point | Status |
|---|---|---|
| 1 | Layers (`ARCHITECTURE.md` §6) | **holds.** Drafts are in `manage/`. Repositories do no cross-aggregate joins (names resolve in the service). No fourth `@Global()`. |
| 2 | `018` on real PG 15 from an empty schema, executed rather than skipped | **holds.** I ran it myself: 145/145, 001–018 applied, 15.19. |
| 3 | `TaskDraftRepository` in both drivers; `AssessmentRepository` changes in both | **holds.** Integration tests cover every new or changed `Postgres*` method:<br>• `findMany`, `findById`, `create`, `update`, `remove`, `incrementUsedCount`;<br>• `ASSESSMENT_COLUMNS` round-trips;<br>• **`findByCourseForGroups`/`findByIdForGroups` return the new columns**, including seeded defaults (Risk 2 closed through the shared `TARGETED_NON_WINDOW_COLUMNS`);<br>• `findForStaff`, including the literal `%`/`_` escape;<br>• `findTargetsForAssessments`, `countSubmissionsByAssessments`, the marker sentinel and `draft_id` immutability;<br>• the `SET NULL` cascade and the rollback test. `F-5` is a noted divergence. |
| 4 | DTOs on every new field | **holds.** `IsOptionalNotNull` where NOT NULL; `markerId` is `@IsOptional` because null has meaning. `ArrayMaxSize`, `ArrayUnique`, `IsMediaUrl` and `@IsIn` are applied. The whitelist strips undeclared fields (`main.ts:53-57`). |
| 5 | Authorization in the service via `StaffScopeService` | **holds.** `TaskDraftsService` (`scopeFor`/`assertAssigned`), `listForStaff` (`reachableGroupIds`), `assertTargets` and `setTargets` (`mayReachGroup`), `markerQualifies` (`reachableGroupIds`) and `listForCourse`. `reachableGroupIds` has 4 contract cases (admin/teacher → null, all_groups → null, assigned → held ids, no row → `[]`). The existing cases are unmodified. |
| 6 | Audit: three actions and one target type in the union, the `Record`, the frontend mirror and a spec; transactional | **holds.** `audit-log-repository.interface.ts`, `list-audit-log-query.dto.ts:66-68,87`, `lib/types.ts:760-762`, both `activity/page.tsx` maps. `task-drafts.service.spec.ts` asserts each entry (including non-aliasing `before`), and the e2e test covers the log filter. Every mutation is in `runInTransaction`. There is no frontend `AuditTargetType` mirror; `targetType` is `string` there, so nothing drifts. |
| 7 | Named tests, and refusal tests in both directions | **holds.** Drafts: student 403, assistant-2 `[]`, assistant-1 own course OK versus course-2 404 `===` missing (`e2e:1729,1744`); admin and teacher are unrestricted. Tasks: assistant-2 `[]`, unheld and unknown `groupId` `===`. Marker: assistant 403 on create and update, including the clear case; teacher 400 for an ineligible user; teacher OK. `D-33`: 404 template-identical, re-target 403, teacher and admin unaffected, picker narrowed. Visibility: 404 `===`, hide 409. Oracle: `===` on PATCH, DELETE and targets. |
| 8 | Error cases: not found, out of scope `===`, conflict, unconfigured driver | **holds.** The upload spec covers the 503 with `STORAGE_DRIVER` unset; the form falls back to the URL field only. |
| 9 | Frontend on the real API, no mock data | **holds** by code. There is no fixture or mock in `manage/tasks/`, and every control maps to a DTO field. Behaviour is **not browser-verified.** |
| 10 | `API_SPEC.yaml` matches every new or changed route | **holds.** Drafts ×4, `/staff/tasks` (with `status` and the derivation), the three `/staff/…assessments` routes, `…/targets` (403/404), `/staff/courses/{id}/groups`, `/staff/uploads`, and the student list/detail/submissions (+409). Schemas: `TaskDraftWrite`/`Update`, `Attachment` (with `audience` required), `StaffTask`, `StaffTaskStatus` (4 values), `TaskVisibility` (2 values). |
| 11 | `tsc`, `eslint`, `npm test`, e2e | **holds** (my runs, above). |
| 12 | The eight design questions for the four screens | **holds by reading; the RTL and visual half is outstanding.**<br>• No `text-[var(--…)]`.<br>• The only size utility is `text-base`; tint (`text-fg`/`-2`/`-3`/`-4`) carries hierarchy.<br>• No Panel inside a Panel (the draft editor is a sibling Panel).<br>• No earnings figure, and no `Meter` or `Score`. "Used N times" is a plain count.<br>• No hex, rgb or px font sizes; only `w-[..px]` layout widths.<br>• Logical properties only (`ms-2`, `justify-end`, `align: 'end'`); no `ml-`, `mr-`, `left-`, `right-`, `text-left` or `text-right`.<br>• Missing values render `—`.<br>• Every control sends only accepted fields; the marker is sent only by the teacher or an admin, and `scheduled`, `status` and drift are never sent.<br>`F-1`, `F-2` and `F-4` are behaviour findings, not design-rule breaks. |
| 13 | Documentation | **holds, except `F-6`.** TASK-1..7 are `[~]` with citations; `TASK-F1` and `MARK-6` are placed; `AUTH-6` is narrowed; `PHASE_ROADMAP.md` unit 6 is `[~]`, **not `[x]`**. `DATABASE_PLAN.md` §7 is renumbered with `018` verified. `CLAUDE.md` §3 and §4.1 counts (653/39, 292, 145) match my runs, and §7 and §9 are updated. |

## Checked against `CLAUDE.md` §8

| Area | Finding |
|---|---|
| Uploads | Audio is admitted as mp3 and m4a with server-chosen extensions. `svg`, `html`, `js`, `wav` and `octet-stream` are still refused (spec). No executable type was added. |
| `/uploads` served without authentication | Only under `STORAGE_DRIVER=local`, which is refused in production (`main.ts:79-89`). Stored names are UUIDs, so a staff-only attachment is not reachable by guessing. It is reachable by anyone who holds the URL, and **`audience` governs what the API returns, not file access**. That is recorded honestly in `SECURITY.md` and `D-29`. |
| Staff-only attachments on the student surface | The student detail is the only student read carrying attachments, and it filters field by field. List items carry none. Staff reads (`StaffTask`, `AuthoredAssessment`) are `STAFF_ALL`. |
| Input validation | DTOs on every field; the whitelist is on. `IsMediaUrl` refuses `javascript:` and `data:` (e2e). |
| SQL injection | Parameterised throughout. The `ILIKE` is escaped in code and passed as `$4` with `ESCAPE '\'`. |
| XSS | No `dangerouslySetInnerHTML`. Attachment names and URLs render as text and `href`, and URLs are restricted to `http(s)` and `/uploads/`. |
| Error leakage | Messages are exported `const`s. There are no ids beyond the caller's own input (the not-enrolled template echoes the id the caller sent). |
| Object-level access | Every draft id, assessment id and group id is checked against scope in the service (above). |
| SSRF | Attachment URLs are never fetched server-side. |

## Verified claims

**Re-derived and true:**
- The 653/39, 292 and 145 counts; 0 skipped; 018 on 15.19.
- `D-34`/`D-35` are total, with no null path: `Math.max` falls back to the task's `dueAt` when there are no targets.
- The duplicate `a.work_type, a.external_url` is gone.
- The in-memory driver deep-copies attachments.
- `incrementUsedCount` runs before the insert, in the same transaction.
- `COURSE_NOT_IN_SCOPE` cannot escape a draft-id route: `loadInScope` uses the non-throwing `scopeFor`.
- `role-guards.spec.ts` counts are 30 controllers and 26 expectations, with `TaskDraftsController.remove` added to the assistant-DELETE list.
- No test was deleted, skipped or weakened: the only removed `expect`s are the two count bumps.
- The blog editor refuses audio.

**Not verified:**
- The four screens' rendering, LTR and RTL layout, and the draft-prefill `useEffect`. This is the browser pass.
- The executor's live-verification transcript. I re-ran the suites instead of the curl script, to avoid mutating the coordinator's running dev stack.

## Outstanding verification

**The coordinator's real-browser pass is not yet complete.** It must cover all four screens as teacher **and** assistant-1, in LTR **and** RTL, with `ليلى فهمي`. Specifically:
- the `?course=&draft=` prefill;
- a scoped assistant's edit screen showing no audience editor;
- the amber drift tag;
- the upload button absent when `enabled: false`;
- the toolbar wrapping at narrow widths.

**Also worth reproducing in the browser:**
- `F-1`: edit a drifted task's title as the teacher, and expect a 400 today.
- `F-2`: re-target a task that has an override.

## Remediation checklist

1. **`F-1`.** Stop re-validating an unchanged marker. Do it server-side (skip when `update.markerId === before.markerId`) or in the form (send `markerId` only when changed). Add the "drifted task, title-only PATCH succeeds, marker unchanged" test.
2. **`F-2`.** Preserve the overrides of retained groups on re-target from the edit form, and show them. Add an e2e test that asserts a retained override survives an added group.
3. **`F-3`.** Put the question in *Open decisions* to the user. Implement the answer; if external results count, extend `assertMayHide`, and record it as a `D-` entry either way.
4. **`F-4`.** No pre-selected audience on a new attachment row; Save is disabled until each row has one.
5. **`F-6`.**
   - Annotate `D-30` as superseded on nullability and fix the `§Blockers` reference.
   - Record deviations 2 and 8 in `CHANGELOG.md`.
   - Add the deviation-7 "403 → 404 when the per-course list narrows" note to `AUTH-6`.
6. **`F-5`.** Decide to accept and record it, or null the provenance in `TaskDraftsService.remove`.
7. The coordinator's browser pass (above) is recorded with its results.
8. Re-run `npm test`, `npm run test:e2e` and, if any SQL changed, the integration suite against `tahir-unit6-pg`.

`F-7` is optional.

## Open decisions (surfaced, not ruled on)

- **`F-3`.** *"When a Google Form or link task already has students' synced results, may it still be hidden? And may it still be deleted?"* Today both are allowed. The delete half predates unit 6.
- **Deviation 3 (not raised above).** The `scheduled` label uses the task's own `availableFrom`, not per-group overrides, so a group whose override opens later can read *Published* on the staff list while its students see it locked. *"Should the staff label follow the earliest or latest group opening, as the status follows the latest due date?"* This is low stakes, because students always see their own resolved window.

## Follow-ups for `IMPLEMENTATION_PLAN.md`

- `TASK-F1` (already placed): an admin cannot pick the teacher as marker.
- `MARK-6` (already placed): mode enforcement and the multi-file model.
- `AUTH-6`: add that the deviation-7 403 must become `ASSESSMENT_NOT_FOUND` when the per-course list narrows.
- Retire `manage/courses/[id]/assessments/page.tsx` after a consumer count, since the new screens supersede it.
- Pre-existing, unchanged by unit 6, and not counted against it:
  - `F5-1`;
  - `PostgresWorkRepository`/`PostgresGoogleCredentialRepository` coverage (their SQL is untouched by this range, which I verified with the name-only diff);
  - `group.updated` missing from the frontend `AuditAction` mirror;
  - the empty `backend/{const`.
