# Phase plan — unit 2, slice 2b: scope, people and courses

**Planner:** `redesign-planner` · **Date:** 2026-09-20 · **Branch:** `redesign`
**Base:** `4e11a69` (`DOM-1`+`DOM-2`), plus `executor-unit2a-remediation`'s uncommitted work tree.
**Carries forward:** `docs/phases/unit-2/PHASE_PLAN.md` (the original unit-2 plan),
`COORDINATOR_RULINGS.md` (R-1…R-4), `EXECUTION_NOTES.md` (`D-1`…`D-6`), `REVIEW.md` (F-1…F-9),
`CHANGELOG.md` `D-10`.

**This plan amends the original rather than replacing it.** Every amendment is marked **[AMENDS
§x]** with the reason. Anything not amended stands as written there; do not re-derive it.

---

## 0. Headline — read before §1

1. **`scopeFor`'s return shape does not have to change, and it must not.** The original plan §3.7
   said `assignments: CourseStaffAssignment[]` "is the one member of the interface that does
   change". It does not need to: keep the member, and populate it with a **derived per-course
   reach** row whose `assignedAt` is `MIN(assigned_at)` over the held groups reaching that course —
   which is exactly what ruling **R-4** already requires. That single decision makes **all seven**
   contract cases in `staff-scope.service.spec.ts` pass unmodified and leaves **both** consumers of
   `scope.assignments` untouched. **[AMENDS §3.7, §4.4]**
2. **`scope.assignments` has two consumers, not one.** The original plan §4.4 named only
   `staff.service.ts:70`. `manage/manage.service.ts:115-126` reads it too, and feeds
   `manage.service.ts:168`'s `assignedAt`. Verified in the current tree. **[AMENDS §4.4]**
3. **Four cases in `staff-scope.service.spec.ts` test methods this slice deletes.** `describe('assign
   and unassign')` (`:118-150`) exercises `assign`/`unassign`, which go with
   `/admin/courses/:id/staff`. Those four are **deleted with the methods**, not edited — see §4.4.1
   for why that is not the contract breaking, and what replaces them.
4. **`register` currently issues a JWT.** A `waiting` account that cannot sign in but is handed a
   working token at registration is an authentication bypass, because `JwtStrategy.validate`
   (`auth/jwt.strategy.ts:34-51`) re-reads role but **not status**. The status gate belongs in
   `JwtStrategy`, where every route routes through it — not only in `login`. See §4.3 and **B-1**.
5. **2b is about the same size as 2a, and 2a came back with nine findings.** A second split is
   recommended at a boundary that is again a migration gate — §10.

---

## 1. Scope

### IN — ordered

| # | Task | Migration |
|---|---|---|
| 1 | **`DOM-3`** `student_profiles` gains `school_name`, `parent_email`, `staff_notes`; **no `mode`** (ruling R-2), and the five documents that still require it are amended | `014` |
| 2 | **`DOM-4`** `users.status`, the waiting queue, accept/reject, `POST /courses/:id/enroll` retired | `014` |
| 3 | **`DOM-5`** course CRUD (`POST /admin/courses`, `PATCH /admin/courses/:courseId`) | — |
| 4 | **`AUTH-2`** course scoping → group scoping; `assistant_scopes` + `assistant_group_assignments`; `course_staff_assignments` dropped; **`D-10`** scopes the staff group reads | `015` |
| 5 | **`DOM-6`** seeds `001`/`002` in lock-step with `014`/`015`; final integration pass from an empty schema | seeds |

### OUT, and why

| Not in scope | Reason |
|---|---|
| `PATCH /admin/assistants/{userId}` (edit an assistant's scope) | Unit 5 `PEOPLE-4`; `API_SPEC.yaml:597` already owns it. **Consequence, stated again:** between this slice and unit 5, the only way to give an assistant a group is the seed fixture or SQL. Acceptable — no production deployment, and `DOM-6` regenerates the fixtures. |
| `GET /admin/students` gaining `status`/`groupId`/percentages, `POST /admin/students`, `PATCH /admin/students/:id` | Unit 5 `PEOPLE-1`. `DirectoryService.students` exists (`manage/directory.service.ts:55`) and returns `StudentDirectoryEntry`; **2b adds `status` to it and a `status` filter, and nothing else** — the queue screen needs to be able to list waiting accounts, and that is the whole of it. |
| `DELETE /admin/students/{id}/enrollments/{courseId}` (`API_SPEC.yaml:570`) | Not named by `DOM-4`; it is the `enrollment.remove` withheld verb and needs a `student.unenrolled` audit action. New task, not this slice. |
| `GET /courses/catalog` | `PRODUCT_SPEC.md:205` marks Catalog `[REMOVED]` *"with open enrolment"*, but `DOM-4`'s text retires only `POST /courses/:id/enroll`. Retiring the catalog read is a separate decision with a frontend consequence. **Recorded as a candidate task; not done here.** |
| `assistant.scope_changed` audit action | No route writes scope in this slice. An action nothing emits is drift. |
| `SESS-1`/`SESS-2`, `AUTH-4`, `PEOPLE-*` screens | Units 5 and 8, unchanged from the original plan §1. |
| `frontend/app/**`, `frontend/components/**` | Unit 4 deletes them (`CLAUDE.md` §4.1). Mirror only: `frontend/lib/{types,api}.ts`. |
| The nine 2a follow-ups `F2A-1`…`F2A-9` | `executor-unit2a-remediation` owns them. **Do not touch the files it is editing until it reports done.** |
| `GroupDataModule` de-globalisation | Recorded as its own task by the 2a review; an unrelated refactor here (`CLAUDE.md` §12). |

---

## 2. Entry criteria — verified

| Criterion | Evidence |
|---|---|
| Branch `redesign` | `git rev-parse --abbrev-ref HEAD` → `redesign`; HEAD `4e11a69` |
| `013` landed **and verified** against real PostgreSQL from an empty schema | `EXECUTION_NOTES.md` §Tests: 13 migrations applied, 87 integration passing, 0 skipped, on a dropped-and-recreated database; independently reproduced by the reviewer (`REVIEW.md` §Scope reviewed) |
| Highest applied migration | `ls backend/src/database/migrations/` → `013_group_holds_one_course.sql`. **`001`–`013` are immutable.** `014`/`015` do not exist. |
| Suites green at entry | 471 unit / 28 files · 217 e2e · 87 integration, 0 skipped (executor and reviewer, independently) |
| `frontend/lib/` at 0 errors | `npx tsc --noEmit 2>&1 \| grep -cE "^lib/"` → 0. **The path-anchored form is the gate**; `grep -c "lib/"` reads 2 and is wrong — it matches the message text `Module '"@/lib/types"'`. |
| Rulings closed, not open | R-2 (`students.mode` struck) and R-4 (`MIN(assigned_at)`) are decided; `D-10` is closed in `CHANGELOG.md`. None is re-litigated here. |
| **Working tree is NOT clean** | 21 modified files + 4 untracked, from `executor-unit2a-remediation`. **2b must not start writing until that work is committed and its suites are green.** See §9 R-1. |

**Junk in the repository root, found not fixed:** untracked files named `1`, `[a.id`, `before`,
`value` — artifacts of a mis-quoted shell redirect. They are not mine to delete; flagged for the
coordinator.

---

## 3. Reconciliation

### 3.1 REMAINS — do not touch

| Feature | Citation |
|---|---|
| `StaffScopeService.assertAssigned`'s **signature, admin bypass, 404-with-identical-message** | `staff/staff-scope.service.ts:76-93`; asserted by `staff-scope.service.spec.ts:55-69` |
| `StaffScopeService.scopeFor`'s **union shape** (`{unscoped:true} \| {unscoped:false, assignments}`) | `staff-scope.service.ts:30-32`; asserted at `:85,92,106` — **and kept, per §0.1** |
| `CoursesService.enroll` — the service method | `PRODUCT_SPEC.md:47`; only the route moves |
| `capabilities.ts` — `registration.reject` already exists and is `false` for assistants | `auth/capabilities.ts:23-42`. **No new `Capability` is needed for reject.** |
| `assertMay` → **403**, `assertAssigned` → **404**; the distinction | `capabilities.ts:96-115` |
| `groups.assistant_id` is display-only (binding ruling R-1) | `EXECUTION_NOTES.md` §1; proved by `groups.controller.spec.ts` *"sets assistantId without granting the assistant anything"* and `staff.e2e-spec.ts` *"naming an assistant on a group grants them nothing"*. **Both must still pass unmodified at the end of 2b.** They are the guard that a group-scoped rewrite did not start reading the display field. |
| `StudentGroupsService`'s tie-break and its `GroupMembership.assignedAt` sort key | 2a; `CHANGELOG.md` |
| `login`'s single-verify timing equalisation against `DUMMY_PASSWORD_HASH` | `auth/auth.service.ts:107-117` |
| The retained audit members and target types | `audit-log-repository.interface.ts:16-23,53-60,101-103,113-117` |

### 3.2 CHANGED

| Feature | Old | New | Delta |
|---|---|---|---|
| Assistant scope storage | `course_staff_assignments` (`002_staff_and_audit.sql:17-36`) | `assistant_scopes` + `assistant_group_assignments` | `AUTH-2`; `AUTHORIZATION_MODEL.md:58-70` |
| `assertAssigned` internals | `staffRepo.find(courseId, userId)` | scope row → held group ids → the groups on `courseId` → intersection | §4.4 |
| `scopeFor` internals | `staffRepo.findByStaff(userId)` | held groups → their courses, one derived row per course, `assignedAt = MIN(assigned_at)` (R-4) | §4.4 |
| `GET /staff/groups/:groupId`, `…/members`, `POST …/members` | unscoped — any assistant reaches any group | `assigned_groups` assistant gets **404, byte-identical to a genuine miss** | **`D-10`**, `CHANGELOG.md`; `AUTHORIZATION_MODEL.md:105,207` |
| `POST /courses/:id/enroll` | `@Roles(Role.Student)`, self-enrol (`courses/courses.controller.ts:57-64`) | **retired → 404** | `PRODUCT_SPEC.md:41-49` |
| `register` | creates a usable student **and returns a JWT** (`auth.service.ts:77-104`) | creates `status='waiting'`; **returns no token** (see **B-1**) | `DOMAIN_MODEL.md:26` |
| `login` | no status check | only `active` authenticates, **same `'Invalid credentials'` message, same one verify** | `DOMAIN_MODEL.md:23` |
| `JwtStrategy.validate` | re-reads role; **does not read status** (`jwt.strategy.ts:46-50`) | refuses a non-`active` account | the root-cause half of the same rule (§0.4) |
| `StaffCourseSummary.assignedAt` | the TA's `course_staff_assignments.assigned_at` | `MIN(assigned_at)` over the held groups reaching the course | ruling **R-4** — satisfied by §0.1, with **no change to `staff.service.ts`** |
| `DirectoryService.students` | `{id,name,email,createdAt,enrolledCourseCount}` | `+ status`, and an optional `status` filter | the queue screen's data source |

### 3.3 REMOVED — and who still references them

| Removed | References to clear |
|---|---|
| `course_staff_assignments` table | `015`; `seeds/002_staff_fixtures.sql:25-27`; `backend/test/postgres-repositories.integration-spec.ts` (`describe('course staff assignments')`) |
| `CourseStaffRepository`, `CourseStaffAssignment`, `COURSE_STAFF_REPOSITORY` | `staff/interfaces/course-staff-repository.interface.ts` (delete), `staff/repositories/{in-memory,postgres}-course-staff.repository.ts` (delete), `staff/staff.module.ts`, `staff/staff-scope.service.ts:3-7,52`, `staff-scope.service.spec.ts` (fixture) |
| `StaffScopeService.findAssignment`, `.listStaffForCourse`, `.assign`, `.unassign` | `staff/staff.service.ts:103,165,213,220`; `staff-scope.service.spec.ts:118-150` |
| `StaffService.listCourseStaff`, `.assign`, `.unassign` | `staff/admin-staff.controller.ts` (**delete the file**), `staff/staff.controller.spec.ts` |
| `GET\|POST /admin/courses/:courseId/staff`, `DELETE …/staff/:userId` | `admin-staff.controller.ts:27,32,39,52`; `role-guards.spec.ts`'s controller/route tables; `staff.e2e-spec.ts` |
| `POST /courses/:id/enroll` | `courses/courses.controller.ts:57-64`; `frontend/lib/api.ts`; `app.e2e-spec.ts` |
| Spec-only: `StudyMode`, `mode` required on `StudentSummary`/`StudentWrite` | `API_SPEC.yaml:156,168,174,196,199` (ruling R-2) |

**Audit trap, inherited and still live.** `course_staff.assigned`, `course_staff.unassigned`
(`audit-log-repository.interface.ts:22-23`) and `course_staff_assignment`
(`AuditTargetType`) **stay in the union and in `AUDIT_ACTION_VALUES`** when the table is dropped.
`AUDIT_ACTION_VALUES` is `Record<AuditAction, true>` (`audit/dto/list-audit-log-query.dto.ts:26`) —
removing a member makes every historical row of that action unfilterable with a **400**. The comment
at `:16-21` already says so, and `audit.service.spec.ts:198` already guards it. Leave all three
alone; the guard spec must still pass.

### 3.4 NEW — full stack

| Feature | Backend today |
|---|---|
| `users.status` + the waiting queue | none |
| `POST /admin/students/:studentId/accept` / `…/reject` | none (`API_SPEC.yaml:516,556` is target-only) |
| `assistant_scopes`, `assistant_group_assignments` | none |
| `student_profiles.school_name / parent_email / staff_notes` | none |
| Course create/update | none — `CourseRepository` (`courses/interfaces/course-repository.interface.ts:42-81`) has `findById/findByIds/findAll/findPublished/findBySlug` and **no `create`/`update`** |

### 3.5 APIs

**To add**

| Method | Path | DTO | Response | Statuses |
|---|---|---|---|---|
| `POST` | `/admin/students/:studentId/accept` | `AcceptRegistrationDto` — `groupId` `@IsString @IsNotEmpty @Matches(ID_PATTERN)` | `StudentDirectoryEntry` + `status` | 200 · 400 · 403 · 404 · 409 |
| `POST` | `/admin/students/:studentId/reject` | `RejectRegistrationDto` — `reason?` `@IsOptionalNotNull @IsString @MaxLength(500)` | `{ ok: true }` 200 | 200 · 403 · 404 · 409 |
| `POST` | `/admin/courses` | `CreateCourseDto` — `title`, `description`, `slug`, `teacherName`, `thumbnailUrl?`, `sequentialLockEnabled?`, `isPublished?` | `StoredCourse` | 201 · 400 · 403 · 409 (slug taken) |
| `PATCH` | `/admin/courses/:courseId` | `UpdateCourseDto` — every field optional, `@IsOptionalNotNull` on the non-nullable ones | `StoredCourse` | 200 · 400 · 403 · 404 · 409 |

> **`accept` returns a directory row, not `API_SPEC.yaml`'s `StudentDetail`.** `StudentDetail`
> requires `mode` (struck by R-2) and carries four percentage fields with no source until the
> reports and analytics units. Emitting a shape the server cannot fill is the drift `CLAUDE.md` §6
> names. The executor **amends the spec** to the shape actually returned, the same reconciliation
> unit 1 did for `Assistant` and 2a did for `Group`.

**To modify**

| Route | Change | Breaking for `lib/api.ts`? |
|---|---|---|
| `POST /auth/register` | returns `{ status: 'waiting' }`, no `accessToken`, no `user` | **YES** — `frontend/lib/api.ts` register, `lib/types.ts` `AuthResponse` |
| `POST /auth/login` | refuses non-`active` with the **unchanged** message | no shape change |
| `GET /admin/students` | row gains `status`; optional `?status=` filter | yes, additive |
| `GET /staff/groups/:groupId`, `…/members`, `POST …/members` | scoped — 404 for an out-of-scope assistant | no shape change |

**To retire:** `POST /courses/:id/enroll` · `GET|POST /admin/courses/:courseId/staff` ·
`DELETE /admin/courses/:courseId/staff/:userId`. All three answer **404** afterwards, asserted.

### 3.6 Domain changes

`User` gains `status: 'waiting' | 'active' | 'rejected'`. `StudentProfile` gains `schoolName?`,
`parentEmail?`, `staffNotes?` — **no `mode`** (R-2). `CourseStaffAssignment` is deleted;
`AssistantScope` + `AssistantGroupAssignment` replace it. `Course` gains no field; it gains
lifecycle (create/update). `Group` is unchanged by this slice.

### 3.7 Authorization changes **[AMENDS original §3.7]**

| Rule | Detail |
|---|---|
| `assertAssigned(courseId, actor)` | **Signature, return type and message unchanged.** Admin → `null`. Assistant: `all_groups` → `null`; `assigned_groups` → the derived reach row, or **404 `'Course not found or not assigned to you'`**, extracted to an exported `const COURSE_NOT_IN_SCOPE`. **No `assistant_scopes` row at all → refuse** (fail closed). |
| `scopeFor(actor)` | **Shape unchanged.** Admin **and `all_groups` assistant** → `{unscoped:true}`. `assigned_groups` → `{unscoped:false, assignments}`, one row per course reachable through a held group, `assignedAt = MIN(assigned_at)` (R-4). No held groups → `{unscoped:false, assignments: []}`. |
| **new** `mayReachGroup(group, actor)` | Non-throwing predicate. Admin or `all_groups` → true; otherwise the group id is in the held set. **Additive** — it breaks nothing and is the only way to give `D-10` a message identical to a genuine group miss. |
| `D-10` — `GET /staff/groups/:groupId`, `…/members`, `POST …/members` | Out of scope → **404 with the byte-identical `'Group not found'`**, from one exported `const GROUP_NOT_FOUND` in `groups.service.ts`. |
| `DELETE /staff/groups/:groupId/members/:studentId` | Unchanged — `@Roles(...STAFF_ADMIN)` + `assertMay(actor,'group.member.remove')` → **403**. An assistant never reaches the group read. |
| `POST /admin/students/:id/accept` | `@Roles(...STAFF_ADMIN)` → 403 for an assistant |
| `POST /admin/students/:id/reject` | `@Roles(...STAFF_ADMIN)` **and** `assertMay(actor,'registration.reject')` in the service → 403. The decorator is the outer gate; the capability is the rule (`CLAUDE.md` §7). |
| `POST\|PATCH /admin/courses` | `@Roles(...STAFF_ADMIN)` |
| Login / every authenticated request | `status !== 'active'` → refused |

### 3.8 Security — `CLAUDE.md` §8, item by item

| Item | Touched | What the executor must check and report |
|---|---|---|
| **Authentication** | **yes** | (a) The login refusal **reuses `UnauthorizedException('Invalid credentials')`** and still runs **exactly one** `hasher.verify` against `DUMMY_PASSWORD_HASH` — a distinct message or an early return turns login into a registration oracle and breaks the timing equalisation. (b) `JwtStrategy.validate` refuses a non-`active` account, so a token minted before a rejection stops working. (c) `register` hands out no token. |
| **Authorization / object-level** | **yes** | The chokepoint is rewritten. All **21** call sites (§4.4) still route through it. `D-10` closes the group reads. **Nothing reads `groups.assistant_id`** — re-run `grep -rn "assistantId\|assistant_id" backend/src --include=*.ts` and report that no service appears. |
| **Input validation** | **yes** | Every new DTO field carries a `class-validator` decorator and a `@MaxLength`: `staffNotes` ≤ 4000, `schoolName` ≤ 160, `parentEmail` `@IsEmail` ≤ 254, `reason` ≤ 500, course `title` ≤ 200, `slug` `@Matches(/^[a-z0-9-]+$/)` ≤ 120, `thumbnailUrl` ≤ 2048. **`@IsOptional()` is banned on any field whose column is `NOT NULL`** — use `@IsOptionalNotNull()` from `backend/src/common/validators/is-optional-not-null.ts` (landed by the 2a remediation). |
| **Output filtering** | **yes** | `staffNotes` and `parentEmail` **never** appear in a student-facing response (`DOMAIN_MODEL.md:35`). `GET /students/me` and the dashboard must not gain them. Assert it. |
| **Sensitive-data exposure** | **yes** | `parentEmail` is a third party's PII on a child's record. Never logged, never in an audit `after` payload, never in an error message. |
| **Error leakage** | **yes** | Accept/reject on an unknown student: 404, one message. The 409 names no id. |
| **SQL injection** | **yes** | Two migrations and ~10 new/rewritten repository methods. Parameterised only; `COALESCE`-per-column for both `UPDATE`s, never a string-built `SET` — the pattern `postgres-group.repository.ts:132-151` already establishes. |
| **Audit logging** | **yes** | Four new actions × three artifacts (§4.5). Every write inside `db.runInTransaction`. Every `before` a **copy**, never an alias. |
| **Rate limiting / brute force** | **yes, indirectly** | The login path changes. Confirm the register and login limiters still wrap the same routes and that the status refusal happens **inside** the rate-limited path, not before it. |
| **Environment configuration** | **yes** | `resolveAutoSeed` still refuses production; the regenerated seeds still carry the published hash, and now also seed `status` and an `assistant_scopes` row. |
| **Token / session security** | **yes** | The denylist and the password-change cutoff are unchanged. The status check is an **additional** refusal in `validate`, not a replacement. |
| CSRF · CORS · XSS · upload · path traversal · SSRF · secrets · dependencies | **no** | No new upload path, external call, HTML sink or dependency. |

### 3.9 Frontend/backend dependencies

No screen ships. The mirror moves in the same commit as each contract change:
`frontend/lib/types.ts` — `AuthResponse` (register), `UserStatus`, student profile fields, the
directory row's `status`; `frontend/lib/api.ts` — register's return, the deleted `enroll` call, the
accept/reject and course-CRUD calls. **`grep -cE "^lib/"` must stay 0.** The total is 326 today; it
may rise again, and if it does, report the delta per cause rather than rounding it (2a's `D-6`).

### 3.10 Architectural risks

| Strain | Where |
|---|---|
| `StaffScopeService` now needs group→course data | It injects `GROUP_REPOSITORY`, which is exported by the `@Global()` `GroupDataModule` — **no new import edge, no fourth global module**. A *repository* calling another repository is forbidden (`CLAUDE.md` §5); composing two repositories in the **service** is the permitted shape and is what §4.4 specifies. |
| `assertAssigned` becomes 2 reads instead of 1, per assistant request | ~10 groups (`CLAUDE.md` §1). Both reads are indexed and bounded by the group table. **Do not add a cache** — that is the speculative architecture §1 exists to refuse. |
| `AUTH-2` adds two tables → **four** repository implementations | One interface, one aggregate ("what this assistant may reach"), **two files** each implementing both tables. `CLAUDE.md` §9. |
| `AdminManageController` grows two more routes | It already owns `/admin/students` and `/admin/assistants`; accept/reject belong beside them. Course CRUD gets its own controller in the module that owns the aggregate (§4.6). |

### 3.11 Migration risks

| Risk | How the migration refuses |
|---|---|
| `users.status DEFAULT 'active'` is right for existing rows and wrong for new ones | The default is deliberate — every existing account predates the queue and must not be locked out. **`register` sets `'waiting'` explicitly** and a unit test proves it. Getting this wrong makes the queue silently always empty: a **silent authorization hole**, not a cosmetic bug. |
| An assistant ends up with **no** `assistant_scopes` row | `015` backfills **every** `role='assistant'` user to an explicit `'assigned_groups'` row. The runtime check also fails closed on a missing row, but the row must exist so the admin screen is never ambiguous between "everything" and "not set up yet" (`AUTHORIZATION_MODEL.md:64-69`). |
| `015` drops the table a live caller still uses | Sequencing, §6: `015` is **written last**, and `StaffScopeService` + `StaffService` + `admin-staff.controller.ts` are migrated in the same commit. Never commit `015` beside an un-migrated caller. |
| Stale seeds fail the migration gate at setup | `postgres-repositories.integration-spec.ts:57-58` calls `runner.seed()` in the same `beforeAll` as `runner.migrate()`. `seeds/002:25-27` inserts into `course_staff_assignments`; the moment `015` drops it the **whole** integration suite errors at setup. Seeds move **with** the migration, in the same step. |
| `014` before `013` | Impossible now — `013` is applied and in the ledger. Numbering is contiguous. |
| `015`'s derived id collides | `id = csa.id \|\| ':' \|\| g.id` against `UNIQUE (user_id, group_id)`: a group holds one course (`013`), so one `csa` row maps to a group at most once. Deterministic and re-runnable in review; **no `gen_random_uuid()`**, because `pgcrypto` availability in the target image is assumed, not verified. |

---

## 4. Changes by layer

### 4.1 Database

| # | File | Task | Destructive? |
|---|---|---|---|
| 014 | `014_registration_and_student_profile.sql` | `DOM-3` + `DOM-4` | **no** — purely additive |
| 015 | `015_assistant_group_scope.sql` | `AUTH-2` | **yes** — `DROP TABLE course_staff_assignments` |

**`014_registration_and_student_profile.sql`**

```sql
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('waiting','active','rejected'));
-- DEFAULT 'active' deliberately: every account that exists predates the queue
-- and must not be locked out. New registrations set 'waiting' EXPLICITLY -
-- relying on the default here would make the waiting queue permanently empty.
CREATE INDEX users_waiting_idx ON users (status) WHERE status = 'waiting';

ALTER TABLE student_profiles ADD COLUMN school_name  TEXT;
ALTER TABLE student_profiles ADD COLUMN parent_email TEXT;   -- a third party's PII; never logged
ALTER TABLE student_profiles ADD COLUMN staff_notes  TEXT;   -- never in a student-facing response
```

**No `mode` column and no conditional CHECK** — ruling **R-2**. Nothing to validate before writing:
the file adds columns and adds no constraint an existing row can violate. Data risk: none.

**`015_assistant_group_scope.sql`** — the one destructive file in this slice.

```sql
CREATE TABLE assistant_scopes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('all_groups','assigned_groups')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assistant_group_assignments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),        -- RESTRICT, as 002 did
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);
CREATE INDEX assistant_group_assignments_user_id_idx  ON assistant_group_assignments (user_id);
CREATE INDEX assistant_group_assignments_group_id_idx ON assistant_group_assignments (group_id);

-- Backfill: a course assignment becomes an assignment to every group studying
-- that course. `groups.course_id` is NOT NULL as of 013, so the join is total.
INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by, assigned_at)
SELECT csa.id || ':' || g.id, csa.user_id, g.id, csa.assigned_by, csa.assigned_at
  FROM course_staff_assignments csa
  JOIN groups g ON g.course_id = csa.course_id;

-- EVERY assistant gets an explicit row, including one who held nothing.
-- 'assigned_groups' for all of them: "sees everything" is a deliberate admin
-- act (AUTHORIZATION_MODEL.md:64-69), never a migration default.
INSERT INTO assistant_scopes (user_id, scope)
SELECT id, 'assigned_groups' FROM users WHERE role = 'assistant'
ON CONFLICT (user_id) DO NOTHING;

DROP TABLE course_staff_assignments;
```

**Report in `EXECUTION_NOTES.md`, from the real run:** the `course_staff_assignments` row count
before, the `assistant_group_assignments` row count after, and the `assistant_scopes` row count
against `SELECT count(*) FROM users WHERE role='assistant'`. A backfill nobody counted is a backfill
nobody verified.

**Scope the `information_schema` predicate.** `012` queries `information_schema.columns` with no
`table_schema` filter (review **F-9**), and the integration suite now runs migrations inside a side
schema. If `014` or `015` asserts anything against the catalog, it carries
`AND table_schema = current_schema()`.

### 4.2 Repositories — **every table costs two implementations**

| Table | Interface | InMemory | Postgres |
|---|---|---|---|
| `users` (changed) | `auth/interfaces/user-repository.interface.ts` — `StoredUser.status`; `create` takes `status`; **new** `setStatus(userId, status)`; `findByRole` takes an optional `status` filter | `repositories/in-memory-user.repository.ts` | `repositories/postgres-user.repository.ts` |
| `student_profiles` (changed) | `students/interfaces/student-repository.interface.ts` — `StudentProfile` + `schoolName`/`parentEmail`/`staffNotes`; `StudentProfileUpdate` likewise | `in-memory-student.repository.ts` | `postgres-student.repository.ts` |
| `courses` (changed) | `courses/interfaces/course-repository.interface.ts` — **new** `create(course)`, `update(courseId, patch)` | `in-memory-course.repository.ts` | `postgres-course.repository.ts` |
| `groups` (changed) | `groups/interfaces/group-repository.interface.ts` — **new** `findByIds(groupIds)`, mirroring `CourseRepository.findByIds` and `UserRepository.findByIds` | `in-memory-group.repository.ts` | `postgres-group.repository.ts` |
| **`assistant_scopes` + `assistant_group_assignments` (new)** | **new** `staff/interfaces/assistant-scope-repository.interface.ts` + `ASSISTANT_SCOPE_REPOSITORY` Symbol | **new** `staff/repositories/in-memory-assistant-scope.repository.ts` | **new** `staff/repositories/postgres-assistant-scope.repository.ts` |
| `course_staff_assignments` (**deleted**) | delete `staff/interfaces/course-staff-repository.interface.ts` | delete `in-memory-course-staff.repository.ts` | delete `postgres-course-staff.repository.ts` |

Wiring: `staff/staff.module.ts` swaps `COURSE_STAFF_REPOSITORY` for `ASSISTANT_SCOPE_REPOSITORY`
through the existing `repositoryProvider` helper (`database/repository.provider.ts`) — the same one
line every other module uses. **Pattern followed** (`ARCHITECTURE.md` §2): the
repository-interface-plus-two-drivers seam. Nothing new is invented.

**`AssistantScopeRepository` — one interface, one aggregate.** "What this assistant may reach."
No caller wants one table without the other, and a second interface would be an abstraction with one
consumer.

```ts
findScope(userId: string): Promise<AssistantScope | null>;            // null = never configured
setScope(userId: string, scope: AssistantScope): Promise<void>;       // used by seeds/tests now, PEOPLE-4 later
findAssignments(userId: string): Promise<AssistantGroupAssignment[]>;
assignGroup(userId, groupId, assignedBy): Promise<{ assignment; created: boolean }>;
unassignGroup(userId, groupId): Promise<boolean>;
```

**Both drivers read only their own two tables.** No join to `groups`. The group→course mapping is
composed in `StaffScopeService` (§4.4), because a repository must not reach into another aggregate
and because a JOIN written twice is a JOIN that can disagree twice.

**In-memory fixture, mirroring `seeds/002` exactly** — `assistant-1`: `scope='assigned_groups'`,
assigned to `group-1` (which is on `course-1`), `assignedAt '2026-02-01T09:00:00Z'`, `assignedBy
'teacher-1'`. `assistant-2`: an `assigned_groups` row and **no** assignments. This reproduces the
current `InMemoryCourseStaffRepository` fixture's behaviour exactly (`assistant-1` holds `course-1`
and not `course-2`), which is what lets the contract cases pass unmodified.

### 4.3 Services

| Service | Change | Invariant / transaction |
|---|---|---|
| `auth/auth.service.ts` `register` | `userRepo.create({..., status:'waiting'})`; **returns no token**. Profile row still created. | The status is passed explicitly, never left to the column default (§3.11) |
| `auth/auth.service.ts` `login` | After the single verify: `if (!user \|\| !passwordMatches \|\| user.status !== 'active') throw new UnauthorizedException('Invalid credentials')` — **one** condition, **one** message, **after** the verify | Timing equalisation preserved; no branch reveals which clause failed |
| `auth/jwt.strategy.ts` `validate` | `if (user.status !== 'active') throw new UnauthorizedException('Account no longer exists')` — reuse the existing message beside it, so a rejected account is indistinguishable from a deleted one | The root-cause guard: every route routes through here |
| **new** `manage/registration-approval.service.ts` | `accept(studentId, groupId, actor)`, `reject(studentId, reason, actor)` | **accept is ONE transaction**: read student (404) → 409 unless `status==='waiting'` → read group (404) → `userRepo.setStatus('active')` → `coursesService.enroll(group.courseId, studentId)` → `groupRepo.addMember` → audit. `reject`: `assertMay(actor,'registration.reject')` **first**, then 404/409/setStatus/audit, in one transaction. |
| **new** `courses/course-admin.service.ts` | `create(input, actor)`, `update(courseId, patch, actor)` | Both audited inside `db.runInTransaction`. `update` reads `before` **as a copy** before writing. 409 on a duplicate slug, checked before the write. |
| `staff/staff-scope.service.ts` | Internals only, per §4.4 | The 404 message becomes an exported `const` |
| `staff/staff.service.ts` | Delete `listCourseStaff`, `assign`, `unassign` and their imports. **`listCourses` is UNCHANGED** — it still reads `scope.assignments[].courseId/.assignedAt`. | R-4 satisfied upstream |
| `manage/manage.service.ts` | **UNCHANGED.** `coursesInScope` (`:115-126`) still reads `scope.assignments`. Verify, do not edit. | — |
| `manage/directory.service.ts` | `students()` emits `status` and accepts an optional `status` filter, passed through to `userRepo.findByRole` | Still no password hash in any shape |
| `groups/groups.service.ts` | `requireGroup(groupId, actor)` gains the actor and the `D-10` check; `get`/`members`/`addMember` pass it. One exported `const GROUP_NOT_FOUND`, used by **both** the miss and the out-of-scope throw. | `removeMember`'s `assertMay` stays the **first** statement (403 before anything is read) |
| `courses/courses.controller.ts` | Delete the `@Post(':id/enroll')` handler. **`CoursesService.enroll` stays.** | `PRODUCT_SPEC.md:47` |

> **Where `accept` lives, and why it is not a new module.** `ManageModule` already imports
> `CoursesModule` (which exports `CoursesService`), `AuthModule` and `EnrollmentsModule`, and
> `GROUP_REPOSITORY` is global. The service needs no new import edge, and `/admin/students` already
> lives on `AdminManageController` beside `DirectoryService`. A new module here would be ceremony.

### 4.4 Authorization — `StaffScopeService`'s new internals **[AMENDS original §3.7 and §4.4]**

```
assertAssigned(courseId, actor):
  admin (isUnscopedStaffRole)        -> null
  scope = assistantScopeRepo.findScope(actor.id)
  scope === null                     -> throw NotFound(COURSE_NOT_IN_SCOPE)   // fail closed
  scope === 'all_groups'             -> null
  held  = assistantScopeRepo.findAssignments(actor.id)
  onCourse = groupRepo.findByCourse(courseId)                                  // indexed, <= 10 rows
  reach = held.filter(h => onCourse.some(g => g.id === h.groupId))
  reach.length === 0                 -> throw NotFound(COURSE_NOT_IN_SCOPE)
  return { userId, courseId, assignedAt: MIN(reach.assignedAt),
           assignedBy: the assignedBy of that earliest row }

scopeFor(actor):
  admin                              -> { unscoped: true }
  scope === 'all_groups'             -> { unscoped: true }
  scope === null                     -> { unscoped: false, assignments: [] }   // fail closed
  held   = findAssignments(actor.id)
  groups = groupRepo.findByIds(held.map(h => h.groupId))
  group by courseId, one row per course, assignedAt = MIN(assigned_at)  (ruling R-4)
```

`CourseStaffAssignment` is renamed to **`StaffCourseReach`** and moves to
`staff/staff-scope.service.ts` (it is now a derived value, not a stored row). **Its member names do
not change** — `{ id?, userId, courseId, assignedAt, assignedBy }` — which is what keeps
`staff.service.ts` and `manage.service.ts` untouched. If `id` is dropped, check
`staff-scope.service.spec.ts:36-38` first: it asserts `courseId` and `userId` only.

**An `all_groups` assistant reads as `unscoped: true`.** That matches the union's own documentation
("Either every course, or an explicit list") and gives them `assignedAt: null` and
`manage.service`'s `scope: 'platform'` label — accurate, since their reach *is* the platform. Say so
in a comment; it is the one place the word "unscoped" stops meaning "admin".

#### The 21 call sites — 9 services, re-verified in the current tree **[AMENDS original §4.4's 22]**

`assertAssigned` (19): `announcements/announcements.service.ts:72,212` ·
`groups/groups.service.ts:264` (`requireCourse`, reached by `create` **and** `update`), `:371`
(`listForCourse`) · `manage/assessment-authoring.service.ts:227,232,253` ·
`manage/grading.service.ts:97,194` · `manage/manage-live-sessions.service.ts:66,76,89` ·
`manage/manage-recordings.service.ts:65,75,96` · `manage/manage.service.ts:183,249` ·
`manage/work-analytics-gate.service.ts:75,102`.

`scopeFor` (2): `manage/manage.service.ts:115` · `staff/staff.service.ts:70`.

**All 21 need no edit.** Verify them unchanged, by file and line, in `EXECUTION_NOTES.md`. The
original plan's count of 22 included `groups.service.ts:209,241` guarding `addCourse`/`removeCourse`,
which 2a deleted; `requireCourse` replaced both with one. **Do not treat 21 as a target to hit** —
re-run the grep and report what you find.

Sites deleted with their routes: `staff/staff.service.ts` `listCourseStaff`/`assign`/`unassign`
(they call `scope.listStaffForCourse`/`assign`/`findAssignment`/`unassign`, not `assertAssigned`).

#### 4.4.1 `staff-scope.service.spec.ts` — extend, and one permitted deletion

**The contract is the seven cases at `:35, :41, :49, :55, :71, :85, :92, :101(it.each ×2), :106`.**
They must pass **unmodified**. The only permitted edit is the `beforeEach` provider —
`{ provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository }` becomes the new
token pair plus `GROUP_REPOSITORY` — which is a fixture change, not a behaviour change.
**If any of the seven cannot pass without changing an assertion, stop and report. That is the
contract breaking.**

**`describe('assign and unassign')` (`:118-150`, four cases) is deleted**, because it tests
`StaffScopeService.assign`/`unassign`, methods this slice deletes along with
`/admin/courses/:id/staff` (`PHASE_PLAN.md` §3.3, ruled approved). Deleting a spec for a deleted
method is not weakening a boundary — but it **is** an edit beyond the fixture, so it is authorised
here, in writing, and it is the only one. Its two behavioural properties are replaced, not lost:

- *idempotent assignment* → moves to the `AssistantScopeRepository` contract, asserted in **both**
  drivers (unit + integration).
- *"grant access that `assertAssigned` immediately honours"* and *"revoke access on unassign"* →
  restated at the group grain in the new `staff-scope.service.spec` cases in §4.7.

### 4.5 Audit — four actions, three artifacts each

| Action | Target type | Union entry | `AUDIT_ACTION_VALUES` entry | Spec asserting the row |
|---|---|---|---|---|
| `student.accepted` | `student` (**new**) | ✓ | ✓ | `{before:{status:'waiting'}, after:{status:'active', groupId, courseId}}` |
| `student.rejected` | `student` | ✓ | ✓ | `{before:{status:'waiting'}, after:{status:'rejected'}}` — **`reason` is not `parentEmail`, but keep the payload minimal** |
| `course.created` | `course` (**new**) | ✓ | ✓ | `after` carries the created course; `before` is null |
| `course.updated` | `course` | ✓ | ✓ | `expect(entry.before).not.toEqual(entry.after)` — the `before` is a **copy**, read before the write |

> **Correction, 2b-i review finding `F2B-1` (coordinator ruling, 2026-09-20).** An earlier comment
> on `AuditTargetType` claimed `accept` *also* writes a `group.student_assigned` entry. **It does
> not, and it must not.** `student.accepted`'s `after` already carries `groupId` and `courseId`, so
> the placement is auditable under that one action; a second entry would be redundant **and** would
> mean routing through `GroupsService.addMember`, opening a nested transaction inside the one
> `accept` already holds. `accept` calls `GroupRepository.addMember` directly and writes exactly one
> entry. `group.student_assigned` is still written by the staff placement route — a different
> decision by a different actor.

`AUDIT_ACTION_VALUES` is `Record<AuditAction, true>`; a missing entry is a **compile error**, which
is the mechanism. `AuditService.record` throws outside a transaction — every one of these is inside
`db.runInTransaction`. `actorRole` comes from `actorRoleOf(actor)`, never a ternary.

`audit.service.spec.ts:198` (*"still accepts every retired action and target type as a filter"*)
must still pass with `course_staff_assignments` gone. Extend its list only if you retire something;
you are retiring nothing.

### 4.6 API layer

| Route | Controller |
|---|---|
| `POST /admin/students/:studentId/accept\|reject` | `manage/admin-manage.controller.ts` — already `@Controller('admin')` + `@Roles(...STAFF_ADMIN)` and already owns `GET /admin/students`. **No new controller.** |
| `POST /admin/courses`, `PATCH /admin/courses/:courseId` | **new** `courses/admin-courses.controller.ts`, `@Roles(...STAFF_ADMIN)`, registered in `CoursesModule`. It goes in the module that owns the aggregate, beside `CourseRepository`. |

`role-guards.spec.ts` (`:149` `toHaveLength(29)`, `:159` `Object.keys(EXPECTED)` 25, `:206`
6 admin controllers) must be **updated, not restructured**: −1 controller (`AdminStaffController`),
+1 (`AdminCoursesController`) — the totals happen to hold, and the `EXPECTED` map changes two
entries. Its enumerating shape is unit 1's mechanism and stays. A route-parity table exists in
`staff.e2e-spec.ts` too (2a's `D-5`); its count moves.

`docs/API_SPEC.yaml` delta: add the four paths; delete the three retired ones and note them as
404; amend `POST /auth/register`'s response; drop `StudyMode` and `mode` from `StudentSummary`/
`StudentWrite` (R-2); move `Assistant.scope` and `Assistant.groupIds` **into** `required` only if
something emits them — nothing does in this slice, so **leave them optional** (`API_SPEC.yaml:212`
already explains the rule).

### 4.7 Tests

**Unit** (memory driver)
- `auth.service.spec` — register creates `'waiting'` **explicitly** (assert the value passed to
  `create`, not just the result, so the column default cannot mask it); register returns no token;
  login refuses `waiting` **and** `rejected` with a message `===` the unknown-email message; exactly
  **one** `hasher.verify` call in all four paths (spy on the call count).
- `jwt.strategy.spec` (or the existing auth spec) — a valid token for a `rejected` user is refused.
- `registration-approval.service.spec` — accept activates + enrols + places, all three; accept on an
  `active` student → 409; accept with an unknown `groupId` → 404; accept with an unknown student →
  404; **an assistant is refused on reject with 403 and the capability message**; the audit rows.
- `course-admin.service.spec` — create; update; duplicate slug → 409; `before` is not an alias of
  `after`.
- `directory.service.spec` — the `status` filter returns only waiting accounts.
- `staff-scope.service.spec` — the **seven existing cases unmodified**, plus:
  - `all_groups` passes on any course **without any assignment row**;
  - `assigned_groups` holding a group on the course passes, and the returned `assignedAt` is the
    **earliest** of two held groups on that course (R-4);
  - `assigned_groups` holding a group on **another** course is refused;
  - an assistant with **no `assistant_scopes` row at all** is refused (fail closed) — both
    `assertAssigned` and `scopeFor`;
  - the out-of-scope message is `===` the genuine-miss message, in the same test;
  - granting a group makes `assertAssigned` honour it immediately; revoking it refuses again.
- `groups.controller.spec` — `D-10`, **both directions**: an `assigned_groups` assistant holding
  `group-1` reads `group-1` and its members; the same assistant gets **404** on `group-2`, with the
  message `===` a genuinely missing group id; an `all_groups` assistant reads both; an admin reads
  both. Plus: `addMember` into an unheld group → 404.
- **`groups.controller.spec`'s two `assistantId`-grants-nothing tests must still pass unmodified.**

**Authorization refusal tests — one per permission**

| Permission | Named test |
|---|---|
| accept a registration | *"an assistant is refused with 403 on POST /admin/students/:id/accept"* |
| reject a registration | *"an assistant is refused with 403 on POST /admin/students/:id/reject"* — plus the service-level `assertMay` refusal |
| create a course | *"an assistant is refused with 403 on POST /admin/courses"* |
| update a course | *"an assistant is refused with 403 on PATCH /admin/courses/:id"* |
| read an out-of-scope group (`D-10`) | *"an assigned_groups assistant gets 404 with the message identical to a genuine miss on GET /staff/groups/:groupId"* + the positive case |
| read an out-of-scope roster | *"…the same, on GET /staff/groups/:groupId/members"* |
| place a student in an out-of-scope group | *"…the same, on POST /staff/groups/:groupId/members"* |
| read an out-of-scope course | the existing *"404 with the identical message"*, still passing |
| self-enrol | *"POST /courses/:id/enroll no longer exists (404) for a student"* |
| sign in while waiting | *"a waiting account is refused at login with the byte-identical invalid-credentials message"* |
| act with a token minted before rejection | *"a token for a rejected account is refused on every route"* |

**Integration** (real PostgreSQL, from an empty schema)
- `applies migrations idempotently` still passes with **15** files.
- Post-conditions asserted directly against the database: after `014` — `users_waiting_idx` exists,
  `users_status_check` rejects `'pendng'`, the three profile columns exist and are nullable; after
  `015` — `course_staff_assignments` is **gone**, both indexes exist, `UNIQUE (user_id, group_id)` is
  enforced, and **every seeded assistant has an `assistant_scopes` row**.
- A named backfill test: seed a `course_staff_assignments` row before `015` (in the side-schema
  harness `013` established) and assert it becomes one `assistant_group_assignments` row per group
  on that course, carrying the original `assigned_at` and `assigned_by`.
- New `describe` blocks for `PostgresAssistantScopeRepository` (the same contract the memory driver
  is held to) and for the four changed repositories' new methods. The existing
  `describe('course staff assignments')` is **replaced**, not deleted quietly.

**e2e** — happy path and error case for each new route; all three retired routes answer 404; the
register → cannot-sign-in → accept → can-sign-in sequence end to end.

---

## 5. Files

### To create
`backend/src/database/migrations/{014_registration_and_student_profile,015_assistant_group_scope}.sql` ·
`backend/src/staff/interfaces/assistant-scope-repository.interface.ts` ·
`backend/src/staff/repositories/{in-memory,postgres}-assistant-scope.repository.ts` ·
`backend/src/manage/registration-approval.service.ts` + `.spec.ts` ·
`backend/src/manage/dto/registration.dto.ts` ·
`backend/src/courses/course-admin.service.ts` + `.spec.ts` ·
`backend/src/courses/admin-courses.controller.ts` · `backend/src/courses/dto/course.dto.ts` ·
`docs/phases/unit-2/EXECUTION_NOTES_2B.md`

### Expected to change
`backend/src/auth/{auth.service.ts,auth.service.spec.ts,jwt.strategy.ts,interfaces/user-repository.interface.ts,repositories/{in-memory,postgres}-user.repository.ts,role-guards.spec.ts}` ·
`backend/src/students/{interfaces/student-repository.interface.ts,repositories/{in-memory,postgres}-student.repository.ts,students.service.ts}` ·
`backend/src/courses/{courses.controller.ts,courses.module.ts,interfaces/course-repository.interface.ts,repositories/{in-memory,postgres}-course.repository.ts,courses.controller.spec.ts}` ·
`backend/src/groups/{groups.service.ts,staff-groups.controller.ts,groups.controller.spec.ts,interfaces/group-repository.interface.ts,repositories/{in-memory,postgres}-group.repository.ts}` ·
`backend/src/staff/{staff-scope.service.ts,staff-scope.service.spec.ts (EXTEND + the one authorised deletion),staff.service.ts,staff.module.ts,staff.controller.spec.ts}` ·
`backend/src/manage/{admin-manage.controller.ts,manage.module.ts,directory.service.ts,manage.controller.spec.ts}` ·
`backend/src/audit/{interfaces/audit-log-repository.interface.ts,dto/list-audit-log-query.dto.ts,audit.service.spec.ts}` ·
`backend/src/database/seeds/{001_development_fixtures,002_staff_fixtures}.sql` ·
`backend/test/{postgres-repositories.integration-spec.ts,app.e2e-spec.ts,staff.e2e-spec.ts}` ·
`frontend/lib/{types.ts,api.ts}` ·
`docs/{IMPLEMENTATION_PLAN.md,PHASE_ROADMAP.md,DATABASE_PLAN.md,DOMAIN_MODEL.md,API_SPEC.yaml,AUTHORIZATION_MODEL.md,SECURITY.md,CHANGELOG.md,PRODUCT_SPEC.md}` · `project_log.md`

**Ruling R-2's five documents, named so none is missed:** `IMPLEMENTATION_PLAN.md:112` ·
`DOMAIN_MODEL.md:33,36` · `DATABASE_PLAN.md` §6 bullet 1 · `PRODUCT_SPEC.md:117` ·
`API_SPEC.yaml:156,168,174,196,199`.

### To delete
`backend/src/staff/admin-staff.controller.ts` ·
`backend/src/staff/interfaces/course-staff-repository.interface.ts` ·
`backend/src/staff/repositories/{in-memory,postgres}-course-staff.repository.ts`

### NOT to touch, and why
- `backend/src/database/migrations/001`–`013` — **immutable**; the ledger records them by filename.
- `backend/src/manage/manage.service.ts`'s `coursesInScope` and `backend/src/staff/staff.service.ts`'s
  `listCourses` — they must come out of this slice **byte-identical**. That is the proof §0.1 worked.
- `backend/src/auth/{roles.enum.ts,staff-roles.ts,capabilities.ts,actor-role.ts}` — unit 1's boundary.
  `AUTH-2` changes *what* scope means, not *who* is unscoped, and `registration.reject` already exists.
- `staff-scope.service.spec.ts`'s seven contract assertions — §4.4.1.
- `frontend/app/**`, `frontend/components/**` — unit 4 deletes them.
- `database/schema.sql`, `database/seed.sql` at the repo root — not applied, design outline only.
- Anything `executor-unit2a-remediation` is still holding.

---

## 6. Sequencing

```
 0. Wait for the 2a remediation to commit; re-baseline all three suites.
 1. DOM-3+DOM-4 : 014 → user/student repos ×2 → auth.service + jwt.strategy
                  → registration-approval + routes → retire POST /courses/:id/enroll
                  → directory.status → audit (2 actions) → seeds 001/002 → lib mirror
 2. DOM-5       : course repo create/update ×2 → course-admin.service
                  → admin-courses.controller → audit (2 actions)
 3. AUTH-2      : assistant-scope interface + repos ×2 → GroupRepository.findByIds ×2
                  → StaffScopeService internals → verify the 21 call sites
                  → D-10 in GroupsService + staff-groups.controller
                  → delete StaffService's three methods + admin-staff.controller
                  → 015 (WRITTEN LAST) → seeds 002 → role-guards.spec
 4. DOM-6       : final seed pass + full integration run from an empty schema
 5. Docs        : the five R-2 amendments, API_SPEC, CHANGELOG, IMPLEMENTATION_PLAN, ROADMAP
```

**Load-bearing orders, and what breaks if reversed**

| Order | If reversed |
|---|---|
| The 2a remediation commits **before** 2b writes | Two agents editing `group.dto.ts`, `groups.service.ts`, `staff-groups.controller.ts` and `API_SPEC.yaml` produce a conflict nobody reviewed. |
| `014` **before** any code reading `users.status` | The column does not exist; every Postgres read 500s. |
| `StaffScopeService` rewritten and green **before** `015` is written | `DATABASE_PLAN.md:129-131`. Practically: `015` and its last caller land in the **same commit**, never a commit apart. |
| Seeds updated **in the same step** as each migration | `postgres-repositories.integration-spec.ts:57-58` seeds inside the migration `beforeAll`; `seeds/002:25` names `course_staff_assignments`. The gate fails at setup, which is the gate failing. |
| `jwt.strategy` status gate **with** the login gate | A gate in `login` alone leaves every already-issued token valid for a rejected account. |
| `lib/types.ts` in the **same step** as the response change | `lib/` stops being the 0-error island. |

---

## 7. Definition of Done

1. Each change in the layer `ARCHITECTURE.md` §6 names — no rule in a controller or repository.
2. **`014` and `015` both run against real PostgreSQL 15 from an empty schema**, with the pasted
   output and the three backfill row counts in `EXECUTION_NOTES_2B.md`.
3. Both drivers for `assistant_scopes` + `assistant_group_assignments`; both drivers updated for
   `users`, `student_profiles`, `courses`, `groups`.
4. A `class-validator` DTO on every new body; **no `@IsOptional()` on a `NOT NULL` column** —
   `@IsOptionalNotNull()` instead; no undeclared field accepted.
5. Authorization in the service, not only `@Roles` — verified at all 21 `StaffScopeService` sites,
   listed by file and line in the notes.
6. Four new audit actions, each with a union entry + an exhaustive `Record` entry + a spec asserting
   the row. **Three retired members untouched**, and `audit.service.spec.ts:198` still green.
7. Every refusal test in §4.7 named and passing, **in both directions**.
8. 404-with-identical-message (course **and** group), 409-on-conflict, and not-found covered.
9. n/a — no screen ships; the mirror is updated instead.
10. `API_SPEC.yaml` matches: four paths added, three deleted, register's response amended,
    `StudyMode`/`mode` removed (R-2).
11. The commands below.
12. n/a.
13. `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `CHANGELOG.md`, `DATABASE_PLAN.md`,
    `DOMAIN_MODEL.md`, `AUTHORIZATION_MODEL.md`, `SECURITY.md`, `PRODUCT_SPEC.md`, `project_log.md`.

**Exact commands and expected results**

```
npm test --workspace=backend                    # >= 471 passing, 0 failing, 0 skipped
npm run test:e2e --workspace=backend            # >= 217 passing
docker compose up -d postgres
docker exec tahirelshazli-db psql -U dev -d postgres \
  -c "DROP DATABASE IF EXISTS lms_migtest_u2b;" -c "CREATE DATABASE lms_migtest_u2b;"
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest_u2b \
  npm run test:integration --workspace=backend  # ALL 15 migrations from nothing; > 87 passing; 0 skipped
npm run lint                                    # exit 0 (one PRE-EXISTING warning: dashboard.controller.spec.ts:17)
cd frontend && npx tsc --noEmit 2>&1 | grep -cE "^lib/"    # exactly 0   <-- path-anchored
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"  # report the number and the delta per cause
```

A skipped integration suite is a **failure**, not a pass. Take a `pg_dump` of the dev database before
`015`'s first run.

---

## 8. Blockers and decisions required

### B-1 — What does `POST /auth/register` return now? **One line from the user; does not block the slice.**

**Question.** A registered account is `waiting` and cannot sign in. Does register still return an
`accessToken` and a `user`?

**Reading A — no token.** Return `{ status: 'waiting' }` (201). A token that authenticates an
account which `login` refuses is an authentication bypass today, because `JwtStrategy.validate`
(`jwt.strategy.ts:34-51`) checks the denylist, the password cutoff and existence — **not status**.
**Reading B — keep the token**, and rely on the `JwtStrategy` status gate to make it inert.

**Impact.** A: `frontend/lib/{api,types}.ts`'s register signature changes, and the sign-up screen
must show a "waiting for approval" state instead of navigating to the dashboard (unit 4's problem,
recorded). B: no mirror change, but the API hands out a credential that authenticates nothing, which
is a thing someone will later "fix" by removing the gate.

**Blocks.** `DOM-4`'s register path only — one function and one mirror line either way.

**My reading, labelled an assumption.** **Reading A.** `DOMAIN_MODEL.md:23` says only `active` may
authenticate; issuing a token for an account that may not authenticate contradicts it in the API's
own response body. **The `JwtStrategy` status gate is built either way** — it is the root-cause fix
and it also covers a token minted before a rejection.

### B-2 — Does an `all_groups` assistant read as `unscoped: true`? **Proceeding; recorded for the reviewer.**

**Question.** `scopeFor` returns `{unscoped:true}` for an `all_groups` assistant, which makes
`manage.service` label their overview `scope: 'platform'` and `staff.service` return
`assignedAt: null`.

**Reading A (taken).** Yes. The union documents itself as "every course, or an explicit list", and an
`all_groups` assistant genuinely has no restriction. Zero changes to two consumers.
**Reading B.** Keep them scoped and enumerate every course, so the response can still say "assigned".

**Impact.** Cosmetic only — a label and a nullable timestamp on two staff screens that unit 5
rebuilds. No authorization difference: `all_groups` means all groups under either reading.

**Assumption.** Reading A, with a comment at the union saying `unscoped` now means "unrestricted",
not "admin". Flagged so a one-word correction is cheap.

### B-3 — Deleting four cases from `staff-scope.service.spec.ts`. **Ruled in §4.4.1; raising it, not asking.**

The brief says the spec is *extended, never edited*, and that a case which cannot pass unmodified
stops the work. Four cases test `assign`/`unassign` — methods the coordinator's own approved plan
deletes with `/admin/courses/:id/staff`. §4.4.1 authorises **that deletion and no other**, and names
the replacements. **If the coordinator disagrees, `AUTH-2` stops until it is resolved** — but the
alternative is keeping two methods and three routes the plan retires.

### Not blockers — settled from the documents

| Question | Settled by |
|---|---|
| May a `waiting` or `rejected` account sign in? | **No.** `DOMAIN_MODEL.md:23,25`. |
| Who may reject? | Teacher/admin. `capabilities.ts:23-42`, `AUTHORIZATION_MODEL.md` §3. |
| Is `students.mode` built? | **No.** Ruling **R-2**. |
| `StaffCourseSummary.assignedAt`? | `MIN(assigned_at)`. Ruling **R-4** — satisfied by §0.1. |
| Are the staff group **writes** scoped, or only the reads? | Both. `AUTHORIZATION_MODEL.md:207`: *"Any assistant-facing read/write → group scope → 404"*. `D-10` names the reads because that is where the leak was found. |
| Where does scope **editing** live? | `PATCH /admin/assistants/{userId}`, unit 5. |
| Regenerate or migrate the seeds? | **Regenerate.** `D-5`. |

---

## 9. Risks, ranked

| # | Risk | How it shows up | Detect early by |
|---|---|---|---|
| R-1 | **The 2a remediation and 2b edit the same files concurrently.** | A silent merge conflict, or 2b reintroducing `@IsOptional()` on a `NOT NULL` column the remediation just fixed. | Do not write until it commits. Then `git log --stat` its range and read `group.dto.ts`, `groups.service.ts`, `staff-groups.controller.ts` and `API_SPEC.yaml` **before** touching them. |
| R-2 | **The `StaffScopeService` rewrite passes its spec but changes the message by a byte.** | Nothing fails loudly; the anti-enumeration property quietly dies. | One exported `const` for each of the two messages, and an `===` assertion between the out-of-scope and genuine-miss paths **in the same test**, for the course **and** the group. |
| R-3 | **`users.status DEFAULT 'active'` leaks into `register`.** | The waiting queue is always empty — a **silent authorization hole**. | Assert the value **passed to `userRepo.create`**, not only the row that comes back, plus an e2e proving a fresh registration cannot sign in. |
| R-4 | **The `JwtStrategy` gate is forgotten**, so a rejected account keeps working until its token expires. | Nothing fails; the account simply still works. | The named test *"a token for a rejected account is refused on every route"*. |
| R-5 | **Seeds go stale and the migration gate stops being a gate.** | `beforeAll` errors — or worse, the suite skips and CI's zero-test guard is the only thing standing. | Run the integration suite immediately after `014` alone, before any `015` work. |
| R-6 | **`015` is committed beside an un-migrated caller.** | The whole backend 500s on every `/staff` route, and the drop cannot be undone in the dev database. | `pg_dump` first; write `015` last; same commit as its final caller. |
| R-7 | **A retired audit member is deleted "for tidiness".** | `GET /admin/audit-log?action=course_staff.assigned` answers **400**; history becomes unreachable. | `audit.service.spec.ts:198` already guards it. Do not edit that spec. |
| R-8 | **`accept` is not one transaction** — activation commits, enrolment does not. | A student is `active`, in a group, and enrolled on nothing: every course read 404s and nobody can see why. | One `db.runInTransaction`, and a test that forces the enrol step to throw and asserts the status is unchanged. |
| R-9 | **`parentEmail` or `staffNotes` leaks into a student-facing response.** | A child reads a staff note about themselves, or a parent's address is exposed. | Assert the exact key set of `GET /students/me` and the dashboard payloads. |
| R-10 | **The slice is oversized and lands as one unreviewable diff.** | The reviewer cannot examine the destructive drop under 3,000 lines of registration plumbing. | §10. |

---

## 10. Size assessment — **recommend a second split**

Measured against the current tree, not estimated:

| Dimension | 2a (landed) | 2b (planned) |
|---|---|---|
| Migrations | 2 | 2 |
| Destructive | 2 (one one-way) | 1 (`DROP TABLE course_staff_assignments`) |
| New tables → repository implementations | 0 | **2 tables → 2 files, one interface** |
| Changed tables → touched drivers | 2 → 4 | **4 → 8** |
| New services / controllers | 0 / 0 | **2 / 1** (+2 routes on an existing one) |
| Deleted services / controllers / interfaces | 1 / 0 / 1 | **0 / 1 / 1** (+2 driver files) |
| New audit actions (× 3 artifacts) | 1 | **4 (= 12)** |
| Routes added / retired | 0 / 2 | **4 / 3** |
| Authorization-contract files | 0 | **1 (`StaffScopeService`) + 21 call sites** |
| Files touched | 56 | **~55** |

2b is the same size as 2a. 2a was tractable and still returned **nine findings** on
`APPROVED WITH FOLLOW-UP`.

### Proposed boundary — and it is again a migration gate

| Slice | Tasks | Migration | Exit |
|---|---|---|---|
| **2b-i — people and courses** | `DOM-3`, `DOM-4`, `DOM-5`, seeds `001`/`002` for `014` | `014` (additive) | All suites green; 15→14 migrations from an empty schema; `lib/` at 0; the waiting queue works end to end |
| **2b-ii — scope** | `AUTH-2` + `D-10`, final `DOM-6` | `015` (destructive) | Integration green from an empty schema; `course_staff_assignments` referenced nowhere; the seven contract cases passing unmodified |

**Why here.**
1. **`014` is additive and `015` is destructive.** Putting the only irreversible drop in this unit
   into its own review is the same reasoning that produced the 2a/2b split, and it worked.
2. **`AUTH-2` is the only item carrying an authorization contract.** The seven unmodified spec cases,
   the two byte-identical messages, 21 call sites and `D-10`'s both-directions refusal tests deserve
   a reviewer's whole attention, not attention divided with registration plumbing.
3. **They share almost no files.** 2b-i touches `auth/`, `students/`, `courses/`, `manage/`;
   2b-ii touches `staff/`, `groups/`. The overlap is `seeds/002`, `role-guards.spec.ts`, the audit
   union and `API_SPEC.yaml` — four files, all additive on one side.
4. **Nothing is double-handled.** `AUTH-2` needs nothing from `014`; `DOM-3`/`DOM-4`/`DOM-5` need
   nothing from `015`.

**If the coordinator rules "one pass anyway":** this plan stands unmodified — §6's five steps are
already the commit sequence and each is independently green. The cost is one large review, and
`015` still must not be committed beside an un-migrated caller.

---

## 11. Citations re-verified after the concurrent edits

Re-read in the **current working tree** (i.e. after `executor-unit2a-remediation`'s uncommitted
changes), as the brief required, immediately before this plan was written:

| Citation | State found |
|---|---|
| `backend/src/groups/staff-groups.controller.ts:30-49` | **Already rewritten.** The class doc now cites `D-10`, names the dead premise, says `AUTH-2` implements it and that the check belongs in `GroupsService`. My §4.3 follows it rather than contradicting it. |
| `backend/src/groups/dto/group.dto.ts` | Now imports `IsOptionalNotNull` (`:13`) and uses it at `:88,94`. **The mechanism for every new DTO in 2b is `@IsOptionalNotNull()` from `backend/src/common/validators/is-optional-not-null.ts`** (new, untracked). |
| `backend/src/groups/groups.service.ts` — `assertAssigned` sites | **Moved** to `:264` (`requireCourse`) and `:371` (`listForCourse`). The original plan's `:209,241,364` are stale. |
| `backend/src/reports/reports.service.ts:57` | Orphaned `GroupDataModule`/learning-mode comment **removed** (review F-7 closed). |
| `backend/src/manage/manage.service.ts:94` | Same comment **removed**; `:94` is now the `COURSE_REPOSITORY` injection, unannotated. `scopeFor` is at `:115`. |
| `backend/src/courses/courses.controller.spec.ts:73-82` | Block comment **corrected** (review F-6 closed); it now says the recordings-and-no-sessions direction is not covered. |
| `docs/API_SPEC.yaml` `Group` / `GroupWrite` / `GroupPatch` | At `:254`, `:276`, `:288`. `Group.required` is still `[id, name, courseId, memberCount]` — **review F-4's `memberCount`-on-write drift may or may not be closed yet**; the executor re-checks before amending the file. |

Citations outside those files are from the committed tree at `4e11a69` and are stable.

---

## 12. What I could not verify

- **Neither `014` nor `015` has been run.** They are not written. Every one of `001`–`008` found
  something on its first real run, and `013`'s second abort path was found by writing it.
- **I started no container and ran no suite.** The 471/217/87 baseline is the coordinator's and the
  2a reviewer's, quoted.
- **The 2a remediation is unfinished.** Its final diff may move a line I cited in §11. The executor
  re-reads those seven files before touching them.
- `pgcrypto` / `gen_random_uuid()` availability is **assumed, not checked** — §4.1 avoids it.
- I did not verify whether review **F-4** (`memberCount` absent from the two group **write**
  responses) has been closed; it is the remediation's item, not mine.
