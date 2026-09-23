# Execution notes: unit 6, tasks and the draft library

**Executor:** `redesign-executor` · **Date:** 2026-09-22 · **Branch:** `redesign`

**Revision range:** `6dabdb8..aafafd4` covers the code and the documentation, in 12 commits. This
file lands in the one commit after `aafafd4`.

**Environment:**
- Node **v26.8.1**. The project targets 24; recorded, not changed.
- PostgreSQL **15.19** (`postgres:15-alpine`), the throwaway container `tahir-unit6-pg` on :55432.
  No test was pointed at the compose `postgres` service or its volume.

**Status:** all eleven slices are built, **6a → 6b → 6c → 6d → 6f → 6g → 6h → 6i → 6j → 6k → 6e**.
The unit stays `[~]` in `PHASE_ROADMAP.md`; completion is the coordinator's call after review.

**Stopped and recorded, not invented:**
- Two `D-30` edges (§Blockers).
- Two smaller open points.

---

## What was built

### 6a (`88752b4`): migration `018` and both repository drivers

**Migration.** `018_task_drafts_and_task_settings.sql` is additive:
- `task_drafts`: `TIMESTAMPTZ(3)`, JSONB attachments, and CHECKs on type, work type, a non-blank
  title, the array shape and `used_count >= 0`. Index on `(course_id, type)`.
- `assessments` gains `visibility`, `marker_id`, `allow_resubmission`, `submission_modes`, `draft_id`
  and `attachments`.
- **`D-28` and `D-31` were folded in before the first run.** The `visibility` CHECK is
  `('published','hidden')`; `submission_modes TEXT[]` is constrained to the three modes. There is no
  `019`.
- **It ran on PG 15.19 immediately, before any repository code** (output below).

**`AssessmentRepository`, both drivers:**
- The new fields.
- One shared `TARGETED_NON_WINDOW_COLUMNS` for `findByCourseForGroups`/`findByIdForGroups`. This is
  Risk 2; the duplicate `a.work_type, a.external_url` line is gone.
- `findForStaff`: reach restricted with an `EXISTS` in SQL, and an escaped literal `ILIKE`.
- `findTargetsForAssessments`.
- The in-memory driver deep-copies `attachments` on every read and write.

**`TaskDraftRepository`:** `InMemory*` + `Postgres*`, with an atomic, course-scoped
`incrementUsedCount`.

**Files:**
- `backend/src/database/migrations/018_*.sql`
- `assessments/interfaces/assessment-repository.interface.ts`
- both assessment repositories
- `manage/interfaces/task-draft-repository.interface.ts`
- `manage/repositories/{in-memory,postgres}-task-draft.repository.ts`
- `assessments/repositories/in-memory-assessment.repository.spec.ts` (new)
- `test/postgres-repositories.integration-spec.ts`

**`CHANGELOG.md`:** `D-28`…`D-33`, one per blocker.

### 6b (`f00f2bb`): the draft library (`TASK-2`)

**`TaskDraftsService`:**
- The grain is course reach through a held group.
- Every mutation is audited in one `runInTransaction`.
- `TASK_DRAFT_NOT_FOUND` is identical for a missing draft and an unreachable one. The service uses
  the non-throwing `scopeFor`, so `COURSE_NOT_IN_SCOPE` can never escape a draft-id route.
- No own-only rule.

**`TaskDraftsController`:** `/staff/task-drafts` GET, POST, PATCH and DELETE, `STAFF_ALL`.

**DTOs:**
- `TaskDraftWrite`/`TaskDraftUpdate`: a blank title is a 400, and `@IsOptionalNotNull` applies.
- `AttachmentDto`: `IsMediaUrl` refuses `javascript:` and `data:`; at most 10.

**Audit:** `task_draft.created`, `.updated` and `.deleted`, plus the target type `task_draft`. Each is
in the union, the exhaustive `Record`, the frontend `AuditAction` mirror, and both
`activity/page.tsx` maps.

`role-guards.spec.ts` declares the new controller and its assistant-reachable DELETE.

### 6c (`4d2a210`): authoring from a draft, attachments, `allowResubmission`, the oracle fix

**Create.** An optional `draftId` calls `incrementUsedCount(draftId, courseId)` **before** the insert,
in the same transaction. A missing, foreign or unreachable draft is one identical 404. The body is
authoritative (A-2).

**New fields.** `attachments` and `allowResubmission` are accepted on create and PATCH, threaded
field by field. The audit snapshots are extended.

**Student side:**
- A second submission to a one-shot task is a **409**.
- `canSubmit` is false in that state.
- `true` keeps the window-end cut-off.

**The oracle (plan finding 2).** `loadInScope` rethrows the scope 404 as `ASSESSMENT_NOT_FOUND`, so
PATCH, DELETE and POST targets answer identically for a missing id and an out-of-scope task.

### 6d (`789f3ca`): `GET /staff/tasks` (`TASK-6`)

**`StaffScopeService.reachableGroupIds`** (additive):
- `null` for an admin or an `all_groups` assistant.
- The held ids for `assigned_groups`.
- `[]` for a missing scope row.
- Four new contract cases. The existing seven are unmodified.

**`listForStaff`:**
- Restricts in SQL and narrows the targets with the same ids.
- Resolves group names in one batch read.
- An unheld or unknown `groupId` answers `[]`, identically.

### 6f (`4c7eb10`): visibility (`D-28`)

**Stored values:** `published | hidden`. `scheduled` is a 400 at the DTO.

**`isVisibleToStudents`.** One predicate drops a hidden task from:
- the student list;
- the detail and submit routes (404 body `===` a genuine miss);
- `getPerformanceEntries`;
- the staff `studentWork` read.

**Hiding a task with any submission is 409.** It uses the same read as the delete guard.

**The label.** `visibilityStateOf` derives `scheduled` on `GET /staff/tasks` as `visibilityState`.

**Documents amended:** `API_SPEC`, `DATABASE_PLAN`, `DOMAIN_MODEL`, `PRODUCT_SPEC`.

### 6g (`50663ef`): the marker (`D-32`)

**Refusals:**
- An assistant sending a non-null `markerId` is **403**.
- An assistant clearing a marker someone else chose is **403**.
- An assistant sending `null` on an unmarked task is a no-op.

**Who qualifies.** The teacher, any admin, or an **active** assistant who reaches every targeted
group, judged with `reachableGroupIds`. Anyone else, including an unknown id, is a 400.

**Drift is displayed.** `markerName` and `markerDrift` are on `GET /staff/tasks`; `setTargets` never
clears the marker. The scope read is cached per marker, so there is no per-task fan-out.

### 6h (`e58aa76`): the targeting write and the picker (`D-33`)

- `assertTargets` puts every id through `mayReachGroup`. The refusal is `Group <id> is not enrolled
  in this course`, the byte-identical template.
- `setTargets` by a scoped caller whose task's current audience includes an unreachable group is
  **403** (`RETARGET_UNREACHABLE_AUDIENCE`). It is checked before the new set.
- `GroupsService.listForCourse` narrows to held groups: a read restricted to their ids, ordered like
  `findByCourse`.

### 6i (`dc7cf2c`): attachment audience and audio (`D-29`)

**`audience`:**
- `audience: 'students' | 'staff'` is **required at the DTO, with no default**.
- The student `GET /assessments/:id` returns only `students` attachments, mapped field by field
  without the `audience`.

**Uploads:**
- `audio/mpeg` (.mp3) and `audio/mp4` (.m4a) join the whitelist.
- `UploadType.kind` is now its own `UploadKind`, no longer `BlogMediaKind`.
- The blog uploader refuses `audio` with a message and filters it out of its picker.
- New `uploads.service.spec.ts`: the whitelist had no spec.

**`SECURITY.md`:** `audience` is not file access control while `/uploads/*` is unauthenticated.

### 6j (`0d9593d`): submission modes (`D-31`)

- `submissionModes` on create and PATCH: unique, at most 3, from the enum.
- Omitted is `[]`, "not stated".
- Carried on the audit snapshots.

### 6k (`3b6eae1`): status (`D-30`)

**`staffTaskStatusOf`:**
- `open` = `now <= dueAt`;
- `marking` = past due with any ungraded submission;
- `marked` = past due, all graded.
- It is judged over each group's own due date and every submission, so it is identical for every
  viewer.

**Where the ruling does not reach, it returns `null`** (§Blockers). A `null` status matches no filter.

**The counts.** `countSubmissionsByAssessments` (both drivers) does one `GROUP BY`, and its counts are
never returned to a client.

**The filter:** `GET /staff/tasks?status=open|marking|marked`.

### 6e (`33e9986`): the four screens (`TASK-7`)

**`/manage/tasks`:**
- One `Panel` with a `TableToolbar` (search, course, group, status) and a `Table`. Every filter is a
  server query parameter.
- Columns: title, type, course, set for, due, work, visibility, status, marker.
- A `null` status renders as an em-dash. Marker drift is an amber tag.

**`/manage/tasks/new[?course=&draft=]` and `/manage/tasks/[id]`** share `task-form.tsx`, built to the
single-panel `TaskAuthoring` shape.
- "Start from a draft" prefills the form and carries `draftId`. "Save as draft" posts
  `TaskDraftWrite`.
- The attachments editor has a per-row audience. Upload appears only when `uploadConfig.enabled`;
  otherwise there is only the URL field.
- Multi-group targeting uses checkboxes from the held-group picker.
- On edit, **a scoped caller gets no audience editor.** They see the held targets read-only, with "Only
  the teacher can change who this is set for".
- The marker select is shown only to the teacher and admins. Everyone else sees the name read-only.
- Visibility, resubmission, modes, the window, the score cap and the upload rules map one-to-one to
  API fields.

**`/manage/tasks/drafts`:**
- The library table: title, type, course, "Used N times", edited date.
- Use → `/manage/tasks/new?course=&draft=`; Edit (inline editor); two-step Delete.

The screens fill the two nav items that 404'd (plan finding 3).

**The handoff (project `59f824fd`) is not reachable from this repository.** The screens are built to
`redesign-mapping.md`'s `TaskAuthoring` single-panel description.

### Docs (`aafafd4`)

See §Documents updated.

---

## Deviations from the plan, and interpretations the reviewer should check

1. **`findTargetsForAssessments` does not join `groups` for the name.** The in-memory driver would
   have to reach into another aggregate's repository, which `CLAUDE.md` §5 forbids. The service
   resolves names in one batch `groupRepo.findByIds`. The reach restriction is still in SQL.
2. **Hidden tasks are also dropped from `getPerformanceEntries` and the staff `studentWork` read.**
   `D-28` names the list, detail and submit. Reading it as "invisible to students" consistently: a
   report averaging a task the student cannot see would count "not submitted" against them, and
   `studentWork` is documented as agreeing with the student's own screen.
3. **The `scheduled` label uses the task's own `availableFrom`**, not the per-group overrides. A
   group's override can open later or earlier than the label says. Students still see their own
   resolved window.
4. **`markerDrift` and `status` are judged over the task's WHOLE audience**, including groups a
   scoped viewer cannot see. This keeps them viewer-independent, the `D-23` requirement. The cost:
   each is one boolean- or enum-sized fact derived partly from unheld targets. No id, name or count
   of those targets is returned.
5. **Marker eligibility requires `active` only for assistants**, literally as ruled. A teacher or
   admin account is not status-checked.
6. **An admin cannot pick the teacher as marker from the form.** `GET /admin/assistants` returns
   assistants and admins, and no staff-reachable route returns the teacher's id. The teacher can
   pick themselves ("you"). An existing teacher marker is preserved and shown. No route was added,
   since that is scope. It is flagged in §Blockers.
7. **The `setTargets` 403 applies even to a task a scoped caller cannot see on `/staff/tasks`** (a
   task set only for unheld groups on a course they reach). The per-course list, `AUTH-6`'s
   remainder, still shows it, so the "on their screen" basis for 403 holds there. The body confirms
   nothing beyond what that list already shows.
8. **The hide-409 mirrors the delete guard**, so a mirrored external result (Google Form) does not
   count as a submission for it, exactly as it does not for delete.
9. **Frontend mirror additions beyond the plan:**
   - `AuthoredAssessment` gained `workType`/`externalUrl`, which the response already carried
     (pre-existing drift).
   - `WorkType`, `UploadKind` and `AttachmentAudience` were added.
   - `AssessmentDetail.attachments` was added.
10. **The blog editor was touched** (`manage/blog/[id]/page.tsx`: refuse audio, filter it out of
    `accept`). This is a direct consequence of `D-29`'s decoupling. Without it an mp3 uploads, then
    400s on the blog DTO, and the frontend type no longer fits `BlogMediaKind`.
11. **`role-guards.spec.ts` was edited** (29 → 30 controllers; `TaskDraftsController.remove` added to
    the assistant-DELETE list). That is the enumeration doing its job.
12. **One 6f e2e test was changed after 6h.** It had assistant-1 target a cohort they do not hold,
    which `D-33` now refuses, so it authors as the teacher. This is an ordering interaction, not a
    weakened assertion.
13. **No parent fixture exists**, so the "student and parent → 403" refusals are proven with a
    student token (the same `RolesGuard`).
14. **The integration suite's migration-018 block also asserts `'scheduled'` is refused**, which
    proves `D-28` in the catalog.

---

## Blockers hit: stopped and recorded, not invented

**B-3a: status of a task past due with no submissions at all.**
- Readings:
  - (a) `marked`: "all graded" holds vacuously.
  - (b) not `marked`: nothing was marked; perhaps a fourth state such as "closed" or "missed".
- Impact:
  - (a) makes a task nobody handed in read as done.
  - (b) needs a label nobody named.
- Built: `status: null`, matching no filter, rendered as an em-dash.
- External work (`link`, `google_form`) has no submission rows, so past due it always lands here.
  Does "marked" for a Google Form mean its results have synced?
- Blocks: part of `TASK-6`'s filter semantics. The task stays `[~]`.

**B-3b: a task whose groups' own due dates disagree** (one group past due, another not).
- Readings:
  - use the latest due date (`open` until everyone is due);
  - use the earliest;
  - show per group.
- Built: `null`.
- A task with no `dueAt` cannot occur (`due_at` is NOT NULL).

**B-4 remainder: what the submission modes *do* at submit time.**
- `D-31` stores them. Nothing says whether `doc_link` should admit a student URL as `fileUrl`, or
  whether `pdf_upload` should narrow `allowedFileTypes`.
- Built: stored, returned to staff, **not enforced and not on the student detail**. That is left to
  unit 7 with the multi-file model.

**B-5 remainder: an admin naming the teacher as marker.** It needs a staff-reachable way to learn the
teacher's id. Deviation 6.

---

## Tests (real output)

Integration run immediately after `018` was written, before any repository code:

```
[Nest] 56999  - 09/22/2026, 6:53:31 PM     LOG [MigrationRunner] Applied 018_task_drafts_and_task_settings.sql
 Test Files  1 passed (1)
      Tests  125 passed (125)
```

Final runs, at `33e9986` (code) with the docs commit touching no code:

```
$ node -v
v26.8.1

$ npm test
 Test Files  39 passed (39)
      Tests  653 passed (653)
   Start at  19:36:51
   Duration  5.15s (transform 2.19s, setup 0ms, import 14.23s, tests 14.56s, environment 3ms)


$ npm run test:e2e
 Test Files  4 passed (4)
      Tests  291 passed (291)
   Start at  19:36:56
   Duration  7.84s (transform 390ms, setup 0ms, import 1.51s, tests 6.11s, environment 0ms)


$ TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:55432/tahirelshazli_test npm run test:integration
[Nest] 63592  - 09/22/2026, 7:37:05 PM     LOG [MigrationRunner] Applied 018_task_drafts_and_task_settings.sql
 Test Files  1 passed (1)
      Tests  145 passed (145)
   Duration  4.04s (transform 130ms, setup 0ms, import 226ms, tests 3.73s, environment 0ms)

$ docker exec tahir-unit6-pg psql -U dev -d tahirelshazli_test -tAc "select version()"
PostgreSQL 15.19 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit

$ cd frontend && npx tsc --noEmit; echo "exit $?"
exit 0

$ cd frontend && npx eslint .; echo "exit $?"
exit 0

$ npm run lint
> tahirelshazli-lms@0.1.0 lint:backend
> npm run lint --workspace=backend


> backend@0.0.1 lint
> oxlint src/ test/

src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars): Identifier 'EXTERNAL_WORK_BINDER' is imported but never used. help: Consider removing this import.

$ grep -rn 'text-\[var(--' 'frontend/app/(app)/manage/tasks' | wc -l
       0
```

Movement against the baseline:
- unit 576/36 → **653/39**;
- e2e 244 → **291**;
- integration 125 → **145, 0 skipped** (the summary line lists no skipped count);
- frontend `tsc` 0 → 0.

The one oxlint warning, `dashboard.controller.spec.ts` unused `EXTERNAL_WORK_BINDER`, is in a file
unit 6 did not touch, so it predates the unit.

Named plan tests that exist:
- `migration 018` ×7, `task drafts` ×6, `assessments: unit-6 columns` ×6, and the
  `runInTransaction` create-from-draft rollback;
- `task-drafts.service.spec` ×11;
- the authoring spec extended to 62;
- `staff-scope` +4;
- e2e blocks: `task drafts`, authoring from a draft, the existence oracle, `GET /staff/tasks`,
  visibility, marker, `D-33`, audience, modes, status.

---

## Live verification (`npm run dev`, `PERSISTENCE_DRIVER=memory`), real output

Teacher (`teacher@`), admin (`admin@`), scoped assistant (`assistant@`, holds group-1 only),
unassigned assistant (`assistant2@`), student:

```
== drafts
student GET /staff/task-drafts -> 403 {"message":"Forbidden resource","error":"Forbidden","statusCode":403}
assistant-1 POST draft course-1 -> id ecd51026-682c-418f-9ebe-7ad5400e3e25
assistant-1 PATCH draft -> 200 {"courseId":"course-1","type":"homework","workType":"file_upload","title":"Live draft, edited","description":"","instructions":"","attachments":[{"url":"/uploads/p.pdf","name":"Pas
assistant-1 PATCH course-2 draft (out of scope) -> 404 {"message":"Task draft not found","error":"Not Found","statusCode":404}
assistant-1 PATCH nonexistent draft -> 404 {"message":"Task draft not found","error":"Not Found","statusCode":404}
assistant-2 GET drafts -> 200 []
admin GET drafts -> 2 drafts: Course-2 draft | Live draft, edited
== authoring
assistant-1 POST task from draft -> id 30cf61df-4762-49e3-9957-25b5eb15cb0d
draft usedCount after authoring -> 1
assistant-1 POST task with markerId -> 403 {"message":"Only the teacher or an admin can choose who marks a task","error":"Forbidden","statusCode":403}
teacher PATCH markerId assistant-2 (holds nothing) -> 400 {"message":"markerId must name the teacher, an admin, or an active assistant who reaches every group this task is set for","error":"Bad Request","statusCode":400}
teacher PATCH markerId assistant-1 -> 200 {"courseId":"course-1","lessonId":null,"title":"Live from draft","description":"","instructions":"","type":"homework","topics":[],"availableFrom":"2026-01-01T00:00:00.000Z","availa
admin PATCH visibility scheduled -> 400 {"message":["visibility must be published or hidden"],"error":"Bad Request","statusCode":400}
teacher hide assess-3 (has submission) -> 409 {"message":"This task has submissions and cannot be hidden. Close its availability window instead.","error":"Conflict","statusCode":409}
assistant-1 POST task targeting unheld group-3 -> 404 {"message":"Group e135a83d-92d3-4a49-9eb8-210b297b8aa6 is not enrolled in this course","error":"Not Found","statusCode":404}
assistant-1 POST task targeting group-2 (off course) -> 404 {"message":"Group group-2 is not enrolled in this course","error":"Not Found","statusCode":404}
assistant-1 re-target shared task -> 403 {"message":"This task is also set for groups you do not hold, so only the teacher or an admin can change who it is set for","error":"Forbidden","statusCode":403}
assistant-1 PATCH course-2 task (oracle) -> 404 {"message":"Assessment not found","error":"Not Found","statusCode":404}
assistant-1 PATCH nonexistent task -> 404 {"message":"Assessment not found","error":"Not Found","statusCode":404}
== GET /staff/tasks
assistant-1 -> 10 tasks; shared targets=["IGCSE Chemistry — Saturday 18:00"]; mine={"status":"open","visibilityState":"published","markerName":"Nour Hassan","markerDrift":false}; contains group-3 id? false
admin -> 11 tasks; shared targets=["Live group 3","IGCSE Chemistry — Saturday 18:00"]
teacher -> 11 tasks; statuses={"open":3,"null":2,"marked":5,"marking":1}
assistant-2 GET /staff/tasks -> 200 []
assistant-1 GET /staff/tasks?groupId=group-3 -> 200 []
teacher ?status=marked -> assess-3:marked, assess-7:marked, assess-5:marked, assess-6:marked, assess-8:marked
teacher GET /staff/tasks?status=closed -> 400 {"message":["status must be open, marking or marked"],"error":"Bad Request","statusCode":400}
student GET /staff/tasks -> 403 {"message":"Forbidden resource","error":"Forbidden","statusCode":403}
== picker (D-33)
assistant-1 course-1 groups -> group-1
teacher course-1 groups -> 2
== student side
student detail attachments -> [{"url":"https://example.com/p.pdf","name":"Passage","mimeType":null,"sizeBytes":null}] canSubmit=true
student submit #1 -> 201 {"id":"a691c244-c728-4681-a5ee-7e9855254612","assessmentId":"30cf61df-4762-49e3-9957-25b5eb15cb0d","studentId":"student-1","fileUrl":null,"answerText":"first","submittedAt":"2026-0
student submit #2 (one-shot) -> 409 {"message":"This task accepts one submission only.","error":"Conflict","statusCode":409}
student GET hidden task -> 404 {"message":"Assessment not found","error":"Not Found","statusCode":404}
student GET nonexistent task -> 404 {"message":"Assessment not found","error":"Not Found","statusCode":404}
student list contains hidden? false
== uploads + audit
upload config audio -> audio/mpeg,audio/mp4
upload mp3 -> kind=audio url=/uploads/db28c590-75ff-4ccd-9b32-a3455bbb281c.mp3
assistant-1 DELETE draft -> 204 
audit task_draft.created -> 2 entries, latest actor teacher-1
audit task_draft.updated -> 1 entries, latest actor assistant-1
audit task_draft.deleted -> 1 entries, latest actor assistant-1
audit assessment.created -> 4 entries, latest actor teacher-1
audit assessment.updated -> 1 entries, latest actor teacher-1
== screens (server render of the route shells)
GET :3000/manage/tasks -> 200
GET :3000/manage/tasks/new -> 200
GET :3000/manage/tasks/drafts -> 200
GET :3000/manage/tasks/30cf61df-4762-49e3-9957-25b5eb15cb0d -> 200
```

**The four screen routes return 200 from `next dev`.** They are client components, so that proves
they compile and serve, not that they render correctly. **A browser pass (teacher and assistant-1,
LTR and RTL with `ليلى فهمي`) is still owed**, for the coordinator.

Both dev servers were stopped and :3000/:3001 are free. The one test mp3 the run uploaded
(gitignored `backend/var/uploads/`) was deleted.

---

## Design questions (`IMPLEMENTATION_PLAN.md` §Verification), for the four screens

1. **Earnings figure:** none.
2. **Mark and completion together:** never. There are no scores or meters. "Used N times" is a plain
   count.
3. **Literal hex, rgb or px font-size:** none. A grep finds only `w-[..px]` layout widths, the
   existing pages' convention.
4. **`text-[var(--`:** 0 (grep output above).
5. **Focus outline:** no `outline-none` added. The primitives' focus-within rings apply.
6. **Panel in Panel:** none. The form is one `Panel` divided by `SectionTitle`. The draft editor is
   a sibling `Panel` above the table's.
7. **Title case or emoji:** none. Sentence-case labels throughout.
8. **RTL and a long Arabic name:** logical properties only (`ms-2`, `text-start`/`end` through
   `Table`). **Not browser-checked**; owed with the browser pass.

The size utility is only `text-base` (13px). Headings versus captions use tint (`text-fg` /
`text-fg-2` / `text-fg-3`).

---

## Not done, and why

- **The browser pass of the four screens.** Assigned to the coordinator.
- **The `D-30` edges, modes enforcement, and the admin-picks-teacher marker.** §Blockers.
- **`AUTH-6` remainder.** Out of scope by the plan.
- **Retiring `manage/courses/[id]/assessments/page.tsx`.** Superseded, not deleted, per the plan. It
  still works: every new field is optional there, except that an attachment now needs `audience`,
  and that page sends none.
- **`F5-1`, and the `PostgresWorkRepository`/`PostgresGoogleCredentialRepository` coverage.** Not
  touched, as instructed. Neither repository's SQL changed.

---

## Findings outside scope (recorded, not fixed)

- `frontend/lib/types.ts`'s `AuditAction` mirror **lacks `group.updated`**, which the backend
  records. The activity log renders a blank label for it. This drift predates unit 6.
- `manage/assistants/page.tsx` renders group `Checkbox`es with **no visible label** (only
  `aria-label`). The new screens render the text beside each box.
- `API_SPEC.yaml` still omits most existing student and staff routes. Unit 6 added every route it
  changed.
- An empty file named `backend/{const` exists, dated 17:05, before this session. Git does not list
  it. It was left alone.
- `API_GAP_ANALYSIS.md` B3/A4 rows still read `[MISSING]`/`[MODIFY]` for what unit 6 built. The
  reviewer or coordinator may want them marked.

---

## Documents updated

- `API_SPEC.yaml`: every changed route and its schemas.
  - Routes: the draft routes, `/staff/tasks` (the `status` param with its derivation),
    `/staff/courses/{courseId}/assessments`, `/staff/assessments/{id}` (+ the 409 and the 403),
    `/staff/assessments/{id}/targets` (the `D-33` 403/404), `/staff/courses/{courseId}/groups`, and
    `/staff/uploads`.
  - Student routes: `/courses/{courseId}/assessments`, `/assessments/{id}`, and `/submissions`
    (+409).
  - Schemas: `TaskDraft` (response), `TaskDraftWrite`, `TaskDraftUpdate`, `Attachment` (+
    `audience`), `AuthoredAssessment`, `AssessmentWrite`, `AssessmentPatch`, `StaffTask`,
    `StaffTaskTarget`, `TaskVisibility` (narrowed), `VisibilityState`, `SubmissionMode`,
    `StaffTaskStatus`.
- `DATABASE_PLAN.md`: §2 (the visibility narrowing, `submission_modes`, `attachments`), §3
  (`created_at`), §7 renumbered with `018` recorded as applied and verified.
- `DOMAIN_MODEL.md` §4 and `PRODUCT_SPEC.md` §2.1: the `D-28` narrowing and the new fields.
- `AUTHORIZATION_MODEL.md`:
  - §4: draft, `/staff/tasks`, task-by-id and `D-33` rows.
  - §6: drafts struck from the no-gate gap.
- `SECURITY.md`: the upload whitelist line.
- `ARCHITECTURE.md` §2.4: ten callers, 29 call sites (recount method stated).
- `IMPLEMENTATION_PLAN.md`: TASK-1..7 `[~]` with citations; `AUTH-6` narrowed.
- `PHASE_ROADMAP.md`: unit 6 `[~]`, **not** `[x]`.
- `CHANGELOG.md`: `D-28`…`D-33`, then A-1..A-4, the oracle fix, and no own-only drafts.
- `CLAUDE.md`: §3 and §4.1 test counts, §7 caller count and `AUTH-6` remainder, §9 001–018.
- `project_log.md`: the unit-6 entry.
- `PHASE_PLAN.md`: a rulings addendum at §8.

---

## For the reviewer: what I am least sure of

1. **Deviation 2** (hidden tasks also leave reports and `studentWork`) and **deviation 4**
   (viewer-independent derivations reading unheld targets). Both are interpretations. Check them
   against `D-28`/`D-23`.
2. **`D-30`'s null edges.** Confirm that `null` rather than a guess is acceptable until ruled, and
   that the list's em-dash is the right rendering.
3. **The 6e screens have not been seen in a browser.** tsc and eslint are clean and the data paths
   are verified by curl, but layout, RTL and the draft-prefill effect are unobserved.
4. **The old per-course assessments page** now fails to add attachments without an audience. It
   sends none today, so nothing breaks, but it is a latent 400 if someone extends it.
