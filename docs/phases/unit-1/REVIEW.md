# Review — unit 1 (`AUTH-1` + `AUTH-3`)

**VERDICT: APPROVED WITH FOLLOW-UP**

Reviewer: `redesign-reviewer`, 2026-09-19. Read-only; this file is the only thing written.

**Why not `APPROVED`:** DoD point 2 does not hold — migration `011` has never run against real
PostgreSQL. That is the environment, not the work, and coordinator ruling 7 already settled it. Three
further findings are real and none blocks unit 2.

**Why not `REJECTED`:** no security or authorization finding stands. No regression in still-wanted
behaviour. No in-scope requirement unimplemented. Both repository drivers exist. Every permission
built in this unit has a refusal test. No test was deleted, skipped, weakened or `.skip`-ed.

**What the verdict becomes once the blocker closes:** `APPROVED`, provided `011` runs green from an
empty schema (behind `009`/`010`) and follow-ups F-1 and F-2 below land. Nothing in findings 4–7
would hold it back.

---

## Scope reviewed

**Revision range.** Working tree against `44cbd88`. Nothing is committed.
`git diff 44cbd88 -- backend frontend` — 39 files, +894/−176 — plus six untracked source files:
`backend/src/auth/{actor-role,staff-roles,capabilities}.ts`,
`backend/src/auth/{capabilities,role-guards}.spec.ts`,
`backend/src/database/migrations/011_full_admin_role.sql`.

I confirm the coordinator's own checks independently: no tracked file deleted, no stray file in the
repo root, and the modified set is exactly the 39 files above — nothing outside the unit's declared
surface.

**Suites that actually executed, run by me:**

| Suite | Result | Baseline | Verdict |
|---|---|---|---|
| `npm test --workspace=backend` | **28 files, 467 passed**, exit 0 | 26 / 383 | matches the executor's report exactly |
| `npm run test:e2e --workspace=backend` | **3 files, 216 passed**, exit 0 | 179 | matches; +37 against the plan's "M ≥ 30" |
| `npm run test:integration --workspace=backend` | **1 file skipped, 81 tests skipped** | — | **SKIPPED, not passing.** Reported honestly as such |
| `cd frontend && npx tsc --noEmit \| grep -c "error TS"` | **301** | 301 | exactly baseline; `grep -c "^lib/"` → **0** |
| `npm run lint --workspace=backend` | 1 warning: `dashboard.controller.spec.ts:17:27` `EXTERNAL_WORK_BINDER` unused | 1 | **pre-existing** — that file is absent from `git status`, so this unit never opened it |

**Files opened and re-derived**, not read from the notes: all six new source files; the full diff of
`groups.service.ts`, `staff-groups.controller.ts`, `staff-scope.service.ts`,
`notifications.controller.ts`, `user-repository.interface.ts`, both user-repository drivers,
`directory.service.ts`, `announcements.service.ts`, `staff.service.ts`, `blog.service.ts`,
`google-integration.service.ts`, `work-analytics-gate.service.ts`, `admin-manage.controller.ts`,
`admin-audit.controller.ts`, `uploads.controller.ts`, `002_staff_fixtures.sql`, `frontend/lib/*`, and
all five changed spec files; `roles.guard.ts:50-76`; `migration-runner.ts`; migrations `001`, `002`,
`010`; `docs/API_SPEC.yaml` at the five cited line ranges; `CLAUDE.md` §7; `IMPLEMENTATION_PLAN.md`;
`PHASE_ROADMAP.md`; `CHANGELOG.md`; `DATABASE_PLAN.md`.

---

## Did this move toward the NEW product?

**Yes, and the part that mattered most is the part the plan almost left out.**

`Role.Admin` is `[NEW]`. The client's requirement is not "a second account with the teacher's
permissions" — it is **attribution**: an audit entry that says `teacher` when the admin acted answers
nobody's question, and the audit log has no `UPDATE` and no `DELETE`, so an entry written wrong is
wrong permanently. The old product had one unscoped identity; the new one has two, and the log has to
tell them apart.

Both halves landed, and I re-derived each from source rather than from the notes.

**Reach.** `staff-scope.service.ts:56-66` — `isAdmin` now calls `isUnscopedStaffRole`, and it is the
*only* line in the file that changed. `assertAssigned`, `scopeFor`, `findAssignment`, `assign`,
`unassign` and the `'Course not found or not assigned to you'` string are untouched, as ruling 1
required. `course_staff_assignments`, `CourseStaffRepository` and both its drivers appear nowhere in
the diff.

**Attribution.** I enumerated every audit write in the backend:
`grep -rn "\.record(" backend/src --include="*.ts"` excluding `audit/` and specs returns **27 call
sites across ten services**, and **all 27** now read `actorRole: actorRoleOf(actor)`.
`grep -rn "Role.Teacher :\|Role.Assistant :\|=== Role.Teacher ?\|=== Role.Assistant ?"` over
non-spec source returns **nothing**. The six private `actorRole` helpers are deleted; the two
hardcoded `actorRole: Role.Teacher` at `staff/staff.service.ts:181,232` are gone. The executor's
"fourteen derivations" reconciles: six helpers + six inline ternaries + two hardcoded literals, and
its table's "Sites" column counts the 27 record sites those fourteen fed. Both figures are right.

`actor-role.ts:10-17` validates against an exhaustive `Record<Role, true>` and throws rather than
defaulting — so a seventh role is a **compile error here**, which is the only compile-time pressure
that exists anywhere for adding a role.

**The narrowing was applied, not quietly skipped.** `AUTH-3` removes a verb an assistant previously
held. `staff-groups.controller.ts:109` carries the method-level `@Roles(...STAFF_ADMIN)`, and
`RolesGuard` resolves `getAllAndOverride(ROLES_KEY, [handler, class])` (`roles.guard.ts:62-65`) so
handler metadata genuinely wins. The shipped e2e test asserting a TA could remove a student was
**converted, not deleted** — `staff.e2e-spec.ts:825` now reads "lets a TA place a student, and no
longer lets them remove one", 403 for the assistant and 204 for the teacher in the same test. That is
the redesign's narrowing correctly treated as the point rather than as a regression.

**Nothing was built that the spec did not ask for.** No `scope`, `groupIds`, `status` or `lastSeenAt`
on the directory row (ruling 2). No `@Injectable` on `capabilities.ts` and no fourth `@Global()`
module. No frontend screen touched. `AUTH-2`/`AUTH-4`/`AUTH-5` absent by ruling 1, and I do not treat
their absence as incomplete work.

### The silent failure mode — enumerated from source, independently

Adding a `Role` member produces zero compile errors, so I did not take the decorator audit on trust.
`grep -rn "@Roles(\|@Public()\|@AnyRole()" backend/src --include="*.ts"` excluding specs, cross-checked
against `@Controller` paths and per-file route-decorator counts:

| Surface | Sites | Routes | Roles | Finding |
|---|---|---|---|---|
| `/admin/*` (6 controllers) | 6 | 2+1+6+5+8+3 = **25** | `...STAFF_ADMIN` on every one | **No `/admin/*` controller admits `assistant`, `student`, `parent` or `visitor`** |
| `/staff/*` (7 controllers) | 7 | 2+6+2+5+12+7+1 = **35** | `...STAFF_ALL` on every one | **No `/staff/*` route became teacher-only** — except `staff-groups.controller.ts:109`, which is `AUTH-3`'s intended narrowing |
| `/notifications` | 1 | **3** | `Role.Student, ...STAFF_ALL` | adds `admin` only; was already `Student, Assistant, Teacher` |
| **Total widened** | **14** | **63** | | **the executor's count is exactly right** |
| Student-only | 11 | — | `[Role.Student]` | **not one widened** — `student-announcements`, `assessments`, `courses`, `dashboard`, `student-home`, `classmates`, `live-sessions`, `materials`, `recordings`, `reports`, `students` |

`find backend/src -name "*.controller.ts" | wc -l` → **29**, matching the spec's pinned count.
`grep -rn "STAFF_ADMIN\|STAFF_ALL"` over non-spec source shows **every** usage is one of the sites
above: no `STAFF_ALL` on an `/admin/*` controller, no `STAFF_ADMIN` misapplied to `/staff/*`. No
route lost its guard — `role-guards.spec.ts`'s "no handler relies on the fail-closed 403" test
iterates every handler on all 29 controllers with the guard's own resolution and asserts the
undecided list is empty, and it passes. No `@Public()` was added: the anonymous surface is pinned at
exactly ten handlers, which I read and agree with (health, 4 auth, the Google callback, 4 public
marketing routes).

---

## Findings

Ranked most severe first. Each labelled `confirmed` (re-derived in the code) or `plausible`.

### 1. `BLOCKER` · `confirmed` · Migration `011` has never run against real PostgreSQL

`backend/src/database/migrations/011_full_admin_role.sql`. DoD point 2 **NOT MET**. Environment, not
the work — Docker daemon down, no `psql`, nothing on 5432. Already recorded by the executor and ruled
on by the coordinator (ruling 7). **This is not a finding against the executor**, and it is the single
reason the verdict is not `APPROVED`.

The executor asked me to check the reasoning rather than the result, since there is no result. I did,
and it holds:

- PostgreSQL names a table constraint derived from an inline column `CHECK` as
  `<table>_<column>_check`. `001_student_platform.sql:26-27` is `role TEXT NOT NULL CHECK (role IN …)`
  — unambiguously inline, one CHECK on the column so no `_1` suffix, well under 63 characters →
  `users_role_check`. `002_staff_and_audit.sql:65-66` is the same shape → `audit_log_actor_role_check`.
  `NOT NULL` is an attribute flag in PG 15, not a named constraint, so it does not consume a name.
- **No intervening migration touches either constraint.** I grepped `003`–`010`: the only other
  `ALTER TABLE users` is `010_work_types.sql:224`, which adds `google_email` and changes no
  constraint. So `011`'s `DROP` targets exactly what `001`/`002` created.
- `MigrationRunner` runs each file in one transaction together with its ledger insert
  (`migration-runner.ts:46`), so a wrong name aborts loudly, rolls back whole, writes no ledger row
  and leaves nothing half-applied. That is the intended failure mode and it justifies the absent
  `IF EXISTS` — with it, the `DROP` would silently no-op, the `ADD` would create a *second*
  constraint, and the intersection of old-narrow and new-wide is still narrow, so the first `admin`
  insert would fail later naming a constraint nobody knew survived. **The absence of `IF EXISTS` is
  deliberate and correct.**
- **It cannot lose data.** Two CHECK widenings, strictly looser; no column added, dropped or
  rewritten. `ADD CONSTRAINT` validates existing rows, and every existing value is already in the
  narrower set. Neither column opens to free text — both stay pinned to six literals.
- **`audit_log`'s widening is in the same migration as `users`'**, which is required, not tidy.
  `AuditService.record` runs inside the acting transaction, so an admin who could be created but not
  logged would take a CHECK violation at the audit `INSERT`, roll the action back, and get an opaque
  500 on **every single write**. Splitting these across two migrations would ship exactly that window.

**Failure scenario if the reasoning is wrong:** `DB_AUTO_MIGRATE=1` on first boot against a real
database → `011` aborts on `ALTER TABLE users DROP CONSTRAINT users_role_check` → the boot fails
loudly, no ledger row, no partial state. Loud, recoverable, and the right failure.

**Residual exposure, correctly recorded and re-confirmed:** `009` and `010` have also never run, and
`MigrationRunner` stops at the first failing file — so a defect in either **masks `011` entirely**.
You learn nothing about `011` until `009`/`010` are green.

### 2. `MEDIUM` · `confirmed` · Frontend/backend contract drift on `GET /admin/assistants`

The backend response gained a field; the frontend mirror did not.

- `backend/src/manage/directory.service.ts:30-32` — new `StaffDirectoryEntry extends DirectoryEntry`
  with `role: Role`, returned at `:89-100` and declared on the route at
  `admin-manage.controller.ts:81`.
- `frontend/lib/api.ts:852` — still `request<DirectoryEntry[]>('/admin/assistants')`.
- `frontend/lib/types.ts:523` — `DirectoryEntry` has **no `role`**.

**Failure scenario.** `PEOPLE-4` builds the course-staff picker against `lib/api.ts`. `row.role` is a
TypeScript error (or `undefined` after a cast), so the picker cannot tell the Full admin from an
assistant and renders "assign to this course" on Mona Saleh. `StaffService.assign` refuses a
non-assistant (`backend/src/staff/staff.service.ts:153`) and returns 400. That is precisely the
outcome `role` was emitted to prevent — the executor's own note 4 says so.

**Root cause is the plan, not disobedience.** `PHASE_PLAN.md:72` states "Zero *shape* changes …
**Nothing is breaking for `frontend/lib/api.ts`** — no path, verb, DTO or response schema changes",
and `:426` repeats "`frontend/lib/api.ts` is untouched". That became false when coordinator ruling 2
(later, and higher authority) required "Emit `role` on the assistants list response" — which *is* a
response-schema change. The executor followed the plan's instruction while implementing the ruling's
requirement. This is the case where the plan itself failed to carry the new requirement, which is
mine to say.

Three lines close it: add `role: Role` to a `StaffDirectoryEntry` in `frontend/lib/types.ts`, export
it, and change `lib/api.ts:852` to `request<StaffDirectoryEntry[]>`.

### 3. `MEDIUM` · `confirmed` · `capabilities.spec.ts`'s `WITHHELD` list is not derived from the union, and its comment says it is

`backend/src/auth/capabilities.spec.ts:11-30`.

The **module's** preset is genuinely exhaustive: `ASSISTANT_CAPABILITIES: Record<Capability, boolean>`
at `capabilities.ts:44-49` means adding a `Capability` **without deciding whether an assistant holds
it is a compile error.** That property holds, and it is the one the brief asked me to confirm.

What does not hold is the spec side. `const WITHHELD: Capability[]` at `:11-16` is a hand-written
array. Its guard is `expect(WITHHELD).toHaveLength(4)` plus a uniqueness check — neither of which
reads the module's `Record` (`ASSISTANT_CAPABILITIES` is not exported, so the spec cannot). The
comment at `:23-27` nonetheless claims "it is asserted against the exhaustive `Record` the module
holds rather than trusted". It is not.

**Failure scenario.** `DOM-4` adds `'account.deactivate'` to the `Capability` union and to
`ASSISTANT_CAPABILITIES` (compiles — a value was decided). `WITHHELD` still holds four entries, so
`toHaveLength(4)` still passes, `describe.each(WITHHELD)` still generates four refusal suites, and the
fifth capability ships with **no refusal test at all**, green. This is the exact defect class
`CLAUDE.md` §10 names — "a spec that iterates an array can only prove that what is listed works,
never that nothing is missing" — which is the same mechanism that let six audit actions log correctly
and then be rejected by the log's own filter.

Fix: declare `const ALL_CAPABILITIES: Record<Capability, true> = { … }` in the spec and derive
`WITHHELD = Object.keys(ALL_CAPABILITIES) as Capability[]`. Then a fifth capability is a compile error
in the spec, and the comment becomes true.

### 4. `LOW-MEDIUM` · `confirmed` · `role-guards.spec.ts`'s `/admin/*` boundary reads class metadata only

`backend/src/auth/role-guards.spec.ts`. The file defines `resolve()` at `:95-100` specifically to
reproduce the guard's handler-over-class precedence — and then the two tests that guard the `/admin/*`
boundary do not use it:

- `:166-176` (`'%s carries exactly its expected roles'`) reads
  `Reflect.getMetadata(ROLES_KEY, entry!.cls)`.
- `:196-222` (`'no controller under admin/ admits an assistant, student, parent or visitor'`) reads
  `Reflect.getMetadata(ROLES_KEY, entry.cls)`.

**Failure scenario.** Someone adds `@Roles(...STAFF_ALL)` to a single handler on
`AdminManageController` — say to let a TA read `GET /admin/students` — exactly the way
`staff-groups.controller.ts:109` legitimately overrides in the other direction. `RolesGuard` honours
it (`getAllAndOverride`), an assistant reaches an `/admin/*` route, and **both tests stay green**
because class metadata is unchanged. The `only the DELETE handlers that should admit an assistant do`
test at `:279-314` *does* use `resolve()`, so it would catch this on a `DELETE` — but not on a `GET`,
`POST` or `PATCH`.

**Not a live hole:** `grep` over all non-spec source finds exactly one method-level `@Roles` in the
build (`staff-groups.controller.ts:109`, narrowing), so no handler currently over-widens. This is a
gap in the mechanism, closed by iterating `handlersOf(entry)` with `resolve()` inside the admin
boundary test.

### 5. `LOW` · `confirmed` · DoD point 10 was verified for `x-roles` only, and `GET /admin/assistants` does disagree on its response schema

`docs/API_SPEC.yaml:563` responds `array of Assistant`. `Assistant` (`:210-221`) declares
`required: [id, name, email, role, scope, status]`. The implementation returns
`{ id, name, email, createdAt, role }` — `scope` and `status` **absent**, `createdAt` **undeclared**.

`scope`/`status` are deliberately deferred by coordinator ruling 2 ("Do **not** add `scope`,
`groupIds`, `status` or `lastSeenAt`"), so the gap is settled rather than wrong, and I do not rule on
it. The finding is the reporting: `EXECUTION_NOTES.md:442` says "**No disagreement on any implemented
route**", which overstates a check that compared role sets and not response shapes. Recorded so
`PEOPLE-4`'s planner does not inherit a clean bill of health it was never given.

### 6. `LOW` · `confirmed` · `docs/IMPLEMENTATION_PLAN.md:235` still draws `AUTH-2 ──> AUTH-3`

The §"Dependency graph" block reads `├─> AUTH-2 ──> AUTH-3 ──> (all /staff/*)`. That contradicts
line 89 of the same file (`**Dep corrected: `AUTH-1`, not `AUTH-2`**`) and contradicts reality:
`AUTH-3` is `[x]` while `AUTH-2` is `[ ]`. `PHASE_ROADMAP.md` §5's graph **was** corrected — the
executor says so and I confirmed it at `PHASE_ROADMAP.md:344-350` — but this second graph was missed.

**Failure scenario.** Unit 2's planner reads the graph, believes `AUTH-3` is still pending behind
`AUTH-2`, and budgets a phase slice for work that shipped in unit 1.

### 7. `TRIVIAL` · `confirmed` · An orphaned docblock and a misnamed error message

`backend/src/auth/repositories/in-memory-user.repository.ts:11-14` — the `SEED_PASSWORD_HASH`
docblock ("bcrypt hash of \"password123\"…") now sits directly above `requireRoles` at `:15-29`,
documenting the wrong symbol; the constant it describes is at `:31`. The new function was inserted
between a comment and its subject.

Separately, `requireRoles` throws `'findByRole requires at least one role'` in both drivers
(`in-memory-user.repository.ts:26`, `postgres-user.repository.ts:41`), including on the
`findIdsByRole` path (`:138` and `:127` respectively). The message names the wrong method when the
audience resolver is the caller.

Neither affects behaviour. Recorded because they are in files a later unit will open.

---

## Findings I looked for and did not find

Stated explicitly, because a clean result is a result. Each was actively hunted, not assumed.

- **Authorization bypass / over-widening.** None. Enumerated from source; see the table above.
- **Object-level (IDOR/BOLA).** No id from a request reaches a query without its existing check.
  `/notifications`, the one route whose audience changed, keys every handler to `req.user.sub`
  (`notifications.controller.ts:51,60,68`) — no caller-supplied user id anywhere.
- **Anti-enumeration.** `staff-scope.service.spec.ts`'s identical-message assertion is byte-untouched
  and passes; the diff on that file removes six lines, all from two `it(` headers converted to
  `it.each` and the "no other role" list being **extended** (`'ADMIN'`, `'administrator'` added — a
  case-sensitivity guard, a strengthening). `staff.e2e-spec.ts`'s four-route 404 table and its
  TA-on-`/admin/*` 403 table appear nowhere in the diff. The new 403 on `removeMember` is a
  **capability** refusal on a row the caller is being shown, which `CLAUDE.md` §7's stated exception
  covers and `API_SPEC.yaml:726` specifies.
- **SQL injection.** The one new predicate is `role = ANY($1::text[])`
  (`postgres-user.repository.ts:89,130`) with the array passed as a bound parameter. No concatenation,
  no interpolation. Migration `011` is static DDL with literal values.
- **The `findByRole` safety property (ruling 2).** Preserved and strengthened in **both** drivers. The
  parameter stays required; empty **throws** rather than returning "all accounts" —
  `in-memory-user.repository.ts:24-28` and `postgres-user.repository.ts:37-42`, applied in
  `findByRole` *and* `findIdsByRole`. Asserted three times: `manage.controller.spec.ts:617` (memory),
  and `postgres-repositories.integration-spec.ts:770-773` (both methods, Postgres — **written, never
  executed**).
- **Transactions and audit atomicity.** All 27 `audit.record` calls remain inside their enclosing
  `runInTransaction`; none was relocated. `actorRoleOf` is evaluated inside the transaction, as the
  ternaries were. No nested transaction introduced.
- **A `before` snapshot aliasing its `after`.** No snapshot logic changed.
- **New `AuditAction`.** None added, so no union entry and no `Record<AuditAction, true>` entry were
  owed. The 27 members are unchanged.
- **Data exposure / field minimisation.** `StaffDirectoryEntry` adds `role` and nothing else;
  `passwordHash` asserted absent (`staff.e2e-spec.ts`, `expect(row.passwordHash).toBeUndefined()`).
- **Error leakage.** The capability refusal message is capability-independent and asserted identical
  across all four verbs (`capabilities.spec.ts:68-84`); the e2e 403 body is asserted to contain no
  SQL, no stack, no group id and no student id.
- **A fourth `@Global()` module, or a new per-process security structure.** Neither.
  `capabilities.ts` is a pure module with no provider.
- **HTTP semantics.** No mutating `GET`, no status code changed except the intended assistant
  403 on `DELETE /staff/groups/:groupId/members/:studentId`, which `API_SPEC.yaml:726` specifies.
- **A missing repository implementation.** None — no new table, no new interface.
- **A test deleted, skipped or weakened.** None.
  `grep -rn "\.skip\|\.todo\|xit(\|xdescribe" backend/src backend/test` returns nothing new. Three
  expected values changed, each for a settled decision and each strengthened, not loosened:
  `announcements.controller.spec.ts:209` (`3`→`4`, ruling 3), `staff.e2e-spec.ts:509` (`2`→`3`, same),
  and `manage.controller.spec.ts:594` where `email.includes('assistant')` — which
  `admin@example.com` fails — became an assertion on the **roles present** plus four explicit
  include/exclude id checks. That last one is a materially stronger test than the one it replaced.
- **A permission with no refusal test.** All four capabilities have one
  (`capabilities.spec.ts:33-65`, per-verb, covering assistant, student, parent, visitor, `''`,
  `'root'` and `'ADMIN'`). The one routed verb has a **service-layer** refusal test as well
  (`groups.controller.spec.ts:421-441`) and an HTTP one (`staff.e2e-spec.ts`).
- **CLAUDE.md rules silently changed.** No. Verified below.
- **Design system.** Not applicable — this unit touches no screen, no component and no token. The
  only frontend change is three lines in `frontend/lib/`, which render nothing. The executor stated
  this explicitly rather than leaving it to inference, which is the right call.

---

## Definition of Done

Against the thirteen points in `docs/IMPLEMENTATION_PLAN.md` §"Definition of done".

| # | Point | Verdict |
|---|---|---|
| 1 | Implementation complete, in the layer `ARCHITECTURE.md` §6 names | **Holds.** Role sets in `auth/`, capability in a pure module, enforcement in the service, decorators on controllers. No business logic in a controller or repository. |
| 2 | Migration written **and run against real Postgres from an empty schema** | **DOES NOT HOLD.** `011` written, never executed. Environment (ruling 7). The single blocker. |
| 3 | Both repository drivers implemented | **Holds.** No new table. Both existing user-repository drivers updated symmetrically, including the empty-list refusal. |
| 4 | DTO validation at the boundary | **Not applicable.** No new DTO, no new body field, no new query parameter. |
| 5 | Authorization enforced server-side, **in the service** — not only by `@Roles` | **Holds.** `GroupsService.removeMember` calls `assertMay(actor, 'group.member.remove')` as its **first statement** (`groups.service.ts:333`), before `runInTransaction`, before `requireGroup`. Proved by a unit test that spies on `findById` — the actual first read — and asserts it is never called. |
| 6 | Audit inside the same transaction, action in the union **and** the DTO's exhaustive `Record` | **Holds** (union/`Record` not applicable — no new action). All 27 record sites remain inside their transaction. |
| 7 | Unit for the rule, integration for the SQL, **and a refusal test for every permission** | **Holds for unit and refusal.** **Integration written but never executed** — three new tests (`admin` round trip, multi-role `findByRole`, empty-list refusal in both methods) sit inside the 81 skipped. Rolls up into point 2. |
| 8 | Error cases: not-found, out-of-scope (404, identical body), conflict, unconfigured driver | **Holds.** The 24-route parity table deliberately exercises 404 and the unconfigured-Google 503; the anti-enumeration specs are untouched and pass; the assistant-403-vs-teacher-404 pair on the same call is asserted (`staff.e2e-spec.ts`, "even for a member who is not there"). |
| 9 | Frontend integrated against the real API, no mock data | **Not applicable.** No screen. |
| 10 | `API_SPEC.yaml` matches what was built | **Holds for the authorization boundary** — I spot-verified `:563`, `:713-727`, `:210-221`, `:460`, `:1124`. Not editing the spec is correct: it was written against the post-redesign target, so the unit's job was to make code match contract. **Partially verified only** — see finding 5. |
| 11 | `tsc` + `eslint` clean in `frontend/`; `npm test` + `test:e2e` green in `backend/` | **Holds as narrowed by `CLAUDE.md` §4.1.** Backend 467 + 216 green, run by me. `frontend/npx eslint .` clean. `tsc` is **301 errors, exactly baseline, zero in `lib/`** — the literal reading does not hold and cannot until `SHELL-4`; `PHASE_ROADMAP.md:180-182` forbids patching them earlier. Correctly not treated as this unit's failure. |
| 12 | Design adherence — the eight questions in §Verification | **Not applicable**, and the executor said so explicitly rather than silently. Correct. |
| 13 | This file and `CHANGELOG.md` updated | **Holds**, with one stale artefact — finding 6. |

**Applicable points that do not hold: 2 (and 7's integration half, which reduces to 2).** Everything
else holds or is genuinely not applicable.

---

## Verified claims

Executor claims re-derived at their cited `file:line`, and the ones I could not.

| Claim | Result |
|---|---|
| 14 decorator sites / 63 routes | **Confirmed independently.** 25 + 35 + 3 = 63. My own enumeration, not theirs. |
| 25 pre-existing `@Roles` sites re-enumerated; 26 now | **Confirmed.** 26 sites today, the 26th being `staff-groups.controller.ts:109`. |
| Fourteen `actorRole` derivations replaced (plan said twelve) | **Confirmed.** 6 helpers + 6 ternaries + 2 hardcoded. Zero survivors; 27 record sites all on `actorRoleOf`. |
| `StaffScopeService` internals byte-untouched beyond one line | **Confirmed.** Only `isAdmin` changed. |
| `StaffScopeService` has nine callers, not eight | **Confirmed.** `grep ": StaffScopeService"` over non-spec source returns exactly nine injecting services. The doc correction is right. |
| `= ANY($1::text[])`, parameterised, no concatenation | **Confirmed** at `postgres-user.repository.ts:89,130`. |
| Both drivers throw on an empty role array | **Confirmed** in both, for both methods. |
| `011`'s constraint names, and `IF EXISTS` deliberately absent | **Reasoning confirmed; result does not exist.** See finding 1 — I additionally checked that no migration between `002` and `011` touches either constraint, which the notes did not claim. |
| Baselines 383 / 179 / 301 | **Accepted on report** — I cannot re-run a pre-change baseline without stashing, and I am read-only. The *deltas* are consistent with the file-level diff I read. |
| Current 467 / 216 / 301 | **Confirmed by running all three myself.** Exact match. |
| Integration reported SKIPPED, 81 tests | **Confirmed by running it.** 1 file skipped, 81 tests skipped, exit 0. Correctly never presented as a pass. |
| The one lint warning is pre-existing | **Confirmed by a different method than the executor's stash:** `dashboard.controller.spec.ts` is absent from `git status`, so this unit never opened it. |
| The guard test was proved to fail in both directions | **Confirmed by reading the assertions, not the narrative.** Experiment A would fail `'AdminAuditController carries exactly its expected roles'` (`:166`, exact-match sorted equality) *and* `'no controller under admin/ admits an assistant…'` (`:196`) — two failures, as reported. Experiment B would fail the first alone — one failure, as reported. Both tests are real mechanisms. |
| The R-3 attribution test was proved to fail | **Confirmed.** `staff.e2e-spec.ts` asserts `toMatchObject({ actorId: 'admin-1', actorRole: 'admin', targetId: 'sub-2' })`; reverting `grading.service.ts` to `=== Teacher ? Teacher : Assistant` makes `actorRole` `'assistant'` for `admin-1`, so the assertion must fail. The reported diff output is consistent. A second family is covered (`groups.service.ts`, which failed in the *opposite* direction) and the teacher's own attribution is asserted not to have flattened the other way. |
| It caught one of its own tests being unable to fail | **Confirmed in the current code.** `groups.controller.spec.ts:428` spies on `findById` and asserts `expect(findById).not.toHaveBeenCalled()`. `findById` is reached via `requireGroup` (`groups.service.ts:72`), the genuine first read — so the test does pin ordering, where a `findMembers` spy would not have. The strengthening is real, not narrated. |
| The three must-not-edit tests pass unchanged | **Confirmed by reading the diffs.** Neither the TA-on-`/admin/*` 403 table nor the four-route 404 table nor the anti-enumeration identical-message assertion appears in the diff. |
| No `@Public()` added; guard order unchanged; `roles.guard.ts` untouched | **Confirmed.** `roles.guard.ts` and `jwt.strategy.ts` are absent from `git status`. The `@Public()` surface is now pinned at ten handlers by a test. |
| No `AuditAction` added | **Confirmed.** `audit/` is absent from the diff except `admin-audit.controller.ts`'s decorator. |
| The three recorded `API_SPEC.yaml` findings | **All three confirmed.** `/notifications` returns **zero** matches in the spec. `:460` is `[teacher, admin, assistant]`, `:1124` is `[assistant, teacher, admin]`, both on unimplemented routes. `/me/profile` is specified for staff while the code implements `students/me/profile` under `@Roles(Role.Student)`. |
| "No disagreement on any implemented route" | **Overstated.** True for `x-roles`; not checked for response schemas, and one disagrees. Finding 5. |
| `CLAUDE.md`: four factual corrections, no rule changed | **Substantially confirmed, with one honest caveat** — see below. |

### On the `CLAUDE.md` edit specifically

I could not diff the executor's contribution in isolation: `CLAUDE.md` was already `M` in the working
tree before the executor ran (its own preflight records this), so `git diff 44cbd88 -- CLAUDE.md`
returns a 1687→629-line rewrite belonging to phase 0, not to this unit. I verified by content
instead, against the pre-executor text.

The four corrections are present and each is factual and **correct**:
`:155` and `:213` `383 tests, 26 files` → `467 tests, 28 files` (I measured both); `:319` "Eight
services call it" → "**Nine** services call it, across 22 call sites" (I counted nine injecting
services); and the §7 roles bullet now lists `admin` in the union.

**One thing beyond a factual correction, and I judge it acceptable.** The §7 roles bullet gained four
sentences of substance: `STAFF_ALL`, the no-compile-error fact, `actorRoleOf`, and — the one that is
arguably a *rule* rather than a fact — "**`STAFF_ADMIN` must never contain `Role.Assistant`.**" That
is a **tightening**, it restates a boundary §6 already draws (`/admin/*` is teacher and admin only),
and it loosens nothing. Read `:295-332` in full: no permission was widened, no boundary relaxed, no
exit from the global guards added, and the 404-not-403 rule, the scope-is-a-query-filter rule and the
hiding-is-courtesy rule are all verbatim. The executor flagged the edit explicitly in its notes
because it is `CLAUDE.md`, which is the right instinct. **Nothing was silently changed.**

### On the executor's two self-flagged judgement calls

Asked for a second opinion, so: I agree with both.

**The 24-route parity table proving parity through status-code equality.** Keep it as it is. The table
proves the *role gate* is passed identically, which is the only thing `AUTH-1` changes, and it pairs
`expect(asAdmin.status).toBe(asTeacher.status)` with `not.toBe(403)` and `not.toBe(401)` — so
"both got 403" cannot pass as parity. Driving real writes on all 24 would make the suite
order-dependent and its failures ambiguous between a role gate and a fixture. The successful-mutation
case is separately covered on three routes (grading, group creation, member removal), which is where
it belongs. **Do not change this.**

**`role-guards.spec.ts` using `import.meta.glob` with a locally-declared `ViteImportMeta`.** The right
trade. Discovery is what makes the count assertion meaningful, and a hand-written list can only prove
that the controllers someone thought of are decorated. Widening the whole workspace's ambient types
with `vite/client` for one spec would be the larger change. The local interface is four lines and
scoped to the file.

---

## Remediation checklist

Ordered. Required because the verdict is not `APPROVED`.

**Blocking — closes DoD point 2 and `SPEC-12`, and turns this verdict into `APPROVED`:**

1. Start Docker Desktop (the disk half of the blocker has eased — the executor re-measured `C:` at
   8.5 GB free, against the 0 bytes `PHASE_PLAN.md` §2 recorded; enough for `postgres:15`).
2. `docker compose up -d db`.
3. Run the integration suite with `TEST_DATABASE_URL` against an **empty** schema, so `001`–`011`
   apply in order. Expect `009`/`010` to surface something first — the named candidate is `010`'s
   `NUMERIC(10,2)` columns, which `pg` returns as **strings**, invisible on the memory driver.
4. Record the **real output**, including whatever the first run finds. Confirm specifically that
   `users_role_check` and `audit_log_actor_role_check` were the actual constraint names.
5. Confirm the three new integration tests execute and pass: `admin` surviving a round trip,
   multi-role `findByRole`, and `findByRole([])` / `findIdsByRole([])` rejecting.
6. Close `SPEC-12`; set `AUTH-1` `[x]` and unit 1 complete **only then**.

**Required before unit 1 is called complete, but not blocking unit 2:**

7. **Finding 2** — add `role` to the frontend mirror: a `StaffDirectoryEntry` in
   `frontend/lib/types.ts` and `request<StaffDirectoryEntry[]>` at `lib/api.ts:852`. Three lines.
8. **Finding 3** — derive `WITHHELD` in `capabilities.spec.ts` from an exhaustive
   `Record<Capability, true>` so a fifth capability is a compile error there, and make the comment at
   `:23-27` true.
9. **Finding 6** — correct `docs/IMPLEMENTATION_PLAN.md:235`: `AUTH-3` hangs off `AUTH-1`, not
   `AUTH-2`. Re-check the critical path line at `:247` while in there.

**Worth doing in the same pass, cheap:**

10. **Finding 4** — iterate `handlersOf(entry)` with the existing `resolve()` helper inside
    `role-guards.spec.ts`'s admin-boundary test, so a method-level over-widening on an `/admin/*`
    controller cannot pass on a `GET`.
11. **Finding 5** — amend `EXECUTION_NOTES.md:442` to say the check covered role sets, and record the
    `Assistant`-schema gap (`scope`, `status` absent; `createdAt` undeclared) as `PEOPLE-4`'s
    inheritance.
12. **Finding 7** — move the `SEED_PASSWORD_HASH` docblock back above its constant, and make
    `requireRoles`'s message method-agnostic.

---

## Open decisions

Surfaced, not ruled on. A decision left open is correct behaviour by the executor.

| Decision | Where | The one question that would close it |
|---|---|---|
| `D-1` — `AUTH-5` device/session list | `IMPLEMENTATION_PLAN.md:281`, `AUTH-5` `[!]` | Redis for shared session state, or drop the Security tab for launch? Untouched by this unit, correctly. |
| `D-d` — are assistant invitation accept/resend audited? | Left for `AUTH-4`'s planner per ruling 6 | Do `assistant.invitation_accepted` / `assistant.invitation_resent` become `AuditAction` members? |
| `PEOPLE-6` `[!]` — `Assistant.lastSeenAt` has no source | `IMPLEMENTATION_PLAN.md:139` | Is a last-seen timestamp wanted enough to justify a write on the authenticated hot path, or should the field leave the contract? Emitting `null` per ruling 4 is the right holding position. |
| `/admin/students/{studentId}` and `/admin/announcements/reach` admit `assistant` in the spec | `API_SPEC.yaml:460`, `:1124` | Is `/admin/*` genuinely teacher/admin-only (`CLAUDE.md` §6), making these two spec entries wrong — or is a scoped assistant read on `/admin/*` intended, making `CLAUDE.md` §6 the thing to amend? Both routes are unimplemented, so nothing is currently wrong; whoever implements them must resolve it. |
| `/notifications` absent from `API_SPEC.yaml` | three implemented routes, no path entry | Does the spec gain `/notifications`, or is the path meant to change? The most substantive of the executor's three recorded findings and the one I would escalate first. |
| `GET /admin/assistants` lists an account the picker cannot act on | `directory.service.ts:89`, `staff.service.ts:153` | Settled by ruling 2 — recorded here only so the consequence is seen rather than discovered. Finding 2 is what makes it actionable. |

---

## Follow-ups for `IMPLEMENTATION_PLAN.md`

1. **`SPEC-12`** stays `[!]`. Add remediation steps 1–6 verbatim as its closing procedure, including
   "confirm the two constraint names against the real database".
2. **`AUTH-1`** stays `[~]`. Add: "Reviewed 2026-09-19, `APPROVED WITH FOLLOW-UP`. Becomes `[x]` when
   `SPEC-12` closes **and** follow-ups 3 and 4 below land. See `docs/phases/unit-1/REVIEW.md`."
3. **New, under `PEOPLE-4` or as its own hygiene item:** the `/admin/assistants` frontend mirror is
   missing `role` (finding 2). Note that `PHASE_PLAN.md:72`'s "zero shape changes" was overtaken by
   coordinator ruling 2 — a lesson for future plans, not a rebuke.
4. **New, under `AUTH-3`:** derive `capabilities.spec.ts`'s `WITHHELD` from an exhaustive `Record`
   (finding 3). Add the note that the **module's** preset already gives the compile error; it is the
   spec's mirror that does not.
5. **`docs/IMPLEMENTATION_PLAN.md` §Dependency graph** — correct `AUTH-2 ──> AUTH-3` (finding 6).
6. **Under unit 2's entry**, carry forward: `role-guards.spec.ts`'s handler-level gap (finding 4), and
   that `AUTH-2` must keep `staff-scope.service.spec.ts`'s identical-message assertion and the
   `FULL_ADMIN` `it.each` rows when it rewrites the internals course-scoped → group-scoped.
7. **`PHASE_ROADMAP.md` unit 5** — add the `Assistant` response-schema gap (`scope`, `status`,
   `createdAt`) to what `PEOPLE-4`/`AUTH-4` inherit (finding 5), so it is costed rather than found.
