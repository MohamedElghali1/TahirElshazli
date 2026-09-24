# Implementation plan

The living backlog for the redesign. **This file is the source of truth for what is done.** Update
it as part of finishing a task, not afterwards.

Status: `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked

Companion docs: `PRODUCT_SPEC.md` (what) · `DOMAIN_MODEL.md` (entities) ·
`AUTHORIZATION_MODEL.md` (who) · `API_SPEC.yaml` (contract) · `DATABASE_PLAN.md` (schema) ·
`SECURITY.md` · `ARCHITECTURE.md` · `CHANGELOG.md` (decisions).

**`PHASE_ROADMAP.md` controls what may be worked on now**, and groups the phases below into fifteen
chat units with entry and exit criteria. This file answers *is this task done*; that one answers *may
this start, and is the phase closable*. The nine-condition phase completion protocol and the
three-agent pipeline live there.

---

## Definition of done

A task is `[x]` only when **all applicable** hold:

1. Implementation complete, in the layer `ARCHITECTURE.md` §6 names.
2. Migration written, and **run against real Postgres from an empty schema**.
3. Both repository drivers implemented (`InMemory*` **and** `Postgres*`).
4. DTO validation at the API boundary.
5. Authorization enforced server-side, in the service — not only by `@Roles`.
6. Audit entry written **inside** the same transaction, with its action added to the union **and**
   the DTO's exhaustive `Record`.
7. Tests: unit for the rule, integration for the SQL, **and a refusal test for every permission** —
   authorized works, unauthorized is rejected.
8. Error cases handled: not-found, out-of-scope (404, identical body), conflict, unconfigured driver.
9. Frontend integrated against the **real** API — no mock data, no important state kept only in the
   browser.
10. `API_SPEC.yaml` matches what was built.
11. `npx tsc --noEmit` and `npx eslint` clean in `frontend/`; `npm test` + `npm run test:e2e` green
    in `backend/`.
12. Design adherence checked — the eight questions in §Verification.
13. This file and `CHANGELOG.md` updated.

**Not done because it compiles. Not done because it looks right.**

---

## Phase 0 — Specification `[~]`

| ID | Task | Status |
|---|---|---|
| `SPEC-1` | `PRODUCT_SPEC.md` | `[x]` |
| `SPEC-2` | `DOMAIN_MODEL.md` | `[x]` |
| `SPEC-3` | `AUTHORIZATION_MODEL.md` | `[x]` |
| `SPEC-4` | `API_GAP_ANALYSIS.md` | `[x]` |
| `SPEC-5` | `API_SPEC.yaml` (validated: 40 paths, 54 ops, 150 refs resolve). **The `[x]` is overstated** — validation proved the document is well-formed and its `$ref`s resolve, not that it covers what is implemented. `/notifications` has three implemented routes and no path entry at all (`SPEC-16`). | `[x]`* |
| `SPEC-6` | `DATABASE_PLAN.md` | `[x]` |
| `SPEC-7` | `SECURITY.md` | `[x]` |
| `SPEC-8` | `ARCHITECTURE.md` | `[x]` |
| `SPEC-9` | `IMPLEMENTATION_PLAN.md` (this file) | `[x]` |
| `SPEC-10` | `CHANGELOG.md` | `[x]` |
| `SPEC-11` | Amend `CLAUDE.md` §0, §2.1, §5.11.1, §5.16, §6.1, §7.2; mark `frontend-design-system.md` superseded | `[x]` |
| `SPEC-12` | **Run migrations 009 + 010 against real Postgres.** **Done 2026-09-20.** All eleven migrations applied in order from an empty schema (`lms_migtest`, created beside the dev database rather than wiping it), all four seeds, **81/81 integration tests passed**. First ever run of 009, 010 **and** 011. | `[x]` |
| `SPEC-13` | **Rewrite `CLAUDE.md`** as a durable engineering contract (1,687 → ~430 lines); correct the drifted facts (17 repositories not 15, `app/tokens/` not `app/tokens.css`, exact stack versions, vitest/oxlint/Tailwind v4/npm workspaces). **Superseded in one detail:** the rewrite also claimed 39 audit actions, which was wrong — `AuditAction` has **27** members and `CLAUDE.md` §5.4's original "twenty-seven" was correct. Corrected 2026-09-19 after `unit-1/PHASE_PLAN.md` §2 re-counted. | `[x]` |
| `SPEC-14` | `PHASE_ROADMAP.md` — 15 chat units, entry/exit criteria, the 9-condition completion protocol | `[x]` |
| `SPEC-15` | The sequential pipeline: `redesign-planner` → `redesign-executor` → `redesign-reviewer` + `/redesign-phase` | `[x]` |
| `SPEC-16` | **Reconcile `/notifications` into `API_SPEC.yaml`.** `NotificationsController` implements three routes — `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read` — and the spec has **no path entry for any of them**. Found during unit 1's DoD point 10 check, filed rather than authored: adding a path to the target contract is a contract decision, and whether the path stays `/notifications` or moves is not the executor's to settle. **`D-8` closed: fix the spec to match the redesign** — path entries shaped by `PRODUCT_SPEC.md` §5.2 (bell + `Menu`, plus teacher notification preferences), not transcribed from current code. | `[ ]` |
| `SPEC-17` | **Two `/admin/*` spec paths admit an assistant.** `API_SPEC.yaml:460` (`/admin/students/{studentId}`) reads `x-roles: [teacher, admin, assistant]` and `:1124` (`/admin/announcements/reach`) reads `[assistant, teacher, admin]`, against `CLAUDE.md` §6's rule that `/admin/*` is teacher and admin, unscoped. **Both routes are unimplemented, so no code is wrong today** — but either the two spec entries are wrong or the §6 rule is, and that is a question for the user, not a fix. **`D-7` closed: the spec was wrong.** Strip `assistant` from both; `CLAUDE.md` §6 stands. | `[ ]` |

**`SPEC-12` closed 2026-09-20.** Docker Desktop was started and the suite run against a **fresh,
empty** database created beside the dev one (`CREATE DATABASE lms_migtest`) rather than wiping
`tahirelshazli_postgres_data`, which held 27 tables:

```
docker compose up -d postgres
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest   npm run test:integration --workspace=backend
```

All eleven migrations applied in order, all four seeds, **81/81 passed**.

**The streak is broken, and honestly so.** 001-008 had each found something on their first real run;
009, 010 and 011 found nothing. The one defect the unit-1 review specifically predicted -
`010`'s `score NUMERIC(10,2)` coming back from `pg` as the **string** `"85.00"` - was probed directly
and is **already handled**: `postgres-work.repository.ts:37-38` declares the row type as
`string | null` and maps both columns through `numOrNull` (`:77-78`), as it does the `AVG` aggregates
(`:321-322`). The risk was real, the code was already right.

**Gate:** closed. Phase 1 was unblocked by this run.

---

## Phase 1 — Identity and authorization  *(backend; unblocks everything)*

| ID | Task | Deps | DB | API | Authz | Tests |
|---|---|---|---|---|---|---|
| `AUTH-1` `[x]` | Add `Role.Admin`. Migration for both role CHECKs. Define `STAFF_ADMIN`/`STAFF_ALL` once and use them at **14 decorator sites covering 63 routes** (not "~30"). One exhaustive `actorRoleOf` replacing **fourteen** `actorRole` derivations. | `SPEC-12` | 011 | 63 routes widen, 1 narrows | New role reaches every teacher route; `/admin/*` does **not** widen to `assistant` | `role-guards.spec.ts` enumerates all 25 controllers; a 24-route admin≡teacher parity table; attribution asserted in the audit log |
| | **Built 2026-09-19 · reviewed 2026-09-19 · closed 2026-09-20.** DoD point 2 is now **MET**: `011` applied from an empty schema and verified behaviourally — `admin` accepted, `'admln'` rejected by `users_role_check` (so review risk R-5, a constraint-name mismatch, did not materialise), and `audit_log_actor_role_check` widened to admit `admin`. Green: **467** unit, **216** e2e, **81** integration, frontend 301 with 0 in `lib/`. | | | | | |
| | Reviewer verdict `APPROVED WITH FOLLOW-UP` (`docs/phases/unit-1/REVIEW.md`), whose own words were *"once the blocker closes and F-1/F-2 land, the verdict is APPROVED. Nothing else holds it back."* Both follow-ups landed in the same-day remediation pass (frontend mirror `role`, capability spec derived from the module's `Record`, guard test's method-level gap) and the blocker closed with `SPEC-12`. **Conditions met.** | | | | | |
| | **DoD point 10 closed 2026-09-20.** The reviewer's lower finding 4 was a real spec/code disagreement on `GET /admin/assistants`: the schema required `scope` and `status` (no data source until `AUTH-2`/`AUTH-4`) and omitted `createdAt`, which the route actually returns. `API_SPEC.yaml`'s `Assistant` now requires `[id, name, email, role, createdAt]` with `scope`/`groupIds`/`status` declared-but-optional and annotated with the task that populates each. **Code, spec and `lib/types.ts` now carry the same five fields** — verified field-by-field. A contract that requires a field nothing emits is drift, not ambition. | | | | | |
| `AUTH-2` `[x]` **unit 2, slice 2b-ii, `APPROVED WITH FOLLOW-UP` 2026-09-21** | **Course scoping → group scoping.** `assistant_scopes` + `assistant_group_assignments` (migration **`015`**, run against real PostgreSQL from an empty schema and against the dev database); `StaffScopeService`'s internals rewritten and `mayReachGroup` added; `course_staff_assignments` dropped with `AdminStaffController`, `CourseStaffRepository` and the three `/admin/courses/:courseId/staff` routes. **`D-10` built with it**: every staff group route is scoped, reads and the placement write alike. **The seven contract cases in `staff-scope.service.spec.ts` pass unmodified** — only the `beforeEach` provider changed; the four `assign`/`unassign` cases were deleted with their methods under ruling R-8. `[x]` 2026-09-21 on the reviewer's `APPROVED WITH FOLLOW-UP` (`docs/phases/unit-2/REVIEW_2B_II.md`): no finding was attributable to the change itself. The two that gate the slice — the overstated `AUTHORIZATION_MODEL.md` row (F2) and the user's ruling on the course door (F1/F3/F4, now `D-23`) — are closed; the rest are `F2B2-*` below, none blocking. **Re-homed to unit 2, beside `DOM-1`/`DOM-2`,** by the 2026-09-19 ruling: its migration `014` joins `groups.course_id`, which does not exist until `DOM-1`'s `013`, and `MigrationRunner.sqlFilesIn` sorts lexicographically — so a `014` with no `013` applies straight after `012` and aborts every boot and every integration run. See `docs/CHANGELOG.md`. | `AUTH-1`, `DOM-1` | **015 `[x]` ran** | `[REPLACE]` ×3 | The chokepoint itself | **404-not-403 and the identical message survived**, asserted `===` against the genuine-miss path in the same test for the course *and* the group; both scope values tested, plus the never-configured third state failing closed |
| `AUTH-3` `[x]` | `AssistantCapabilities` preset gating the four withheld verbs (`backend/src/auth/capabilities.ts`). `DELETE /staff/groups/:id/members/:studentId` → teacher/admin with a **403**. **Dep corrected: `AUTH-1`, not `AUTH-2`** — the preset is a pure module and the one routed verb needs no scope table, which is what let it ship in unit 1 while `AUTH-2` deferred. | `AUTH-1` | — | 1 route | The four verbs | One refusal test per verb (`capabilities.spec.ts`), plus a service-layer refusal proving the repository is never read. **Strengthened 2026-09-19:** `WITHHELD` is now derived from an exhaustive `Record<Capability, true>` in the spec and asserted against the module's exported `ALL_CAPABILITIES`, so a fifth capability fails the spec (proved by adding one and watching it go red) rather than shipping with no refusal test. The module's preset already gave the compile error; it was the spec's mirror that did not. |
| `AUTH-4` `[x]` **unit 5, slice 5c** | Assistant invitations: `assistant_invitations` table (**017**, `[x]` ran 2026-09-22 against real PostgreSQL 16 from an empty schema, with 10 integration tests over `PostgresAssistantInvitationRepository`; see `docs/phases/unit-5/FOLLOW_UP_CLOSURE.md`), 4 admin routes (`POST/PATCH/DELETE /admin/assistants/{userId}`, `POST .../resend`) plus `POST /auth/invitations/{token}/accept` (`@Public()`). `AuthService.acceptInvitation`: one transaction — create the user `active`, set scope, assign every listed group, mark the invitation accepted, self-attributed `assistant.invitation_accepted` audit entry, issue a token. Five audited actions landed (`invited`/`invitation_accepted`/`invitation_resent`/`scope_changed`/`removed`), all costed in advance per the note this row used to carry. | `AUTH-2`, `MAIL-1` | 017 (own number) | 5 new | Teacher/admin only for the four admin routes; `@Public()` for accept, rate-limited like login | Token reuse, expiry, and unknown all give the identical `'Invitation is invalid or has expired'` message — asserted `===` across all three in `auth.controller.spec.ts` |
| ~~`AUTH-5`~~ `[REMOVED]` | ~~Device/session list.~~ **Dropped from scope 2026-09-20 (`D-1`): no Redis, no Security tab.** Not deferred — dropped. The per-process rate limiter and token denylist therefore stay as they are, and `SECURITY.md` §3.1 is a **permanent** known weakness until a second replica is configured. | — | — | — | — | — |
| `AUTH-6` `[ ]` (narrowed by `D-33`) | **When this narrows the per-course `GET /staff/courses/:id/assessments`, the `setTargets` 403 (`RETARGET_UNREACHABLE_AUDIENCE`) on a task set *only* for groups the caller cannot reach must become the `ASSESSMENT_NOT_FOUND` 404** — its "on the caller's own screen" basis is that list, and once the task leaves it the 403 is an existence oracle (unit-6 review, deviation 7). **Unit 7 (`D-44`) closed** `POST /staff/submissions/:id/grade` (course-grained and missing from this list until unit 7 found it) and the **items** of `GET /staff/courses/:id/submissions`; that queue's per-task averages stay course-wide by ruling, recorded as the residue. **Remainder after unit 7:** `GET /staff/courses/:id/roster`, the work-analytics pair, the per-course `GET /staff/courses/:id/assessments`, and `PATCH`/`DELETE` of a task shared with an unheld group. **Closed by unit 6 (`D-33`, slice 6h):** the targeting write (`create`/`setTargets` refuse an unheld group with the not-enrolled 404; re-targeting a task whose audience includes an unreachable group is 403) and `GET /staff/courses/:id/groups` (narrowed to held groups). The original text follows. **Narrow the course-named staff routes to held groups** (`D-23`). `AUTH-2` moved assistant scope to the group grain and `D-10` enforced it on group-named routes; the routes that name a **course** were left course-grained and still hand an assistant every cohort on that course. In scope: `GET /staff/courses/:id/roster`, `GET /staff/courses/:id/submissions`, `GET /staff/courses/:id/groups`, the work-analytics pair, and `assessment-authoring.service.ts:170` (an assistant may currently **target work at a group they do not hold** — an assistant-facing *write* naming a group that skips `mayReachGroup`). **The hard part is not the filter, it is one ruling per screen on whether a number may depend on who is looking** — `B-4`'s trap: `StaffScopeService` already exposes the held-group set, so the filter itself is small. Completion rates and averages must stay caller-independent or be labelled as scoped; `CLAUDE.md` §11.1 forbids merging progress and performance, and a denominator that silently narrows is the same class of error. Refusal test in both directions per route, 404 byte-identical to a genuine miss. | `AUTH-2` | — | Medium |

---

## Phase 2 — Domain reshaping  *(backend)*

| ID | Task | Deps | DB | Risk |
|---|---|---|---|---|
| `DOM-0` `[x]` | **Retire `learning_mode` (`D-9`).** Drop `groups.learning_mode`, `courses.default_learning_mode`, `enrollments.learning_mode`; delete `LearningModeService`; collapse the `{type:'recorded'} \| {type:'live'}` progress union into one shape carrying **both** completion and attendance. 46 files, and a **frontend-visible contract change** (`lib/types.ts` mirrors the union). Deletion, so it gets easier as it goes — but sequence it **before** `DOM-1` so the destructive migration lands on a simplified model, not beside a half-removed one. | `SPEC-12` | **012 `[x]` ran** | Medium — touched dashboard, courses, assessments, enrollments, groups. **Landed 2026-09-20 (unit 2 slice 2a).** The union collapse is one shape carrying completion *and* attendance; both sub-queries always run and the two halves are never averaged. `frontend/lib/{types,api}.ts` changed in the same commit; `lib/` stayed at 0 typecheck errors. |
| `DOM-1` `[x]` | **Collapse `group_courses` → `groups.course_id`.** (No `learning_mode` — `D-9` retired it; see `DOM-0`.) Migration **raises** if any group holds two courses **and** if any group holds zero — the second abort path was not in `DATABASE_PLAN.md` §4.1 and is reachable via `GroupRepository.create`. Both messages name the offending group. **Landed 2026-09-20 (unit 2 slice 2a), run against real PostgreSQL 15 from an empty schema.** | `SPEC-12` | **013 `[x]` ran** | **Highest.** Destructive, one-way. Touched GroupRepository ×2, StudentGroupsService, ClassmatesService, AssessmentAuthoringService, GroupsService, the admin routes, the frontend mirror |
| `DOM-2` `[x]` | `groups` gains `assistant_id`, `meets`, `room`. **`assistant_id` is a DISPLAY field and is never an authorization input** (binding ruling R-1) — `AUTH-2`'s `assistant_group_assignments` decides reach. `room` kept (ruling R-3). The rename-only PATCH is widened to the whole `GroupWrite`, retiring `POST\|DELETE /admin/groups/:id/courses`. | `DOM-1` | **013 `[x]` ran** | Low |
| `DOM-3` `[x]` | `student_profiles` gains `school_name`, `parent_email`, `staff_notes`. **No `mode` and no conditional CHECK** — `D-4` stands (ruling R-2, 2026-09-20). **Landed 2026-09-20 (unit 2 slice 2b-i), migration `014` run against real PostgreSQL 15 from an empty schema.** All five documents amended: this row, `DOMAIN_MODEL.md`, `DATABASE_PLAN.md` §2/§6, `PRODUCT_SPEC.md`, `API_SPEC.yaml`. Nothing writes the three columns yet — `PEOPLE-1` (unit 5) owns `PATCH /admin/students/:id` — so they are read-only from seeds, and `StudentProfileUpdate` deliberately does **not** carry them: a writable member with no writer on the one path a *student* drives is an open door. `StudentsService` returns a key-by-key `StudentProfileView`, asserted by an exact-key-set test. | — | 014 `[x]` ran | Low |
| `DOM-4` `[x]` | Registration approval: `users.status`; accept/reject routes; `POST /courses/:id/enroll` **retired** (404). **`CoursesService.enroll` kept** — `RegistrationApprovalService.accept` calls it. **Landed 2026-09-20 (unit 2 slice 2b-i).** The status gate is in **two** places (ruling R-6): `login` refuses to mint a token, and **`JwtStrategy.validate` refuses one already minted** — a login-only gate leaves every token issued before a rejection working until it expires. `register` returns `{status:'waiting'}` and **no credential**; the status is passed **explicitly** to `UserRepository.create` and a spec asserts the *argument*, because `users.status DEFAULT 'active'` would otherwise make the queue silently always empty. `accept` is one `runInTransaction` — activate, enrol, place, audit. **Consequence, recorded:** a signed-in student with zero enrollments is no longer reachable through the API, since acceptance always enrols; the e2e cases that needed one now use a course holding no fixtures. | `AUTH-1` | 014 `[x]` ran | Medium — changes the login path |
| `DOM-5` `[x]` | Course CRUD — `POST /admin/courses`, `PATCH /admin/courses/:courseId`, on a new `AdminCoursesController` in `CoursesModule` (the module that owns the aggregate). **Landed 2026-09-20 (unit 2 slice 2b-i).** `CourseRepository` gains `create`/`update` in **both** drivers; `InMemoryCourseRepository` moved its fixtures from a shared module constant to a per-instance copy, because they became writable. A course is created as a **draft** — publishing is a separate PATCH. Audited `course.created`/`course.updated`, the `before` a flat copy taken before the write. | `AUTH-1` | — | Low |
| `DOM-6` `[~]` | **Regenerate seed fixtures** for the new shape. **Not a tail task** — the integration suite calls `runner.seed()` in the same `beforeAll` as `runner.migrate()`, so a stale seed fails the migration gate at setup rather than in a test. Seeds `001`/`003` were regenerated **in lock-step with `012` and `013`**; `001`/`002` followed with `014` in slice 2b-i — every seeded account now writes `status` out rather than leaning on the column default, and `profile-1` carries all three staff fields so the "never student-facing" property is testable on a row where the leak is actually possible. `002` gained the two `assistant_scopes` rows and `003` the `assistant_group_assignments` grant with `015` in slice 2b-ii — **split across two files because the grant references `groups`, which `003` seeds**; that is FK ordering, not a change of intent. `DOM-6` is now complete pending review. | per migration | seeds | Medium |


### Slice 2a follow-ups — `APPROVED WITH FOLLOW-UP`, 2026-09-20

`docs/phases/unit-2/REVIEW.md`. **All closed 2026-09-20; the re-check returned `APPROVED` and unit 2a
is `[x]`.** `F2A-9` is recorded as unfixable-by-edit rather than open.
**None blocks slice 2b from starting.** No security or authorization finding; every number the
executor reported was independently reproduced by the reviewer on a dropped-and-recreated database.

| ID | Follow-up | Severity |
|---|---|---|
| `F2A-1` `[x]` | **The longest-standing-placement tie-break has no memory-driver test**, and the gap is not among the recorded deviations. `PHASE_PLAN.md` §4.7 named a `student-groups.service.spec` case; only the Postgres integration test at `backend/test/postgres-repositories.integration-spec.ts:993` exists. Deleting the comparator at `backend/src/groups/repositories/in-memory-group.repository.ts:198-201` leaves all 471 unit tests green while a student in two groups on one course sees one cohort's classmates and another's due dates. Add the unit test. | medium |
| `F2A-2` `[x]` | **`UpdateGroupDto` admits `null` for two `NOT NULL` columns and the drivers disagree.** `@IsOptional()` skips every validator when the value is `null`, not only `undefined` (`node_modules/class-validator/cjs/decorator/common/IsOptional.js:19-20` — verified). `PATCH /admin/groups/:id {"name": null}` validates: Postgres `COALESCE`s it to a no-op and returns 200, the memory driver writes `name = null`. Should be 400. `backend/src/groups/dto/group.dto.ts:87,93`. Teacher/admin-only, so correctness rather than security. **Check every other `@IsOptional()` DTO field over a `NOT NULL` column for the same shape.** | medium |
| `F2A-3` `[x]` | **Migration `013` falsified the rationale that keeps the staff group reads unscoped.** `backend/src/groups/staff-groups.controller.ts:30-37` argues *"a group is not a course — it spans them"* and points at `addCourse`, deleted in this slice. A group now holds exactly one course. Behaviour is unchanged and closing it is `AUTH-2`'s job — but a 2b executor will read a comment arguing against the target model from a false premise. **Fix the comment in 2a; do not change the behaviour.** | medium |
| `F2A-4` `[x]` | `API_SPEC.yaml`'s `Group` requires `memberCount` and is the documented 201/200 body of `POST`/`PATCH /admin/groups`, but `groups.service.ts:181,246` return a bare `Group` without it. | low-medium |
| `F2A-5` `[x]` | `GroupWrite` names two different shapes — the POST body at `API_SPEC.yaml:265`, the all-optional PATCH body at `frontend/lib/types.ts:706` (which the spec calls `GroupPatch`). | low-medium |
| `F2A-6` `[x]` | `backend/src/courses/courses.controller.spec.ts:74-77` claims a fixture combination is unreachable that deviation `D-3` admits is reachable. | low |
| `F2A-7` `[x]` | Two orphaned comments still say the learning mode lives on the group — `backend/src/reports/reports.service.ts:57`, `backend/src/manage/manage.service.ts:94`. | low |
| `F2A-8` `[x]` | `PHASE_ROADMAP.md:188` said 470 unit tests where the real output is 471. Corrected by the coordinator 2026-09-20. | info |
| `F2A-9` `[!]` | Migration `012`'s `information_schema` assertion is not schema-scoped, which matters only because this slice introduced side-schema migration tests. **`012` is applied and its ledger row is written — the file is immutable.** Recorded, not fixed; any correction belongs in a later migration, not an edit. | info |

**Closed 2026-09-20 by the executor's remediation pass** — `F2A-1`…`F2A-7`. Unit counts moved
471 → **473** (two new cases in a new `student-groups.service.spec.ts`); e2e stays **217** (the new
assertions sit inside existing tests); integration **87**, from an empty schema. Two follow-ups the
reviewer listed remain open and are **not** part of this pass: de-globalise `GroupDataModule`, and a
second in-memory fixture course with recordings and no sessions (the untested progress direction,
now named in the test-block comment rather than mis-described by it).

**One decision the reviewer raised, open, needed before `AUTH-2` is built** — see `PHASE_ROADMAP.md`
unit 2b and the Decisions table: now that a group holds exactly one course, does an assistant with
`assigned_groups` scope get a **404** on `GET /staff/groups/:groupId` for a group whose course they do
not hold, or does the client's *"TAs are allowed to access all groups"* instruction still stand?
`AUTH-2` implements it either way. **Today an assistant can read any group's roster with every member's name and email — ~~closed~~ *partly* closed by `AUTH-2` in slice 2b-ii, 2026-09-20.** The strike-through was too broad and is corrected here: `D-10` closed it on routes that name a **group**. A route naming a **course** is still course-grained, so an assistant holding one group of a course still reads every cohort's roster, submission queue and analytics on it (2b-ii review F1/F3/F4). **`D-23` closes the rest as `AUTH-6`.** It was equally true before that slice, so it was not a regression, but `AUTH-2`
is the moment it is either closed or deliberately kept.

### Slice 2b-ii follow-ups — `APPROVED WITH FOLLOW-UP`, 2026-09-21

`docs/phases/unit-2/REVIEW_2B_II.md`. The reviewer found **no** finding attributable to the change
itself — no lost object-level check, no weakened test, no swallowed failure, no unparameterised SQL,
no new per-process state, no response field gained, no spec drift. What it withheld a clean
`APPROVED` for was one document claiming more than the code does, and one decision that was the
user's to make. **Both are closed, so `AUTH-2` is `[x]`.** Nothing below blocks phase 3.

| ID | Follow-up | Severity |
|---|---|---|
| `F2B2-1` `[x]` | **The leak `D-10` closes at the group door is still open at the course door** (F1/F3/F4, and the read half of `B-4`). An assistant holding one group of a course still reads every cohort's roster with emails (`manage.service.ts:182`), the whole submission queue (`grading.service.ts:92`), analytics and a named student's work for tasks set to cohorts they do not hold, the full group list for the course, and may **target** new work at those cohorts (`assessment-authoring.service.ts:170`). Pre-existing, not a regression: `D-10`'s text scoped only the group-named routes. **Ruled by the user 2026-09-21 as `D-23` — narrow to held groups — and filed as task `AUTH-6`.** Closed here as a question; the code is `AUTH-6`'s. | high |
| `F2B2-2` `[x]` | **`AUTHORIZATION_MODEL.md:217` said the group-scope rule was `Built`**, which read as *course-grained `assertAssigned` satisfies group scope*. It does not, on a course with more than one cohort — and it is the line a future agent would cite to conclude the question was settled. `IMPLEMENTATION_PLAN.md:148` compounded it by striking `D-10` through as closed without naming the residue. **Fixed 2026-09-21:** the row is qualified, a second row names the open course door and points at `D-23`/`AUTH-6`, and the strike-through above is narrowed to *partly* closed. Documentation only; no code. | medium |
| `F2B2-3` `[x]` 2026-09-22 | **Closed:** accepting an invitation writes the row. The browser pass invited and accepted an assistant through the UI, and `psql` showed its `assistant_scopes` row (`FOLLOW_UP_CLOSURE.md`). Original finding: **An assistant created at runtime still gets no `assistant_scopes` row** (`D-20`), observed live by the reviewer on the post-migration database. It fails **closed** — such an account reaches nothing — and nothing in the product creates an assistant today. `PEOPLE-4` must write the row, and is the only route that can grant a group until it ships. Already recorded in `AUTHORIZATION_MODEL.md` §2, `DATABASE_PLAN.md` §4.2 and `EXECUTION_NOTES_2B_II.md`. | medium |
| `F2B2-4` `[ ]` → `SHELL-4` | `frontend/app/(app)/manage/courses/[id]/staff/page.tsx` is dead: it calls the retired `/admin/courses/:courseId/staff` routes and carries the +12 TS errors that took the frontend 328 → 340. Delete it with `SHELL-4`, not before (`CLAUDE.md` §4.1). | low |
| `F2B2-5` `[ ]` | **`npm run test:e2e` aborted once with exit `3221226505`** (`STATUS_STACK_BUFFER_OVERRUN`) *after* a run that was green through `npx vitest run --config ./vitest.config.e2e.ts` — a teardown crash, not a failing assertion, not reproducible and not attributable to this diff. It matters because CI would read that exit code as a failed suite, and because the mirror image — a teardown abort after a **red** run being read as green — is the one that hides things. When CI is authored, invoke vitest directly rather than through `npm run`. | low |

---

## Phase 3 — Mail  *(backend)*

| ID | Task | Deps |
|---|---|---|
| `MAIL-1` `[x]` | `MailSender` port + `MAIL_DRIVER=none\|log\|smtp`, resolved in `env.ts` like `STORAGE_DRIVER`; 503 when unconfigured. Fold `PasswordResetNotifier` onto it. | — |
| `MAIL-2` `[x]` | `mail_deliveries` table, written in the same transaction as the causing action. **Recipient and template only — never the rendered body** (`SECURITY.md` §5). | `MAIL-1` |
| `MAIL-3` `[x]` | Templates: invitation, sign-in link, report, announcement. | `MAIL-2` |

---

## Phase 4 — Shells  *(frontend)*

| ID | Task | Deps |
|---|---|---|
| `SHELL-1` `[x]` | Console shell — 244px `--surface-2` sidebar, course switcher, six nav sections, 52px crumb header, role-based hiding (courtesy only). | `AUTH-1` |
| `SHELL-2` `[x]` | Student shell — 248px `--surface-3` sidebar, **no right border**, white-pill active item, WhatsApp FAB, 96px bottom padding. | — |
| `SHELL-3` `[x]` | Flat student IA + course switcher; `/learn/[id]/*` collapses to top-level routes. | `SHELL-2` |
| `SHELL-4` `[x]` | Delete `components/app/*` (the dead 3/4 of it — `page-chrome.tsx` relocated to `components/shell/`, still live), legacy pages. **`components/site/*` was NOT deleted — every file in it was ported in place during `SHELL-3`'s slice and is current, not legacy** (`docs/phases/unit-4/REVIEW_4D.md`). **Frontend builds again from here**: `tsc` is down to 22 errors, all pre-existing `AUTH-2` domain drift unit 5 owns, 0 elsewhere. | `SHELL-1..3` |
| `SHELL-5` `[x]` | **Sign-up consumes the registration queue.** `POST /auth/register` returns **`201 {status:'waiting'}` with no `accessToken` and no `user`** (ruling R-6, unit 2 slice 2b-i, landed `20580a1`) — the screen must show a waiting-for-approval state instead of navigating to a dashboard, and must not assume it holds a session. A `waiting` or `rejected` account is refused **twice over, with two different byte-identical messages, and both are deliberate**: `login` answers `'Invalid credentials'` — identical to a wrong password and an unknown email, so registration cannot be enumerated — while `JwtStrategy` answers `'Account no longer exists'` (`jwt.strategy.ts:57`) — identical to a **deleted** account, which is the correct property there. Either way the UI **cannot distinguish waiting from rejected from wrong-password from deleted** by any API error, and must not try: **the waiting state comes from register's own 201 body, nowhere else.** Filed here rather than built in unit 2: the current screen lives in `frontend/app/(auth)/`, which `SHELL-4` deletes (`CLAUDE.md` §4.1). Coordinator ruling, 2026-09-20. | `SHELL-2`, `DOM-4` |

---

## Phases 5–14 — Vertical slices

Each slice: migration → repositories (both) → service → authz → API → tests → frontend → check.

### Phase 5 — People
`PEOPLE-1` `[x]` Student directory + waiting queue (`DOM-4`). Backend already existed
(`registration-approval.service.ts`, `directory.service.ts`) — frontend-only slice: `manage/students/page.tsx`
gained the status column, filter, and a `DecisionPanel` for accept/reject. Unit 5 slice 5a,
`a8e6d57`. ·
`PEOPLE-2` `[x]` Student detail + edit. `GET/PATCH /admin/students/:id`, `admin-students.service.ts`,
`manage/students/[id]/page.tsx`. Unit 5 slice 5b, `d6e749f`. ·
`PEOPLE-3` `[x]` Create student directly (emails a sign-in link; needs `MAIL-3`). Reuses the existing
password-reset-token mechanism rather than inventing new auth — see `REVIEW_5B.md`. `POST /admin/students`.
Unit 5 slice 5b, `d6e749f`. ·
`PEOPLE-4` `[x]` Assistants list + invite + scope editing (`AUTH-4`). The response-schema gap this
row used to describe is closed: `Assistant` now carries `scope`/`groupIds`/`status`/`lastSeenAt`, all
moved into `API_SPEC.yaml`'s `required` set in the same change. `manage/admin-assistants.service.ts`
merges real accounts and pending `assistant_invitations` rows into one shape.
`POST/PATCH/DELETE /admin/assistants/{userId}`, `POST .../resend`, `POST /auth/invitations/{token}/accept`.
`manage/assistants/page.tsx`, `(auth)/accept-invitation/page.tsx`. Unit 5 slice 5c,
see `docs/phases/unit-5/REVIEW_5C.md`. **`remove` is scoped to pending invitations only** — no
precedent in this codebase for hard-deleting or deactivating an already-active account; disclosed
rather than invented. ·
`PEOPLE-5` `[x]` Assistant activity screen over the existing audit log. No new route: `GET
/admin/audit-log` already accepted `actorId` server-side with no frontend caller — the existing
`manage/activity/page.tsx` (built ahead of schedule in unit 4 slice 4d as the general feed) now
reads an optional `?actorId=` query param and filters through it. Unit 5 slice 5c. ·
`PEOPLE-6` `[x]` **`Assistant.lastSeenAt` — derived from the audit log.** `MAX(created_at)` for that
actor, read via `AuditService.find({actorId, limit: 1})`. No `users.last_seen_at` column, no write on
the hot path. Unit 5 slice 5c.

One caveat carried into the UI: this is *last acted*, not *last seen*. An assistant who signs in and
only reads shows nothing (`—`, never `0`). `PEOPLE-4` emits it; `PEOPLE-5` renders it, as a link into
the filtered activity screen.

### Phase 6 — Groups
`GROUP-1` `[x]` Group CRUD with course/assistant/meets/room (`DOM-2`). Built unit 2
(`admin-groups.controller.ts`) — `GET/POST/PATCH /admin/groups`, `CreateGroupDto` carries
`courseId`/`assistantId`/`meets`/`room`. Frontend closed unit 5 slice 5d: `manage/groups/page.tsx`
was carrying retired `LearningMode`/multi-course fields and did not compile; rewritten onto the
current one-course-per-group model. ·
`GROUP-2` `[x]` Group detail + membership multi-select. Built unit 2 (`staff-groups.controller.ts`:
`GET groups/:id`, `GET/POST/DELETE groups/:id/members`). The add-not-remove asymmetry for assistants
is enforced in `GroupsService.removeMember` (`assertMay(actor, 'group.member.remove')`) and verified
both directions in `groups.controller.spec.ts` and `staff.e2e-spec.ts`. ·
`GROUP-3` `[x]` Bulk move ("Move N to group"). `POST /admin/groups/{groupId}/members/bulk` —
`GroupsService.bulkMove`: every id validated before any write (a half-valid batch is refused whole),
then `addMember` called once per id in one transaction, each write audited individually as
`group.student_assigned` — this endpoint saves the UI N requests, it does not change what happens.
Teacher/admin only, matching `API_SPEC.yaml`'s `x-roles`. Frontend: a checkbox-select-and-move
control on `manage/courses/[id]/groups/page.tsx`'s roster cards, admin-only. Unit 5 slice 5d. ·
`GROUP-4` `[x]` Group report (stats + per-student table). `GET /staff/groups/{groupId}/report` —
scored against what was actually **targeted** at the group (`findByCourseForGroups`), not every
assessment on the course; the group-level average is rolled up from every individual graded
submission's share, not from an average of the per-student averages. **No PDF route**: this stack
carries no server-side PDF library, and marking's rendered-overlay pattern (`D-2`) does not apply —
there is no existing PDF to overlay for a report generated from scratch. "PDF" is the frontend page
(`manage/groups/[id]/report/page.tsx`) plus the browser's own print-to-PDF; the console shell's nav
and header now carry `print:hidden` so the printed output is just the report. Unit 5 slice 5d, see
`docs/phases/unit-5/REVIEW_5D.md`.

### Unit 5 closure follow-ups — 2026-09-22

The two environment follow-ups from `REVIEW_5D.md` are closed (`docs/phases/unit-5/FOLLOW_UP_CLOSURE.md`,
reviewed in `REVIEW_CLOSURE.md`): migration `017` has run against real PostgreSQL, 13 integration
tests were added (125 total), and the 5a–5d screens were verified in a real browser. Found along the
way:

| ID | Follow-up | Severity |
|---|---|---|
| `F5-1` `[ ]` → needs a token-mapping decision | **No `text-[var(--fs-*)]` class sets a font size.** Tailwind v4 compiles `text-[var(--x)]` as `color:`. There are 113 uses across `(site)`, `(auth)`, `components/site` and `components/blog`, so every marketing and auth heading renders at inherited size. 6 referenced tokens (`--fs-h1/h2/h3`, `--fs-body`, `--fs-lead`, `--fs-display`; 87 uses) are not defined at all. The mechanical fix is `text-(length:--x)`. Which defined token each missing name maps to is a design decision, not to be guessed. | high (public site) |
| `F5-2` `[ ]` | The console's role chip renders "Teacher" in **amber**, which §11.1 reserves for a queue. A design question. | low |
| `F5-3` `[x]` (C-1, R-1, R-2) | `GET /admin/assistants` reported an **admin** as `assigned_groups` with no groups ("0 groups"). Fixed for active accounts (`fromUser`) and, after the re-check's R-1, for pending invitations and edits too (`invite`/`update` store `all_groups` for an admin, whatever the body's `scope`). The re-check then caught that fix keying an *account's* scope off the body's role, which let a `PATCH` claiming `role: admin` widen a real assistant (R-2). Now keyed off the account's own role. Specs cover all five cases. | low |
| `F5-4` `[ ]` (C-2) | The default `a:hover` underline still shows on sidebar items and the header link-button. The `@layer base` fix is what makes `hover:no-underline` work now. Unit-4 shell polish. | low |
| `F5-6` `[ ]` → needs a ruling | **Open question from the closure review:** should `PATCH /admin/assistants/{id}` answer 400 when the body's `role` differs from the account's, or should changing an account's role become a supported operation? Today the account's role is never changed and a mismatched body fails closed. Not invented here. | decision |
| `F5-5` `[x]` | Fixed in the closure: the unlayered `a` colour rule beat every utility; `md:translate-x-0` lost to `rtl:translate-x-full`, hiding both sidebars on desktop RTL; `formatPercent(null)` rendered `--` instead of an em-dash. | — |

### Phase 7 — Tasks
`TASK-1` `[x]` `visibility` `published | hidden`, distinct from the window; `scheduled` derived (`D-28`, slice 6f) ·
`TASK-2` `[x]` `task_drafts` (migration `018`, both drivers) + 4 routes + 3 audited actions (6a, 6b) ·
`TASK-3` `[x]` Author from a draft (copies content, increments `usedCount`; body authoritative, A-2) (6c) ·
`TASK-4` `[x]` Attachments on the task, per-attachment `audience`, audio uploads (`D-29`; 6c, 6i) ·
`TASK-5` `[x]` `allowResubmission` (6c), `submissionModes` stored (`D-31`, 6j; enforcement moved to unit 7 as `MARK-6`, with the multi-file model), marker assignment (`D-32`, 6g; follow-up `TASK-F1` below) ·
`TASK-6` `[x]` Global `GET /staff/tasks`, group-grain (6d) + derived `status` filter `open | marking | marked | closed` (`D-30`, completed by `D-34` `closed` and `D-35` latest due date; never null) ·
`TASK-7` `[x]` Task list, authoring (new/edit) and draft-library screens (6e; browser pass by the user, 2026-09-22: teacher, assistant-1, RTL, F-2, F-4 all confirmed)

`TASK-F1` `[ ]` follow-up, **accepted for now (user, 2026-09-22)** — an admin cannot name the teacher as marker from the form: `GET /admin/assistants` returns assistants and admins, and no staff-reachable route exposes the teacher's id. The teacher picks themselves ("you"), and an existing teacher marker is preserved and shown. Revisit if an admin needs to assign Dr. Tahir.

`TASK-F2` `[ ]` follow-up (unit-6 review) — **retire `frontend/app/(app)/manage/courses/[id]/assessments/page.tsx` after a consumer count** (the `D-25` discipline). The `/manage/tasks` screens supersede it; it still works today, but it sends no attachment `audience`, so extending it would meet a 400.

`TASK-F3` `[x]` **built in unit 7 (slice 7a), reviewed `APPROVED`** — 409 now, e2e moved. Follow-up (unit-6 re-check 1, user ruling) — **deleting a task that has submissions should return 409, not 400** (`CLAUDE.md` §6: a state conflict is 409). Today `DELETE /staff/assessments/:id` refuses with 400 for `assessment_submissions`, while `D-36`'s external-result refusal is 409. Code **not** changed in unit 6; the e2e `refuses to delete a task that has submissions` asserts 400 and moves with it. Unit 7 rebuilds the submissions surface and is a natural place.

`TASK-F4` `[ ]` **narrowed by unit 7**: `tallyResults`, `countResultsByAssessments`, `findResultsForStudent`, `findResults` and the new `findLatestScoresForStudents` now run against real Postgres (7a, 7n). **Remaining:** `PostgresGoogleCredentialRepository`, and the binding/sync/attach methods of `PostgresWorkRepository`. Original entry: follow-up, pre-existing, **filed here because no entry existed** (it was carried only in the unit-6 plan's and review's out-of-scope lists): integration coverage for `PostgresWorkRepository` and `PostgresGoogleCredentialRepository`. **`PostgresWorkRepository.tallyResults` goes first**, because `D-36`'s hide and delete guards now depend on it (unit-6 re-check 1). Their SQL was not changed by unit 6.

`[x]` = built, tested and reviewed **`APPROVED`** on 2026-09-22 (`docs/phases/unit-6/REVIEW.md`, three rounds; closed on the user's browser confirmation per re-check 2). Unit 6 also closed the
existence oracle on `PATCH`/`DELETE /staff/assessments/:id` and `POST …/targets` (plan finding 2).

### Phase 8 — Marking
Unit 7, 2026-09-23. `[x]` = built, tested and reviewed **`APPROVED`** (`docs/phases/unit-7/REVIEW_7.md`; closed on the user's browser confirmation). Rulings `D-40`…`D-46`; `D-38`/`D-39` withdrawn (`CHANGELOG.md`).

`MARK-1` `[x]` `submission_annotations` (migration `019`, both drivers) + 4 routes (list, create, update, delete), `submission.annotated` audit; author-only edit/erase, allowed after return (`D-42`); the first annotation claims an unclaimed task (`D-43`) ·
`MARK-2` `[x]` Save and return are two operations: `POST /staff/submissions/:id/return` (`returned_at`, `submission.returned` audit); one `isReturnedToStudent` predicate across the five student reads; `019` backfills `returned_at := corrected_at` ·
`MARK-3` `[x]` `GET /staff/assessments/:id/submissions` — every targeted student **including non-submitters**, group grain, per-group counts never summed; screen `/manage/tasks/[id]/submissions` ·
`MARK-4` `[x]` Marking view (page, toolbar, annotation list, mark, feedback, Save / Save and return) ·
`MARK-5` `[x]` Marked copy as a **rendered overlay** (`D-2`): pins and freehand strokes as data over the immutable original; images and PDFs (`pdfjs-dist` 6.3.289, `D-40`); the student sees it only once returned. **Only platform-stored files can be marked up (`D-41`) — and no student route can store one while `MARK-6` is open, so no real submission is annotatable yet in any environment.** A flattened download stays out of scope ·
`MARK-6` `[x]` **Built 2026-09-23 (slice 7i)** on the user's ruling `D-47`/`D-48` (the recommendations; `D-38`/`D-39` stay withdrawn): modes enforced at submit time (one PDF, 1–5 photos, or a link; a note never alone); the student upload route `POST /assessments/:id/files`; upload modes refused while storage is off; `allowedFileTypes` derived from the modes; the file set in migration `020` (both drivers), replaced and archived whole; marking over every file of a hand-in.

`AUTH-6` progress (unit 7, `D-44`): `POST /staff/submissions/:id/grade` and the **items** of `GET /staff/courses/:id/submissions` are now group-grain; that queue's per-task averages stay course-wide by ruling. The remainder is below in `AUTH-6`'s own entry.

Unit-7 follow-ups (found, recorded, **not** fixed here):
- `MARK-F1` `[ ]` **R2 storage driver** (`D-41`). Without it production stores no files: students cannot upload, so upload-mode tasks cannot be authored there (`D-48` (b)) and nothing is annotatable.
- `MARK-F5` `[ ]` **Bind a submitted file to the student who uploaded it** (assumption A-15). Today a submission accepts any platform-stored file of the right type; a student could name another platform file they can see. No data is exposed and the marker sees the file, but the platform cannot prove authorship. Needs an upload ledger (a table, two repositories) or a signed upload token. Client subscription; not assumed.
- `MARK-F2` `[ ]` **`WorkAnalyticsService.forStudent` shows a student's OLDEST form response on Postgres and the newest in memory.** `findResultsForStudent` orders `DESC` in SQL and by insertion in memory, and `forStudent` keeps the last row per task in a `Map`. The mark book does not share the bug (it picks the latest in the query, `findLatestScoresForStudents`). Pin the rule with an integration test, then fix.
- `MARK-F3` `[ ]` `GROUP-4` report's `assessmentCount` includes hidden tasks (`groups.service.ts` `report` calls `findByCourseForGroups` without `isVisibleToStudents`). The averages are unaffected (a hidden task has no submissions, `D-28`).
- `MARK-F4` `[ ]` **Helmet's `Cross-Origin-Resource-Policy: same-origin` is on `/uploads/*`**, and the web app is a different origin, so a plain `<img src={mediaSrc(...)}>` of an uploaded file is blocked by the browser (checked with `curl -I`, 2026-09-23). The marking screens avoid it by fetching through CORS; the existing blog/media screens that use `mediaSrc` in an `<img>` need a browser check.

### Phase 9 — Mark book
`BOOK-1` `[x]` `GET /staff/groups/:id/markbook`: uploads as platform cells (saved marks shown to staff, flagged), Google Form columns mirrored with sync time and unmatched count (`D-46`), link work named as omitted, "Average of marked work" (`D-45`, `GROUP-4`'s arithmetic, platform work only) · `BOOK-2` `[x]` Screen `/manage/marks` (sticky first column, em-dash for missing, CSV export) ·
`BOOK-3` `[x]` `GET /staff/groups/:id/markbook.csv` (UTF-8 BOM, RFC 4180, formula-injection neutralised, em-dash)

### Phase 10 — Sessions and attendance
`SESS-1` `[ ]` Sessions re-parent to group + mode/location/assistant/visible/state (`DOM-1`) ·
`SESS-2` `[ ]` **Attendance boolean → three-state enum** ·
`SESS-3` `[ ]` Attendance sheet read + bulk write ·
`SESS-4` `[ ]` Draft timetable + publish ·
`SESS-5` `[ ]` Console week grid ·
`SESS-6` `[ ]` Student timetable — **meeting link withheld server-side until T-30min** ·
`SESS-7` `[ ]` Student attendance screen

### Phase 11 — Weekly reports  *(the flagship; 9 routes, none exist)*
`RPT-1` `[ ]` `weekly_reports` table + repositories ·
`RPT-2` `[ ]` Generation service (pure composition over attendance/submissions/progress; **idempotent; never overwrites `sent`**) ·
`RPT-3` `[ ]` Generation trigger — **on-demand button only** (`D-3`, closed). No cron, no scheduler. Still idempotent; still must never overwrite a report already `sent`. ·
`RPT-4` `[ ]` List + detail routes ·
`RPT-5` `[ ]` Note save + review transition (requires a non-empty note) ·
`RPT-6` `[ ]` **Send to parent** — teacher/admin only, requires `reviewed` + `parentEmail`, irreversible, audited, `mail_deliveries` row ·
`RPT-7` `[ ]` PDF generation ·
`RPT-8` `[ ]` Console Reports list + ReportViewer ·
`RPT-9` `[ ]` Student Marks page (the report *is* the page)

### Phase 12 — Announcements
Both slices are merged: 10a (backend) `APPROVED`, 10b (frontend) built 2026-09-23 against the
live routes. Not yet driven in a browser, and not checked in `dir="rtl"` or dark.

`ANN-1` `[x]` `group:<id>` audience — backend done (migration `021` widens the `audience_type` CHECK; both repository drivers; parser and DTO pattern kept in step). Picker built in 10b ·
`ANN-2` `[x]` Media — backend done (`mediaKind`/`mediaUrl` pair, validated). Picker built in 10b, reusing `/staff/uploads` ·
`ANN-3` `[x]` Draft + publish — backend done. **Draft-ness is derived from `published_at IS NULL`**, the house idiom; there is deliberately no status column ·
`ANN-4` `[x]` Email fan-out, idempotent on `published_at` (`MAIL-3`) — `publish()` is the only writer of that column and `updateDraft()` never touches it, so editing a published announcement cannot re-send. Proven by test (publish twice → second is 409, mail sent once) ·
`ANN-5` `[x]` Live reach preview — `GET /staff/announcements/reach` exists and is group-scoped; an unheld group answers 404 with the byte-identical `GROUP_NOT_FOUND` string. Counter built in 10b ·
`ANN-6` `[x]` Compose screen with student-view preview — built in 10b; the UI offers nothing the server refuses (publish admin-only and drafts-only, delete only while unpublished, audience read-only once published)

Two authorization holes were found and closed here across two review rounds, both recorded in
`docs/CHANGELOG.md`: `B-ANN-1` (an assistant could publish through two undocumented `/staff/*`
routes) and `B-ANN-2` (round 1's own fix shared a DTO with the staff PATCH routes, letting an
assistant retarget their draft platform-wide for a teacher to publish unaware).

### Phase 13 — Google Forms surface  *(frontend only — backend complete)*
`WORK-1` `[x]` Task results screen (`Score`/`Meter` split, understated-figure banner) — `manage/tasks/[id]/results/page.tsx`, reviewer-`APPROVED` (`docs/phases/unit-11/REVIEW.md`) ·
`WORK-2` `[x]` Unmatched queue + match-student — same page, reviewer-`APPROVED` ·
`WORK-3` `[x]` `SyncStatus` on every mirrored surface built this unit — present on the results screen ·
`WORK-4` `[x]` Student Quizzes surface driven by `work_type: google_form` — **no quiz engine**. Built 2026-09-23 as unit 11 slice C against the checklist in `docs/phases/unit-11/REVIEW.md`, independently reviewed and `APPROVED` (`docs/phases/unit-11/REVIEW_SLICE_C.md`). Four states only: open (a primary link leaving the app), submitted and awaiting Google, marked, locked. Never driven in a real browser.

### Phase 14 — Settings and account
`SET-1` `[x]` `/me/profile` for staff — unit 12; positive-path e2e for a teacher **and** an assistant ·
`SET-2` `[x]` Notification preferences — migration `022`, both repository drivers; defaults are **opt-out / all true**, and the DB `DEFAULT true` and the service's no-row fallback agree by test. Tab visible to assistants (client ruling) ·
`SET-3` `[x]` Google panel over the 5 existing routes — **found already built server-side**, not rebuilt. Admin-only; the refusal is proven by `role-guards.spec.ts` (`AdminGoogleIntegrationController: STAFF_ADMIN`) ·
`SET-4` `[x]` Courses tab (`DOM-5`) — backend already existed. The edit form was broken for every caller who could reach it (it read the student-only `GET /courses/:id`); fixed by adding `GET /admin/courses/:courseId`, a user-approved scope change ·
`SET-5` `[x]` Groups tab — **no remaining gap**: full group CRUD shipped in unit 5. Verified, not rebuilt ·
`SET-6` `[x]` Student Settings + avatar upload — the upload path is student-reachable for the first time. Server-minted filename, MIME whitelist, size cap, no SVG; a disallowed type is 415 and an oversized file a clean 413

---

### Reconciliation follow-ups — units 10–12 ported onto the unit 7 line, 2026-09-23

`docs/phases/RECONCILE_UNITS_10_12.md`. None blocks unit 14.

- `RC-F1` `[ ]` `announcements.controller.spec.ts` does not typecheck (11 errors): fixtures pass `id` to repository `create` calls that ignore it. The scope refusals hold only because the seed already has an unheld `group-2`. Rewrite against the seed; add backend `tsc --noEmit` (specs included) to CI — the remote line shipped a backend `nest build` could not compile.
- `RC-F2` `[ ]` `SettingsService.getProfile` throws a bare `Error` on a missing user: a 500, not a 404.
- `RC-F3` `[ ]` No e2e for the five `/staff/groups/:groupId/announcements*` routes or `/staff/announcements/reach`.
- `RC-F4` `[x]` One unreproduced integration failure during the reconciliation. **Closed in unit 14:** the announcements "newest first" test tied at millisecond `created_at` and broke the tie on a random UUID; the fixture now makes the older row older (`REVIEW_14.md` R-5).

## Phases 15–17 — Remaining surfaces

`STU-1` `[ ]` Overview (action-first; **no mark on this page**) — **deferred**, it composes unit 8's
attendance figures and unit 8 is in flight ·
`STU-2` `[x]` `recordings.thumbnail_url` + library grid/list — migration `023`, both repository
drivers, DTO guarded like `videoUrl` so the field cannot become a `javascript:` URL. Thumbnails
default with a `surface-3` + icon fallback, because `thumbnail_url` is null for every recording that
exists today — the null path is the normal path. Watched share is a `Meter`, never a `Score` ·
`STU-3` `[ ]` Lesson detail + next-recording — **not taken this session**; recorded so it is not
mistaken for done ·
`STU-4` `[ ]` Homework + four attempt states — **deferred**, the four states need unit 7's
`returned_at` ·
`STU-5` `[x]` Materials — **no gap found.** Course-scoped, on the current kit, and reachable: it has
no rail slot by design (`PRODUCT_SPEC.md` §6 lists none) and is linked from the Overview's own
Materials panel. Verified, not rebuilt — the same posture unit 12 took with `SET-3`/`SET-5` ·
`STU-6` `[~]` Classmates — verified against the narrower reading (names only, no email, mark,
progress or attendance). **Blocked on a documentation conflict**, `F13-2` below ·
`STU-7` `[x]` Help/WhatsApp — the card was right; its call to action was a `Button` running
`window.open`, which cannot be middle-clicked or opened in a new tab and is the exact shape a popup
blocker suppresses. It would have left the one support route on the platform silently doing nothing.
Now an anchor

`SITE-1` `[x]` Homepage · `SITE-2` `[x]` Course pages · `SITE-3` `[x]` Blog ·
`SITE-4` `[x]` Contact · `SITE-5` `[x]` Auth screens (sign-in card shape ×4)

**What `SITE-1`…`SITE-5` turned out to be (`F13-1`).** Not a redesign — a repair. Every marketing
and auth surface was still written against the token vocabulary `ad238a7` deleted along with
`frontend/app/tokens.css`: **491 references to 38 custom properties defined nowhere in the
repository.** A `var()` naming an undefined property with no fallback is invalid at computed-value
time and is dropped, so every padding, gap, font size, radius and max-width they named was **not
applied at all**. It typechecked, it linted and it built.

This is the third recurrence of the class `CLAUDE.md` §11 records twice already (478 colour
instances; then 113 size instances as `F5-1`), and the root cause is identical each time: Tailwind's
arbitrary-value syntax accepts any string, so nothing in the toolchain distinguishes a live token
from a dead one. 46 of the references named a **console** size token on a `[data-surface="site"]`
page — the scale mixing §11 forbids, shipped and invisible.

**It was verified against the compiled stylesheet, not the source**, which is the only check that
catches this class. All five marketing steps are emitted and defined, and no dead custom property
reaches the compiled CSS. See `OPS-1` — this wants a build-time check, not a reviewer.

`GAUTH-1` `[~]` Google OAuth sign-in. **Built, unit 14 (2026-09-23), review `APPROVED WITH FOLLOW-UP`.**
Rulings `D-49` (no auto-link; link only from a signed-in account), `D-50` (no account created through
Google; passwords stay), `D-51` (`STAFF_GOOGLE_DOMAINS` pin, empty = staff off). Migration `023`, both
drivers, six routes, 32 e2e through the real `id_token` verifier. Found and fixed F-1 (an OAuth `state`
worked as a session). **Open, the two closing conditions** (`docs/phases/unit-14/REVIEW_14.md`):
- `GAUTH-C1` `[ ]` The user checks the staff Account and student Settings Google panels in a browser (LTR and `dir="rtl"`).
- `GAUTH-C2` `[ ]` Add `GOOGLE_SIGN_IN_REDIRECT_URI=` and `STAFF_GOOGLE_DOMAINS=` to `.env.example` (the session could not read `.env*`).
Not performed, and not a condition: a live Google round trip (needs the client's Google Cloud client, `google-forms-setup.md` §A5a).

`OPS-1` `[x]` **Redefined by `D-52`:** `frontend/lib/types.ts` typechecked against the backend's own types, both directions, as a CI step (`npm run typecheck:drift`, `backend/test/drift/`). 119 of 139 mirror types checked; the rest listed in the check's header. Four drifts found and fixed on its first run. `lib/api.ts` (route paths) is **not** covered; a path check would need the backend's routes as types, and was not built.

`OPS-2` `[ ]` **Fail the build on a `var(--x)` that names an undefined custom property.** Added
2026-09-24 out of `F13-1`. Resolve every custom property written inside a Tailwind arbitrary value
against the set defined in `app/tokens/*.css` + `app/globals.css`, and fail on a miss. The same
shape as `OPS-1` and for the same stated reason — **make drift a compile error, not a code review.**
This defect class has now shipped three times (478, 113, 491 instances) and was invisible to `tsc`,
`eslint` and `next build` every time, because Tailwind's arbitrary-value syntax accepts any string.
Three independent reviewers have looked at this code since the tokens were deleted and none caught
it. A reviewer is the wrong instrument; a resolver is the right one.

---

## Dependency graph

```
SPEC-12 ─┬─> DOM-1 ─┬─> DOM-2 ──> GROUP-*
         │          ├─> AUTH-2 ──> (all /staff/* rescoped group-wise)
         │          └─> SESS-1 ──> SESS-2..7 ──┐
         ├─> AUTH-1 ─┬─> AUTH-3                │
         │           ├─> DOM-4 ──> PEOPLE-1..3 │
         │           └─> DOM-5 ──> SET-4       ├──> RPT-2 ──> RPT-4..9
         ├─> DOM-3 ────────────────────────────┤
         └─> MAIL-1 ──> MAIL-2 ──> MAIL-3 ─────┴──> AUTH-4, ANN-4, RPT-6

AUTH-1 ──> SHELL-1 ──┐
SHELL-2 ──> SHELL-3 ─┴──> SHELL-4 ──> every frontend task
TASK-1..6 ──> MARK-1..4 ──> BOOK-1..3 ──> RPT-2
```

**Critical path:** `SPEC-12 → DOM-1 → AUTH-2 → SESS-1 → RPT-2 → RPT-6`.
`DOM-1` and `AUTH-2` gate the most work; do them carefully and first.

`AUTH-3` hangs off `AUTH-1`, **not** `AUTH-2` — corrected 2026-09-19, matching line 89 and
`PHASE_ROADMAP.md` §5. It shipped in unit 1; a planner reading the old edge would budget a slice for
work that is already done.

---

## Verification

**Per slice**
```
npm test --workspace=backend
npm run test:e2e --workspace=backend
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
cd frontend && npx tsc --noEmit && npx eslint .
docker compose up -d --build     # then click the slice through both consoles
```

**Design adherence, after every screen** (the handoff's own eight questions):
1. Any earnings or total-revenue figure? *(must be none)*
2. Any place a mark and a completion percentage share a bar, column or average?
3. Any literal hex, rgb, or px font-size that should be a token?
4. Any `text-[var(--…)]`? *(silently drops the colour — use `text-fg`, `text-fg-2`, `text-accent`)*
5. Any element that loses its focus outline?
6. Any `Panel` nested inside a `Panel`?
7. Any Title Case button label, or any emoji?
8. Does it survive `dir="rtl"` and a long Arabic name? *(`ليلى فهمي` is in the fixtures for this)*

Report findings; do not fix silently.

---

## Decisions — all closed (`D-1`…`D-10` 2026-09-20, `D-23` 2026-09-21)

| ID | Blocks | Question |
|---|---|---|
| `D-1` | ~~`AUTH-5`~~ | **CLOSED 2026-09-20: drop the Security tab.** No Redis. `CLAUDE.md` §5's named trigger for Redis is a second replica, which has not fired. `AUTH-5` is **dropped from scope**, not deferred. |
| `D-2` | `MARK-*` | **CLOSED 2026-09-20: rendered overlay, no server-side PDF library.** The teacher marks up with in-app **marker and eraser** tools that draw *over* the PDF and never edit it, then submits the overlaid result. So annotations are wider than `{page,x,y,kind,text}` — they include **freehand stroke paths**, and the eraser removes the teacher's own strokes, never page content. Original stays immutable. |
| `D-3` | `RPT-3` | **CLOSED 2026-09-20: on-demand button only.** No cron, no scheduler, no unattended run over 300 students' data. Generation stays idempotent and never overwrites a report already `sent`. |
| `D-4` | `DOM-3`, `SESS-1` | **CLOSED then SUPERSEDED by `D-9` the same day.** `D-4` kept one axis (the group's `learning_mode`); `D-9` removes that one too. Net: **zero mode axes.** No `students.mode`, no session `mode`, no `learning_mode`. |
| `D-5` | `DOM-6` | **CLOSED 2026-09-20: regenerate.** Seeds are rewritten for the new shape, not migrated. Fixtures are dev data carrying a published password hash; auto-seeding is refused in production. |
| `D-6` | `SESS-1` | **REVISED 2026-09-20: yes, but their own groups only.** Supersedes the earlier "any session". One `StaffScopeService` check — `SESS-1` re-parents sessions to the group, so the group *is* the scope key. |
| `D-7` | `SPEC-17` | **CLOSED 2026-09-20: fix the spec to match the redesign.** `/admin/*` is teacher and admin, unscoped, per `AUTHORIZATION_MODEL.md`; `assistant` is stripped from `API_SPEC.yaml:460` and `:1124`. `CLAUDE.md` §6 stands. |
| `D-8` | `SPEC-16` | **CLOSED 2026-09-20: fix the spec to match the redesign.** `/notifications` gains its path entries, shaped by `PRODUCT_SPEC.md` §5.2 (the student surface becomes a bell + `Menu`, and teacher notification preferences are added) rather than transcribed from current code. |
| `D-9` | `DOM-1`, `SESS-1`, `STU-2`, dashboard, courses | **CLOSED 2026-09-20: `learning_mode` is retired entirely — there is no live/recorded distinction.** Every group is both: sessions run on an external meeting link, recordings are uploaded afterwards. 46 files reference it and it changes a **response shape** (`courses.service.ts:24,39,120` is a discriminated union), so it wants its own slice in unit 2 **before** `DOM-1`. Assistants may upload recordings for their own groups. |
| `D-10` | `AUTH-2`, `F2A-3` | **CLOSED 2026-09-20: an assistant's group reads are scoped.** An `assigned_groups` assistant gets a **404 with the byte-identical message** on `GET /staff/groups/:groupId` for a group they do not hold. Raised by the 2a review (F-3): migration `013` falsified the premise — *"a group spans courses"* — that had kept those reads unscoped. Supersedes *"TAs are allowed to access all groups"*. Lands in `AUTH-2` (2b) with a refusal test in both directions; 2a fixes only the stale comment. |
| `D-23` | `AUTH-6`, 2b-ii F1/F3/F4/B-4 | **CLOSED 2026-09-21: narrow the course-named staff routes to held groups.** `D-10` closed the roster leak at the group door; the course door was left open, so an assistant given one cohort of IGCSE still read roughly 150 students' names and emails instead of thirty. Chosen over keeping it course-grained because `AUTHORIZATION_MODEL.md:207` already says *any* assistant-facing read/write is group-scoped, and a model the code contradicts is worse than either rule on its own. **Accepted cost:** each screen now needs an explicit ruling on whether its numbers may depend on the viewer — the trap `B-4` avoided by preserving behaviour rather than silently narrowing a denominator. Filed as `AUTH-6`, **not** folded into phase 2: it is unplanned scope and real design work, not a patch. |

---

## Counts

| | |
|---|---|
| Phases | 18 |
| Tasks | 87 (`AUTH-6` added 2026-09-21), less `AUTH-5` (dropped) = **86** |
| Blocked | **0** — all eight decisions closed 2026-09-20 |
| Complete | **15** — Phase 0's 13 done (`SPEC-16`/`SPEC-17` outstanding), plus `AUTH-1` and `AUTH-3` |
| Migrations | 12 (011–022), one destructive |
| New backend routes | ~48 |
| Routes modified | ~28 |
| Routes retired | 12 |
