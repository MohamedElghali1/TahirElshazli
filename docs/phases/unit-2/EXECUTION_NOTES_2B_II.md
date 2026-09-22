# Execution notes — unit 2, slice 2b-ii (scope)

**Executor:** `redesign-executor` · **Date:** 2026-09-20 · **Branch:** `redesign`
**Baseline:** `9c754d0`, tree clean — 515 unit / 32 files · 228 e2e / 4 files · 103 integration,
0 skipped, 14 migrations. Re-run by me before writing anything; all three matched.
**Landed:** `2abd54b` (code) + the documentation commit that follows it.
**Input:** `PHASE_PLAN_2B.md` §6 steps 3 and 4 · `COORDINATOR_RULINGS.md` R-1, R-4, R-5, R-7, R-8 ·
`CHANGELOG.md` `D-10`.

---

## What was built

### `AUTH-2` — course scoping → group scoping

| File | What |
|---|---|
| `backend/src/staff/interfaces/assistant-scope-repository.interface.ts` | **new.** One interface, one aggregate ("what this assistant may reach") over **two** tables. `AssistantScope`, `AssistantGroupAssignment`, `ASSISTANT_SCOPE_REPOSITORY`. |
| `backend/src/staff/repositories/in-memory-assistant-scope.repository.ts` | **new.** Fixture mirrors `seeds/002`+`003`: `assistant-1` → `assigned_groups` + group-1; `assistant-2` → `assigned_groups` + nothing. Reads return **copies**. |
| `backend/src/staff/repositories/postgres-assistant-scope.repository.ts` | **new.** Parameterised only. `ON CONFLICT DO NOTHING` + re-read for the idempotent grant; `ON CONFLICT … DO UPDATE` for the scope upsert. **Neither query joins `groups`.** |
| `backend/src/staff/staff-scope.service.ts` | Internals rewritten. **Signature, union shape, admin bypass and 404-with-identical-message unchanged.** `CourseStaffAssignment` → `StaffCourseReach`, a *derived* value with the same member names minus `id` (no caller read it). `COURSE_NOT_IN_SCOPE` exported. **`mayReachGroup` added** — non-throwing, for `D-10`. |
| `backend/src/staff/staff.service.ts` | `listCourseStaff`/`assign`/`unassign` deleted with their routes; `AuditService`, `DatabaseService` and `USER_REPOSITORY` dependencies dropped with them. **`listCourses`'s executable body is byte-identical.** |
| `backend/src/staff/staff.module.ts` | Token swap through the existing `repositoryProvider`; `AdminStaffController` removed. No new module, no fourth `@Global()`. |
| deleted | `admin-staff.controller.ts`, `dto/assign-staff.dto.ts`, `interfaces/course-staff-repository.interface.ts`, `repositories/{in-memory,postgres}-course-staff.repository.ts` |
| `backend/src/database/migrations/015_assistant_group_scope.sql` | **new, written last.** Two tables, two indexes, two backfills, then `DROP TABLE course_staff_assignments`. |
| `backend/src/auth/role-guards.spec.ts` | 30 → **29** controllers, `EXPECTED` 26 → **25**, admin controllers 7 → **6**. Updated, not restructured. |

`GroupRepository.findByIds` was already present (landed by 2a), so the plan's §4.2 row for it was a
no-op.

### `D-10` — the staff group surface is scoped

| File | What |
|---|---|
| `backend/src/groups/groups.service.ts` | `GROUP_NOT_FOUND` exported. **`requireGroup(groupId, actor)`** is the one chokepoint: 404 on a miss, 404 on out-of-scope, **same `const`** on both. |
| `backend/src/groups/staff-groups.controller.ts` | `get` and `members` take the actor. The class doc block (rewritten in 2a to point at `D-10`) now says it is built, and where. |
| `backend/src/groups/admin-groups.controller.ts` | `get` passes the actor too — unscoped in practice (`STAFF_ADMIN`), but there is exactly **one** reachability chokepoint. |

**Enforced on:** `GET /staff/groups/:groupId` · `GET /staff/groups/:groupId/members` ·
`POST /staff/groups/:groupId/members` · and, through the same private method,
`PATCH /admin/groups/:groupId` and `DELETE /staff/groups/:groupId/members/:studentId` (both
`STAFF_ADMIN`, so the check passes — it is there so a route added later cannot forget it).
`GET /staff/courses/:courseId/groups` was already scoped by `assertAssigned` and is unchanged.

`DELETE …/members/:studentId` keeps its **403** and `assertMay` as the first statement: a capability
refusal, not a scope one, and an assistant never reaches that group read anyway.

### `DOM-6` — the final seed pass

`seeds/002` gains the two `assistant_scopes` rows; `seeds/003` carries the one
`assistant_group_assignments` grant. **Split across two files because the grant references
`groups`, which `003` seeds** — FK ordering, not a change of intent, and both files say so.

---

## Deviations from the plan

1. **The seed grant is in `003`, not `002`** (plan §4.2 / §6 implied `002`). `002` runs before `003`,
   and `assistant_group_assignments.group_id` references `groups`. Recorded as `D-22`.
2. **`StaffCourseReach` drops `id`.** The plan allowed it conditionally ("if `id` is dropped, check
   `staff-scope.service.spec.ts:36-38` first"). Checked: it asserts `courseId` and `userId` only, and
   no production caller reads the return value at all (grep in §Verification below). Dropped.
3. **`WorkAnalyticsService` was changed, and it is not in the plan's file list.** Forced by `D-10`:
   `expectedStudentIds` called `GroupsService.members`, which is now caller-scoped. Passing the
   actor would have made a completion-rate **denominator** depend on who was looking — a number
   that is wrong without ever being an error, which is worse than a refusal. It reads
   `GROUP_REPOSITORY` (global) instead, and `AssessmentsModule`'s now-unused `GroupsModule` import
   went with it. Recorded as `D-21`. **The route's gate is unchanged** — see `B-4`.

   **Every other consumer of the two methods `D-10` scoped, checked for the same shape.** The
   question is not "who calls `members`" but "who uses a caller-scoped read as *data* rather than as
   an authorization decision", so the sweep was over `GroupsService` as a whole:

   | Consumer | Uses | Same shape? |
   |---|---|---|
   | `groups/staff-groups.controller.ts:73,82` | `get`, `members` | **No** — an HTTP handler answering the caller; scoping it is the point. |
   | `groups/admin-groups.controller.ts:66` | `get` | **No** — `STAFF_ADMIN`, so the check always passes; the actor is threaded so there is one chokepoint rather than two. |
   | `assessments/work-analytics.service.ts:129` | was `members` | **Yes — the one, and it is fixed.** |

   `grep -rn "\.members(\|groups\.get(" src --include=*.ts` (non-spec) returns those three lines
   and nothing else, and `GroupsService` is injected in exactly two files after the change, both its
   own controllers. **No follow-up is filed because none remains.**

   Two near-misses worth naming so nobody re-greps them: `AssessmentsService` and
   `WorkAnalyticsGateService` import `StudentGroupsService`, not `GroupsService` — a different,
   student-scoped service keyed on the caller's *own* membership, which `D-10` does not touch.
   `ClassmatesService` builds its own narrower list and never calls `members`; that separation is
   deliberate (widening the staff roster must not widen the student one) and it paid off here.
4. **Two comments inside `StaffService.listCourses` were corrected.** The plan asks for the method
   byte-identical; its **executable body is**, but two comments said an assistant "reads through
   `course_staff_assignments`", a table this slice drops. A false comment is worse than a
   non-identical diff. `ManageService` is untouched entirely (`git diff --stat` empty).
5. **Three `/staff/groups/*` paths were added to `docs/API_SPEC.yaml`.** They existed in the
   implementation and were absent from the target contract. Their authorization changed here, which
   is the point at which an undocumented route stops being a nuisance.
6. **Existing tests that placed an assistant into `group-2` moved to `group-1`.** Five unit cases and
   three e2e cases. Not a weakening: `assistant-1` holds group-1 and not group-2, and each refusal
   they used to imply is now asserted directly and in both directions in the new `D-10` blocks. The
   `assistantId`-grants-nothing tests were **not** touched and pass unmodified.

---

## The four deleted spec cases (ruling R-8), named with the method each tested

| Deleted case (`staff-scope.service.spec.ts:118-150`) | Method it tested |
|---|---|
| *"should be idempotent and report whether a row was created"* | `StaffScopeService.assign` |
| *"should grant access that assertAssigned immediately honours"* | `StaffScopeService.assign` |
| *"should revoke access on unassign"* | `StaffScopeService.unassign` |
| *"should report false when there was nothing to unassign"* | `StaffScopeService.unassign` |

Both methods are deleted, along with `/admin/courses/:courseId/staff`. The §4.4.1 replacements
landed **in the same commit**:

- *idempotent grant* → `AssistantScopeRepository`'s contract, asserted in **both** drivers:
  `staff-scope.service.spec.ts` *"should be idempotent on a repeated grant, and report which
  happened"* (memory) and `postgres-repositories.integration-spec.ts` *"is idempotent under the
  unique index rather than under a prior read"* (Postgres).
- *grant-then-reach / revoke-then-refuse* → *"should honour a grant immediately, and a revocation
  immediately"*, at the group grain.

## The seven contract cases pass unmodified

`git diff` on that file removes exactly: two import lines, two doc comments, the one
`beforeEach` provider line, and the four cases above. **No assertion in the seven was changed.**

| Case | Status |
|---|---|
| *should let an assigned TA through and return their assignment* | unmodified, passing |
| *should refuse a TA on a course they are not assigned to* | unmodified, passing |
| *should refuse a TA with no assignments at all* | unmodified, passing |
| *should refuse with 404, not 403, so a TA cannot enumerate courses* | unmodified, passing |
| *should let %s through without an assignment row* (`it.each` ×2) | unmodified, passing |
| *should return only the assigned courses for a TA* | unmodified, passing |
| *should return an empty list, not everything, for an unassigned TA* | unmodified, passing |
| *should report %s as unscoped* (`it.each` ×2) | unmodified, passing |
| *should not treat any other role as unscoped* | unmodified, passing |

The only permitted edit — `{ provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository }`
→ the new token pair plus `GROUP_REPOSITORY` — is a fixture change.

**Also still passing unmodified (ruling R-1, the display-field guard):**
`groups.controller.spec.ts` *"sets assistantId without granting the assistant anything"* and
`staff.e2e-spec.ts` *"naming an assistant on a group grants them nothing"*.

---

## Blockers hit

### `B-4` — may an assistant read work analytics for a task targeted at a group they do not hold? **Open. Nothing guessed; one task left as it was.**

**Question.** `GET /staff/assessments/:id/analytics` gates on the *course*
(`WorkAnalyticsGateService.assertAssigned`). A task targets **groups**. `AUTHORIZATION_MODEL.md:207`
says *"any assistant-facing read/write → group scope → 404"*.

**Reading A — refuse the whole read** unless the assistant holds every targeted group. Simple and
fail-closed; makes analytics unreadable for any multi-group task an assistant partly holds.
**Reading B — narrow the denominator** to the held groups. Keeps the screen useful; changes what a
number *means* depending on who reads it, which is the failure `CLAUDE.md` §11.1 warns about, and
two staff would legitimately see different completion rates for one task.

**Impact.** Neither is a code problem; both are one condition. The difference is a number a teacher
and an assistant would disagree about, which is business behaviour and not mine to invent.

**What I did.** Everything that does not depend on it. The route's gate is **unchanged** — this is
not a regression; it is the behaviour that shipped. `WorkAnalyticsService` was changed only to stop
`D-10` silently producing Reading B *by accident* (`D-21`). Task left `[!]` nowhere because no task
in this slice covers it; it is a **new** task for whichever unit owns analytics, and it is named in
`CHANGELOG.md` `D-21`.

### `D-20` — nothing writes a scope row for an assistant created after `015`. **Recorded, not a blocker.**

Found by the integration suite, not reasoned about: a `role='assistant'` account created at runtime
has no `assistant_scopes` row. `015` backfills the accounts that exist, and **nothing in the product
creates an assistant account** (`register` makes students; there is no `POST /admin/assistants`).
`StaffScopeService` treats a missing row as a refusal, so such an account reaches **nothing** — the
safe direction. Unit 5's `PEOPLE-4` must write the row. `AUTHORIZATION_MODEL.md` §2 and
`DATABASE_PLAN.md` §4.2 now say so.

The integration assertion is scoped to the seeded accounts for this reason, with the reason written
at the assertion; the **unconditional** version of the same invariant is asserted in the side-schema
migration test, where nothing but `015` has run.

---

## Tests — real output

```
$ npm test --workspace=backend

 Test Files  32 passed (32)
      Tests  517 passed (517)
   Start at  22:52:43
   Duration  20.51s (transform 5.89s, setup 0ms, import 71.73s, tests 36.96s, environment 20ms)
```

```
$ npm run test:e2e --workspace=backend

 Test Files  4 passed (4)
      Tests  228 passed (228)
   Start at  22:53:07
   Duration  37.62s (transform 2.79s, setup 0ms, import 13.75s, tests 22.01s, environment 1ms)
```

```
$ docker exec tahirelshazli-db psql -U dev -d postgres \
    -c "DROP DATABASE IF EXISTS lms_migtest_u2bii;" -c "CREATE DATABASE lms_migtest_u2bii;"
DROP DATABASE
CREATE DATABASE

$ TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest_u2bii \
    npm run test:integration --workspace=backend
[Nest] LOG [MigrationRunner] Seeded 004_blog_fixtures.sql
[Nest] LOG [MigrationRunner] Schema is up to date

 Test Files  1 passed (1)
      Tests  110 passed (110)
   Start at  22:53:55
   Duration  19.19s (transform 664ms, setup 0ms, import 2.21s, tests 16.35s, environment 0ms)
```

**0 skipped in all three.** The integration database was created **empty immediately before the
run**, so all 15 migrations applied from nothing.

```
$ docker exec tahirelshazli-db psql -U dev -d lms_migtest_u2bii \
    -c "SELECT count(*) AS migrations FROM schema_migrations;" \
    -c "SELECT to_regclass('course_staff_assignments') AS csa_gone;" \
    -c "SELECT * FROM assistant_scopes ORDER BY user_id;" \
    -c "SELECT id,user_id,group_id FROM assistant_group_assignments;"
 migrations
------------
         15

 csa_gone
----------
            <- NULL: the table is gone

   user_id   |      scope      |          updated_at
-------------+-----------------+-------------------------------
 assistant-1 | assigned_groups | 2026-09-20 19:54:00.748649+00
 assistant-2 | assigned_groups | 2026-09-20 19:54:02.60254+00

        id         |   user_id   | group_id
-------------------+-------------+----------
 assistant-group-1 | assistant-1 | group-1
```

```
$ npm run lint
> frontend@0.1.0 lint
> eslint
> backend@0.0.1 lint
> oxlint src/ test/
src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars):
  Identifier 'EXTERNAL_WORK_BINDER' is imported but never used.
```

The one warning is **pre-existing** and named as such in the plan's §7.

```
$ cd frontend && npx tsc --noEmit 2>&1 | grep -cE "^lib/"
0
$ cd frontend && npx tsc --noEmit 2>&1 | grep -cE "error TS"
340
```

**Delta 328 → 340, +12, all one cause:** `app/(app)/manage/courses/[id]/staff/page.tsx` — a screen
for `/admin/courses/:courseId/staff`, a route that no longer exists. `frontend/app/**` is out of
scope (unit 4 deletes it), so it was not touched. **It is dead code today and a candidate for
deletion the moment anyone wants the number down.**

### `015` against the real dev database, after a `pg_dump`

Dump taken first:
`docker exec tahirelshazli-db pg_dump -U dev -d tahirelshazli` → 1667 lines, held in the session
scratchpad. Then the runner applied `015`:

| Count | Before | After |
|---|---|---|
| `course_staff_assignments` | **1** | table dropped |
| `assistant_group_assignments` | — | **1** (the one course had one group) |
| `assistant_scopes` | — | **2** |
| `SELECT count(*) FROM users WHERE role='assistant'` | 2 | 2 |

`assistant_scopes` = 2 = the assistant count. Both `assigned_groups`; a migration never grants
"sees everything".

### The security checklist (`CLAUDE.md` §8), item by item

| Item | Checked |
|---|---|
| **Authorization / object-level** | The chokepoint was rewritten. **21** `StaffScopeService` call sites across 9 services, **none edited** — enumerated below. `D-10` closes the group surface in both directions. |
| **Anti-enumeration** | Two exported `const`s; `===` against the genuine-miss path **in the same test**, for the course (`staff-scope.service.spec.ts`, `groups.controller.spec.ts`) and the group (`groups.controller.spec.ts`, `staff.e2e-spec.ts`). The e2e case also asserts the body carries no SQL or stack. |
| **`groups.assistant_id`** | `grep -rn "assistantId\|assistant_id" backend/src --include=*.ts` → the only non-`groups/{interfaces,repositories,dto}` hits are `groups.service.ts`'s five **write/audit-payload** lines and `staff-scope.service.ts`'s comment saying it is never read. **No service reads it for a decision.** |
| **Output filtering** | No response shape gained a field. The staff roster (name + email) is unchanged and is now *harder* to reach, not easier. |
| **SQL injection** | Two new repository files, ~7 methods, **parameterised only**; no string-built SQL. `015` contains no interpolation. |
| **Audit logging** | **No new action.** The three retired members (`course_staff.assigned`, `course_staff.unassigned`, `course_staff_assignment`) are **untouched**; `audit.service.spec.ts:198` still passes, and a new e2e case asserts the log still filters by both actions with the table gone. |
| **Error leakage** | The two 404s carry one message each and no id, no SQL, no stack. The refused placement writes nothing and logs nothing (asserted). |
| **Rate limiting · CSRF · CORS · XSS · upload · SSRF · secrets · dependencies** | Untouched — no new upload path, external call, HTML sink or dependency. |
| **Environment configuration** | Seeds still carry the published hash; `resolveAutoSeed` untouched. |

### The 21 call sites, verified unedited

`assertAssigned` (19): `announcements/announcements.service.ts:72,212` ·
`groups/groups.service.ts:300,407` (was `:264,371`; the lines moved because `requireGroup` grew,
the **statements are unchanged**) · `manage/assessment-authoring.service.ts:227,232,253` ·
`manage/grading.service.ts:97,194` · `manage/manage-live-sessions.service.ts:66,76,89` ·
`manage/manage-recordings.service.ts:65,75,96` · `manage/manage.service.ts:183,249` ·
`manage/work-analytics-gate.service.ts:75,102`.

`scopeFor` (2): `manage/manage.service.ts:115` · `staff/staff.service.ts:45` (was `:70`; the file
shrank by the three deleted methods).

Plus **one new** site: `groups/groups.service.ts:124` → `mayReachGroup`, inside `requireGroup`.

No caller reads `assertAssigned`'s return value —
`grep -rn "= await .*assertAssigned" backend/src` is empty — which is what made dropping
`StaffCourseReach.id` safe.

---

## Not done, and why

- **`PATCH /admin/assistants/{userId}`** — unit 5 `PEOPLE-4`, out of scope by the plan. **Consequence,
  restated:** until it ships, the only way to grant an assistant a group is the seed fixture or SQL.
  This is what forced three e2e tests onto `group-1`.
- **`assistant.scope_changed` audit action** — no route writes scope; an action nothing emits is drift.
- **`Assistant.scope` / `Assistant.groupIds` moved into `required`** — the storage exists now, but
  `GET /admin/assistants` still does not emit them. Left optional, with the comment retargeted from
  `AUTH-2` to `PEOPLE-4` so it stops being wrong.
- **`B-4`'s analytics scoping** — above.
- **`app/(app)/manage/courses/[id]/staff/page.tsx`** — dead, out of scope, flagged.

---

## Documents updated

| Document | What changed |
|---|---|
| `docs/API_SPEC.yaml` | Three `/staff/groups/*` paths added with their `D-10` 404 semantics. `Assistant.scope`/`groupIds` comment retargeted: storage exists, no emitter, so still optional. No path was deleted — `/admin/courses/{courseId}/staff` was never in the contract. |
| `docs/AUTHORIZATION_MODEL.md` | §2 says the replacement is **built**, names the missing-row third state and `PEOPLE-4`'s obligation, and records that a migration never grants `all_groups`. §"Any assistant-facing read/write" names the two chokepoints and the two `const`s. |
| `docs/DATABASE_PLAN.md` | §4.2 marked DONE, corrected to the SQL actually shipped, with the two departures explained (deterministic id; scope backfill reads `users`, not the old table) and the real row counts. `015` marked applied and verified. |
| `docs/CHANGELOG.md` | `D-18`…`D-22`. |
| `docs/IMPLEMENTATION_PLAN.md` | `AUTH-2` `[ ]` → `[~]`; `DOM-6` note closed; the open `D-10` paragraph struck through as closed. |
| `docs/PHASE_ROADMAP.md` | 2b-ii → **`[~]`** with the measured numbers. **Not `[x]`** — that needs a reviewer verdict of `APPROVED` and is the coordinator's to set. |
| `project_log.md` | Slice entry. |
| `CLAUDE.md` | §4 repository counts 17/34 → **16/32**; §7's `StaffScopeService` bullet updated (22 → 21 call sites, rewrite done and contract intact) and a new bullet stating the group grain and the fail-closed missing row. Durable facts only. |

---

## For the reviewer — what I am least sure of

1. **`B-4`.** I changed `WorkAnalyticsService` to *preserve* current behaviour rather than to scope
   it, and I think that is right — a wrong number is worse than a refusal — but it is a judgement
   call made under a question nobody has answered. Check the reasoning, not just the diff.
2. **Eight existing tests moved from `group-2` to `group-1`.** Each is a consequence of `D-10` and
   each refusal is separately asserted in the new blocks, but this is the largest surface on which I
   could have accidentally weakened something. `git diff 9c754d0..HEAD -- backend/src/groups/groups.controller.spec.ts backend/test/staff.e2e-spec.ts`
   is the thing to read.
3. **The seed split across `002` and `003`.** FK-forced, but it separates one conceptual fixture into
   two files and 2a's comment in `003` had to be rewritten because `assistant-1` now genuinely holds
   group-1. I kept the display-vs-authorization proof by moving it to `assistant-2`; satisfy yourself
   that the proof is as strong.
4. **Two comments inside `listCourses`.** The plan asked for the method byte-identical. The body is;
   the comments are not. If you would rather have the literal byte-identical file, the comments go
   back and become false.
5. **`015`'s `ON CONFLICT (user_id) DO NOTHING` on `assistant_scopes`.** Re-running the file on a
   database where the table already exists would fail at `CREATE TABLE` long before that, so the
   clause only protects the case where the two backfill statements are replayed by hand. Harmless,
   but it is defensive code for a case that cannot arise through the runner.
