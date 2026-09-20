# Review — unit 2, slice 2a

**VERDICT: APPROVED WITH FOLLOW-UP**

**Reviewer:** `redesign-reviewer` · **Date:** 2026-09-20 · **Range:** `26b9ccb..4e11a69`

The substance of the slice is correct, safe and genuinely moves the product to the new model. Nine
findings remain; none is a security or authorization defect, none is a regression against behaviour
still wanted, and none blocks slice 2b. **The phase stays incomplete until the checklist in
§Remediation closes.**

---

## Scope reviewed

**Revision range** `26b9ccb..4e11a69` — `a7ea93a` (`DOM-0`), `4e11a69` (`DOM-1`+`DOM-2`).
56 files, +3233/−1143. Working tree carries one uncommitted change, the coordinator's own
`PHASE_ROADMAP.md` status reset.

**Read in full:** `PHASE_PLAN.md`, `COORDINATOR_RULINGS.md`, `EXECUTION_NOTES.md`, `CLAUDE.md`,
`docs/{PRODUCT_SPEC,AUTHORIZATION_MODEL,DATABASE_PLAN,DOMAIN_MODEL,API_SPEC.yaml,CHANGELOG,
IMPLEMENTATION_PLAN,PHASE_ROADMAP}.md`, and every source file in the diff that carries logic:
migrations `012`/`013`, `migration-runner.ts`, `courses.service.ts`, `recordings.service.ts`,
`live-sessions.service.ts`, `groups.service.ts`, `group.dto.ts`, `admin-groups.controller.ts`,
`staff-groups.controller.ts`, `group-repository.interface.ts`, both group repository drivers,
`student-groups.service.ts`, `classmates.service.ts`, `dashboard/manage/reports/public-courses`
services, the audit union + query DTO + spec, `group-data.module.ts`, `groups.module.ts`, both seeds,
and `frontend/lib/{types,api}.ts`.

**Suites I ran myself** (not taken on the executor's report):

| Command | Result |
|---|---|
| `npm test --workspace=backend` | **471 passed, 28 files**, exit 0 |
| `npm run test:e2e --workspace=backend` | **217 passed, 3 files**, exit 0 |
| `TEST_DATABASE_URL=…/lms_rev_u2a npm run test:integration --workspace=backend` | **87 passed, 0 skipped**, exit 0, on a database I dropped and recreated immediately before the run — all **13** migrations and all 4 seeds applied from nothing |
| `cd frontend && npx tsc --noEmit` | **326** `error TS`; `grep -cE "^lib/"` = **0** |

The integration suite **executed**; it did not skip itself. Every executor-reported number is
reproducible.

---

## Did this move toward the NEW product?

**Yes, on all three counts, and with none of the classic half-moves.**

1. **`learning_mode` is gone as a concept, not merely as a column.** `LearningModeService` is deleted
   whole; the three columns are dropped by `012`; and — the part that distinguishes a real retirement
   from a schema tidy — the `{type:'recorded'} | {type:'live'}` **response union collapsed**
   (`backend/src/courses/courses.service.ts:44-54`). Every residual match in the repository is a
   comment, an immutable historical migration, or a *negative* assertion
   (`expect(progress).not.toHaveProperty('type')`). Verified by grep across `backend/src`,
   `backend/test` and `frontend/lib`.
2. **The group is now the centre.** `groups.course_id` is `NOT NULL`, `group_courses` is dropped,
   and the three call sites that used to resolve a pairing back into a group
   (`classmates.service.ts:75`, `assessment-authoring.service.ts:191`, `groups.service.ts:369`) each
   lost a read rather than gaining a shim.
3. **Non-negotiable 2 is held, and is held by a test rather than by a comment.** `CourseProgress`
   carries completion and attendance as four + four separate fields; the two sub-services compute
   their percentages independently (`recordings.service.ts:73-76`, `live-sessions.service.ts:103-106`);
   nothing anywhere averages them. `courses.controller.spec.ts:117-126` pins the set of
   `*Percentage` keys to exactly `['completionPercentage','attendancePercentage']` — derived from the
   object, so a third blended figure fails it. `frontend/lib/types.ts:61-84` mirrors the shape and
   restates the rule. `app.e2e-spec.ts:597` asserts `not.toHaveProperty('overallPercentage')` over
   the wire.

**Nothing obsolete was left active.** `POST|DELETE /admin/groups/:id/courses` answer 404, asserted
(`staff.e2e-spec.ts`, "no longer exposes the retired group-course routes"). `AddGroupCourseDto` and
`RenameGroupDto` are deleted. The `GroupCourse` entity is gone from both the backend interface and
the frontend mirror.

**Nothing in scope was skipped.** `DOM-3`, `DOM-4`, `DOM-5`, `AUTH-2`, `014` and `015` are absent —
which ruling R-1 requires, and I confirmed `014`/`015` do not exist even as empty files, that
`backend/src/staff/**` is untouched including `staff-scope.service.spec.ts`, and that
`frontend/app/**` and `frontend/components/**` are untouched.

---

## Findings

Ranked most severe first. Each is `confirmed` — I re-derived it at the cited line.

### F-1 · Medium · confirmed · the tie-break has no memory-driver test, and the gap is unrecorded

`PHASE_PLAN.md` §4.7 names a `student-groups.service.spec` case: *"a student in two groups on one
course returns the longest-standing placement first, by `GroupMembership.assignedAt`"*. It did not
ship, and it is not among deviations `D-1`…`D-6`. The only test of the order is
`backend/test/postgres-repositories.integration-spec.ts:993`, against Postgres.

The rule is load-bearing (`student-groups.service.ts:8-29`: the assessment window and the classmate
list must pick the **same** group) and it is implemented twice — in SQL at
`postgres-group.repository.ts:228` and in JavaScript at `in-memory-group.repository.ts:198-201`.

**Failure scenario.** Someone simplifies `in-memory-group.repository.ts:198-201` to return
memberships in insertion order. All 471 unit tests — which run against the memory driver — stay
green. On `PERSISTENCE_DRIVER=memory` a student placed in two groups on one course then sees group
A's classmates and group B's due dates, the exact drift the service's doc comment says the tie-break
exists to prevent. Only the Postgres suite would catch a matching mistake in SQL, and it cannot catch
this one at all.

`groups.controller.spec.ts:366` covers two groups but asserts only the count, not the order.

### F-2 · Medium · confirmed · `UpdateGroupDto` admits `null` for the two `NOT NULL` columns, and the drivers disagree about it

`backend/src/groups/dto/group.dto.ts:87-91` and `:93-99` guard `name` and `courseId` with
`@IsOptional()`. `@IsOptional()` **ignores every validator when the value is `null`, not only when it
is `undefined`** — verified in the installed source,
`node_modules/class-validator/cjs/decorator/common/IsOptional.js:19-20`:

```js
(object, value) => object[propertyName] !== null && object[propertyName] !== undefined
```

So `PATCH /admin/groups/:groupId` with `{"name": null}` passes validation and reaches the service,
where the two drivers do different things:

- `postgres-group.repository.ts:133` — `name = COALESCE($2, name)` → silent no-op, **200 OK** with
  the group unchanged.
- `in-memory-group.repository.ts:131-134` — `Object.entries(patch)` skips only `undefined`, so it
  writes `found.name = null` and returns a group whose name is `null`.

`CLAUDE.md` §9 requires the memory driver to satisfy the same contract as the Postgres one, and §6
requires a DTO not to accept what it does not declare — it declares `name?: string`. The correct
answer for both drivers is **400**.

`staff.e2e-spec.ts:947` tests `''`, a missing `courseId`, and a malformed `courseId`; it does not
test `null`. Scope is limited: the route is `@Roles(...STAFF_ADMIN)`, so this is reachable only by a
teacher or admin, and production runs the Postgres driver. It is a correctness and
driver-contract defect, not a security one.

### F-3 · Medium · confirmed · the rationale for leaving the staff group reads unscoped was falsified by this very migration

`backend/src/groups/staff-groups.controller.ts:30-37` explains why `GET /staff/groups/:groupId` and
`GET /staff/groups/:groupId/members` carry no scope check:

> *"The group reads and the placement writes name a **group**, and a group is not a course — it spans
> them — so there is no course to scope by. … the check that appears here is "is this TA assigned to a
> course this group studies", and it belongs in `GroupsService` beside the one `addCourse` already
> makes."*

After migration `013` a group studies **exactly one** course, so there is now precisely one course to
scope by; and `addCourse` was deleted in this slice, so the sentence points at nothing.

Meanwhile `docs/AUTHORIZATION_MODEL.md:105` puts an assistant's "View groups" at **"in scope"**, and
`:207` says *"Any assistant-facing read/write | group scope → 404"*.

**This is not a new hole.** The behaviour is unchanged from before the slice, it is what the client
asked for at the time (*"TAs are allowed to access all groups"*), and closing it is `AUTH-2`'s job in
2b. The finding is that the comment a 2b executor will read now argues **against** the target model
using a premise that is false. Today an assistant can `GET /staff/groups/:id/members` for any group
in the platform and receive every member's name and email.

### F-4 · Low-medium · confirmed · `API_SPEC.yaml` drifts from the two group **write** responses

`docs/API_SPEC.yaml:252` declares `Group` with `required: [id, name, courseId, memberCount]`, and
documents `POST /admin/groups` (201) and `PATCH /admin/groups/{groupId}` (200) as returning it.

The implementation returns a **bare `Group`, with no `memberCount`** —
`groups.service.ts:181` (`return group`) and `:246` (`return after`), typed `Promise<Group>` at
`admin-groups.controller.ts:69,88`. `GroupSummary` (which does carry `memberCount`) is returned only
by `list` and `get`.

`courseTitle` and `assistantName` are likewise declared on the schema and emitted by nothing; they
are optional, so they are target-shape rather than drift.

**Failure scenario.** A client generated from `API_SPEC.yaml` — which `CLAUDE.md` §6 explicitly
proposes as the fix for the hand-written mirror — rejects or mistypes every create/edit response,
because a required property is absent. This is the same class of defect as the `AuditAction` union
that shipped 6 of 39 members.

### F-5 · Low · confirmed · `GroupWrite` names two different shapes in the two artifacts

`docs/API_SPEC.yaml:265` — `GroupWrite` is the **POST** body, `required: [name, courseId]`; the PATCH
body is the new `GroupPatch`, all-optional.
`frontend/lib/types.ts:706` — `GroupWrite` is the **all-optional PATCH** body, used by
`lib/api.ts:updateGroup`. The frontend has no mirror of the spec's `GroupWrite`; `createGroup` takes
an inline object literal instead (`lib/api.ts:815-824`).

**Failure scenario.** A developer reaches for `GroupWrite` to type a create form, gets a shape in
which `name` and `courseId` are optional, and ships a create call the server answers 400 on.
Renaming the frontend type to `GroupPatch` costs one line and removes the collision.

### F-6 · Low · confirmed · a test-block comment overstates what the tests prove

`backend/src/courses/courses.controller.spec.ts:74-77` introduces the two replacement progress tests
as:

> *"a course with recordings and no sessions, and a course with sessions and no recordings, each
> carry BOTH halves"*

Neither fixture is the first of those. course-1 has recordings **and** a session (5/12 complete,
1/1 attended); course-2 has sessions and no recordings. The executor's own deviation `D-3` states
plainly that "recordings and no sessions" is unreachable with the in-memory fixtures — but the block
comment above the renamed tests still claims it. `CLAUDE.md` §12: an entry that overstates what works
is worse than no entry.

The underlying coverage gap is small: the half-empty property is proved in one direction, and each
sub-service handles its own zero case independently and correctly (verified at
`recordings.service.ts:73-76` and `live-sessions.service.ts:103-106`).

### F-7 · Low · confirmed · two orphaned comments now assert something false

- `backend/src/reports/reports.service.ts:57` — `/** Global (GroupDataModule); the mode lives on the
  group now (§5.2). */` is the last thing inside the constructor parameter list, documenting a
  parameter that was deleted.
- `backend/src/manage/manage.service.ts:94` — the same comment now sits directly above
  `@Inject(COURSE_REPOSITORY) private readonly courseRepo`, labelling the **course** repository as a
  `GroupDataModule` global.

Both still claim the learning mode exists. `D-9` retired it.

### F-8 · Low · confirmed · `PHASE_ROADMAP.md` records a test count that is one short

`docs/PHASE_ROADMAP.md:188` — *"**Exit, met** 470 unit · 217 e2e · 87 integration"*. The real figure
is **471**, in `EXECUTION_NOTES.md`'s own pasted output and in my independent run.

### F-9 · Info · confirmed · `012`'s assertion is not schema-scoped

`backend/src/database/migrations/012_retire_learning_mode.sql:48-51` queries
`information_schema.columns WHERE table_name = 'enrollments' AND column_name = 'learning_mode'` with
no `table_schema` predicate, so it reads **every schema in the database**.

Harmless in the single-schema production case. It becomes load-bearing because this slice introduces
a technique that deliberately runs `001`–`012` inside a side schema
(`postgres-repositories.integration-spec.ts:1606-1617`): there, the assertion inspects the main
schema's tables too. It passes today only because the main schema's `enrollments` also lost the
column in `007`. `AND table_schema = current_schema()` makes the assertion say what it means.

I checked the rest of `001`–`012` for cross-schema reach and found nothing else: no `public.`
qualification, no `CREATE EXTENSION`, no `pg_catalog` reference.

---

## The coordinator's ten questions, answered

**1 · Is the one-way migration correct, not merely guarded?**

Yes. `013_group_holds_one_course.sql:101-104` is
`UPDATE groups g SET course_id = gc.course_id FROM group_courses gc WHERE gc.group_id = g.id` —
a correlated update whose only ambiguity (a group with two pairings, where Postgres would pick one
arbitrarily) is eliminated *before* any write by the guard at `:73-80`, and whose only silent failure
(a group with no pairing) is eliminated by the guard at `:87-94`. Both name the offending group with
`string_agg(g.name, ', ')`. The file is one transaction —
`migration-runner.ts:91-98` wraps `client.query(sql)` and the ledger insert together — so a `RAISE`
leaves no column, no dropped table and no ledger row.

**The abort tests are genuine, and they would fail if the guards were removed.** Both apply `001`–
`012` by an explicit filtered file loop (`:1584-1591`, `n < '013'`), insert real bad data, then offer
`013` the whole file. Removing guard (a) makes the two-course case succeed silently, so
`rejects.toThrow` fails. Removing guard (b) makes the no-course case fail with a bare `NOT NULL`
violation whose message does not match `/A group studies no course; assign one by hand first:
Unassigned cohort/`, so it fails too. Each asserts the rollback as well as the throw:
`course_id` absent, `group_courses` still present with both rows.

The happy path (`:1708`) asserts the row count is unchanged **and** the exact `(id, course_id)`
mapping, `is_nullable = 'NO'`, the join table gone, and both indexes present. The abort tests were
written before it, per R-1.

**Every group ends on the right course** in the fixtures too: `seeds/003_group_fixtures.sql:32-34`
puts group-1 on course-1 and group-2 on course-2, matching the pairings the old seed created.

**2 · The progress-union collapse.**

Verified, backend and frontend, and nothing averages the halves — see §"Did this move toward the NEW
product?" above for the six places I checked.

**On the test naming (`D-3`):** the two cases `PHASE_PLAN.md` §4.7 asked for are **not** both covered.
"Sessions and no recordings" is covered (course-2). "Recordings and no sessions" is **not**, because
`InMemoryLiveSessionRepository` seeds sessions on both fixture courses — the executor's account is
accurate. The substitute ("a course that has both") is a weaker but still useful test, and a third
test pinning the `*Percentage` key set was added that the plan did not ask for. I judge the
substance adequate and the *comment* describing it inaccurate — **F-6**.

**3 · The binding R-1 condition.**

Held, and proved behaviourally rather than by assertion. `grep -rn "assistantId\|assistant_id"
backend/src --include=*.ts` returns matches only in the group repository, interface, DTO, service
(as data), and two specs. **Zero services read it.** The statement is written in all five places the
executor claims, plus `seeds/003_group_fixtures.sql:28-34`, where `assistant-1` is named on group-1
while holding no assignment — deliberately making the two facts disagree in the fixtures.

**The proof survives slice 2b**, which was the real question. Both tests are behavioural, not
structural:
- `groups.controller.spec.ts:271` names `assistant-2` on group-2, then asserts
  `staff.listForCourse('course-2', UNASSIGNED_TA)` still rejects with `NotFoundException`.
- `staff.e2e-spec.ts:898` creates a group on course-1 naming `assistant-2`, then asserts that
  `assistant-2` still gets **404** (not 403) on `GET /staff/courses/course-1/groups`.

If a 2b query started reading `groups.assistant_id` for an access decision, both tests would begin
passing the assistant through and both would fail. That is the right shape of guard.

**4 · The six deviations.**

| # | Recorded honestly? | Within authority? | Changes business behaviour? |
|---|---|---|---|
| `D-1` `GroupsService.create` validates its course, 404 | Yes, and flagged again under "least sure of" | **Yes.** `NOT NULL` forces `create` to take a course; validating it is not a new decision but the same one `update` makes | **Yes, and correctly.** `POST /admin/groups` gains a 404. It matches `update`'s behaviour, matches `assertAssigned`'s anti-enumeration contract, and the alternative — accepting a `courseId` that names nothing and letting the FK 500 — is worse. The spec documents it (`API_SPEC.yaml`, `POST /admin/groups` 404). **I agree with the executor's call.** |
| `D-2` `GroupPatch` schema + three documented operations | Yes | Yes — `API_SPEC.yaml` is a required output of the unit (DoD 10) | No. It fixes a contract that could not express its own operation (`GroupWrite.required: [name, courseId]` on a PATCH). The spec ≠ implementation gaps that remain are **F-4** and **F-5**. |
| `D-3` progress test naming | Yes, with the weakness named | Yes | No — but see **F-6** |
| `D-4` three e2e assertions reshaped | Yes | Yes | No, and the replacements are **stronger**: the old probe (`learningMode: 'hybrid'`) was silently stripped by `whitelist: true` rather than rejected, so it had stopped testing anything. The new ones (`name: ''`, missing `courseId`, malformed `courseId`) are genuinely refused. No test was weakened to go green. |
| `D-5` admin route parity 24 → 22 | Yes | Yes | No. The two retired routes take their generated rows with them; `role-guards.spec.ts`'s enumerating shape is intact (29 controllers, 25 entries, 6 admin controllers — unchanged, since no controller was added or removed). |
| `D-6` typecheck 301 → 326 | Yes, and refused to round it off | Yes | No — see question 5 |

**5 · The missed gate.**

**The argument holds, and the 25 are the honest consequence of doing the right thing.** I re-measured:
**326** `error TS`, **0** anchored to `^lib/`. The coordinator's reading of the loose `grep -c "lib/"`
= 2 is correct — both are the error *message* `Module '"@/lib/types"' has no exported member
'LearningMode'` on files under `app/`.

The 25 fall into four mechanical classes, all of them the direct shadow of a contract change that
`CLAUDE.md` §6 required to be made: a legacy screen reading `learningMode` off a type that no longer
has it, branching on `progress.type`, importing the deleted `LearningMode`, or calling
`addGroupCourse`/`renameGroup`/`GroupSummary.courses`. Every affected file is under `app/` or
`components/{app,site}` — I confirmed the per-file distribution independently (300 in `app/`, 26 in
`components/`, 0 in `lib/`).

**None of the 25 came from an avoidable choice.** The only two ways to have avoided them are the two
the executor names: patch code `SHELL-4` deletes (forbidden by `CLAUDE.md` §4.1 and by the
coordinator's brief), or leave `lib/` stale (forbidden harder by §6, and the specific defect §6
records having shipped before). The ≤301 target in `PHASE_PLAN.md` §7 was written on an assumption
that turned out to be false; that is a defect in the gate, not in the work.

**6 · The audit trap.**

All seven retained members present, commented, and still accepted:

| Retained | Where | Commented |
|---|---|---|
| `course_staff.assigned`, `course_staff.unassigned` | `audit-log-repository.interface.ts:22-23` | Yes, with the reason at `:16-21` |
| `group.renamed`, `group.course_added`, `group.course_removed` | `:57-60` | Yes, at `:53-56` |
| `course_staff_assignment`, `group_course` | `:103`, `:117` | Yes |

`ListAuditLogQueryDto`'s `AUDIT_ACTION_VALUES: Record<AuditAction, true>` carries all of them plus
the new `group.updated` (`list-audit-log-query.dto.ts:38`). The guard spec is
`audit.service.spec.ts:198` — *"still accepts every retired action and target type as a filter"* —
which, for each of the five actions and two target types, asserts membership in the runtime list,
**records an entry, and reads it back through `service.find({action})`**. That is the right test: an
enumerated list is the correct shape here precisely because the retired set is fixed and known.

**7 · `GroupDataModule` keeping `@Global()`.**

**Keeping it is right for this slice, and the follow-up is correctly scoped.** The executor's claim
is accurate: `groups.module.ts:34` imports `CoursesModule`, and `group-data.module.ts` imports
nothing — the cycle is genuinely gone, because `CoursesService` no longer reads group data (verified:
`courses.service.ts` injects only the course repository and three services, none of them group-side).

The narrower justification (four feature modules consume `GROUP_REPOSITORY` or
`StudentGroupsService`) is weaker than the cycle was, and the module says so in the words a future
reader needs: *"It is no longer load-bearing … do not cite it as precedent for a fourth global
module"* (`group-data.module.ts:26-27`). De-globalising it inside a destructive migration's slice
would be an unrelated refactor (`CLAUDE.md` §12). It belongs on `IMPLEMENTATION_PLAN.md` as its own
task — see §Follow-ups.

**8 · Documentation honesty.**

Substantially good, and in two places notably better than required — the `009`/`010` risk row in
`DATABASE_PLAN.md` is closed with the correct caveat (*"because nothing reads those columns through a
repository yet"*) rather than an unqualified all-clear, and `CHANGELOG.md`'s six entries include the
409 labelled as an assumption with both alternatives stated.

`API_SPEC.yaml` does **not** match every changed response shape — **F-4**, **F-5**. `StudyMode` and
`mode`-required-on-`StudentWrite` remain, which is correct: ruling R-2 assigns those amendments to
`DOM-3` in 2b. Retired routes are handled correctly — removed from `paths` and noted, with a 404
asserted over HTTP. The count error the coordinator spotted is **F-8**.

No entry overstates what works. `DOM-6` is `[~]` rather than `[x]`, which is the honest status.

**9 · Security, for the areas touched (`CLAUDE.md` §8).**

| Item | Finding |
|---|---|
| SQL injection | **Clean.** `postgres-group.repository.ts:132-151` is `COALESCE`/`CASE`-per-column with a fixed nine-parameter list; every column is named in the SQL text at author time. No string-built `SET`, no identifier from input anywhere in the diff. The in-memory dynamic-key write (`in-memory-group.repository.ts:131-134`) never reaches SQL. |
| Object-level authorization | **Clean.** `assertAssigned` is untouched. `create` and `update` both route a named course through `requireCourse` → `StaffScopeService.assertAssigned` (`groups.service.ts:157,211,259`) before the course is read. |
| Anti-enumeration | **Clean.** The out-of-scope 404 message is unchanged and `staff-scope.service.spec.ts` — not edited at all — still asserts it identical to a genuine miss. |
| Audit | **Clean.** `group.updated` has its union entry, its exhaustive `Record` entry and a spec. Both writes are inside `db.runInTransaction` (`:156`, `:204`). `before` is read before the write (`:208`) and **is a copy**, not an alias: `in-memory-group.repository.ts:91` returns `{ ...found }` with the reason on the line. |
| Output filtering / data exposure | **Clean.** No new field reaches a student-facing response. `classmates.service.ts:102-114` builds its rows field-by-field from memberships and a name map — it never spreads a `Group`, so `assistantId`/`meets`/`room` cannot leak into the student classmate list, and it still carries no email. |
| Input validation | **Mostly clean.** Every new field has a `class-validator` decorator with a length cap and, for ids, `ID_PATTERN`. The exception is **F-2**. |
| Error leakage | Clean. The 409 names no id. |
| CSRF · CORS · XSS · upload · path traversal · SSRF · secrets · rate limiting · dependencies · env config | Not touched. No new upload path, external call, HTML sink, dependency, or driver-selection change. No new per-process security structure. |

**10 · Is `CLAUDE.md` §4.1's "~301 errors" a durable repository fact needing an update?**

**Yes — it should be updated, and I am not the one to edit it.**

§4.1 is not narrative; it is a working instruction with a number in it, and it exists so that a
future agent seeing a large error count knows it is expected rather than a break it caused. That
number is now wrong by 25, and the gap will keep widening as 2b changes more of the mirror. The
executor's reasoning for not touching it — "described there as approximate and expected-to-move" — is
the weaker reading: §4.1 also says *"after which the frontend builds again"*, which is a durable fact
about a count, and `CLAUDE.md` §12 requires this file to be updated when a repository fact changes.

Suggested wording for the coordinator: **"~326 errors"**, with one clause noting the figure rises as
each unit updates `frontend/lib/` ahead of the screens `SHELL-4` deletes, and that the invariant to
hold is **`npx tsc --noEmit | grep -cE "^lib/"` = 0**, not the total. That invariant is the one worth
gating on, and it is currently met.

---

## Definition of Done — `PHASE_PLAN.md` §7, applicable points

| # | Point | Verdict |
|---|---|---|
| 1 | Each change in its `ARCHITECTURE.md` §6 layer | **Holds.** No rule in a controller or repository. `AdminGroupsController` routes and delegates only; the 409, the scope check and the audit write are all in `GroupsService`. |
| 2 | Migrations run against real PostgreSQL from an empty schema | **Holds.** `012` and `013` — I reproduced the full run on a database I created empty. `013`'s both abort paths and its happy path are asserted directly against the database. (`014`/`015` are 2b.) |
| 3 | Both drivers for every changed table | **Holds** for `groups`, `courses`. Both are updated, both are exercised — memory by the unit suite, Postgres by 87 integration tests. But see **F-2**: the two drivers disagree on one input. |
| 4 | `class-validator` DTO on every new body, no undeclared field accepted | **Holds with the exception at F-2.** `whitelist: true` strips undeclared fields; every declared field is decorated and capped. |
| 5 | Authorization in the service, not only `@Roles` | **Holds.** `requireCourse` in the service on both writes; `assertMay` first in `removeMember`. |
| 6 | New audit action with all three artifacts; retired members retained with comments | **Holds.** `group.updated` ×3; seven retained members, commented, with a spec. |
| 7 | Every test in §4.7 named and passing | **Does not fully hold — F-1.** The unplaced-student case, the two abort cases, the union-collapse cases and the retired-audit case all ship. The memory-driver tie-break case does not. |
| 8 | 404/identical-message, 409-on-conflict, not-found covered | **Holds.** 409 at unit and e2e level, in both the populated and the empty-group direction; 404 for a missing group, a missing course and an out-of-scope course. |
| 9 | n/a — no screen ships; the mirror is updated instead | **Holds.** `lib/types.ts` + `lib/api.ts` changed in the same commits; `lib/` at 0 errors. |
| 10 | `API_SPEC.yaml` matches | **Partially — F-4, F-5.** `LearningMode` removed, `Group`/`GroupWrite` reconciled, `GroupPatch` added, retired paths deleted. The two write responses drift. |
| 11 | The commands | **Holds** except the ≤301 frontend total, which is the accepted **F-6/question-5** outcome. |
| 12 | n/a — no screen ships | n/a |
| 13 | Documentation updated | **Holds**, with **F-8**. |

---

## Verified claims

Every executor claim I re-derived, with the outcome.

| Claim | Outcome |
|---|---|
| 471 unit / 28 files, 217 e2e, 87 integration / 0 skipped | **Confirmed**, by my own runs on a freshly created database |
| All 13 migrations applied from an empty schema | **Confirmed** — the `MigrationRunner` log in my run lists `001`…`013` plus all four seeds |
| `grep -c "lib/"` = 2 is a flaw in the gate; `grep -cE "^lib/"` = 0 | **Confirmed.** Both loose matches are message text on files under `app/` |
| 326 frontend errors, all in `app/`/`components/` | **Confirmed** — 300 `app/`, 26 `components/`, 0 `lib/` |
| Zero services read `groups.assistant_id` | **Confirmed** by grep across `backend/src` |
| `staff-scope.service.spec.ts` not edited; `backend/src/staff/**` untouched | **Confirmed** by `git diff --stat` |
| `014`/`015` not authored, not even as empty files | **Confirmed** by directory listing |
| No test deleted or skipped to get a green run | **Confirmed.** No spec file was deleted; the only removed cases tested the deleted `LearningModeService` or the two retired routes, and the reshaped e2e probes (`D-4`) are strictly stronger than what they replaced |
| Audit `before` is a copy, not an alias | **Confirmed** at `in-memory-group.repository.ts:91` and `groups.service.ts:208` |
| The `CoursesModule ⇄ GroupsModule` cycle no longer exists | **Confirmed.** `group-data.module.ts` has no `imports`; `courses.service.ts` injects nothing group-side |
| Both `013` abort tests were written to fail without their guard | **Confirmed by analysis** of each guard's removal — see question 1 |
| The one lint warning is pre-existing | **Confirmed** — `git show HEAD~2` carries the same unused import |
| `013`'s side-schema technique reaches nothing outside its schema | **Confirmed for `013`**; **one exception found in `012`** — **F-9** |

**Could not verify:** that the pre-slice frontend baseline was exactly **301**. Measuring it requires
checking out `26b9ccb` with `node_modules` present, which I did not do rather than disturb the
working tree. The figure is the coordinator's and `CLAUDE.md` §4.1's; nothing in the diff contradicts
it, and the error *composition* I verified is consistent with a +25 delta.

---

## Remediation checklist

Ordered. None of these blocks slice 2b from starting; all of them should close before unit 2a is
marked `[x]`.

1. **Add a memory-driver tie-break test** (**F-1**). A new
   `backend/src/groups/student-groups.service.spec.ts`, or a case in `groups.controller.spec.ts`
   beside `:366`: place `student-1` in a second group studying course-1, then assert
   `StudentGroupsService.groupsFor('course-1','student-1')` returns the January placement **first**.
   It must fail if `in-memory-group.repository.ts:198-201`'s comparator is removed. Record it in
   `EXECUTION_NOTES.md` as the §4.7 case that was missing.
2. **Refuse `null` on the two `NOT NULL` fields** (**F-2**). In
   `backend/src/groups/dto/group.dto.ts`, replace `@IsOptional()` with
   `@ValidateIf((_, v) => v !== undefined)` on `UpdateGroupDto.name` (`:87`) and
   `UpdateGroupDto.courseId` (`:93`). Add `.send({ name: null }).expect(400)` to
   `staff.e2e-spec.ts:947`. Optionally harden `in-memory-group.repository.ts:131-134` to ignore
   `null` for `name`/`courseId`, so the two drivers cannot diverge even if the DTO is bypassed.
3. **Fix the two write-response schemas** (**F-4**). Either give `POST /admin/groups` and
   `PATCH /admin/groups/{groupId}` a response schema without `memberCount`, or make the service
   return a `GroupSummary` from both. Pick one and make the spec and the code agree.
4. **Rename `frontend/lib/types.ts`'s `GroupWrite` to `GroupPatch`** (**F-5**), matching
   `API_SPEC.yaml`, and update `lib/api.ts:updateGroup`'s signature. One line each.
5. **Correct the test-block comment** at `backend/src/courses/courses.controller.spec.ts:74-77`
   (**F-6**) to describe the two cases that actually ship — "a course with both halves" and "a course
   with sessions and no recordings" — and name the untested direction.
6. **Rewrite the stale rationale** at `backend/src/groups/staff-groups.controller.ts:30-37`
   (**F-3**). Do **not** change the behaviour in 2a. State the new fact (a group holds exactly one
   course, so a course to scope by now exists), drop the dead `addCourse` reference, and point at
   `AUTHORIZATION_MODEL.md:105,207` and `AUTH-2` as where the decision is taken. Add the open
   question below to `PHASE_ROADMAP.md`'s 2b block.
7. **Delete the two orphaned comments** at `backend/src/reports/reports.service.ts:57` and
   `backend/src/manage/manage.service.ts:94` (**F-7**).
8. **Correct `docs/PHASE_ROADMAP.md:188`** — `470 unit` → `471 unit` (**F-8**).
9. **Schema-scope `012`'s assertion** (**F-9**): add `AND table_schema = current_schema()` at
   `backend/src/database/migrations/012_retire_learning_mode.sql:50`. **`012` has been applied and is
   therefore immutable under `CLAUDE.md` §9** — so this is a decision for the coordinator, not a free
   edit. The alternatives are: leave it and record the limitation in `DATABASE_PLAN.md` §8, or fix it
   in a later migration file. My recommendation is to record it; the assertion is inert and the cost
   of touching an applied migration is higher than the risk.
10. **`CLAUDE.md` §4.1's error count** — coordinator's edit, per question 10.

---

## Open decisions — surfaced, not ruled on

**OD-1 · Now that a group holds exactly one course, should the staff group reads be scoped?**
`GET /staff/groups/:groupId` and `GET /staff/groups/:groupId/members` are unscoped today, on a
client instruction (*"TAs are allowed to access all groups"*) whose supporting technical argument
migration `013` just removed. `AUTHORIZATION_MODEL.md:105,207` describes the target as scoped.

> **The one question that closes it:** *does an assistant with `assigned_groups` scope get a 404 on
> `GET /staff/groups/:groupId` for a group whose course they do not hold — or does the "TAs see all
> groups" instruction still stand?* This is `AUTH-2`'s to implement either way; it needs the answer
> before 2b starts, not after.

**OD-2 · Is the 409 on re-pointing a populated group the behaviour the client wants?** The executor
implemented it, labelled it an assumption in `groups.service.ts:189-197`, and the coordinator
ratified it. Recorded here only so it is visible as an assumption rather than a requirement — it is
already closed and needs nothing from anyone.

---

## Follow-ups for `IMPLEMENTATION_PLAN.md`

| Task | Size | Why |
|---|---|---|
| **De-globalise `GroupDataModule`** | Small — four module files, no logic | Its justifying import cycle is gone (`group-data.module.ts:12-19`). Three `@Global()` modules with only two still earning it invites a fourth. Correctly deferred out of a destructive migration's slice. |
| **Generate `frontend/lib/types.ts` from `API_SPEC.yaml`, or add a CI drift check** | Medium | `CLAUDE.md` §6 already calls for it. **F-4** and **F-5** are two more instances of exactly the drift it predicts, found by hand in one review. |
| **Replace the `≤301` frontend gate with `^lib/` = 0** | Trivial | The total is the wrong invariant and will fail every unit that touches the mirror before `SHELL-4`. The anchored `lib/` count is the one that means something. |
| **A second in-memory fixture course with recordings and no sessions** | Small | Closes the untested half-empty direction (**D-3**, **F-6**). |

---
---

# Re-check — unit 2, slice 2a remediation

**VERDICT: APPROVED**

**Reviewer:** `redesign-reviewer` · **Date:** 2026-09-20 · **Range:** `4e11a69..248da24`

All seven closable findings are closed. `F2A-9` is correctly left `[!]` and untouched. Two cosmetic
nits are recorded below; neither is a condition. **Unit 2a may go `[x]`.**

## Scope re-reviewed

`4e11a69..248da24`, 25 files, +1109/−79. Remediation only — I did not re-review the original slice,
and slice 2b's work is not in this range.

**Suites I ran myself**, all reproducing the executor's report exactly:

| Command | Result |
|---|---|
| `npm test --workspace=backend` | **473 passed, 29 files** (+2 tests, +1 file — the new spec), exit 0 |
| `npm run test:e2e --workspace=backend` | **217 passed**, exit 0 |
| `TEST_DATABASE_URL=…/lms_rev_rem npm run test:integration` | **87 passed, 0 skipped**, exit 0, database created empty immediately before the run |
| `cd frontend && npx tsc --noEmit` | **326** total, **0** anchored `^lib/` — unchanged by the response-shape change |
| `npm run lint` | Clean but for the one pre-existing `EXTERNAL_WORK_BINDER` warning |

## Finding by finding

### F2A-1 — closed. The test can genuinely fail.

`backend/src/groups/student-groups.service.spec.ts` (new, +98). **The test is order-sensitive by
construction, not by luck**, which was the whole point:

- Insertion order into the memory array is `[group-1 (seed), march, february]` — `create` appends,
  and the March placement is written first.
- Expected order is `[group-1, february, march]` — the seed membership is stamped `2026-01-20`
  (`in-memory-group.repository.ts:58`), and the fake timer stamps the other two `2026-03-01` and
  `2026-02-01`.

The two orders differ in their last two elements. `findStudentGroups` is `filter` → `sort` → `map`;
delete the comparator at `in-memory-group.repository.ts:198-201` and `filter` alone yields
`[group-1, march, february]`, which fails the assertion. The fake timer is what makes this possible
at all — `addMember` stamps from the clock, so without it insertion order would always equal
chronological order and the test could not fail. The executor's red/green pair in
`EXECUTION_NOTES.md` agrees with this derivation.

The second case ("empty for an enrolled but unplaced student") duplicates coverage that already
existed at `groups.controller.spec.ts:381`; harmless, and it puts the rule next to its tie-break.

### F2A-2 — closed at the root, and the sweep is both complete and not over-wide.

`backend/src/common/validators/is-optional-not-null.ts` is one line of mechanism
(`ValidateIf((_o, v) => v !== undefined)`) with the defect and the rule in the docstring. Fixing the
decorator rather than the two fields I named is the right call — I named the two I could prove, and
the class of defect was repository-wide.

**The count is right.** 39 grep matches, of which one is the docstring in the validator's own file →
**38 applications** across 7 DTO files.

**Nothing was missed.** I enumerated every remaining `@IsOptional()` in a body DTO and checked each
field against its column:

| Remaining `@IsOptional()` | Column | Correct? |
|---|---|---|
| `AssessmentTargetDto.availableFrom/availableTo/dueAt` | `assessment_targets.*`, **nullable** (`006_groups.sql:164-166`) — per-group *overrides* where `null` means inherit | Yes |
| `Create/UpdateAssessmentDto.externalUrl`, `googleForm`, `lessonId` | nullable | Yes |
| `blog` caption, mimeType, sizeBytes, excerpt, media | nullable | Yes |
| `submit-assessment` fileUrl, answerText · `grade-submission` feedback, annotatedFileUrl | nullable | Yes |
| `update-profile` phone, avatarUrl | nullable, and already carried an explicit `ValidateIf(v !== null)` | Yes |
| `group.dto.ts` assistantId, meets, room (both classes) | nullable | Yes |
| every `*-query.dto.ts` limit/offset/filter | see below | Yes |

**Nothing was over-swept.** I resolved all 24 distinct converted field names to their columns in the
migrations, and **every one is `NOT NULL`** — `allowed_file_types`, `max_file_size_bytes`,
`work_type`, `duration_minutes`, `duration_seconds`, `lesson_date`, `publish_at`, `zoom_link`,
`video_url`, `chapter`, `category`, `tags`, `status`, `body`, `max_score`, `topics`, `title`,
`description`, `instructions`, `name`, `course_id`, `available_from`, `available_to`, `due_at`. No
field that was correctly nullable turned into a 400.

The `NOT NULL` fields on `UpdateAssessmentDto` were the nearest miss and were caught: `availableFrom`
/ `availableTo` / `dueAt` are `NOT NULL` on `assessments` (`001_student_platform.sql:209-211`) and
were converted, while the identically-named nullable overrides on `AssessmentTargetDto` were
correctly left alone. Getting that pair right in one pass is the evidence the sweep was checked
rather than pattern-matched.

**The query-DTO exclusion is sound.** A `@Query()`-bound DTO receives values Express parsed from the
query string: `?limit=` is `''`, `?limit` is `''`, an absent key is `undefined`. JSON `null` is not
reachable, so `@IsOptional()` and `@IsOptionalNotNull()` are indistinguishable there and converting
them would be noise. `@Transform(toNumber)` does not manufacture one either — `Number('')` is `0`.

**Tested in both directions**, which is what makes it a boundary rather than a happy path —
`staff.e2e-spec.ts:970-990`: `{name: null}` gives 400, `{courseId: null}` gives 400, and
`{room: null}` gives **200**, the nullable column still clearing. That last assertion is the
regression guard for the over-sweep risk.

### F2A-3 — closed, and it points at the decision rather than making a new argument.

`staff-groups.controller.ts:30-48` now states what is true today ("unscoped today — an assistant can
fetch any group and its members, name and email included"), names it "deliberate and temporary, not a
posture", says why the old premise is dead, cites **`D-10`** and its 404-with-identical-message
outcome, points at `AUTH-2` / slice 2b as where it lands, and closes with *"Slice 2a changed this
comment and nothing else about the behaviour."* It advances no reasoning of its own — a 2b executor
building from it is sent to `D-10` and `AUTHORIZATION_MODEL.md:105,207`.

`D-10` is present as the last entry in `docs/CHANGELOG.md:833-865`, attributed to the finding, closed
by the user, and it carries the refusal test it requires **plus the positive case**. That is
`CLAUDE.md` §10's both-directions rule written into the decision rather than left to the executor.

### F2A-4 / F2A-5 — closed; all three artifacts now agree.

| Artifact | POST body | PATCH body | Both responses |
|---|---|---|---|
| `docs/API_SPEC.yaml:251-284` | `GroupWrite`, `required: [name, courseId]` | `GroupPatch`, all optional | `Group`, `memberCount` required |
| Backend | `CreateGroupDto` | `UpdateGroupDto` | `GroupSummary` (`groups.service.ts:155,207`; `admin-groups.controller.ts:68,87`) |
| `frontend/lib/types.ts:702-728` | `GroupWrite` (required) | `GroupPatch` (optional) | `GroupSummary` (`lib/api.ts:820,832`) |

Asserted over the wire at `staff.e2e-spec.ts:880,888` — `memberCount` is `0` on both the create and
the edit. **Nothing else moved with the return-type change**: the diff to `groups.service.ts` is 13
lines, all of it the two return statements and their comments; the audit payloads, the 409, the scope
check and `GroupWrite`'s own shape are untouched. `frontend/lib/` stayed at 0 errors and the total
did not move from 326 — the legacy screens do not read these two call sites.

### F2A-6 / F2A-7 — closed.

`courses.controller.spec.ts:73-83` now describes the two cases that ship, names the third as **not**
covered, gives the fixture reason, and points at the follow-up. `reports.service.ts` and
`manage.service.ts` lost their orphaned comments.

### F2A-9 — correctly left open.

`git diff 4e11a69..248da24 -- backend/src/database/migrations/` is **empty**. `012` was not edited.
Leaving an applied migration alone and carrying the limitation as `[!]` is the right reading of
`CLAUDE.md` §9.

## Nits — not conditions

**N-1 · Four zero-byte untracked files in the repository root:** `1`, `before`, `value`, `[a.id`.
Shell-redirect debris from the remediation pass (an unquoted pattern containing a redirect
character). Harmless, but `git add -A` would commit them. Delete before committing.

**N-2 · `groups.service.ts:250` fetches rows to produce an integer.** `update` calls
`findMembers(groupId)` and takes `.length` where `countMembersByGroups` exists;
`EXECUTION_NOTES.md` describes it as "one count", which it is not. It matches what `get()` already
does at `:115-116` and it is at most thirty rows, so it is consistent with the surrounding code and
below `CLAUDE.md` §1's threshold. Worth one word in the notes rather than a change.

## Definition of Done — the points the remediation touched

| # | Point | Verdict |
|---|---|---|
| 3 | Both drivers hold the same contract | **Now holds.** The `null` divergence is refused at the boundary before either driver sees it. |
| 4 | DTO validation, no undeclared value accepted | **Now holds**, repository-wide rather than on the two fields the finding named. |
| 7 | Every test in `PHASE_PLAN.md` §4.7 named and passing | **Now holds.** The memory-driver tie-break ships, and it can fail. |
| 10 | `API_SPEC.yaml` matches the implementation | **Now holds** for the group surface, in both directions. |
| 13 | Documentation updated | **Holds.** `CHANGELOG.md` gains `D-10`; `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `EXECUTION_NOTES.md` and `project_log.md` record the pass. |

All other points were verified in the original review and are unaffected by this range.
