# Phase plan: unit 6, Tasks and the draft library

**Planner:** `redesign-planner` · **Date:** 2026-09-22 · **Branch:** `redesign` · **Base:** `6dabdb8`
(working tree clean, verified with `git status --porcelain`: 0 lines).

**Input read:**
- `CLAUDE.md` in full.
- `PHASE_ROADMAP.md` §1–§3 and unit 6.
- `IMPLEMENTATION_PLAN.md`: the Definition of Done, `AUTH-6`, Phase 7, `D-23`, and the unit-5 follow-ups.
- `PRODUCT_SPEC.md` §2.1.
- `DOMAIN_MODEL.md` §4 and §8.
- `DATABASE_PLAN.md` §2, §3, §5 and §7.
- `API_SPEC.yaml`: the tasks schemas, `/staff/task-drafts` and `/staff/tasks`.
- `API_GAP_ANALYSIS.md` A4, A5 and B3.
- `AUTHORIZATION_MODEL.md` §3 and §4.
- `SECURITY.md` §3.4, §3.5 and §4.
- `ARCHITECTURE.md` §2 and §6.
- `redesign-mapping.md`: navigation and coverage.
- `CHANGELOG.md`: `D-23` and the migration-renumber entry.

**Code read:**
- `manage/assessment-authoring.service.ts` in full.
- `staff/staff-scope.service.ts` in full.
- `assessments/interfaces/assessment-repository.interface.ts` in full.
- `assessments/assessments.service.ts` in full.
- `postgres-assessment.repository.ts`: every SQL statement that touches `assessments`.
- `manage/staff-manage.controller.ts` and `manage/dto/assessment.dto.ts`.
- `common/storage/*`.
- `audit/interfaces/audit-log-repository.interface.ts` and `audit/dto/list-audit-log-query.dto.ts`.
- `test/postgres-repositories.integration-spec.ts`: setup, `assessments`, `assessment targeting`.
- The seeds `002` and `003`.
- Migrations `001`, `016` and `017`.
- `components/shell/console-shell.tsx`, `components/ui/index.ts`, `app/globals.css`, and `app/(app)/manage/courses/[id]/assessments/page.tsx`.
- `app/(app)/homework/page.tsx`.

**Ground truth re-established by the planner:**
- `npm test`: **576 passed, 36 files.**
- `ls backend/src/database/migrations/`: the last migration is `017_assistant_invitations.sql`.

The coordinator's baseline of 244 e2e passing and 0 `tsc` errors is taken as given, not re-run.

**Not read, and why:** the Claude Design handoff (project `59f824fd`) is not in this repository and
not reachable from here. TASK-7's screens must be built against it by whoever has access. Where no
one does, build to the `TaskAuthoring` single-panel shape `redesign-mapping.md:177` names, and
record that in `EXECUTION_NOTES.md`.

---

## 0. Headline

Three of the eight scope items are fully specified. Five questions are not answered by any document,
and the plan scopes them out rather than guess.

**Built:**
- **`task_drafts`** (`TASK-2`): the table, both repositories, four routes and three audited actions.
- **Authoring from a draft** (`TASK-3`).
- **The global `GET /staff/tasks`** (`TASK-6`), group-grain from birth.

**Built in part:**
- **Attachments on the staff side** (`TASK-4`).
- **`allowResubmission`** (half of `TASK-5`).
- **The four console screens** (`TASK-7`).

**Gated behind a blocker:**
- `visibility` semantics (`B-1`).
- Who may see an attachment (`B-2`).
- The staff-side task `status` filter (`B-3`).
- The submission modes (`B-4`).
- Marker assignment (`B-5`).
- Whether this unit closes the half of `AUTH-6` it rewrites (`B-6`).

Each gated slice is fully specified under its recommended reading. It becomes executable as soon as
the question is answered.

**Findings the documents do not record. Each is cited in §3.**
1. **The premise behind `scheduled` is false against the code.** The documents say that today "a
   scheduled task cannot be shown as locked-with-a-date". But `computeStatus` already returns
   `locked` for `now < availableFrom` (`assessments.service.ts:220-223`). The student list already
   shows such a task under "Marked and locked" (`homework/page.tsx:144,184`), and the detail page
   shows `Opens <availableFrom>` (`homework/[assessmentId]/page.tsx:130`). A `published` task with a
   future window **already is** "locked with a date". So what `scheduled` adds is undefined. This is
   `B-1`.
2. **Existence oracle on three existing routes: `PATCH` and `DELETE /staff/assessments/:id`, and
   `POST .../targets`.**
   - `loadInScope` (`assessment-authoring.service.ts:217-229`) throws `'Assessment not found'` for a
     missing id.
   - It throws `COURSE_NOT_IN_SCOPE` (`'Course not found or not assigned to you'`) for a real
     assessment on a course the caller cannot reach.
   - Both are 404, but the bodies differ.
   - No spec covers it: a grep of `backend/test` and `manage/*.spec.ts` for either message finds
     nothing.

   Unit 6 changes all three routes, so the fix is planned in slice 6c (§4, *Authorization*).
3. **No page exists for `/manage/tasks` or `/manage/tasks/drafts`, yet both are live nav items**
   (`console-shell.tsx:93-94`). Today they 404 in the console.
4. **No `GET` exists for one staff task.** The only staff read is the per-course list
   `GET /staff/courses/:id/assessments`. That route is course-grained, which is `AUTH-6` territory.
5. **Assessment attachments have no storage in `DATABASE_PLAN.md`.** Only `task_drafts.attachments`
   is listed. `API_GAP_ANALYSIS.md` B3 and A4 require attachments on the task itself. That is a
   documentation gap, closed here with an engineering choice (§4, *Database*).
6. **The migration numbering in `DATABASE_PLAN.md` §7 is stale.** It assigns `016` to task drafts,
   but `016` is `mail_deliveries` and `017` is `assistant_invitations`. This unit's migration is
   **`018`**, and §7 must be renumbered in the same change.
7. **`findByCourseForGroups` and `findByIdForGroups` keep their own column lists, separate from
   `ASSESSMENT_COLUMNS`** (`postgres-assessment.repository.ts:212-226, 248-256`). The first also
   selects `a.work_type, a.external_url` twice. A new column added only to `ASSESSMENT_COLUMNS` is
   silently `undefined` on every **student** read. This is Risk 2.
8. **The staff upload whitelist has no audio type** (`upload-types.ts:36-49`), yet `PRODUCT_SPEC`
   §2.1 names "an audio file" as a task attachment. It is part of `B-2`.

---

## 1. Scope

**IN:**
- `TASK-1` … `TASK-7` (`IMPLEMENTATION_PLAN.md:268-275`).
- The documentation `CLAUDE.md` §12 requires.
- The existence-oracle fix from finding 2. This is **in scope by construction**: the coordinator's
  caution 6 requires every route this unit changes to answer out-of-scope and nonexistent
  identically, and unit 6 changes these routes. It is a single helper, and it is flagged here so
  the coordinator can strike it at approval.

**Executable now:**

| Slice | Task | Content |
|---|---|---|
| 6a | TASK-1 plumbing, TASK-2, TASK-4, TASK-5 plumbing | Migration `018`, both repository drivers, integration tests |
| 6b | TASK-2 | Draft library: service, authorization, API, tests |
| 6c | TASK-3, TASK-4 (staff half), TASK-5 (`allowResubmission`) | Authoring from a draft; attachments on the staff side; `allowResubmission` written and enforced; oracle fix |
| 6d | TASK-6 | `GET /staff/tasks`, group-grain, plus one additive `StaffScopeService` method |
| 6e | TASK-7 | Task list, authoring (new and edit), and draft-library screens against the real API |

**Gated. Each is specified in §4 and becomes executable when its blocker closes:**

| Slice | Task | Gate |
|---|---|---|
| 6f | TASK-1 API and derivation | `B-1` |
| 6g | TASK-5, marker assignment | `B-5` |
| 6h | D-23 on the targeting write (overlaps `AUTH-6`) | `B-6` |
| 6i | TASK-4, the student-facing attachments | `B-2` |
| 6j | TASK-5, the submission modes | `B-4` |
| 6k | TASK-6, the `status` filter and any per-row counts | `B-3` |

**OUT, and why:**

| Item | Reason |
|---|---|
| `F5-1`: 114 broken `text-[var(--fs-*)]` classes on marketing and auth pages | Coordinator instruction. Needs a token-mapping decision. The new screens must not add to it. |
| `PostgresWorkRepository` / `PostgresGoogleCredentialRepository` integration coverage | Pre-existing. **Unit 6 changes neither repository's SQL.** `bindExternal` is called exactly as today. If the executor finds it must change either, each changed method needs a named integration test, and that is a deviation to record. |
| The rest of `AUTH-6` | Not in `TASK-1..7`. Covers the roster, `GET /staff/courses/:id/submissions`, the analytics pair, the per-course `GET /staff/courses/:id/assessments`, and `PATCH`/`DELETE` of a task shared with an unheld group. `B-6` decides only the targeting-write half. |
| Splitting homework from quizzes on the student read (`API_GAP_ANALYSIS.md` A4) | That is the student surface's IA (unit 13). It is not visibility. |
| Marking, the per-task submissions queue, and non-submitters | Unit 7 (`MARK-*`). Unit 6 stores the marker; unit 7 decides what the marker *means* for grading. |
| Retiring `manage/courses/[id]/assessments/page.tsx` | It still works, and the new screens supersede it. Deleting it is a consumer-count decision in the manner of `D-25`. Record it as a follow-up; do not delete in this unit. |

---

## 2. Entry criteria: verified

| Criterion | Evidence |
|---|---|
| Branch is `redesign`, and `git status` has been inspected | `git rev-parse --abbrev-ref HEAD` gives `redesign`. HEAD is `6dabdb8`. The porcelain output is 0 lines. |
| Units 1, 2 and 4 are `[x]` | `PHASE_ROADMAP.md`: unit 1 is `[x]` COMPLETE, unit 2 is complete (2a and 2b approved, `AUTH-2` `[x]`), and unit 4 is `[x]` (`APPROVED` 2026-09-21). Unit 5 is `[x]` as well (2026-09-22), although it is not a stated dependency. |
| No open blocker in `IMPLEMENTATION_PLAN.md` §Blocked gates an in-scope task | §Decisions: "all closed". `AUTH-6` is `[ ]`, not `[!]`, and is outside scope. The six blockers in this plan are **new**, and each is scoped out below. |
| Backend suite green at start | `npm test`: 576/576, 36 files (planner re-run). e2e: 244/244 (coordinator). |
| Migrations 001–017 verified on real PostgreSQL | `CLAUDE.md` §9 and `FOLLOW_UP_CLOSURE.md`: all of 001–017 have run from an empty schema, on **PG 16**. Unit 6 must run on `postgres:15-alpine` (`docker-compose.yml:13`), which also closes unit 5's PG-version caveat. |

**Environment caveats to record in `EXECUTION_NOTES.md`, not to hide:**
- Node is v26.8.1, not the project's 24.
- Docker 29.6.2 is available, so the migration gate is runnable in this environment. Unit 5 could
  not run it.

---

## 3. Reconciliation

| Question | Finding, with citation |
|---|---|
| **Remains unchanged** | See the list below this table. |
| **Changed** | See the list below this table. |
| **Removed** | Nothing. No task feature is `[REMOVED]` in `PRODUCT_SPEC` §2.1. |
| **New** | `TaskDraft`. There is no backend, table or route today. `DOMAIN_MODEL.md` §4 and `DATABASE_PLAN.md` §3 cover it. Also new: `GET /staff/tasks`, marked `[MISSING]` in `API_GAP_ANALYSIS.md` B3. |
| **Missing APIs** | `GET`/`POST /staff/task-drafts`, `PATCH`/`DELETE /staff/task-drafts/:id`, and `GET /staff/tasks`. All five are in `API_SPEC.yaml:1110-1176`. Their request and response schemas need correcting (§4, *API*). |
| **APIs to modify** | `POST /staff/courses/:id/assessments`, `PATCH /staff/assessments/:id` and `POST /staff/assessments/:id/submissions` (student). Each is **additive** for `lib/api.ts`: new optional request fields and new response fields. `AuthoredAssessment` in `lib/types.ts` gains fields, and nothing is removed. The breaking half is below. |
| **Breaking change** | A student resubmission against a task with `allowResubmission: false` becomes a **409**. It cannot happen until someone sets the flag, because the default is `true`. |
| **Obsolete APIs** | None retired. `GET /staff/courses/:id/assessments` stays: the old course page and the edit screen's fallback use it. See 6e. |
| **Domain changes** | New `TaskDraft`. `Assessment` gains `visibility`, `markerId`, `allowResubmission`, `draftId` and **`attachments`**. The last is not in `DOMAIN_MODEL.md` §4's field list; that is a documentation gap to close. Also new: an `Attachment` value object (`API_SPEC.yaml:413`). |
| **Database changes** | Migration **`018`**, additive, with no backfill, no data movement and no destructive step (§4, *Database*). |
| **Authorization changes** | See the list below this table. |
| **Security implications** | §4, *Security*. |
| **Frontend/backend dependencies** | 6e needs 6b, 6c and 6d merged. Visibility, marker and submission-mode controls do **not** render until 6f, 6g and 6j land. No control may post a field the API does not yet accept. |
| **Architectural risks** | One additive `StaffScopeService` method, in the same shape as `mayReachGroup`. It is a contract change, so it needs contract tests. No new module, no fourth `@Global()`, no new port. |
| **Migration risks** | Adding a `NOT NULL DEFAULT` column is safe on PG 11+. Existing rows get `published`/`true`/`[]`, which is exactly today's behaviour. `draft_id`'s FK to a table created in the same file needs `CREATE TABLE` first; getting that order wrong aborts the migration. |
| **Testing requirements** | §4, *Tests*. |
| **Unresolved product decisions** | `B-1` … `B-6` (§8). |

**Remains unchanged.** The executor must not touch:
- `workType` / `externalUrl` / `bindExternal` (migration 010, `assessment-authoring.service.ts:131-145, 279-294`).
- Window validation (`:152-169`).
- Delete-refused-once-submitted (`:439-467`).
- The `assessment_targets` join and its override semantics (`assessment-repository.interface.ts:118-151`).
- The student group-targeting gate (`assessments.service.ts:150-189`).
- `computeStatus`'s four values, until 6f.
- The work-analytics subsystem (`API_GAP_ANALYSIS.md` A8: `[KEEP]` ×7).
- `POST /staff/uploads` as a route.

**Changed.** Authoring (`PRODUCT_SPEC` §2.1 `[CHANGED]`). Old versus new:
- **Old:** a task is title, content, window, upload rules, work type and targets.
- **New:** a task also carries:
  - `draftId` provenance and `attachments[]`;
  - `allowResubmission`;
  - `visibility` (gated, `B-1`);
  - `markerId` (gated, `B-5`).

  It can also be started from a draft.
- **Student submit, old:** resubmission is always allowed while the window is open and the work is
  unmarked (`assessments.service.ts:414-487`).
- **Student submit, new:** refused with 409 when `allowResubmission` is false and a submission
  exists.

**Authorization changes:**
- **Drafts** get a new object-level gate. `AUTHORIZATION_MODEL.md:252` says "Build with the
  feature, never after". Its grain is **course reach derived from held groups**, justified in §4.
- **`GET /staff/tasks`** is group-grain.
- **`StaffScopeService.reachableGroupIds`** is new (additive).
- **Optional (6h):** held-group enforcement on the targeting write.
- **New refusal tests** are listed in §4, *Tests*.

---

## 4. Changes by layer

### Database: migration `018_task_drafts_and_task_settings.sql`

**Additive. Not destructive. No backfill.** The pattern is `017`'s: a header comment citing the
task and the `DATABASE_PLAN.md` row, and a comment on each constraint giving its reason.

```sql
CREATE TABLE task_drafts (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,   -- same as assessments.course_id
  type         TEXT NOT NULL CHECK (type IN ('homework', 'assignment', 'quiz')),
  work_type    TEXT NOT NULL DEFAULT 'file_upload'
               CHECK (work_type IN ('file_upload', 'link', 'google_form')),
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  attachments  JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array'),
  used_count   INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_by   TEXT NOT NULL REFERENCES users (id),                        -- RESTRICT, as 017's invited_by
  created_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX task_drafts_course_id_type_idx ON task_drafts (course_id, type);  -- DATABASE_PLAN §5

ALTER TABLE assessments
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'published'
      CHECK (visibility IN ('published', 'scheduled', 'hidden')),
  ADD COLUMN marker_id TEXT REFERENCES users (id),
  ADD COLUMN allow_resubmission BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN draft_id TEXT REFERENCES task_drafts (id) ON DELETE SET NULL,
  ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'
      CHECK (jsonb_typeof(attachments) = 'array');
```

**Deviations from `DATABASE_PLAN.md`, each deliberate:**
- `task_drafts.created_at` is added. It is the `CLAUDE.md` §9 convention, and §3's list is
  shorthand, as `017` recorded for `name`.
- `TIMESTAMPTZ(3)`, per `CLAUDE.md` §9: a JavaScript `Date` is the reader.
- `assessments.attachments JSONB` is new (finding 5). **JSONB rather than a child table:** a draft
  stores JSONB (`DATABASE_PLAN.md` §3), authoring from a draft *copies* it, and a task has a handful
  of attachments. A child table would cost a third repository surface for no read that filters on
  it.
- `marker_id` has no `ON DELETE` clause, exactly as §2 writes it. No product path deletes a
  `users` row (`admin-assistants.service.ts:172-190` removes only invitations).

**Gated adjustments.** If a ruling arrives **before 6a is authored**, amend `018` in place:
- If `B-1` closes as reading C, narrow the `visibility` CHECK to `('published','hidden')`.
- If `B-1` closes as reading B, add `publish_at TIMESTAMPTZ(3)` plus
  `CHECK (visibility <> 'scheduled' OR publish_at IS NOT NULL)`.

If a ruling arrives after `018` has run, it gets `019`. **Never edit an applied migration.**

**How it refuses bad data:**
- The CHECKs on `visibility`, `type`, `work_type`, the attachments' array shape, `used_count >= 0`
  and a non-blank title.
- The FKs.

**Data risk to existing rows: none.** Every default reproduces today's behaviour: `published`, as
today; `allow_resubmission = true`, which is today's rule; `[]` attachments; null marker and draft.

**Indexes:** only `(course_id, type)`. No reads in this unit filter on `draft_id` or `marker_id`.
Unit 7 adds a marker index if the queue filters on it (`DATABASE_PLAN.md` §5: resist adding more).

### Repositories: every new table costs two implementations

**New `TaskDraftRepository`** (`manage/interfaces/task-draft-repository.interface.ts`, token
`TASK_DRAFT_REPOSITORY`). It needs **both** `InMemoryTaskDraftRepository` **and**
`PostgresTaskDraftRepository` in `manage/repositories/`, wired with `repositoryProvider` in
`ManageModule` (pattern 2.1). Only `ManageModule` consumes it, so it needs no separate repository
module, unlike `AssistantInvitationRepositoryModule`, which exists to break a cycle.

```ts
interface Attachment { url: string; name: string; mimeType: string | null; sizeBytes: number | null }
interface StoredTaskDraft { id; courseId; type: AssessmentType; workType: WorkType; title; description;
  instructions; attachments: Attachment[]; usedCount: number; createdBy; createdAt; updatedAt }
findMany(filter: { courseIds: readonly string[] | null; courseId?: string; type?: AssessmentType }): Promise<StoredTaskDraft[]>
  // null courseIds = unrestricted; [] = nothing, with no round trip. Order: updated_at DESC, id.
findById(id): Promise<StoredTaskDraft | null>                 // returns a COPY (§9 aliasing rule)
create(input: NewTaskDraft): Promise<StoredTaskDraft>
update(id, patch: TaskDraftUpdate): Promise<StoredTaskDraft | null>   // stamps updated_at; COALESCE pattern
remove(id): Promise<boolean>
incrementUsedCount(id, courseId): Promise<StoredTaskDraft | null>
  // UPDATE … SET used_count = used_count + 1 WHERE id = $1 AND course_id = $2 RETURNING …
  // Atomic and row-locking; null → the caller's 404.
```

`Attachment` is shared by drafts and assessments. It lives in
`assessments/interfaces/assessment-repository.interface.ts` and the draft interface imports it
(`manage` already imports from `assessments`).

**Changed `AssessmentRepository`, in both drivers:**
- **`StoredAssessment`** gains `visibility: TaskVisibility`, `markerId: string | null`,
  `allowResubmission: boolean`, `draftId: string | null` and `attachments: Attachment[]`.
- **`NewAssessment`** follows automatically (`Omit<…>`).
- **`AssessmentUpdate`** gains `visibility?`, `markerId?: string | null` (sentinel-cleared, as
  `lesson_id` is), `allowResubmission?` and `attachments?`. **`draftId` is not updatable.**
  Provenance is set once, at creation.
- **Postgres methods whose SQL changes.** Every one needs an integration test, named in §4, *Tests*:
  - `ASSESSMENT_COLUMNS`, and therefore `findByCourse`, `findById`, `create` and `update`.
  - **`findByCourseForGroups`** and **`findByIdForGroups`**, through their own column lists
    (finding 7). The duplicate `a.work_type, a.external_url` line in `findByCourseForGroups` may be
    removed as part of that edit, because the method is changed and covered.
  - `toAssessment` / `toTargetedAssessment`.
- **New `findForStaff(filter)`**, the read behind 6d. It takes
  `{ groupIds: readonly string[] | null; courseId?: string; groupId?: string; search?: string }`.
  - `null` means unrestricted and `[]` returns nothing.
  - Restricted: `EXISTS (SELECT 1 FROM assessment_targets t WHERE t.assessment_id = a.id AND t.group_id = ANY($groupIds))`.
  - `search`: `a.title ILIKE $n ESCAPE '\'`, with the pattern built by escaping `\`, `%` and `_` in
    code and passed as a parameter. **No string-built SQL** (`CLAUDE.md` §8).
  - Order: `due_at DESC, id`. Not paged (`CLAUDE.md` §1: two courses, ~20 tasks each).
  - **The restriction is in the query, not a post-read filter.** This is `scopeFor`'s own rule
    (`staff-scope.service.ts:196-203`).
- **New `findTargetsForAssessments(assessmentIds, groupIds: readonly string[] | null)`.**
  - It returns `(AssessmentTarget & { groupName: string })[]`, joining `groups` for the name.
  - The restriction is again in SQL.
  - It is a batch read. It replaces the per-row `findTargets` fan-out for this list only; the
    existing `list()` is left alone.
- **In-memory driver.** Mirror every change. Every read that feeds a `before` returns a **copy**,
  and that includes the `attachments` array (deep-copy it: the aliasing bug shipped twice,
  `CLAUDE.md` §9). The in-memory fixtures for `assess-*` gain the five fields at their defaults.

**`AssistantScopeRepository` is unchanged.** `StaffScopeService` composes the existing reads.

### Services: business rules, transactions and audit (pattern 2.2 and 2.3)

**`TaskDraftsService`** (new, `manage/task-drafts.service.ts`). Every mutation runs inside
`db.runInTransaction` together with its audit entry:
- **`list(actor, { courseId?, type? })`:**
  - Calls `scope.scopeFor(actor)`.
  - Unscoped gives `courseIds: null`.
  - Scoped gives the course ids of `assignments`.
  - A never-configured assistant gets `[]` (`staff-scope.service.ts:209-211`).
  - A `courseId` filter the caller cannot reach **narrows to `[]`**: the SQL intersects it.
- **`create(actor, input)`:**
  - Calls `scope.assertAssigned(input.courseId, actor)`.
  - An unreachable or nonexistent course is a 404 `COURSE_NOT_IN_SCOPE`, identical by construction.
  - `createdBy = actor.id`, and `usedCount` is server-owned (0).
  - Audit `task_draft.created`.
- **`update(id, actor, patch)`:**
  - Loads the draft. **Missing, or on an unreachable course, both throw
    `NotFoundException(TASK_DRAFT_NOT_FOUND)`**, where `TASK_DRAFT_NOT_FOUND = 'Task draft not found'`
    is an exported `const`.
  - Implement it by catching nothing: call `scope.scopeFor`/`assertAssigned` inside a helper that
    rethrows `TASK_DRAFT_NOT_FOUND`. **Never let `COURSE_NOT_IN_SCOPE` escape from a draft-id route.**
  - `courseId` is **not patchable**, which avoids a two-course scope check (assumption A-1, §8).
  - Audit `task_draft.updated`. `before` must be a copy.
- **`remove(id, actor)`:**
  - Same load and 404 as `update`.
  - Audit `task_draft.deleted`.
  - Assessments made from the draft keep their content, because `draft_id` goes to NULL.
- **Who may edit whose draft.** Any staff member in scope may edit or delete any draft in scope:
  `AUTHORIZATION_MODEL.md` §3 gives the assistant "Manage the draft library ✓" **without** the
  "own only" qualifier the blog row carries. There is no creator check. Stating it here keeps
  anyone from adding one by analogy with the blog.

**`AssessmentAuthoringService`, changed:**
- **`create`, in one transaction and in this order:**
  1. `assertAssigned`.
  2. The window.
  3. The targets (plus 6h, if `B-6` = A).
  4. The work-type payload.
  5. **If `draftId`:** call `draftRepo.incrementUsedCount(draftId, courseId)`. `null` throws
     `NotFoundException(TASK_DRAFT_NOT_FOUND)`, whether the draft is missing, on another course, or
     unreachable (the course is already asserted), so all three are identical.
  6. `assessmentRepo.create({ … draftId, attachments, allowResubmission })`.
  7. Bind.
  8. Set targets.
  9. Audit.

  Incrementing first takes the row lock, so a concurrent draft delete cannot race the FK insert.
- **The request body is authoritative. `draftId` is provenance only.** The server does **not**
  merge draft content into the task. "Start from a draft prefills" (`PRODUCT_SPEC` §2.1) is the
  *form's* job: it `GET`s the draft and fills the fields. That satisfies `DOMAIN_MODEL.md` §4:
  "copied… never linked live". Recorded as assumption A-2.
- **`update`** accepts `attachments` and `allowResubmission` (plus `visibility` in 6f and
  `markerId` in 6g).
- **Audit snapshots grow.** Flat and scalar, per the existing comment at `:313-316`:
  - `assessment.created`'s `after` adds `draftId`, `attachmentCount` and `allowResubmission`.
  - `assessment.updated`'s `before`/`after` add `attachmentCount` and `allowResubmission`, then
    `visibility` (6f) and `markerId` (6g).
  - **No new assessment action.** A change of visibility or settings is an edit, and
    `DOMAIN_MODEL.md` §8 names no separate action.
- **`listForStaff(actor, filter)`** is new, for 6d:
  - `groupIds = await scope.reachableGroupIds(actor)`.
  - A `groupId` filter outside that set narrows to `[]`, identically to a nonexistent group.
  - `findForStaff`, then `findTargetsForAssessments` with the **same** `groupIds`, so an assistant
    never sees an unheld group's id or name.
- **`loadInScope`** is the oracle fix, slice 6c. When `assertAssigned` throws, rethrow
  `NotFoundException(ASSESSMENT_NOT_FOUND)`, where `ASSESSMENT_NOT_FOUND = 'Assessment not found'`
  is an exported `const`. A real-but-unreachable id and an imaginary one then have byte-identical
  bodies.

**`AssessmentsService` (student), changed in 6c:**
- In `submitAssessment`, after the window check and **before** the existing correction check: if
  `existing && !assessment.allowResubmission`, throw `ConflictException('This task accepts one
  submission only.')`. It is a state conflict (`CLAUDE.md` §6: 409).
- `AssessmentDetail.canSubmit` must become `false` in that state. The UI must not offer a button
  the server refuses.
- **The resubmission cut-off is unchanged when `true`:** window end, as today. Whether "until due
  date" means `dueAt` is `B-4`.

**`StaffScopeService`, additive (6d):**
- `reachableGroupIds(actor): Promise<readonly string[] | null>`.
- It returns `null` for an admin or an `all_groups` assistant, the held ids for `assigned_groups`,
  and **`[]` for a missing scope row** (fail closed, as `scopeFor` does).
- It is a predicate-free read, so the caller owns every message, which is `mayReachGroup`'s own
  reasoning (`:242-251`).
- The existing four methods are untouched. The contract spec gains cases; none change.

**New audited actions. Each costs three things, listed exactly:**

| Action | `AuditAction` union (`audit/interfaces/audit-log-repository.interface.ts`) | `Record<AuditAction, true>` (`audit/dto/list-audit-log-query.dto.ts:26`) | Spec asserting the entry written |
|---|---|---|---|
| `task_draft.created` | add | add | `task-drafts.service.spec.ts` → "create writes task_draft.created with actor, actorRole via actorRoleOf, targetType task_draft, courseId, after {title,type,workType,attachmentCount}" |
| `task_draft.updated` | add | add | same file → "update writes task_draft.updated whose before is not the after (copy, not alias)" |
| `task_draft.deleted` | add | add | same file → "remove writes task_draft.deleted with before {title,type} and after null" |

**Plus these, because the unions grow in lockstep:**
- **`AuditTargetType`** gains `'task_draft'`, together with its `Record<AuditTargetType, true>`
  entry (`list-audit-log-query.dto.ts:68`).
- **The frontend mirror.** `lib/types.ts:692`'s `AuditAction` gains the three actions. Two
  `Record<AuditAction, …>` in `app/(app)/manage/activity/page.tsx` need entries:
  - `ACTION_LABEL` at `:23`: "created a draft task", "edited a draft task", "deleted a draft task".
  - `ACTION_TONE` at `:70`: green, amber and red, following the `assessment.*` precedent at
    `:87-90`.

  If these are missing, `tsc` fails, which is the point.
- **The modified `assessment.created` / `assessment.updated` snapshots** each need their existing
  spec extended to assert the new keys.

**Every mutation above commits with its audit entry in one `runInTransaction`.** `AuditService.record`
throws outside one.

### Authorization: role gates, scope and 404-versus-403, per route

**The grain decision for new routes (caution 3 and `D-23`):**
- **Drafts carry no group.** The finest grain available is "the caller reaches this draft's course
  through a held group", which is exactly what `assertAssigned` and `scopeFor` compute after
  `AUTH-2`.
- A draft exposes no cohort data: no roster, no submission and no group-dependent number.
- **So course-reach-via-held-groups is the group-grain answer for drafts, not the `D-23` leak.**
  `CLAUDE.md` §7 requires this to be stated. It is.
- **`GET /staff/tasks` is group-grain from birth.** A task is visible only through a held target,
  and its targets are narrowed to held groups in SQL.
- **`usedCount` is viewer-independent.** It is a global fact about the draft, so `D-23`'s "does this
  number depend on who is looking" trap does not arise. `GET /staff/tasks` returns no aggregate in
  this unit (`B-3`), so it does not arise there either.

| Route | Roles | Service-level check | Out-of-scope vs nonexistent | 403 case |
|---|---|---|---|---|
| `GET /staff/task-drafts` | `STAFF_ALL` (class) | `scopeFor` → query branch | An unreachable or unknown `courseId` filter returns `200 []`. Identical, because filters narrow and do not address. | student/parent → 403 (RolesGuard) |
| `POST /staff/task-drafts` | `STAFF_ALL` | `assertAssigned(body.courseId)` | **404 `COURSE_NOT_IN_SCOPE`**, `===` the nonexistent-course message | student → 403 |
| `PATCH /staff/task-drafts/:id` | `STAFF_ALL` | load, then `assertAssigned(draft.courseId)` | **404 `TASK_DRAFT_NOT_FOUND`**, `===` for missing and unreachable. The draft is never listed on the caller's screen, so 404 applies. | student → 403 |
| `DELETE /staff/task-drafts/:id` | `STAFF_ALL` | as `PATCH` | **404 `TASK_DRAFT_NOT_FOUND`**, identical | student → 403 |
| `GET /staff/tasks` | `STAFF_ALL` | `reachableGroupIds` → query | An unheld or unknown `groupId` and an unreachable `courseId` both return `200 []`, identical | student → 403 |
| `POST /staff/courses/:id/assessments` (changed) | `STAFF_ALL` | `assertAssigned`. A `draftId` goes through `incrementUsedCount(id, courseId)`. | course: 404 `COURSE_NOT_IN_SCOPE`; draft: 404 `TASK_DRAFT_NOT_FOUND`, identical whether the draft is missing or elsewhere | student → 403 |
| `PATCH /staff/assessments/:id` (changed) | `STAFF_ALL` | `loadInScope` (oracle fixed) | **404 `ASSESSMENT_NOT_FOUND`**, identical (**today it is not**, finding 2) | student → 403 |
| `DELETE /staff/assessments/:id`, `POST …/targets` | unchanged | `loadInScope` (fixed as a side effect) | 404 `ASSESSMENT_NOT_FOUND`, identical | 6h only: `setTargets` on a task whose audience includes a group the caller cannot reach gives **403**, because the task **is listed on their screen** |
| `POST /assessments/:id/submissions` (student, changed) | `Student` | existing `loadForStudent` | unchanged: 404 `'Assessment not found'`, identical (`assessments.service.ts:182-188`) | — |

**Refusal tests, one per permission, in both directions.** Their names are in §4, *Tests*.

**The `AUTH-6` overlap (caution 6) is reconciled in `B-6`.** In short:
- **New routes** are group-grain as above. No new course-grained staff route is added.
- **Modifying `create` does not by itself make the targeting fix unavoidable.** The check lives in
  `assertTargets`, which this unit does not have to touch.
- **Leaving it has a cost:** unit 6 would ship a changed write path, create-from-draft plus the new
  authoring screen, that **still lets an assistant target a group they do not hold, bypassing
  `mayReachGroup`.** It is not a new route, but it is new surface on a known leak.
- **A worse interaction.** The new group-grain task list, combined with the existing
  replace-the-whole-set `setTargets`, means an assistant editing a shared task **silently drops**
  the targets they cannot see.
- That is new harm unit 6 would introduce. It is not pre-existing, and 6e must guard against it
  whichever way `B-6` closes (see 6e).

### API: `API_SPEC.yaml` delta. Every new or changed route is updated in the same change.

| Route | Request | Response | Codes |
|---|---|---|---|
| `GET /staff/task-drafts?courseId&type` | query DTO: `@IsOptional @IsString courseId`, `@IsOptional @IsIn(types) type` | `TaskDraft[]` | 200, 401, 403 |
| `POST /staff/task-drafts` | **new schema `TaskDraftWrite`**: `courseId` (required), `type` (required), `workType?`, `title` (required, `MaxLength 200`), `description?`, `instructions?` (reuse `CreateAssessmentDto`'s caps), `attachments?: Attachment[]` (`ArrayMaxSize(10)`, A-3) | `TaskDraft` | 201, 400, 404, 403 |
| `PATCH /staff/task-drafts/{draftId}` | **`TaskDraftUpdate`**: everything in `TaskDraftWrite` except `courseId`, all `@IsOptionalNotNull` (`D-11`) | `TaskDraft` | 200, 400, 404, 403 |
| `DELETE /staff/task-drafts/{draftId}` | — | — | **204**, 404, 403 |
| `GET /staff/tasks?courseId&groupId&search` | query DTO. `search`: `MaxLength(120)`. **`status` is not accepted until `B-3`**; mark it in the spec as `x-status: blocked (B-3)`. | **new `StaffTask[]`**: every `StoredAssessment` field plus `targets: (AssessmentTarget & {groupName})[]`, narrowed to held groups | 200, 401, 403 |
| `POST /staff/courses/{courseId}/assessments` | `+ draftId?`, `+ attachments?`, `+ allowResubmission?` (default true) | `AuthoredAssessment` with the new fields | 201, 400, 404 |
| `PATCH /staff/assessments/{assessmentId}` | `+ attachments?`, `+ allowResubmission?` | as above | 200, 400, 404 |
| `POST /assessments/{assessmentId}/submissions` | unchanged | unchanged | **adds 409** |

**Notes on the table:**
- **`TaskDraft` currently marks `id` and `usedCount` as required on the request body**
  (`API_SPEC.yaml:1127-1130, 1147-1150`). That is wrong for a request. Replace it with
  `TaskDraftWrite` / `TaskDraftUpdate`.
- **`StaffTask` is a new schema.** The spec's `200: OK` has no body today.
- **`PATCH` returns 200 with the `TaskDraft`,** because the spec's `200` has no body today.
- **The three `/staff/…assessments` routes are not in `API_SPEC.yaml` at all today.** They were
  `[MODIFY]` without an entry. Add them, because they changed (`CLAUDE.md` §6).
- **`Attachment` validation.**
  - `url`: `@IsMediaUrl()` (`common/validators/is-media-url.validator.ts`). It accepts
    `/uploads/…` or a public `http(s)` URL. **`javascript:` and `data:` are refused**, so an
    attachment `href` is not an XSS sink.
  - `name`: `MaxLength(200)`.
  - `mimeType` and `sizeBytes`: optional and **display-only**, never used for a decision.
- **The controller must thread every new field through.** `StaffManageController.create` maps the
  body field by field (`staff-manage.controller.ts:~170-190`). A DTO field that is not threaded
  there is silently dropped, so there must be an e2e test for each new field.

### Frontend: slice 6e, `TASK-7`

**`lib/` mirror, in the same commit as the backend change for each slice (`CLAUDE.md` §6):**
- `types.ts`: `TaskDraft`, `Attachment`, `StaffTask`, the new `AuthoredAssessment` fields, and the
  three `AuditAction`s.
- `api.ts`: `staff.taskDrafts`, `createTaskDraft`, `updateTaskDraft`, `deleteTaskDraft` and
  `staff.tasks`. `createAssessment` and `updateAssessment` gain the new fields.

**Screens** (under `app/(app)/manage/tasks/`, filling the two dead nav items from finding 3):

| Route | Content | Data |
|---|---|---|
| `/manage/tasks` | One `Panel` holding a `Table`.<br>Toolbar: `SearchInput`, course `Select`, group `Select` built from the groups present in the returned targets.<br>Columns: title, type `Tag`, groups, due, work type.<br>No status or count column until `B-3`. No visibility column until 6f. | `api.staff.tasks` |
| `/manage/tasks/new?draft=<id>` | The `TaskAuthoring` single-panel shape (`redesign-mapping.md:177`).<br>Fields: title, type, work type, description, instructions, attachments, window, target groups (multi-select `Checkbox` list, caution 3), `allowResubmission` `Toggle`.<br>"Start from a draft" picks a draft and **prefills** the form, carrying `draftId`.<br>"Save as draft" posts `TaskDraftWrite`. | `taskDrafts`, `createAssessment`, `createTaskDraft`, the course group list (below) |
| `/manage/tasks/[id]` | The same form in edit mode, loaded from `api.staff.tasks` by id. There is no single-task route (finding 4), and a list read at this scale is fine. | `tasks`, `updateAssessment`, `setAssessmentTargets` |
| `/manage/tasks/drafts` | The draft library: one `Panel`/`Table`, showing title, type, course, "used N times", edited date. Actions: edit, delete (confirm), and "Use" (→ `/manage/tasks/new?draft=`). | `taskDrafts` family |

**The group picker source is the open problem.**
- The only staff source today is `GET /staff/courses/:id/groups` (`api.staff.courseGroups`), which
  is course-grained (`AUTH-6`).
- **If `B-6` = A+**, 6h narrows it, and the picker becomes honest.
- **Otherwise**, the picker lists groups the server will accept today. That is the existing leak,
  not a new one.

**The edit screen guards against silent target loss, whatever `B-6` says:**
- For a **scoped** caller, the edit form does **not** render the audience editor.
- It shows the held targets read-only, with the copy "Only the teacher can change who this is set
  for".
- Admins and teachers get the editor.
- This is courtesy, not security. The security half is 6h's 403.
- It is the only way to avoid shipping a UI that drops unseen targets through replace-the-whole-set.
  Record it in `EXECUTION_NOTES.md` as a consequence of `B-6`, not a product decision. It is
  reversible the moment `AUTH-6` rules on merge semantics.

**Design rules (caution 9), each checked by the reviewer's eight questions:**
- Named size utilities only: `text-base` (13px, the workhorse), `text-md`, `text-lg`, `text-xl`
  (`globals.css:98-103`).
- **Never `text-[var(--fs-*)]`** and never `text-[var(--x)]`.
- Headings versus captions: tint (`text-fg` / `text-fg-2`), not size.
- One `Panel` per region. **No `Panel` inside a `Panel`**, and a `Table` inside a `Panel` is the
  existing pattern.
- No earnings widget.
- **`usedCount` is a plain count**, not a `Meter` or a `Score`, so progress and performance cannot
  merge on these screens.
- A missing due override renders the inherited date. A missing value renders an em-dash, never `0`.
- `dir="rtl"` with `ليلى فهمي` checked in a browser.
- Sentence-case buttons and no emoji.

**Primitives are `components/ui/` only:** `Panel`, `Table`, `TableToolbar`, `SearchInput`, `Select`,
`Checkbox`, `Toggle`, `TextInput`, `TextArea`, `Tag`, `Button`, `EmptyState`, `InlineBanner` and
`Loader`.
- **There is no `Modal`** (`redesign-mapping.md` decision 4 is unbuilt). Authoring is a page, so
  none is needed.
- The draft picker is an inline `Select`, not a modal.
- A delete confirm reuses whatever `manage/blog` uses today.

**Uploads.** Attachments use `api.staff.uploads.config`, and `enabled: false` shows only the URL
field (production is `STORAGE_DRIVER=none`: an honest 503 fallback, pattern 2.5).

### Security: the `CLAUDE.md` §8 items this unit touches

- **Authorization and object-level access:** covered in §4, *Authorization*.
- **Input validation:** DTOs on every field. `@IsOptionalNotNull` on patches (`D-11`).
  `ArrayMaxSize` on `attachments`.
- **SQL injection:** parameterised only. The `ILIKE` pattern is escaped in code and passed as a
  parameter.
- **XSS:**
  - Attachment `name`, `title` and `instructions` render as text.
  - Attachment `url` goes through `IsMediaUrl`, which admits `http(s)` or `/uploads/` only.
  - No `dangerouslySetInnerHTML`.
- **SSRF:** attachment URLs are never fetched server-side. The `IsPublicHttpUrl` DNS gap
  (`SECURITY.md` §3.5) is therefore not widened.
- **File-upload validation:** unchanged in 6a–6e. **Audio is not added to the whitelist**; that is
  `B-2`. Adding it is a security-review item: it requires a new entry in the MIME table, and the
  table's `kind` is typed `BlogMediaKind`, a blog coupling the entry would have to address.
- **Sensitive-data exposure:**
  - `/uploads/*` is served statically **without authentication** (`main.ts:82`, "dev only",
    `SECURITY.md` §4). An attachment uploaded there is reachable by anyone holding its UUID URL.
  - That is acceptable for a passage or audio file. **It is not acceptable for a mark scheme
    before the due date**, which is why `B-2` blocks student-facing exposure *and* the product
    question.
  - Production is `STORAGE_DRIVER=none`, so production attachments are pasted URLs until R2 with
    signed URLs lands.
- **Error leakage:** the three exported message `const`s asserted `===`. The oracle fix.
- **Audit logging:** §4, *Services*.
- **Rate limiting:** no new public route. The global 120/min applies.

**Not affected:** CSRF, CORS, tokens, brute force, secrets, dependency security and environment
configuration. No new `@Public()` route.

### Tests, per level and named

**Integration** (`backend/test/postgres-repositories.integration-spec.ts`, against real PG 15):
- **`describe('migration 018')`**, asserted against the catalog, not inferred:
  - `task_drafts` exists with the columns and CHECKs above.
  - The CHECK refuses `visibility = 'hiden'`, `attachments = '{}'::jsonb` (an object), and
    `used_count = -1`.
  - The defaults on an existing seeded assessment read `published` / `true` / `[]` / null / null.
  - `task_drafts_course_id_type_idx` exists.
- **`describe('task drafts')`**, for `PostgresTaskDraftRepository`:
  - "creates a draft and round-trips attachments JSONB"
  - "lists by course ids and type, most recently edited first; null courseIds is every course; [] is none"
  - "a partial update leaves omitted fields alone and advances updated_at"
  - "incrementUsedCount adds exactly one and returns null for a draft on another course"
  - "remove returns false for a missing draft"
  - "deleting a draft sets assessments.draft_id to NULL and leaves the task intact"
- **`describe('assessments')`**, extended for the changed `PostgresAssessmentRepository` methods:
  - "create and update round-trip visibility, allow_resubmission, draft_id, attachments and marker_id"
  - "update clears marker_id with the null sentinel and leaves draft_id immutable"
  - "findByCourseForGroups and findByIdForGroups return the new columns" (finding 7)
  - "findForStaff: null is every task; held groups restrict; [] is none; courseId, groupId and search filter; a literal % in search matches only a literal %"
  - "findTargetsForAssessments restricts to the given groups and carries group names"
- **`describe('runInTransaction')`**, extended:
  - "a create-from-draft that throws after incrementing leaves used_count unchanged"
  - This can **only** be proved here, because the memory driver has no rollback
    (`CLAUDE.md` §9).

**Unit tests** (memory driver):
- **`task-drafts.service.spec.ts`** (new):
  - The three audit entries, as in the table.
  - "an assistant lists only drafts on courses they reach through a held group"
  - "a never-configured assistant lists nothing"
  - "create on an unreachable course throws COURSE_NOT_IN_SCOPE === the nonexistent-course message"
  - "update and remove on an unreachable draft throw TASK_DRAFT_NOT_FOUND === a missing id"
  - "an assistant may edit a draft the teacher created" (the matrix has no own-only rule)
  - "courseId is not patchable"
- **`assessment-authoring.controller.spec.ts`** (extend):
  - "create from a draft increments usedCount by one and records draftId on assessment.created"
  - "create with a draft from another course throws TASK_DRAFT_NOT_FOUND === missing draft"
  - "editing a draft after authoring does not change the task" (copy, not link)
  - "attachments and allowResubmission round-trip; assessment.updated's before/after carry them and do not alias"
  - "loadInScope: an out-of-scope assessment's 404 body === a missing id's" (finding 2)
- **`listForStaff`:**
  - "an assigned assistant sees a task set for group-1 and group-3 with only group-1 in targets"
  - "a task set only for an unheld group is absent"
  - "a groupId filter outside the held set returns [] exactly as an unknown groupId does"
  - "admin and all_groups see every task and every target"
  - Group-3 is a second course-1 group **created inside the spec**. Do not change the seeds: every
    course has exactly one group in the fixtures (`003_group_fixtures.sql:38-40`), which is why
    course-grain and group-grain are indistinguishable there.
- **`staff-scope.service.spec.ts`**, four new cases for `reachableGroupIds`: admin → null;
  all_groups → null; assigned → held ids; missing row → `[]`. **The seven existing contract cases
  must pass unmodified.**
- **`assessments` (student) spec:**
  - "allowResubmission false: a second submission is 409 and canSubmit is false after the first"
  - "allowResubmission true: resubmission unchanged until window end"
- **Audit:**
  - `audit.service.spec.ts` or `role-guards.spec.ts`: whatever enumerates `AuditAction` must still
    pass.
  - "GET /admin/audit-log?action=task_draft.created is a 200, not a 400" (the `Record` exists for
    this).

**e2e** (`test/staff.e2e-spec.ts`), with new `it.each` rows in the existing tables:
- **`describe('task drafts')`:**
  - student and parent → 403 on all four routes.
  - assistant-1 → 201/200/204 on course-1.
  - assistant-1 → 404 with a byte-identical body on a course-2 draft and on a nonexistent one.
  - assistant-2 → `[]`.
  - admin and teacher → everything.
- **`describe('GET /staff/tasks is group-grain')`:**
  - student → 403.
  - assistant-2 → `[]`.
  - assistant-1 → only tasks with a group-1 target, with targets narrowed.
  - admin → all.
- **`describe('authoring from a draft')`:** 201; the draft's `usedCount` is +1 in a follow-up `GET`;
  a foreign draft gets 404 with the identical body.
- **Per-field threading.** One e2e per new create and patch field, asserting it comes back.
- **`describe('existence oracle on /staff/assessments/:id')`:** `PATCH` of `assess-*` on course-2
  by assistant-1 versus `PATCH` of `nope`, with `===` bodies.
- **Student:** one 409 for `allowResubmission: false`.

**Database:** the migration-018 describe above, run from an empty schema (§7).

**Frontend:**
- `npx tsc --noEmit` = 0, and `npx eslint .` clean.
- `grep -rn "text-\[var(--" "frontend/app/(app)/manage/tasks"` must report 0.
- A real-browser pass of all four screens as teacher **and** assistant-1, in LTR and RTL, against
  `PERSISTENCE_DRIVER=postgres`.

---

## 5. Files

**Create:**
- `backend/src/database/migrations/018_task_drafts_and_task_settings.sql`
- `backend/src/manage/interfaces/task-draft-repository.interface.ts`
- `backend/src/manage/repositories/in-memory-task-draft.repository.ts`
- `backend/src/manage/repositories/postgres-task-draft.repository.ts`
- `backend/src/manage/task-drafts.service.ts`
- `backend/src/manage/task-drafts.service.spec.ts`
- `backend/src/manage/task-drafts.controller.ts` (`@Controller('staff') @Roles(...STAFF_ALL)`)
- `backend/src/manage/dto/task-draft.dto.ts`
- `backend/src/manage/dto/staff-tasks-query.dto.ts`
- `frontend/app/(app)/manage/tasks/page.tsx`
- `frontend/app/(app)/manage/tasks/new/page.tsx`
- `frontend/app/(app)/manage/tasks/[id]/page.tsx`
- `frontend/app/(app)/manage/tasks/drafts/page.tsx`
- Optionally one shared `frontend/app/(app)/manage/tasks/task-form.tsx`, used by new and edit.

**Change:**
- `assessments/interfaces/assessment-repository.interface.ts`
- Both assessment repositories
- `assessments/assessments.service.ts`
- `manage/assessment-authoring.service.ts`
- `manage/staff-manage.controller.ts`
- `manage/dto/assessment.dto.ts`
- `manage/manage.module.ts`
- `staff/staff-scope.service.ts` and its spec
- `audit/interfaces/audit-log-repository.interface.ts`
- `audit/dto/list-audit-log-query.dto.ts`
- `test/postgres-repositories.integration-spec.ts`
- `test/staff.e2e-spec.ts`
- `assessment-authoring.controller.spec.ts`
- `frontend/lib/{api,types}.ts`
- `frontend/app/(app)/manage/activity/page.tsx`

**Docs, at close:**
- `API_SPEC.yaml`
- `DATABASE_PLAN.md`: §2 gains `assessments.attachments`, §3 gains `created_at`, §7 is renumbered
  (finding 6).
- `DOMAIN_MODEL.md`: §4 `Assessment.attachments`.
- `AUTHORIZATION_MODEL.md`: §4 gains a draft row and a `/staff/tasks` row, and §6 strikes "drafts"
  from the no-gate gap.
- `ARCHITECTURE.md` §2.4 and `CLAUDE.md` §7 caller counts: **`TaskDraftsService` is a tenth
  caller**. Recount the call sites; do not add one by hand.
- `CLAUDE.md` §3 and §4.1 test counts.
- `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `CHANGELOG.md` (A-1 … A-3, finding 2's fix, any
  `B-*` ruling) and `project_log.md`.

**Do not touch:**
- `PostgresWorkRepository` and `PostgresGoogleCredentialRepository`, per the coordinator. They
  have no reason to change.
- `upload-types.ts`, until `B-2`.
- `manage/courses/[id]/assessments/page.tsx`: superseded, not retired (§1).
- The seeds: add groups inside specs instead.
- `StaffScopeService`'s four existing methods.
- `computeStatus`, until 6f.
- `(site)` and `(auth)`: `F5-1`.
- `AUTH-6`'s routes: roster, submissions, analytics, the per-course assessment list, and course
  groups (the last only under `B-6` = A+).

---

## 6. Sequencing

These are separate commits, each citing its `TASK-*`. Each slice goes to the reviewer on its own, as
in unit 5. The order follows `CLAUDE.md` §12 within each slice.

**1. Slice 6a: migration and both repository drivers.**
- 1.1. Write `018`.
- 1.2. **Run it immediately** against real PG 15 from an empty schema (§7 command block) **before**
  writing any repository code. Unit 0's rule is that authoring on top of an unverified migration
  buries whatever it gets wrong.
- 1.3. Write the repository interfaces, then both drivers together.
- 1.4. Write the integration tests.
- 1.5. `npm test` stays at 576 or above, green.

**2. Slice 6b: drafts (service → authorization → API → tests).** It depends on 6a.

**3. Slice 6c: authoring from a draft, attachments, `allowResubmission`, and the oracle fix.**
- It depends on 6a and 6b: `incrementUsedCount` and the draft 404 `const`.

**4. Slice 6d: `GET /staff/tasks` and `reachableGroupIds`.**
- It depends on 6a (`findForStaff`).
- It is independent of 6b and 6c, but it goes after them so the list shows `draftId` and
  attachments.

**5. Gated slices 6f, 6g, 6h, 6i, 6j and 6k, in that order, for any whose blocker has closed.**
- **6h should precede 6e if `B-6` = A+,** so the picker is honest from day one.
- **6f must precede 6e's visibility column.**

**6. Slice 6e: frontend.**
- **Last, because a screen against an unmerged API is a mock** (`PHASE_ROADMAP.md` §3).
- Controls for gated fields render only once their slice has merged.

**Load-bearing orders:**
- **`CREATE TABLE task_drafts` before the `ALTER TABLE … draft_id REFERENCES task_drafts`.**
  Reversed, `018` aborts.
- **`incrementUsedCount` before `assessmentRepo.create`,** for the row lock.
- **The `lib/` mirror in the same commit as each route.** If it is deferred to 6e, `tsc` goes red
  mid-unit on `activity/page.tsx`'s `Record<AuditAction,…>`.
- **The integration run after 6a, and again at close.** One run at the end would let 6c's SQL
  changes land unverified.

---

## 7. Definition of Done for this unit

The applicable points of the thirteen in `IMPLEMENTATION_PLAN.md`, made concrete:
1. **Layers.** Code sits where `ARCHITECTURE.md` §6 says: drafts in `backend/src/manage/`.
2. **Migration 018 has run on real PostgreSQL 15 from an empty schema.** The recorded output shows
   executed tests, not skipped ones.
3. **`TaskDraftRepository` exists in both drivers.** `AssessmentRepository`'s changes are in both
   drivers.
4. **DTOs on every new field.**
5. **Authorization in the service.** `StaffScopeService` is called from `TaskDraftsService` and
   `listForStaff`.
6. **Audit.** Three actions and one target type, in the union, the `Record` and the frontend mirror,
   each with its spec. Every mutation is transactional.
7. **Tests.** The named integration, unit, e2e and refusal tests in §4.
8. **Error cases.** Not-found, out-of-scope with an identical body, conflict (409 resubmission), and
   unconfigured driver (`STORAGE_DRIVER=none` → URL field).
9. **Frontend** integrated against the real API. No mock data.
10. **`API_SPEC.yaml`** matches every new and changed route (the unit's own exit criterion).
11. **Frontend and backend checks.** `tsc` and `eslint` clean in `frontend/`; `npm test` and
    `npm run test:e2e` green.
12. **The eight design questions** answered for all four screens.
13. **Documentation.** `IMPLEMENTATION_PLAN.md` and `CHANGELOG.md` updated.

**Exact commands and expected results. Record the real output in `EXECUTION_NOTES.md`:**

```bash
npm test                                   # ≥ 576 passed, 0 failed; files ≥ 37 (new task-drafts spec)
npm run test:e2e                           # ≥ 244 passed, 0 failed
docker compose up -d postgres                # the compose service is `postgres`, not `db`
docker compose exec postgres psql -U dev -d tahirelshazli -c 'CREATE DATABASE tahirelshazli_test'   # once; NEVER the dev DB — the suite DROPs SCHEMA public
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/tahirelshazli_test \
  npm run test:integration                 # > 125 passed, **0 skipped**; migration list shows 018 applied
cd frontend && npx tsc --noEmit            # 0 errors
cd frontend && npx eslint .                # 0 problems
grep -rn 'text-\[var(--' 'frontend/app/(app)/manage/tasks'   # no output
```

**A self-skipping suite is not a pass.** The executor must quote vitest's summary line showing
`skipped 0` together with a test count above 125. If the count equals 125, the new tests did not
run.

**The unit is COMPLETE only when all nine `PHASE_ROADMAP.md` §2 conditions hold. Condition 9 is zero
unresolved blockers in scope.** So the unit **cannot** close while any of `B-1` … `B-6` is open:
- Each one must be ruled on and its slice built, **or**
- The coordinator must formally move the dependent task (for example `TASK-1`'s derivation) out of
  unit 6 into `IMPLEMENTATION_PLAN.md` as a new `[!]` task.

That second option is the coordinator's call, not the executor's.

---

## 8. Blockers and decisions required

Every blocker below is scoped **out** of 6a–6e. Each recommendation is an **assumption**, not a
decision.

> **Rulings, 2026-09-22 (coordinator + user).** All six blockers below are ruled, each as the
> recommendation given here, and recorded as dated decisions in `docs/CHANGELOG.md`:
> `B-1` → **`D-28`** (C + iii) · `B-2` → **`D-29`** (B + `audio/mpeg`, `audio/mp4`) ·
> `B-3` → **`D-30`** ((a), no counts; unruled edges are recorded, not invented) ·
> `B-4` → **`D-31`** (B) · `B-5` → **`D-32`** (as recommended) · `B-6` → **`D-33`** (A+).
> The recommendations below are therefore decisions, and 6f–6k are executable. `B-1` and `B-4`
> were folded into `018` before it first ran. The executor's order is
> `6a → 6b → 6c → 6d → 6f → 6g → 6h → 6i → 6j → 6k → 6e`.

### `B-1`: What does `visibility` mean to a student, and does `scheduled` need a publish-at? Blocks 6f (`TASK-1`)

**Sources:**
- `PRODUCT_SPEC.md:76-78`, `DOMAIN_MODEL.md:142-146` and `DATABASE_PLAN.md:61-63` define
  `published | scheduled | hidden` as distinct from the window. Their stated reason is that today
  "hidden is inexpressible" and "a scheduled task cannot be shown as locked-with-a-date".
- **The second half is false against the code** (finding 1): a published task with a future
  `availableFrom` is already `locked` and shows its date.
- No document says what `scheduled` does that `published` does not, whether it carries a
  timestamp, or what `hidden` does to a task a student has already submitted.

**Readings:**
- **A.** `scheduled` = the task is visible as locked, with `availableFrom` as the date. `published`
  = visible only once `availableFrom` has passed; before that it is **absent**.
  - Impact: a behaviour change for every existing `published` future task. They would vanish until
    they open. That contradicts "nothing appears out of nowhere" (`DATABASE_PLAN.md:62`).
- **B.** `scheduled` = invisible until a new `publish_at`, then it behaves as `published`. This is
  the blog's precedent (`project_log.md:2147-2152`: derived in the `WHERE`, no job).
  - Impact: a `publish_at` column, a CHECK, a DTO field and a derived `isLive`.
  - "Locked-with-a-date" then means locked with `publish_at`?
- **C.** `scheduled` is **not stored**. It is the label for `published ∧ now < availableFrom`, which
  already exists. Store only `published | hidden`.
  - Impact: the enum narrows, and `API_SPEC`, `DATABASE_PLAN` and `DOMAIN_MODEL` are amended.
- **For `hidden`, under any reading, a second question.** Say a student has already submitted, or
  been marked. Does a hidden task:
  - (i) vanish from their lists, their detail view and their marks;
  - (ii) stay visible to those with a submission; or
  - (iii) refuse to be hidden, with a 409, once anything is submitted, mirroring delete?

  Unit 9's reports and unit 7's mark book both read this.

**Derivation under the recommendation:**
- `hidden` → no row in the list and a 404 on the detail and submit routes, identical to a genuine
  miss.
- `published` → today's `computeStatus`, unchanged.

**Recommendation (assumption):** **C + (iii).**
- C matches the code as it exists and invents no timestamp.
- (iii) loses no student-visible history and is relaxable later.

**If B is chosen instead,** `018` gains `publish_at` (or `019`, if `018` has already run).

**The one question that closes it:** *"Is a `scheduled` task anything other than a published task
whose window has not opened yet? If so, what hides it and until when? And may a task that students
have already submitted be hidden?"*

### `B-2`: Who can see a task attachment? Blocks 6i (student exposure) and the audio whitelist (`TASK-4`)

**Sources:**
- `PRODUCT_SPEC.md:81` lists "a passage, an audio file, **a mark scheme**" in one breath.
- A mark scheme shown to students before the due date defeats the task.
- `/uploads/*` is unauthenticated (§4, *Security*).
- The whitelist has no audio (finding 8).

**Readings:**
- **A.** Every attachment is student-visible. A mark scheme belongs in instructions for staff, or
  nowhere.
- **B.** A per-attachment `audience: 'students' | 'staff'`. The student `GET /assessments/:id`
  returns only `students`.
- **C.** Staff-only until the task is marked or returned. This couples to unit 7's `returned_at`.

**Also to decide:** audio formats (`audio/mpeg` and `audio/mp4` at least). This needs a whitelist
entry and a decoupling of `UploadType.kind` from `BlogMediaKind`.

**Recommendation (assumption):** **B**, plus `audio/mpeg` and `audio/mp4`, both non-executable.
- Before `018` runs: `audience` lives inside the JSONB element, so no DDL is needed either way.

**The one question that closes it:** *"Should students ever see a mark scheme attached to a task,
and if so, from when?"*

### `B-3`: What are a task's staff-side statuses `open | marking | marked`, and may the list show counts? Blocks 6k (`TASK-6`'s `status` filter)

**Sources:**
- `API_SPEC.yaml:1172` names the enum and defines nothing.
- `D-23` accepts that "each screen now needs an explicit ruling on whether its numbers may depend on
  who is looking".
- A "12/30 submitted" column for an assistant holding one of three targeted groups is exactly that
  trap.

**Readings for the status:**
- (a) Derived from the window: open = `now ≤ dueAt`; marking = past due with any ungraded
  submission; marked = all graded.
- (b) Derived from submissions only.

**Readings for the counts:**
- Caller-scoped, labelled as such.
- Caller-independent.

**Recommendation (assumption):** (a), with caller-independent counts **omitted** from this unit. They
are unit 7's queue (`MARK-3`).

**The one question that closes it:** *"When is a task 'marking' rather than 'open', and should an
assistant's task list count only their own groups' submissions?"*

### `B-4`: How do "PDF upload / Google Doc link / photo of written work (≤5)" map onto the submission model, and does "until due date" move the cut-off? Blocks 6j (`TASK-5`, the modes)

**Sources:**
- `PRODUCT_SPEC.md:82-83`.
- A submission today is one `fileUrl` plus `answerText` (`submit-assessment.dto.ts`).
- Per-task upload rules exist as `allowedFileTypes` and `maxFileSizeBytes`.
- **Up to five photos is a multi-file submission**, which no table models and which changes unit 7's
  marking surface: annotations are per page and per file.
- A student-supplied Google Doc link is not `workType: link`, which is a teacher-supplied URL.
- **"Allow resubmission until due date"** conflicts with the current cut-off, which is window end
  (`availableTo`), not `dueAt`.

**Readings:**
- **A.** The modes are a presentation of `allowedFileTypes`: PDF → `application/pdf`; photo →
  `image/*` with a max-files field; Doc link → accept a URL as `fileUrl`. Needs a
  `max_files INT` column, a `submission_files` table, or both.
- **B.** A `submission_modes TEXT[]` column, with the multi-file model deferred to unit 7.

**Recommendation (assumption):** B, with multi-file built in unit 7. `allowResubmission = true`
keeps the window-end cut-off, which is today's rule. That part is built in 6c.

**The one question that closes it:** *"When a task accepts photos of written work, is that up to five
separate files on one submission? And does 'until due date' mean resubmission stops at the due
date even while the window stays open for late work?"*

### `B-5`: Marker assignment rules. Blocks 6g (`TASK-5`, the marker)

**Sources:**
- `PRODUCT_SPEC.md:84`: "Dr. Tahir, a named assistant, or whoever opens it first".
- `DATABASE_PLAN.md:55`: `marker_id` references `users`.

**Unanswered:**
- (a) May an **assistant** set or change the marker? If so, they need a staff-reachable list of
  assistants. `GET /admin/assistants` is teacher/admin only, and no staff-reachable route exists or
  is in `API_SPEC`.
- (b) Must a named assistant reach **every** targeted group? If not, they are assigned work they
  cannot open. What happens to `markerId` when the targets or the assistant's scope later change?
- (c) Is "whoever opens it first" `marker_id IS NULL`, with any claim-on-open behaviour belonging to
  unit 7?

**Recommendation (assumption):**
- (a) Teacher and admin only. An assistant's non-null `markerId` gets a 403, because the task is
  listed on their screen.
- (b) A 400 unless the named user is the teacher, an admin, or an active assistant reaching every
  target. Later drift is displayed rather than silently cleared.
- (c) Yes: null means first opener, and the claim is unit 7's.

**The one question that closes it:** *"Can an assistant choose who marks a task, and may the teacher
name an assistant who does not hold every group the task is set for?"*

### `B-6`: Does unit 6 close the targeting-write half of `AUTH-6`? Blocks 6h. This is scope beyond `TASK-1..7`, for the user.

**Sources:**
- `D-23` (closed: narrow to held groups).
- `AUTH-6` (open), which names `assessment-authoring.service.ts:170`. The actual check is
  `assertTargets`, at `:178-200`.
- `CLAUDE.md` §7: "do not add a new course-grained staff route without saying which grain".

**What unit 6 changes there:** `create` (draft provenance, attachments, settings) and the new
authoring and edit screens. The targeting check is untouched unless this is ruled.

**Readings:**
- **A+ (recommended).** Unit 6 does all three of the following:
  1. **An assistant may not *add* a group they do not hold to an audience.** This covers `create`
     and `setTargets`: each added id goes through `mayReachGroup`, and the refusal is **404 with a
     message byte-identical** to "`Group <id> is not enrolled in this course`" (`:196-198`) for the
     same input.
  2. **`setTargets` by a scoped caller on a task whose current audience includes a group they cannot
     reach → 403.** This refuses rather than silently dropping. The task is on their screen, so the
     exception rule applies.
  3. **Narrow `GET /staff/courses/:id/groups` to held groups,** so the authoring picker is honest.
     Its rows carry `memberCount` (`D-12`), which is a per-group fact, not a viewer-dependent
     aggregate, so `B-4`'s denominator trap does not arise.

  **Impact:** three of `AUTH-6`'s items close in this unit. `AUTH-6` narrows to: roster,
  `/staff/courses/:id/submissions`, the analytics pair, the per-course assessment list, and
  `PATCH`/`DELETE` of a shared task.

  **Refusal tests:**
  - assistant-1 creating a task for course-1's group-3 (created in the spec) gets a 404 whose body
    equals the one for a group not on the course;
  - re-targeting a group-1 + group-3 task gets a 403;
  - teacher and admin are unaffected;
  - the picker lists only group-1 for assistant-1.
- **A.** Items 1 and 2 only. The picker keeps offering unheld groups that the server then 404s.
- **B.** Nothing. `AUTH-6` owns all of it.
  - Impact: unit 6 ships a changed create path, from a draft and from a new screen, that **still
    bypasses `mayReachGroup`**.
  - The new edit screen must still hide the audience editor for scoped callers (6e), or it would
    drop unseen targets.
  - The known leak gains new surface, and that gain is recorded in `CHANGELOG.md`.

**Recommendation (assumption):** **A+.** The rule is already decided (`D-23`). The work is small and
has no per-screen number ruling. Only the *merge* semantics for re-targeting a shared task remain
genuinely open, and A+ refuses those rather than guessing.

**The one question that closes it:** *"Should unit 6 stop assistants adding groups they don't hold to
a task, and narrow the course group list they pick from, or leave all of that to `AUTH-6`?"*

### Assumptions taken without a blocker, stated so the reviewer can overrule

- **A-1.** A draft's `courseId` is fixed after creation. `PATCH` does not accept it.
- **A-2.** Authoring from a draft: the request body is authoritative, and `draftId` records
  provenance and increments `usedCount`. The server does no content merge.
- **A-3.** At most 10 attachments per task or draft. A storage bound, not a product rule.
- **A-4.** A `courseId` or `groupId` *filter* outside scope returns `200 []`, not 404. Filters
  narrow a list; they do not address a resource. Both cases are identical by construction.

---

## 9. Risks, ranked

1. **Silent audience loss** when a group-grain editor meets replace-the-whole-set `setTargets` (`B-6`).
   - **How it shows:** a task quietly stops appearing for a cohort. Nothing fails, and the audit
     entry shows a shrunken `targetGroups`.
   - **Detect early:** the 6e rule that scoped callers get no audience editor, plus 6h's 403, plus an
     e2e test that re-targets a shared task as assistant-1.
2. **The new columns are missing from the explicit student-read column lists** (finding 7).
   - **How it shows:** `visibility` is `undefined` on student reads, so 6f's filter silently passes
     everything, or fails everything.
   - **Detect early:** the named integration test on `findByCourseForGroups` and
     `findByIdForGroups`, plus a unit test that the in-memory versions carry the fields.
3. **Migration 018 is written, and the SQL after it is built, without a real run.**
   - **How it shows:** the first real boot fails. `CLAUDE.md` §9: every first run of 001–008 found
     something.
   - **Detect early:** step 1.2 of §6, where the integration run comes *before* the repository code,
     plus the `skipped 0` check.
4. **The memory driver's no-rollback** hides a `usedCount` that increments on a failed create.
   - **How it shows:** the draft count creeps up.
   - **Detect early:** the named `runInTransaction` integration test. The executor must not try to
     prove this on memory.
5. **An oracle regression.** A new route leaks `COURSE_NOT_IN_SCOPE` where `TASK_DRAFT_NOT_FOUND`
   or `ASSESSMENT_NOT_FOUND` is owed.
   - **Detect early:** an `===` comparison between the two paths, in each e2e.
6. **Drift in the frontend mirror** (the activity page's `Record<AuditAction,…>`, and `AuthoredAssessment`).
   - **How it shows:** `tsc` goes red mid-unit.
   - **Detect early:** mirror in the same commit (§6).
7. **The environment.**
   - Node 26 versus 24, so record test output with `node -v`.
   - PG must be the compose `postgres:15-alpine`, not a local 16. Record `SELECT version()`.
8. **The handoff is unreachable for the task screens.**
   - **How it shows:** the screens drift from the design.
   - **Detect early:** the executor states which source they built from, and the reviewer checks
     against the handoff if they can reach it.
9. **Scope creep in 6e.** Pressure to render visibility, marker and mode controls before their slices
   land.
   - **How it shows:** a control that posts a field the API drops. `forbidNonWhitelisted` is off
     (`SECURITY.md` §3.3), so the drop is silent: a mock presented as working.
   - **Detect early:** the reviewer greps the new pages for `visibility` and `markerId` before
     6f and 6g land.
