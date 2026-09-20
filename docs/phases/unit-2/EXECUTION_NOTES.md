# Execution notes — unit 2, slice 2a

**Executor:** `redesign-executor` · **Date:** 2026-09-20 · **Branch:** `redesign`
**Base:** `26b9ccb` (clean) · **Range:** `26b9ccb..HEAD`
**Input artifacts read in full:** `docs/phases/unit-2/PHASE_PLAN.md` (749 lines),
`docs/phases/unit-2/COORDINATOR_RULINGS.md`, `CLAUDE.md`, and the `docs/` files each cites.

**Baseline established before any edit:** `npm test --workspace=backend` → **467 passed, 28 files**.

---

## What was built

### Step 1 — the migration renumber and doc amendment (`PHASE_PLAN.md` §4.1). No code.

Done **first**, before any migration file existed. `DATABASE_PLAN.md` §7's list predated `DOM-0` and
assigned `012` to `users.status`; a `014` authored with no `013` present applies straight after
`012` and aborts every boot, because `MigrationRunner.sqlFilesIn` sorts lexicographically
(`migration-runner.ts:40-41`).

New order: `012` `DOM-0` · `013` `DOM-1`+`DOM-2` · `014` `DOM-3`+`DOM-4` · `015` `AUTH-2`, and
everything below shifts one to `022`.

- `docs/DATABASE_PLAN.md` §7 — the list, plus a "Renumbered 2026-09-20" note giving the reason.
- `docs/DATABASE_PLAN.md` §7's closing paragraph — "013 and 014 are the pair" → "013 and 015".
- `docs/PHASE_ROADMAP.md` — the whole unit-2 block rewritten as 2a `[x]` / 2b `[ ]`.
- `docs/IMPLEMENTATION_PLAN.md:108-114` — the `DB` column for `DOM-0`…`DOM-6`.

**`014` and `015` were not authored, not even as empty files.**

### `DOM-0` — retire the learning mode (`D-9`)

| Layer | Files |
|---|---|
| Migration | **new** `backend/src/database/migrations/012_retire_learning_mode.sql` |
| Seeds | `seeds/001_development_fixtures.sql` (drop `default_learning_mode` from the courses insert), `seeds/003_group_fixtures.sql` (drop `learning_mode` from the `group_courses` insert) — **in the same step**, not as a tail task |
| Service deleted | `backend/src/groups/learning-mode.service.ts` — **whole file** |
| Repositories | `courses/interfaces/course-repository.interface.ts`, `courses/repositories/{in-memory,postgres}-course.repository.ts` (drop `defaultLearningMode`); `groups/interfaces/group-repository.interface.ts`, `groups/repositories/{in-memory,postgres}-group.repository.ts` (drop `GroupCourse.learningMode`); `enrollments/interfaces/enrollment-repository.interface.ts` (delete the `LearningMode` type) |
| Services | `courses/courses.service.ts` (**the union collapse**), `dashboard/dashboard.service.ts`, `manage/manage.service.ts`, `reports/reports.service.ts`, `public/public-courses.service.ts`, `groups/groups.service.ts` |
| Modules | `groups/group-data.module.ts`, `groups/groups.module.ts`, `app.module.ts` |
| DTO / controller | `groups/dto/group.dto.ts`, `groups/admin-groups.controller.ts` |
| Mirror | `frontend/lib/types.ts`, `frontend/lib/api.ts` — **same commit** |
| Spec | `docs/API_SPEC.yaml` — `LearningMode` schema and its two uses removed |

**The progress-union collapse.** `RecordedProgress | LiveProgress` → one `CourseProgress` carrying
`completedLessons`/`totalLessons`/`completionPercentage`/`checkpoints` **and**
`attendedSessions`/`totalSessions`/`attendancePercentage`/`timeline`. Both sub-queries always run;
`getProgress` lost its `learningMode` parameter. A course with no recordings reports a **present,
zeroed** completion half rather than omitting it — an absent half would force every caller to branch
again, which is the thing `D-9` removed.

`CLAUDE.md` §11.1 non-negotiable 2 is restated as a comment at the type declaration in **both**
`courses.service.ts` and `frontend/lib/types.ts`, and asserted by a test
(*"should never average completion and attendance into one number"*) that pins the set of
`*Percentage` keys to exactly the two.

### `DOM-1` + `DOM-2` — the group holds one course

| Layer | Files |
|---|---|
| Migration | **new** `migrations/013_group_holds_one_course.sql` — **the one-way door** |
| Seeds | `seeds/003_group_fixtures.sql` — `group_courses` insert replaced by `course_id`/`assistant_id`/`meets`/`room` columns on the `groups` insert, same step |
| Interface | `groups/interfaces/group-repository.interface.ts` — `GroupCourse`/`NewGroupCourse` deleted; `Group` gains `courseId`, `assistantId`, `meets`, `room`; `rename` → `update(groupId, patch)`; `findCourses`/`findGroupCoursesByCourse` → `findByCourse`; `findStudentGroupCourses` → `findStudentGroups`; `addCourse`/`removeCourse` gone; **new** `GroupPatch` |
| Both drivers | `repositories/in-memory-group.repository.ts`, `repositories/postgres-group.repository.ts` |
| Services | `groups/student-groups.service.ts` (`pairingsFor` → `groupsFor`), `groups/groups.service.ts` (`create` takes a `GroupWrite`; `update` replaces `rename`; `addCourse`/`removeCourse` deleted; `listForCourse` is now one indexed read), `groups/classmates.service.ts`, `manage/assessment-authoring.service.ts` |
| DTO | `groups/dto/group.dto.ts` — `CreateGroupDto` widened, **new** `UpdateGroupDto`, `AddGroupCourseDto`/`RenameGroupDto` deleted |
| Controller | `groups/admin-groups.controller.ts` — `POST`/`DELETE /admin/groups/:id/courses` **retired**; `PATCH` widened |
| Audit | `audit/interfaces/audit-log-repository.interface.ts` (**new** `group.updated`; five members + two target types **retained with comments**), `audit/dto/list-audit-log-query.dto.ts` |
| Mirror | `frontend/lib/types.ts` (`GroupCourse` deleted, `Group` widened, **new** `GroupWrite`), `frontend/lib/api.ts` (`createGroup` widened, `renameGroup` → `updateGroup`, `addGroupCourse`/`removeGroupCourse` deleted) |
| Spec | `docs/API_SPEC.yaml` — **new** `/admin/groups` (GET, POST) and `GET /admin/groups/{groupId}` documented; PATCH re-pointed at a **new** `GroupPatch` schema; the two retired paths noted as answering 404 |

**Migration `013`'s two abort paths.** `PHASE_PLAN.md` named one; the second is in the plan's §3.11
as an unnamed risk and is reachable through `GroupRepository.create`. Both `RAISE EXCEPTION`s name
the offending group by name (`string_agg(g.name, ', ')`), because the operator fixing it by hand
will look nowhere else. The whole file is one transaction, so a refusal leaves `group_courses`
intact, `groups.course_id` absent and no ledger row.

**`StudentGroupsService`'s tie-break survives; only the sort key moved** — from
`group_courses.enrolled_at` to `group_memberships.assigned_at`, in both drivers, with the membership
id breaking a shared millisecond so the order is total. Both the rule and the substitution are
documented on the service and on the interface method.

---

## The two statements the coordinator asked for

### 1. `groups.assistant_id` (binding ruling R-1)

> **`groups.assistant_id` is the DISPLAY field — who runs this group. It is NEVER an authorization
> input. What an assistant may reach is decided by `assistant_group_assignments` + `assistant_scopes`
> (slice 2b, `AUTH-2`), through `StaffScopeService` and nowhere else. Nothing in this slice reads
> `groups.assistant_id` for an access decision, and nothing ever may.**

Stated in five places, because the two facts look interchangeable and are not:

1. `013_group_holds_one_course.sql`, on the `ALTER TABLE groups ADD COLUMN assistant_id` statement.
2. `groups/interfaces/group-repository.interface.ts`, on `Group.assistantId`.
3. `groups/repositories/postgres-group.repository.ts`, on the `toGroup` mapping.
4. `frontend/lib/types.ts`, on the mirrored field — *"never render a permission from it"*.
5. `docs/API_SPEC.yaml`, on `Group.assistantId`.

Plus `seeds/003`, where `assistant-1` is **named on group-1 while holding no group assignment**,
deliberately — so a test can prove the two disagree.

**Proved, not asserted.** Two tests:
- `groups.controller.spec.ts` — *"sets assistantId without granting the assistant anything"*.
- `staff.e2e-spec.ts` — *"naming an assistant on a group grants them nothing"*: creates a group on
  course-1 naming `assistant-2`, then proves `assistant-2` still gets **404** (not 403) on
  `GET /staff/courses/course-1/groups`.

`grep -rn "assistantId" backend/src --include=*.ts` outside the group repository/interface/DTO/
controller returns nothing — no service reads it at all.

### 2. `GroupDataModule` (`PHASE_PLAN.md` §3.10 / R-6)

> **The `CoursesModule` ⇄ `GroupsModule` cycle documented at `groups.module.ts:14-26` no longer
> exists.** It existed because `CoursesService` had to read group data to resolve a learning mode;
> `D-9` deleted `LearningModeService`, `CoursesService` no longer touches group data, and
> `GroupDataModule`'s own `imports: [CoursesModule]` was removed with it (its remaining providers —
> `StudentGroupsService` and the two group repositories — need nothing from `CoursesModule`).

**I kept it `@Global()`**, per the plan's recommendation, for the narrower reason that four feature
modules read `GROUP_REPOSITORY` or `StudentGroupsService`. De-globalising it is an import-graph
change with no behavioural payoff and does not belong inside a destructive migration's slice.

**I wrote the expiry on the module itself** (`group-data.module.ts`), in the words a future reader
needs: *"It is no longer load-bearing … do not cite it as precedent for a fourth global module."*
Same in `app.module.ts`. **Flagging for the reviewer:** this is the one place I deliberately left a
`@Global()` whose justification has lapsed. If you want it de-globalised, it is a self-contained
follow-up task touching four module files and no logic.

---

## Deviations from the plan

Every one is recorded; none is silent.

**D-1. `GroupsService.create` now requires a course, and validates it.**
The plan's §4.3 listed `update` as the new method and said nothing about `create`. But `013` makes
`groups.course_id` `NOT NULL`, so a `create` that does not take one cannot compile, let alone run.
`create` therefore takes a `GroupWrite` and calls the same `requireCourse` helper `update` uses
(`StaffScopeService.assertAssigned` then `courseRepo.findById`), so a nonexistent or out-of-scope
course answers 404 at creation as well as at edit. **Consequence for the reviewer:** `POST
/admin/groups` gained a 404 response it did not have, and `CreateGroupDto` gained four fields. The
spec documents both.

**D-2. `docs/API_SPEC.yaml` gained a `GroupPatch` schema and three documented operations.**
The spec's `PATCH /admin/groups/{groupId}` pointed at `GroupWrite`, whose `required: [name, courseId]`
would make a partial update invalid — a contract that cannot express the operation it documents.
I added `GroupPatch` (all optional, `minProperties: 1`) for the PATCH and left `GroupWrite` for the
POST. I also documented `GET`/`POST /admin/groups` and `GET /admin/groups/{groupId}`, which exist in
code and were absent from the spec. **`DELETE /admin/groups/{groupId}` is documented as target-only
and explicitly marked not implemented** — it is in the spec, there is no repository delete, and that
is a deliberate §9 soft-delete-where-history-matters call rather than an omission.

**D-3. The `courses.controller.spec` progress tests are named for what the fixtures actually
contain.** `PHASE_PLAN.md` §4.7 asked for *"a student with recordings and no sessions, and one with
sessions and no recordings"*. `InMemoryLiveSessionRepository` seeds sessions on **both** course-1 and
course-2, so "recordings and no sessions" is not reachable without inventing a fixture. What ships:
*"…for a course that has both"* (course-1: 5/12 complete, 1/1 attended) and *"…a present, zeroed
completion half for a course with no recordings"* (course-2: 0/0 complete, 1/2 attended). The
half-empty property — a missing half is present and zeroed rather than absent — **is** proved, in
the completion direction rather than the attendance one. Flagged because it is a weaker test than
the plan asked for.

**D-4. Three e2e assertions changed shape because `whitelist: true` strips rather than rejects.**
`staff.e2e-spec.ts`'s *"validates the body at the API boundary"* rejected `learningMode: 'hybrid'`.
With the field gone, `ValidationPipe`'s `whitelist: true` (no `forbidNonWhitelisted`) silently
strips it and the request succeeds. Replaced with two cases that *are* rejected: a create missing
the now-required `courseId`, and a PATCH with a malformed `courseId`. The boundary is still tested;
the probe changed.

**D-5. The admin route-parity table dropped from 24 routes to 22.** `it.each(ADMIN_ROUTES)` plus an
explicit `toHaveLength(24)` — the two retired group-course routes take two generated tests with
them. Count and comment updated, with the reason.

**D-6. Frontend typecheck: 301 → 326 errors (+25).** All in `app/` and `components/{app,site}`,
none in `lib/`. Enumerated below. **I did not patch any of them** — `CLAUDE.md` §4.1 and the
coordinator's brief both forbid it; `SHELL-4` deletes that code.

---

## Blockers hit

**None.** No requirement conflict and no missing business decision arose that was not already ruled
on. Two things came close and are recorded rather than guessed:

- **Re-pointing a populated group** (`PHASE_PLAN.md` §4.3's assumption, ratified by the coordinator
  as item 11). Implemented as **409**, with a comment in `groups.service.ts` naming it an assumption
  and citing `DOMAIN_MODEL.md:98-100`. Recorded in `CHANGELOG.md` with the two alternatives.
- **`013`'s second abort path.** Not a business decision — the safe behaviour was unambiguous — but
  it is a real gap in `DATABASE_PLAN.md` §4.1, now reconciled.

**No task is left `[!]`.** All three of `DOM-0`, `DOM-1`, `DOM-2` are complete.

---

## Tests — real output

Every command below was run at the final commit. **No test was deleted or skipped to get a green
run.** No suite skipped itself.

### `npm test --workspace=backend`

```
 RUN  v4.1.11 D:/Users/ghali/TahirElshazli/backend

 Test Files  28 passed (28)
      Tests  471 passed (471)
   Start at  09:18:41
   Duration  18.00s (transform 6.22s, setup 0ms, import 62.63s, tests 26.51s, environment 16ms)
```

**471, from a 467 baseline.** Net +4 across −6 deleted (the `LearningModeService` resolution
describe, which tested a deleted service) and +10 added.

### `npm run test:e2e --workspace=backend`

```
 Test Files  3 passed (3)
      Tests  217 passed (217)
   Start at  09:19:07
   Duration  31.19s (transform 3.35s, setup 0ms, import 15.97s, tests 13.71s, environment 1ms)
```

**217, from a 216 baseline.** Net +1 across −3 (two parity rows for retired routes, one
learning-mode dashboard test) and +4.

### Integration — all 13 migrations from an EMPTY schema, real PostgreSQL 15

```
docker compose up -d postgres
docker exec tahirelshazli-db psql -U dev -d postgres \
  -c "DROP DATABASE IF EXISTS lms_migtest_u2a;" -c "CREATE DATABASE lms_migtest_u2a;"
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest_u2a \
  npm run test:integration --workspace=backend
```

```
[MigrationRunner] Applied 001_student_platform.sql
[MigrationRunner] Applied 002_staff_and_audit.sql
[MigrationRunner] Applied 003_course_catalog.sql
[MigrationRunner] Applied 004_public_catalog.sql
[MigrationRunner] Applied 005_announcements.sql
[MigrationRunner] Applied 006_groups.sql
[MigrationRunner] Applied 007_learning_mode_moves_to_the_group.sql
[MigrationRunner] Applied 008_blog.sql
[MigrationRunner] Applied 009_google_integration.sql
[MigrationRunner] Applied 010_work_types.sql
[MigrationRunner] Applied 011_full_admin_role.sql
[MigrationRunner] Applied 012_retire_learning_mode.sql
[MigrationRunner] Applied 013_group_holds_one_course.sql
[MigrationRunner] Seeded 001_development_fixtures.sql
[MigrationRunner] Seeded 002_staff_fixtures.sql
[MigrationRunner] Seeded 003_group_fixtures.sql
[MigrationRunner] Seeded 004_blog_fixtures.sql
[MigrationRunner] Schema is up to date

 Test Files  1 passed (1)
      Tests  87 passed (87)
   Start at  09:19:51
   Duration  14.81s (transform 619ms, setup 0ms, import 1.99s, tests 12.29s, environment 0ms)
```

**87 passing, from an 81 baseline. 0 skipped. The database was dropped and recreated immediately
before this run**, so all 13 migrations applied from nothing. **`009` and `010`, which
`DATABASE_PLAN.md` §8 recorded as never having run, applied cleanly** — the `NUMERIC(10,2)`-as-string
risk named in unit 1's plan did not materialise, because nothing reads those columns through a
repository yet. That risk row is now closed in `DATABASE_PLAN.md`.

**A `pg_dump` of the dev database was taken before `013` was first run**, per R-1.

#### The `013` refusal tests, run on their own

```
TEST_DATABASE_URL=… npx vitest run --config ./vitest.config.integration.ts \
  -t "refuses rather than guessing"

 Test Files  1 passed (1)
      Tests  3 passed | 81 skipped (84)
```

(The 81 skipped there are the other describes filtered out by `-t`; they run in the full pass
above.) The three are:

- *"aborts on a group holding two courses, naming the group"*
- *"aborts on a group holding no course at all, naming the group"*
- *"collapses cleanly, preserving every group, when the data is sound"*

**The two abort tests were written and passing before the happy-path test was written**, per R-1 —
`013` cannot be tested by running it twice. Each runs in its own Postgres schema (`search_path`,
not a second database), applies 001–012 by hand, offers `013` the bad data, and asserts **both** the
throw with the group named **and** the rollback: `group_courses` still present, `groups.course_id`
absent. The happy path asserts the group row count is unchanged before and after, `course_id` is
`NOT NULL`, the join table is gone, and both indexes exist.

### `npm run lint`

```
> npm run lint:frontend && npm run lint:backend
> eslint
> oxlint src/ test/

src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars):
  Identifier 'EXTERNAL_WORK_BINDER' is imported but never used.
```

Exit 0. **That one warning is pre-existing** — `git show HEAD~2:backend/src/dashboard/dashboard.controller.spec.ts`
carries the same unused import. Not mine, and not fixed, because it is outside scope. eslint on the
frontend is clean.

### Frontend typecheck

```
cd frontend && npx tsc --noEmit 2>&1 | grep -c "lib/"      → 2
cd frontend && npx tsc --noEmit 2>&1 | grep -cE "^lib/"    → 0
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"  → 326
```

**The `grep -c "lib/"` gate reads 2, and that is a flaw in the gate expression, not a miss.** Both
matches are the *message text* `Module '"@/lib/types"' has no exported member 'LearningMode'` on
errors whose **files** are `app/(app)/manage/groups/page.tsx` and `app/(site)/courses/page.tsx`.
Anchoring the grep to the start of line — which is where `tsc` prints the file path — gives **0**.
**No file under `frontend/lib/` has a typecheck error.**

**326 errors, up 25 from 301. The gate said ≤301, so this is a miss against the stated number and I
am not going to round it off.** Every one of the 25 is in `app/` or `components/{app,site}`, and
every one is a direct, mechanical consequence of the `DOM-0`/`DOM-1` contract change:

| Cause | Count | Example |
|---|---|---|
| `learningMode` read off `CatalogItem`/`CourseDetail`/`RosterEntry`/`PublicCourse*`/`GroupCourse` | 13 | `app/(site)/courses/[slug]/page.tsx(111,35)` |
| `progress.type` branch on the collapsed union | 4 | `app/(app)/dashboard/page.tsx(848,31)` |
| `LearningMode` type no longer exported | 2 | `app/(app)/manage/groups/page.tsx(8,29)` |
| `GroupSummary.courses` / `addGroupCourse` / `renameGroup` gone | 6 | `app/(app)/manage/courses/[id]/groups/page.tsx(362,33)` |

**These cannot be avoided without either patching the legacy screens — which `CLAUDE.md` §4.1 and
the coordinator's brief both forbid, and which `SHELL-4` throws away — or leaving the mirror stale,
which `CLAUDE.md` §6 forbids more strongly.** The ≤301 target was written on the assumption that the
mirror change would not propagate; it necessarily does, because every legacy screen that rendered a
Live/Recorded badge or branched on `progress.type` is now referring to a field that does not exist.
Nine of the fourteen files involved are already on `SHELL-4`'s deletion list. Raising it is the
correct outcome; hiding it by not updating the mirror would not be.

---

## Not done, and why

- **`014` and `015` — not authored, not even as empty files.** Out of 2a by ruling R-1, and a `014`
  with no `013` aborts every boot.
- **`DOM-3`, `DOM-4`, `DOM-5`, `AUTH-2`, the final `DOM-6` pass** — 2b.
- **`course_staff_assignments`, `admin-staff.controller.ts`, `CourseStaffRepository`,
  `StaffScopeService`'s internals — untouched.** Verified: `git diff --stat 26b9ccb..HEAD` names
  none of them.
- **`staff-scope.service.spec.ts` — not edited at all**, per the brief. It passes unmodified.
- **`frontend/app/**` and `frontend/components/**` — untouched.** Confirmed by `git diff --stat`.
- **`DELETE /admin/groups/{groupId}`** — in the spec, not implemented, now marked as such. There is
  deliberately no repository delete (§9: soft-delete where history matters, and a group carries
  placement history). Not in scope; recorded so it is not mistaken for a gap.
- **Seeds `001`/`002` for `users.status` and the profile columns** — 2b, with `014`.

### Found outside scope, recorded not fixed

1. `backend/src/dashboard/dashboard.controller.spec.ts:17` — `EXTERNAL_WORK_BINDER` imported and
   unused. Pre-existing; the only lint warning in the repo.
2. `docs/API_SPEC.yaml` documents `DELETE /admin/groups/{groupId}` with no implementation. Marked
   target-only rather than silently deleted, since the decision is the client's.
3. `PHASE_PLAN.md` §4.7 asked for a fixture combination the in-memory repositories cannot produce
   (see deviation D-3).

---

## Documents updated

| Document | What changed |
|---|---|
| `docs/DATABASE_PLAN.md` | §7 migration order renumbered with the reason; §4.1 **reconciled with the DDL that actually ran** (no `learning_mode`, the second abort path, group names in both messages, the display-only rule on `assistant_id`); §8 closes the "009/010 never run" risk with what the first real run found; §9 records the 013 post-conditions asserted directly against the database |
| `docs/PHASE_ROADMAP.md` | Unit 2 rewritten as 2a `[x]` / 2b `[ ]`, with the measured reason for the split, the binding R-1 condition, the exit numbers met, and the rulings carried into 2b |
| `docs/IMPLEMENTATION_PLAN.md` | `DOM-0`/`DOM-1`/`DOM-2` → `[x]` with what landed; `DOM-3` corrected for ruling R-2 (`mode` not built); `DOM-6` → `[~]` with why it is not a tail task; `DB` column renumbered |
| `docs/CHANGELOG.md` | **Six new entries**: the 2a/2b split; the migration renumber; `013`'s second abort path; the 409 on re-pointing a populated group (with alternatives, labelled an assumption); the tie-break sort-key substitution; `GroupDataModule`'s expired justification |
| `docs/DOMAIN_MODEL.md` | `Group` — `learningMode` removed, `assistantId` marked display-only and binding, the 409 invariant added, the tie-break's sort key corrected to `GroupMembership.assignedAt`, the unplaced-student case named |
| `docs/API_SPEC.yaml` | `LearningMode` schema deleted; `Group`/`GroupWrite` reconciled; **new** `GroupPatch`; `/admin/groups` GET+POST and `GET /admin/groups/{groupId}` documented; PATCH widened with its 409; the two retired paths noted; `assistantId` annotated |
| `project_log.md` | A narrative entry for slice 2a |
| `CLAUDE.md` | **Not touched.** No durable rule, boundary or repository fact changed that is not already owned by a `docs/` file. §4.1's ~301 figure is now 326 — but it is described there as approximate and as expected-to-move until `SHELL-4`, and `docs/` records the exact delta. Flagging it in case the reviewer reads it as a repository fact needing an update. |

---

## For the reviewer — what I am least sure of

1. **The frontend error count, 301 → 326.** This is the one stated gate I did not meet. My
   reasoning is above; the alternative was leaving the mirror stale, which is worse. **If you
   disagree, the fix is a scoped task, not a patch to the legacy screens.**

2. **`GroupsService.create` growing a course validation (deviation D-1).** It is forced by the
   `NOT NULL`, but the *404-on-unreachable-course* behaviour is my call rather than the plan's. It
   matches `update`, and it matches how every other `/admin` write treats an out-of-scope course, so
   I believe it is right — but it is a new response on an existing route.

3. **The progress tests are named for the fixtures, not for the plan (D-3).** The half-empty
   property is proved in one direction only. A second fixture course with recordings and no sessions
   would close it, and I judged adding one to be scope I was not given.

4. **`GroupDataModule` keeping `@Global()` after its reason expired.** I followed the plan's
   recommendation and documented the expiry loudly. It is the one deliberate piece of now-unjustified
   structure in the slice.

5. **`013`'s abort tests use a Postgres `search_path` schema rather than a second database.** It is
   the lighter isolation and it works — 001–012 name every table unqualified — but it is a technique
   this repository had not used before, and it is worth a second pair of eyes on whether anything in
   001–012 could reach outside the schema. I found nothing that does.

6. **`in-memory-group.repository.ts`'s `update` iterates `Object.entries(patch)` and writes through
   a cast.** It gives the same `undefined`-means-leave-alone / `null`-means-clear semantics the
   Postgres `CASE WHEN` gives, and is covered in both drivers by the same assertions — but it is the
   one place in the slice where a key is applied dynamically. It is a `GroupPatch`, typed, and never
   reaches SQL; no identifier is ever string-built (`CLAUDE.md` §8 is held: every column in the
   Postgres `UPDATE` is named at author time, with a fixed nine-parameter list).

### Security checklist — what I checked (`CLAUDE.md` §8)

| Item | Result |
|---|---|
| Authorization / object-level | `assertAssigned` untouched; `create`/`update` route through it before naming a course. **`assistant_id` reads: zero.** |
| Anti-enumeration | The 404-not-403 message on an out-of-scope course is unchanged and still asserted identical to a genuine miss (`groups.controller.spec.ts`, `staff.e2e-spec.ts`). |
| Input validation | Every new/changed field has a `class-validator` decorator with a `@MaxLength` (`meets` ≤ 120, `room` ≤ 80, `assistantId` ≤ 64 + `ID_PATTERN`). `@ValidateIf` admits an explicit `null` without weakening the non-null case. |
| SQL injection | Parameterised only. `UPDATE groups` is COALESCE/CASE per column with a fixed parameter list; no string-built `SET`, no identifier from input. |
| Audit | `group.updated` added with its union entry, its exhaustive `Record` entry, and a spec asserting the row. **`before` is read before the write and is a copy in both drivers**, asserted by `expect(entry?.before).not.toEqual(entry?.after)`. Both writes are inside `db.runInTransaction`. |
| Audit history preserved | Five actions and two target types retained unused with comments, plus a **new** spec — *"still accepts every retired action and target type as a filter"* — that would fail if any were tidied away. |
| Error leakage | No new message reveals a resource's existence. The 409 names no id. |
| Output filtering | No new field on any student-facing response. `assistantId` appears only on `/admin` and `/staff` responses. |
| CSRF · CORS · XSS · upload · path traversal · SSRF · secrets · rate limiting · dependencies | Not touched — no new upload path, external call, dependency, or HTML sink. |
