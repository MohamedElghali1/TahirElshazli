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
| `AUTH-2` `[ ]` **→ unit 2** | **Course scoping → group scoping.** `assistant_scopes` + `assistant_group_assignments`; rewrite `StaffScopeService` internals; migrate and drop `course_staff_assignments`. **Re-homed to unit 2, beside `DOM-1`/`DOM-2`,** by the 2026-09-19 ruling: its migration `014` joins `groups.course_id`, which does not exist until `DOM-1`'s `013`, and `MigrationRunner.sqlFilesIn` sorts lexicographically — so a `014` with no `013` applies straight after `012` and aborts every boot and every integration run. See `docs/CHANGELOG.md`. | `AUTH-1`, `DOM-1` | 014 | `[REPLACE]` ×3 | The chokepoint itself | **404-not-403 and the identical message must survive**; both scope values tested |
| `AUTH-3` `[x]` | `AssistantCapabilities` preset gating the four withheld verbs (`backend/src/auth/capabilities.ts`). `DELETE /staff/groups/:id/members/:studentId` → teacher/admin with a **403**. **Dep corrected: `AUTH-1`, not `AUTH-2`** — the preset is a pure module and the one routed verb needs no scope table, which is what let it ship in unit 1 while `AUTH-2` deferred. | `AUTH-1` | — | 1 route | The four verbs | One refusal test per verb (`capabilities.spec.ts`), plus a service-layer refusal proving the repository is never read. **Strengthened 2026-09-19:** `WITHHELD` is now derived from an exhaustive `Record<Capability, true>` in the spec and asserted against the module's exported `ALL_CAPABILITIES`, so a fifth capability fails the spec (proved by adding one and watching it go red) rather than shipping with no refusal test. The module's preset already gave the compile error; it was the spec's mirror that did not. |
| `AUTH-4` `[ ]` **→ unit 5** | Assistant invitations: table, 4 admin routes, public accept. **Re-homed to unit 5** (beside `PEOPLE-4`): doubly blocked — on `AUTH-2` for `scope`/`groupIds`, and on `MAIL-1` (unit 3), because an invitation that cannot be emailed is not an invitation. Its planner should cost `assistant.invitation_accepted` and `assistant.invitation_resent` as audited actions (unit-1 `PHASE_PLAN.md` §8 D-d) rather than discover them. | `AUTH-2`, `MAIL-1` | 015 (own number) | 5 new | Teacher/admin only | Token reuse, expiry, and unknown all give one message |
| ~~`AUTH-5`~~ `[REMOVED]` | ~~Device/session list.~~ **Dropped from scope 2026-09-20 (`D-1`): no Redis, no Security tab.** Not deferred — dropped. The per-process rate limiter and token denylist therefore stay as they are, and `SECURITY.md` §3.1 is a **permanent** known weakness until a second replica is configured. | — | — | — | — | — |

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
| `DOM-6` `[~]` | **Regenerate seed fixtures** for the new shape. **Not a tail task** — the integration suite calls `runner.seed()` in the same `beforeAll` as `runner.migrate()`, so a stale seed fails the migration gate at setup rather than in a test. Seeds `001`/`003` were regenerated **in lock-step with `012` and `013`**; `001`/`002` followed with `014` in slice 2b-i — every seeded account now writes `status` out rather than leaning on the column default, and `profile-1` carries all three staff fields so the "never student-facing" property is testable on a row where the leak is actually possible. **`002` still needs its `assistant_scopes` row with `015`** (slice 2b-ii). | per migration | seeds | Medium |


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
`AUTH-2` implements it either way. **Today an assistant can read any group's roster with every
member's name and email** — equally true before this slice, so it is not a regression, but `AUTH-2`
is the moment it is either closed or deliberately kept.

---

## Phase 3 — Mail  *(backend)*

| ID | Task | Deps |
|---|---|---|
| `MAIL-1` `[ ]` | `MailSender` port + `MAIL_DRIVER=none\|log\|smtp`, resolved in `env.ts` like `STORAGE_DRIVER`; 503 when unconfigured. Fold `PasswordResetNotifier` onto it. | — |
| `MAIL-2` `[ ]` | `mail_deliveries` table, written in the same transaction as the causing action. **Recipient and template only — never the rendered body** (`SECURITY.md` §5). | `MAIL-1` |
| `MAIL-3` `[ ]` | Templates: invitation, sign-in link, report, announcement. | `MAIL-2` |

---

## Phase 4 — Shells  *(frontend)*

| ID | Task | Deps |
|---|---|---|
| `SHELL-1` `[ ]` | Console shell — 244px `--surface-2` sidebar, course switcher, six nav sections, 52px crumb header, role-based hiding (courtesy only). | `AUTH-1` |
| `SHELL-2` `[ ]` | Student shell — 248px `--surface-3` sidebar, **no right border**, white-pill active item, WhatsApp FAB, 96px bottom padding. | — |
| `SHELL-3` `[ ]` | Flat student IA + course switcher; `/learn/[id]/*` collapses to top-level routes. | `SHELL-2` |
| `SHELL-4` `[ ]` | Delete `components/app/*`, `components/site/*`, legacy pages. **Frontend builds again from here.** | `SHELL-1..3` |

---

## Phases 5–14 — Vertical slices

Each slice: migration → repositories (both) → service → authz → API → tests → frontend → check.

### Phase 5 — People
`PEOPLE-1` `[ ]` Student directory + waiting queue (`DOM-4`) ·
`PEOPLE-2` `[ ]` Student detail + edit ·
`PEOPLE-3` `[ ]` Create student directly (emails a sign-in link; needs `MAIL-3`) ·
`PEOPLE-4` `[ ]` Assistants list + invite + scope editing (`AUTH-4`). **Inherits a known response-schema
gap on `GET /admin/assistants`:** `API_SPEC.yaml:563` responds `Assistant[]`, whose
`required` set is `[id, name, email, role, scope, status]`, and the implementation returns
`{ id, name, email, createdAt, role }` — `scope` and `status` **absent** (deferred by unit-1 ruling 2,
because both need `AUTH-2`'s scope tables), `createdAt` **undeclared in the schema**. Closing the row
means adding `scope`/`status` to the response *and* declaring `createdAt` in the contract, or dropping
it from the response. Costed here so it is not rediscovered. The frontend mirror's missing `role` was
closed in unit 1's remediation pass (`StaffDirectoryEntry` in `lib/types.ts`); `scope` and `status`
will need the same treatment. ·
`PEOPLE-5` `[ ]` Assistant activity screen over the existing audit log ·
`PEOPLE-6` `[ ]` **`Assistant.lastSeenAt` — derived from the audit log.** Closed 2026-09-20: match
the redesign, where the teacher sees assistant *activity*. That activity **is** the audit log
(`PRODUCT_SPEC.md` §3.3), which already timestamps every staff action — so the field is
`MAX(created_at)` for that actor. **No `users.last_seen_at` column and no write on the hot path.**

One caveat to carry into the UI: this is *last acted*, not *last seen*. An assistant who signs in and
only reads shows nothing. That is the right figure for the screen the redesign draws, but the label
must not imply a login time. `PEOPLE-4` emits it; `PEOPLE-5` renders it.

### Phase 6 — Groups
`GROUP-1` `[ ]` Group CRUD with course/assistant/meets/room (`DOM-2`) ·
`GROUP-2` `[ ]` Group detail + membership multi-select ·
`GROUP-3` `[ ]` Bulk move ("Move N to group") ·
`GROUP-4` `[ ]` Group report (stats + per-student table, PDF)

### Phase 7 — Tasks
`TASK-1` `[ ]` `visibility` enum, distinct from the window ·
`TASK-2` `[ ]` `task_drafts` table + 4 routes ·
`TASK-3` `[ ]` Author from a draft (copies content, increments `usedCount`) ·
`TASK-4` `[ ]` Attachments ·
`TASK-5` `[ ]` Submission settings + marker assignment ·
`TASK-6` `[ ]` Global `GET /staff/tasks` ·
`TASK-7` `[ ]` Task list + authoring screens

### Phase 8 — Marking
`MARK-1` `[ ]` `submission_annotations` + 4 routes ·
`MARK-2` `[ ]` Split save from save-and-return (`returned_at`) ·
`MARK-3` `[ ]` Submissions-for-one-task **including non-submitters** ·
`MARK-4` `[ ]` Marking view (page, toolbar, annotation list, mark, feedback) ·
`MARK-5` `[ ]` Marked-copy delivery — **rendered overlay** (`D-2`, closed). No server-side PDF library. **Annotations include freehand stroke paths, not only pins:** the teacher draws over the PDF with marker and eraser tools and never edits it; the eraser clears the teacher's own strokes only. Original stays immutable. A downloadable flattened PDF is additive and out of scope.

### Phase 9 — Mark book
`BOOK-1` `[ ]` Grid endpoint · `BOOK-2` `[ ]` Screen (sticky first column, em-dash for missing) ·
`BOOK-3` `[ ]` CSV export

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
`ANN-1` `[ ]` `group:<id>` audience · `ANN-2` `[ ]` Media · `ANN-3` `[ ]` Draft + publish ·
`ANN-4` `[ ]` Email fan-out, idempotent on `published_at` (`MAIL-3`) ·
`ANN-5` `[ ]` Live reach preview · `ANN-6` `[ ]` Compose screen with student-view preview

### Phase 13 — Google Forms surface  *(frontend only — backend complete)*
`WORK-1` `[ ]` Task results screen (`Score`/`Meter` split, understated-figure banner) ·
`WORK-2` `[ ]` Unmatched queue + match-student ·
`WORK-3` `[ ]` `SyncStatus` on every mirrored surface ·
`WORK-4` `[ ]` Student Quizzes surface driven by `work_type: google_form` — **no quiz engine**

### Phase 14 — Settings and account
`SET-1` `[ ]` `/me/profile` for staff · `SET-2` `[ ]` Notification preferences ·
`SET-3` `[ ]` Google panel over the 5 existing routes (four states) ·
`SET-4` `[ ]` Courses tab (`DOM-5`) · `SET-5` `[ ]` Groups tab · `SET-6` `[ ]` Student Settings + avatar upload

---

## Phases 15–17 — Remaining surfaces

`STU-1` `[ ]` Overview (action-first; **no mark on this page**) ·
`STU-2` `[ ]` `recordings.thumbnail_url` + library grid/list ·
`STU-3` `[ ]` Lesson detail + next-recording ·
`STU-4` `[ ]` Homework + four attempt states ·
`STU-5` `[ ]` Materials · `STU-6` `[ ]` Classmates (already correct server-side) ·
`STU-7` `[ ]` Help/WhatsApp

`SITE-1` `[ ]` Homepage · `SITE-2` `[ ]` Course pages · `SITE-3` `[ ]` Blog ·
`SITE-4` `[ ]` Contact · `SITE-5` `[ ]` Auth screens (sign-in card shape ×4)

`GAUTH-1` `[ ]` Google OAuth sign-in. **Last.** Nothing depends on it and it replaces a working,
well-tested mechanism. Non-negotiables in `SECURITY.md` §2.6 — especially: never auto-link a Google
account to a password account by email alone.

`OPS-1` `[ ]` Regenerate `lib/api.ts` + `lib/types.ts` from `API_SPEC.yaml`, or add a CI drift check.

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

## Decisions — all closed 2026-09-20

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

---

## Counts

| | |
|---|---|
| Phases | 18 |
| Tasks | 86, less `AUTH-5` (dropped) = **85** |
| Blocked | **0** — all eight decisions closed 2026-09-20 |
| Complete | **15** — Phase 0's 13 done (`SPEC-16`/`SPEC-17` outstanding), plus `AUTH-1` and `AUTH-3` |
| Migrations | 11 (011–021), one destructive |
| New backend routes | ~48 |
| Routes modified | ~28 |
| Routes retired | 12 |
