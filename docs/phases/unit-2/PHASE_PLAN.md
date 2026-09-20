# Phase plan — unit 2: Domain reshaping

**Planner:** `redesign-planner` · **Date:** 2026-09-20 · **Branch:** `redesign` · **Base:** `26b9ccb`
**Input artifacts read:** `PHASE_ROADMAP.md` §4 (unit 2), `IMPLEMENTATION_PLAN.md` Phase 2 +
Definition of Done, `DATABASE_PLAN.md` §3–§9, `DOMAIN_MODEL.md`, `AUTHORIZATION_MODEL.md` §2,
`PRODUCT_SPEC.md` §1.1/§3.1/§3.2, `API_SPEC.yaml`, `CHANGELOG.md` (`D-4`, `D-5`, `D-9`, the
`AUTH-2` re-homing), `docs/phases/unit-1/PHASE_PLAN.md` §8, and the code named throughout.

---

## 0. Headline — read this before §1

Three findings change the shape of this unit, and all three are recorded below with citations:

1. **This unit is too large for one safe pass.** It carries four migrations (not three), three new
   tables' worth of repository work, the project's one destructive one-way migration, and a
   frontend-visible response-shape change. **Recommended split into 2a / 2b at an explicit
   boundary — §10.**
2. **`D-9` added a migration that the numbering plan predates.** `DATABASE_PLAN.md` §7 was written
   before `DOM-0` existed and assigns `012` to `users.status`. `DOM-0` must be **first** and `011`
   is immutable, so `012` becomes `DOM-0` and everything below shifts one. §4.1 gives the new table
   and the exact doc lines to amend.
3. **The seed fixtures are not a tail task.** `postgres-repositories.integration-spec.ts:57-58`
   calls `runner.seed()` inside the same `beforeAll` as `runner.migrate()`, and
   `seeds/003_group_fixtures.sql:32` inserts `group_courses (…, learning_mode, …)`. **The moment
   `012` drops the column the entire 81-test integration suite fails at setup** — which is the
   migration gate itself. `DOM-6` must land *in lock-step with each migration*, not after `DOM-1…4`
   as `IMPLEMENTATION_PLAN.md:114` sequences it.

---

## 1. Scope

### IN — ordered

| # | Task | Why here |
|---|---|---|
| 1 | **`DOM-0`** retire `learning_mode` | `D-9`; must precede `DOM-1` so the destructive migration lands on a simplified model |
| 2 | **`DOM-1`** collapse `group_courses` → `groups.course_id` | The critical path; gates `AUTH-2`, `SESS-1`, `RPT-*` |
| 3 | **`DOM-2`** `groups` gains `assistant_id`, `meets`, `room` | Same table, same migration as `DOM-1` |
| 4 | **`DOM-3`** `student_profiles` gains `school_name`, `parent_email`, `staff_notes` | Independent of 1–3; **`mode` is struck — see B-1** |
| 5 | **`DOM-4`** `users.status`, accept/reject, `enroll` becomes staff-only | Independent of 1–3 |
| 6 | **`AUTH-2`** course scoping → group scoping | Needs `groups.course_id` from step 2 |
| 7 | **`DOM-5`** course CRUD | Independent; smallest item in the unit |
| 8 | **`DOM-6`** regenerate seeds | **Continuous, per migration** — not a tail task (§0.3) |

### OUT, and why

| Not in scope | Reason |
|---|---|
| `SESS-1`/`SESS-2` (sessions re-parent to group, attendance enum) | Unit 8. `DATABASE_PLAN.md` §4.4 is tempting to fold in while `groups.course_id` is fresh; it is a different unit's boundary (`CLAUDE.md` §12 "do not expand scope"). |
| `AUTH-4` assistant invitations | Unit 5 — needs `MAIL-1` (unit 3). `IMPLEMENTATION_PLAN.md:91`. |
| `PEOPLE-1`…`PEOPLE-4` (the directory, waiting-queue and assistant-scope **screens**) | Unit 5. `DOM-4` ships the two routes and the column; the console screens that consume them are `PEOPLE-1`. |
| `PATCH /admin/assistants/{userId}` (scope editing route) | Unit 5 `PEOPLE-4`. `AUTH-2` creates the *tables* and the *enforcement*; the admin route that edits scope is already owned by `API_SPEC.yaml:597`. Building an interim route here would be a route unit 5 replaces. **Consequence, stated: between this unit and unit 5 the only way to give an assistant a group is the seed fixture or SQL.** Acceptable — there is no production deployment, and `DOM-6` regenerates the fixtures anyway. |
| `SPEC-16` / `SPEC-17` | Phase 0 filings, `[ ]` open, not unit-2 scope. |
| Frontend screens | `lib/types.ts` + `lib/api.ts` **are** in scope for the `DOM-0` contract change (§4.6); no `app/` or `components/` work — unit 4 deletes that code (`CLAUDE.md` §4.1). |
| `students.mode` / `StudyMode` / the conditional CHECK | Struck by `D-4` (`CHANGELOG.md:488-499`). See **B-1**. |

---

## 2. Entry criteria — verified

| Criterion | Evidence |
|---|---|
| Branch `redesign`, `git status` inspected | `git rev-parse --abbrev-ref HEAD` → `redesign`; `git status --porcelain` → empty; HEAD `26b9ccb` |
| Every dependency unit `[x]` | Unit 1 `[x]` (`PHASE_ROADMAP.md:143`); unit 0's gate `SPEC-12` `[x]` (`IMPLEMENTATION_PLAN.md:66`) |
| Backend suite green at start | Coordinator: `npm test --workspace=backend` → **467 passed, 28 files** |
| Migration gate closed | `SPEC-12`: 11 migrations from an empty schema, 81/81 integration (`PHASE_ROADMAP.md:118-131`) |
| Highest applied migration | `ls backend/src/database/migrations/` → `011_full_admin_role.sql`. **`011` is immutable.** |
| No open blocker gates a task in scope | `IMPLEMENTATION_PLAN.md` §Decisions: all nine `D-*` closed 2026-09-20. Two *new* questions are raised by this plan as B-1/B-2 (§8); neither blocks a whole task. |
| Frontend typecheck | ~301 errors, all in code unit 4 deletes — expected, `CLAUDE.md` §4.1. **Not a gate for this unit**, but `lib/` must stay at 0 (unit 1 established that). |

---

## 3. Reconciliation

### 3.1 Features that REMAIN — do not touch

| Feature | Citation |
|---|---|
| `StaffScopeService`'s **public interface, admin bypass, and 404-with-identical-message** | `staff/staff-scope.service.ts:76-93`; contract asserted by `staff-scope.service.spec.ts:55` |
| `CoursesService.enroll` — the *service method* | `courses/courses.service.ts`; `PRODUCT_SPEC.md:47` "Acceptance calls the existing `CoursesService.enroll` rather than replacing it" |
| Assessment targeting **stays multi-group** | `PRODUCT_SPEC.md:92`; `DOMAIN_MODEL.md:256` `Assessment ──< AssessmentTarget >── Group` |
| `StudentGroupsService`'s **tie-break rule** (longest-standing placement wins) | `groups/student-groups.service.ts:8-23`; `DOMAIN_MODEL.md:89-90`. The rule survives; only the row type it returns changes. |
| `Enrollment` remains the access gate | `DOMAIN_MODEL.md:98-100` |
| `GroupMembership` (`groupId`, `studentId`, `assignedBy`, `assignedAt`) | `groups/interfaces/group-repository.interface.ts:47-56` — untouched by this unit |
| Assistants may **add** to a group but not **remove** | `AUTH-3`, shipped; `staff-groups.controller.ts:108-109` `@Roles(...STAFF_ADMIN)` with a **403** |
| `actorRoleOf` for every audit `actorRole` | `auth/actor-role.ts`; unit 1 |
| Audit `before` must be a copy, never an alias | `CLAUDE.md` §9 — applies to every new audited action below |

### 3.2 Features CHANGED

| Feature | Old | New | Delta |
|---|---|---|---|
| Course progress response | Discriminated union `RecordedProgress \| LiveProgress` (`courses.service.ts:23-48`), branched at `:120` | **One shape** carrying completion **and** attendance | `D-9`, `CHANGELOG.md:574-578`. **Frontend-visible** — `frontend/lib/types.ts:57-81` mirrors it. |
| Group ⇄ course | `group_courses` join table (`006_groups.sql:67`), `GroupCourse` entity (`group-repository.interface.ts:37`) | `groups.course_id NOT NULL` | `DOM-1`; `PRODUCT_SPEC.md:139`. **Destructive, one-way.** |
| Group fields | `id, name, teacher_id, created_at` (`group-repository.interface.ts:14-19`) | `+ course_id, assistant_id?, meets?, room?` | `DOM-2`; `DOMAIN_MODEL.md:83-84` |
| Assistant scope | `course_staff_assignments` (`002_staff_and_audit.sql:17-36`) | `assistant_scopes` + `assistant_group_assignments` | `AUTH-2`; `AUTHORIZATION_MODEL.md:60-70` |
| `POST /courses/:id/enroll` | `@Roles(Role.Student)`, self-enrol (`courses.controller.ts:23,26,58`) | Retired from the student surface; enrolment happens via accept | `PRODUCT_SPEC.md:41-49`. **The service method stays.** |
| Login | No status check (`auth/auth.service.ts:107-123`) | Only `active` may authenticate | `DOMAIN_MODEL.md:23` |
| Register | Creates a usable student (`auth.service.ts:77-100`) | Creates `status = 'waiting'` | `DOMAIN_MODEL.md:26` |
| `PATCH /admin/groups/:groupId` | Rename only (`admin-groups.controller.ts:78`, audit `group.renamed`) | Full `GroupWrite` — name, course, assistant, meets, room | `API_SPEC.yaml:667-681` |

### 3.3 Features REMOVED — and what must stop referencing them

| Removed | Who still references it |
|---|---|
| `enrollments.learning_mode` | already gone (`007_learning_mode_moves_to_the_group.sql:31`); only comments remain (`enrollment-repository.interface.ts:10-15`, `in-memory-enrollment.repository.ts:8`) |
| `courses.default_learning_mode` | `003_course_catalog.sql:23`; `course-repository.interface.ts:45`; `postgres-course.repository.ts:20,37,192`; `in-memory-course.repository.ts:17,66`; `courses.service.ts:227`; `public-courses.service.ts:41,120`; `learning-mode.service.ts:99-101` |
| `group_courses.learning_mode` | `006_groups.sql:82`; `postgres-group.repository.ts:27,43,62,140,143-144,149,235`; `in-memory-group.repository.ts:47,55`; `group-repository.interface.ts:37`; `groups.service.ts:205,217,228,258`; `group.dto.ts:59-61`; `admin-groups.controller.ts:106` |
| `LearningModeService` (whole file) | `app.module.ts:45` (comment); `group-data.module.ts:2,28,39,45`; `groups.module.ts:14,26`; `courses.service.ts:15,108,189,261,291`; `dashboard.service.ts:14,79,94-96,110,131`; `manage.service.ts:19,98,206,239`; `reports.service.ts:12,59,162-169`; plus doc comments at `assessment-repository.interface.ts:196`, `in-memory-assessment.repository.ts:335`, `postgres-assessment.repository.ts:194` |
| `LearningMode` type | `enrollment-repository.interface.ts:1` (declaration) + every import above |
| `group_courses` table | `postgres-group.repository.ts:43,140,158,174,237`; `in-memory-group.repository.ts:93,142,153,158,164,169,175,230`; `seeds/003_group_fixtures.sql:32`; `postgres-repositories.integration-spec.ts:221` |
| `course_staff_assignments` table + `CourseStaffRepository` | `staff/interfaces/course-staff-repository.interface.ts`; `staff/repositories/{in-memory,postgres}-course-staff.repository.ts`; `staff-scope.service.ts:4-7,52,84,104,120,132,136,140`; `staff.service.ts:70,88,110,165,213,220`; `admin-staff.controller.ts` (3 routes); `postgres-repositories.integration-spec.ts:778` |
| `GET/POST/DELETE /admin/courses/:courseId/staff` | `admin-staff.controller.ts:27,32,39,52` — **retired**, no replacement in this unit (§1 OUT) |
| `POST /admin/groups/:groupId/courses`, `DELETE …/courses/:courseId` | `admin-groups.controller.ts:95,110` — a group's course is now a `GroupWrite` field |
| Spec-only: `LearningMode` schema, `StudyMode` schema | `API_SPEC.yaml:156,157` |

**Audit trap — inherited, do not get this wrong.** Retiring a table does **not** retire its audit
history. **Keep in the union, unused:** `course_staff.assigned`, `course_staff.unassigned`
(`audit-log-repository.interface.ts:18-19`), `group.course_added`, `group.course_removed`
(`:43-44`), `group.renamed` (`:42`); and in `AuditTargetType`: `course_staff_assignment` (`:87`),
`group_course` (`:95`). `ListAuditLogQueryDto`'s `AUDIT_ACTION_VALUES: Record<AuditAction, true>`
(`audit/dto/list-audit-log-query.dto.ts:26`) is built from the union — **removing a member makes
every historical row of that action unfilterable with a 400.** Add a comment at each retired member
saying the table is gone and the member is deliberately retained.

### 3.4 Features NEW — full stack needed

| Feature | Backend today |
|---|---|
| `users.status` + the waiting queue | none |
| `POST /admin/students/:id/accept`, `…/reject` | none (`API_SPEC.yaml:497,527` is target-only) |
| `assistant_scopes`, `assistant_group_assignments` | none |
| Course CRUD (`POST /admin/courses`, `PATCH /admin/courses/:id`) | **none** — `CourseRepository` has no `create`/`update`; there is no admin courses controller (verified: `ls backend/src/*/[a-z]*controller.ts` — 26 controllers, none is `admin-courses`) |
| `student_profiles.school_name / parent_email / staff_notes` | none |
| `groups.assistant_id / meets / room` | none |

### 3.5 APIs

**To add**

| Method | Path | DTO | Response | Status |
|---|---|---|---|---|
| `POST` | `/admin/students/:studentId/accept` | `{ groupId: string }` (`@IsString @IsNotEmpty`) | `StudentDetail` | 200 · 404 · 409 |
| `POST` | `/admin/students/:studentId/reject` | `{ reason?: string }` (`@IsOptional @MaxLength(500)`) | 200, no body | 200 · 403 · 404 · 409 |
| `POST` | `/admin/courses` | `CreateCourseDto` — `title`, `description?`, `thumbnailUrl?`, `teacherName`, `sequentialLockEnabled?` | `Course` | 201 |
| `PATCH` | `/admin/courses/:courseId` | `UpdateCourseDto` (all optional, COALESCE-per-column) | `Course` | 200 · 404 |

**To modify**

| Route | Change | Breaking for `lib/api.ts`? |
|---|---|---|
| `GET /courses`, `GET /courses/catalog`, `GET /courses/:id` | `progress` union collapses; `learningMode` field removed | **YES** — `lib/types.ts:57-81,89-90,111` |
| `GET /dashboard/*` | `learningMode` removed from the response (`dashboard.service.ts:57,131`) | **YES** — `lib/types.ts:273-275` |
| `GET /staff/courses/:courseId/roster` | per-student `learningMode` removed (`manage.service.ts:53,239`) | **YES** — `lib/types.ts:440` |
| `GET /reports/:courseId/summary` | `progress` collapses (`reports.service.ts:169`) | **YES** — `lib/types.ts:323` |
| `GET /public/courses*` | `learningMode` removed (`public-courses.service.ts:41,120`) | **YES** — `lib/types.ts:657,688` |
| `POST /admin/groups`, `PATCH /admin/groups/:groupId` | body becomes `GroupWrite` minus `learningMode`, plus `courseId`, `assistantId?`, `meets?`, `room?` | yes (`lib/api.ts:834`) |
| `POST /courses/:id/enroll` | retired from the student surface | yes |

**To retire:** `POST /courses/:id/enroll` · `GET|POST /admin/courses/:courseId/staff` ·
`DELETE /admin/courses/:courseId/staff/:userId` · `POST /admin/groups/:groupId/courses` ·
`DELETE /admin/groups/:groupId/courses/:courseId`.

### 3.6 Domain changes

`Group` gains `courseId` (required), `assistantId?`, `meets?`, `room?`; loses nothing.
**`GroupCourse` is deleted as an entity.** `User` gains `status`. `StudentProfile` gains
`schoolName?`, `parentEmail?`, `staffNotes?`. `CourseStaffAssignment` is deleted; `AssistantScope`
and `AssistantGroupAssignment` replace it. `Course` loses `defaultLearningMode`.

### 3.7 Authorization changes

| Change | Rule |
|---|---|
| `StaffScopeService.assertAssigned(courseId, actor)` | **Signature and behaviour unchanged.** Internals become: admin → pass; else `scope = 'all_groups'` → pass; else `EXISTS (assistant_group_assignments a JOIN groups g ON g.id = a.group_id WHERE a.user_id = $1 AND g.course_id = $2)`. **404 with the byte-identical message `'Course not found or not assigned to you'`** (`staff-scope.service.ts:88`). |
| `scopeFor(actor)` | Returns `{unscoped:true}` or `{unscoped:false, groupIds, courseIds}`. **This one member of the interface does change** — `assignments: CourseStaffAssignment[]` names a dropped table. See §4.4 for the one caller. |
| `POST /courses/:id/enroll` | student → **retired** |
| `POST /admin/students/:id/accept` | `@Roles(...STAFF_ADMIN)` — teacher/admin |
| `POST /admin/students/:id/reject` | `@Roles(...STAFF_ADMIN)` — **a withheld verb**; assistants get **403**, not 404 (`capabilities.ts:99` — the resource is on the caller's own screen) |
| `POST|PATCH /admin/courses` | `@Roles(...STAFF_ADMIN)` |
| Login | `status !== 'active'` → refused |

### 3.8 Security implications — `CLAUDE.md` §8, item by item

| Item | Touched? | What the executor must check |
|---|---|---|
| Authentication | **yes** | Login gains a status gate. **The refusal must reuse the existing `UnauthorizedException('Invalid credentials')` message and must still run exactly one `verify` against `DUMMY_PASSWORD_HASH`** (`auth.service.ts:109-117`) — a distinct "your account is pending" message and an early return both turn login into a registration oracle and break the timing equalisation. |
| Authorization / object-level | **yes** | The chokepoint is rewritten. Every one of the **22 call sites** must still route through it (§4.4). |
| Input validation | **yes** | New DTOs: accept, reject, course create/update, `GroupWrite`, student profile fields. `@MaxLength` on every free-text field (`staffNotes` ≤ 4000, `meets` ≤ 120, `room` ≤ 80, `reason` ≤ 500 — `API_SPEC.yaml:204-208,262-263`). |
| Output filtering | **yes** | `staffNotes` is **never** in a student-facing response (`DOMAIN_MODEL.md:35`). `parentEmail` is staff-only. |
| Sensitive-data exposure | **yes** | `parentEmail` is a third party's PII on a child's record. Never logged. |
| Error leakage | **yes** | Accept/reject on an unknown student: 404, one message. |
| SQL injection | **yes** | Four migrations and ~6 rewritten repository methods. Parameterised only; `COALESCE`-per-column for `UPDATE`, never a string-built `SET` (the pattern already asserted at `postgres-repositories.integration-spec.ts:1188`). |
| Audit logging | **yes** | 4 new actions (§4.5), each costing three things. |
| Rate limiting / brute force | no change | Register and login keep their limiters. |
| Environment config | **yes** | `resolveAutoSeed` still refuses production; regenerated seeds still carry a published hash. |
| CSRF · CORS · XSS · upload · path traversal · SSRF · secrets · dependencies | **not touched** | No new upload path, no new external call, no new dependency, no `dangerouslySetInnerHTML`. |

### 3.9 Frontend/backend dependencies

Nothing in this unit ships a screen. The only frontend work is the **mirror**: `lib/types.ts` and
`lib/api.ts` must be updated in the same change as the response shape, or `lib/` stops being the
0-error island unit 1 established. Do not touch `app/` or `components/` — unit 4 deletes them.

### 3.10 Architectural risks

| Strain | Where |
|---|---|
| `GroupDataModule` is one of only three `@Global()` modules (`CLAUDE.md` §5) and `D-9` removes half its reason to exist (`CHANGELOG.md:587-588`) | After `LearningModeService` is deleted it exports `GROUP_REPOSITORY` + `StudentGroupsService`. **Re-examine, and record the answer** — `groups.module.ts:14-26` documents a real import cycle (`CoursesModule` ⇄ `GroupsModule`) that the global module exists to break. Do not remove it without proving the cycle is gone. Recommendation: keep it, delete the stale comments, note the reason in one line. |
| `AUTH-2` adds two tables → **four** repository implementations | Not one. `CLAUDE.md` §9. |
| `GroupCourse` deletion ripples into `StudentGroupsService`, whose tie-break is load-bearing | The rule must survive with `GroupMembership` as the ordering row (`assignedAt`) instead of `GroupCourse.enrolledAt`. This is a **behaviour-preserving substitution of the sort key** and needs its own test. |

### 3.11 Migration risks

| Risk | How the migration refuses |
|---|---|
| A group studies two courses | `RAISE EXCEPTION` before any write (§4.1, `013`) |
| A group studies **zero** courses | `groups.course_id` is `SET NOT NULL` — the `ALTER` itself fails. **This is a second abort path `DATABASE_PLAN.md` §4.1 does not name**, and it is reachable: `GroupRepository.create` (`groups.service.ts`) creates a group with no course. Add an explicit `RAISE EXCEPTION` with a usable message *before* the `SET NOT NULL`, so the operator gets "group X studies no course" rather than a bare constraint violation. |
| Seeds break | §0.3 — regenerate in lock-step |
| `assistant_scopes` backfill leaves an assistant with no row | `AUTHORIZATION_MODEL.md:67-69`: "no rows" must never mean "everything". Backfill **every** user with `role IN ('assistant')` to an explicit row; the `EXISTS`-based check in §3.7 fails closed for a missing row, which is the safe direction, but the row must exist anyway so the admin screen is never ambiguous. |
| `014` runs before `013` | Lexicographic ordering (`migration-runner.ts:40-41`) makes this structurally impossible **only if the numbering is contiguous** — hence §4.1's renumber, done once, up front. |

---

## 4. Changes by layer

### 4.1 Database

**Four files, not three.** `PHASE_ROADMAP.md:177` says "Migrations 012, 013, 014" — written before
`D-9` created `DOM-0`. Required doc amendments (executor, as part of the unit):
`DATABASE_PLAN.md` §7 migration-order list, `PHASE_ROADMAP.md:177`, and the `DB` column of
`IMPLEMENTATION_PLAN.md:108-114`.

| # | File | Task | Destructive? |
|---|---|---|---|
| 012 | `012_retire_learning_mode.sql` | `DOM-0` | **yes** — three columns dropped |
| 013 | `013_group_holds_one_course.sql` | `DOM-1` + `DOM-2` | **yes, one-way** — `DROP TABLE group_courses` |
| 014 | `014_registration_and_student_profile.sql` | `DOM-3` + `DOM-4` | no — additive |
| 015 | `015_assistant_group_scope.sql` | `AUTH-2` | **yes** — `DROP TABLE course_staff_assignments` |

> **Why `DOM-1` is alone in `013` rather than folded in with `014`'s column adds:** the runner stops
> at the first failing file and writes the ledger only on success
> (`migration-runner.ts:89-99`). A failing `ALTER TABLE student_profiles` in the same file as the
> collapse would leave the operator unable to tell which half aborted. The destructive file does one
> thing.

**`012_retire_learning_mode.sql`**
```sql
ALTER TABLE groups  … no-op;                        -- (column lives on group_courses)
ALTER TABLE group_courses DROP COLUMN learning_mode;
ALTER TABLE courses       DROP COLUMN default_learning_mode;
-- enrollments.learning_mode was already dropped by 007; assert rather than drop.
```
Data risk: the values are discarded by decision (`D-9`). Not recoverable; that is intended.

**`013_group_holds_one_course.sql`** — the one-way door.
```sql
ALTER TABLE groups ADD COLUMN course_id    TEXT REFERENCES courses(id);
ALTER TABLE groups ADD COLUMN assistant_id TEXT REFERENCES users(id);   -- DOM-2
ALTER TABLE groups ADD COLUMN meets        TEXT;                        -- DOM-2
ALTER TABLE groups ADD COLUMN room         TEXT;                        -- DOM-2 (see B-2)

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM group_courses GROUP BY group_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'A group studies more than one course; collapse it by hand first.';
  END IF;
  IF EXISTS (SELECT 1 FROM groups g
             WHERE NOT EXISTS (SELECT 1 FROM group_courses gc WHERE gc.group_id = g.id)) THEN
    RAISE EXCEPTION 'A group studies no course; assign one by hand first.';
  END IF;
END $$;

UPDATE groups g SET course_id = gc.course_id FROM group_courses gc WHERE gc.group_id = g.id;
ALTER TABLE groups ALTER COLUMN course_id SET NOT NULL;
DROP TABLE group_courses;

CREATE INDEX groups_course_id_idx    ON groups (course_id);
CREATE INDEX groups_assistant_id_idx ON groups (assistant_id);
```
`groups_course_id_idx` is required, not optional: it is the join the rewritten
`assertAssigned` runs on **every assistant request** (§3.7). No `learning_mode` — `D-9`
(`CHANGELOG.md:585-586`), which is why this differs from `DATABASE_PLAN.md` §4.1's DDL. **Amend
§4.1 to match.**

**`014_registration_and_student_profile.sql`**
```sql
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('waiting','active','rejected'));
-- DEFAULT 'active', deliberately: every account that exists predates the queue
-- and must not be locked out. New registrations set 'waiting' explicitly.
CREATE INDEX users_waiting_idx ON users (status) WHERE status = 'waiting';  -- DATABASE_PLAN §5

ALTER TABLE student_profiles ADD COLUMN school_name  TEXT;
ALTER TABLE student_profiles ADD COLUMN parent_email TEXT;
ALTER TABLE student_profiles ADD COLUMN staff_notes  TEXT;
```
**No `mode` column and no conditional CHECK** — `D-4` (`CHANGELOG.md:488-499`); see B-1.

**`015_assistant_group_scope.sql`** — `DATABASE_PLAN.md` §4.2, with the `assistant_scopes` backfill
widened per §3.11.
```sql
CREATE TABLE assistant_scopes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scope   TEXT NOT NULL CHECK (scope IN ('all_groups','assigned_groups')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE assistant_group_assignments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),      -- RESTRICT, as 002 did
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);
CREATE INDEX assistant_group_assignments_user_id_idx  ON assistant_group_assignments (user_id);
CREATE INDEX assistant_group_assignments_group_id_idx ON assistant_group_assignments (group_id);

INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by, assigned_at)
SELECT csa.id || ':' || g.id, csa.user_id, g.id, csa.assigned_by, csa.assigned_at
  FROM course_staff_assignments csa JOIN groups g ON g.course_id = csa.course_id;

INSERT INTO assistant_scopes (user_id, scope)
SELECT id, CASE WHEN EXISTS (SELECT 1 FROM course_staff_assignments c WHERE c.user_id = users.id)
                THEN 'assigned_groups' ELSE 'assigned_groups' END
  FROM users WHERE role = 'assistant'
ON CONFLICT DO NOTHING;

DROP TABLE course_staff_assignments;
```
**`assigned_groups` for everyone, including assistants with no prior assignment** — the fail-closed
direction. An assistant who should see everything is a deliberate admin act
(`AUTHORIZATION_MODEL.md:67-69`), not a migration default.
The `id` is derived (`csa.id || ':' || g.id`) rather than generated, so the migration is
deterministic and re-runnable in review; if a UUID is preferred use `gen_random_uuid()::text` —
`pgcrypto` availability must be checked, not assumed.

**`DROP TABLE course_staff_assignments` runs only after `StaffScopeService` is rewritten and its
spec is green** (`DATABASE_PLAN.md:129-131`). Since a migration file cannot wait on code, the
practical ordering is: write `015` last, run the integration suite last, and do not commit `015`
in the same slice as an un-migrated caller.

### 4.2 Repositories — **every new/changed table costs two implementations**

| Table | Interface | InMemory | Postgres |
|---|---|---|---|
| `groups` (changed) | `groups/interfaces/group-repository.interface.ts` — delete `GroupCourse`/`NewGroupCourse`, `addCourse`, `removeCourse`, `findCourses`, `findGroupCoursesByCourse`, `findStudentGroupCourses`; add `update(groupId, patch)`, `findByCourse(courseId)`, `findStudentGroups(studentId, courseId)` | `repositories/in-memory-group.repository.ts` | `repositories/postgres-group.repository.ts` |
| `courses` (changed) | `courses/interfaces/course-repository.interface.ts` — drop `defaultLearningMode`; **add `create`, `update`** (`DOM-5`) | `in-memory-course.repository.ts` | `postgres-course.repository.ts` |
| `users` (changed) | `auth/interfaces/user-repository.interface.ts` — add `status`, `setStatus`, `findByStatus` | `in-memory-user.repository.ts` | `postgres-user.repository.ts` |
| `student_profiles` (changed) | `students/interfaces/student-repository.interface.ts` — three fields on read + update | `in-memory-student.repository.ts` | `postgres-student.repository.ts` |
| **`assistant_scopes` (new)** | **new** `staff/interfaces/assistant-scope-repository.interface.ts` + `ASSISTANT_SCOPE_REPOSITORY` Symbol | **new** `staff/repositories/in-memory-assistant-scope.repository.ts` | **new** `staff/repositories/postgres-assistant-scope.repository.ts` |
| **`assistant_group_assignments` (new)** | same interface (one aggregate: "an assistant's reach") | same file | same file |
| `course_staff_assignments` (**deleted**) | delete `staff/interfaces/course-staff-repository.interface.ts` | delete `in-memory-course-staff.repository.ts` | delete `postgres-course-staff.repository.ts` |

Wiring: `database/repository.provider.ts` gains the new token pair and loses `COURSE_STAFF_REPOSITORY`.

> **One interface, not two, for the scope tables.** `assistant_scopes` and
> `assistant_group_assignments` are one aggregate — "what this assistant may reach" — and no caller
> ever wants one without the other. A second interface would be an abstraction with one consumer
> (`CLAUDE.md` §13). Methods: `findScope(userId)`, `setScope(userId, scope)`,
> `findGroupIds(userId)`, `assignGroup(userId, groupId, assignedBy)`, `unassignGroup(...)`,
> `holdsCourse(userId, courseId)`, `findAssistantsForGroup(groupId)`.

**Pattern followed** (`ARCHITECTURE.md` §2): the repository-interface-plus-two-drivers seam — the
same pattern all 17 existing interfaces use. Nothing new is invented.

### 4.3 Services

| Service | Change | Invariant / transaction |
|---|---|---|
| `groups/learning-mode.service.ts` | **DELETE the file** | — |
| `groups/student-groups.service.ts` | `pairingsFor` → `groupsFor(courseId, studentId)` returning `Group[]` ordered by `GroupMembership.assignedAt`. **The longest-standing-placement tie-break survives** and is still named here, not in callers. | Order is the repository's; the service names the rule (`:8-23`) |
| `courses/courses.service.ts` | `getProgress(courseId, studentId)` — drop the `learningMode` parameter and the `:120` branch; return **one** shape with `completedLessons/totalLessons/completionPercentage/checkpoints` **and** `attendedSessions/totalSessions/attendancePercentage/timeline`. Both sub-queries always run. | **`CLAUDE.md` §11.1 non-negotiable 2 still holds:** completion and attendance are separate fields; they must never be averaged. Add that as a comment where the shape is declared. |
| `courses/courses.service.ts` | `enroll` **kept unchanged** — only its route moves | `PRODUCT_SPEC.md:47` |
| `dashboard`, `manage`, `reports`, `public-courses` | drop the `LearningModeService` injection and the field from each response | — |
| `groups/groups.service.ts` | `addCourse`/`removeCourse` deleted; `update(groupId, patch, actor)` added | Setting `course_id` on a group that already has targeted assessments or members is a **re-cohorting**: refuse with **409** if the group has members *and* the course changes. Invented? No — `DOMAIN_MODEL.md:98-100` makes `Enrollment` the access gate, so silently moving a populated group to another course would leave every member enrolled on the old course and targeted by the new one. If the coordinator prefers to allow it, that is a one-line change; recorded as an **assumption**. |
| `staff/staff-scope.service.ts` | Internals only, per §3.7 | **The 404 message is a byte-identical constant.** Extract it to a named `const` so it cannot drift. |
| `staff/staff.service.ts` | `listCourses` scoped branch reads `scope.courseIds` (derived from held groups) instead of `scope.assignments`; `listCourseStaff`/`assign`/`unassign` **deleted** with their routes | `assignedAt` on `StaffCourseSummary` becomes `null` for an assistant too, or is dropped — see B-3 |
| `auth/auth.service.ts` | `register` creates `status: 'waiting'`; `login` refuses non-`active` | §3.8 authentication row |
| **new** `students/registration-approval.service.ts` (or on `StaffService`) | `accept(studentId, groupId, actor)`, `reject(studentId, reason, actor)` | **accept is one transaction**: set `status='active'` → `CoursesService.enroll(group.courseId, studentId)` → `GroupRepository.addMember` → audit. `this.db.runInTransaction`. 409 if already `active`. |
| **new** `courses/course-admin.service.ts` | `create`, `update` | audited |

### 4.4 Authorization — the 22 call sites

`assertAssigned` keeps its signature, so **20 of the 22 sites need no edit**. They must be *verified*
unchanged, by file and line:

`announcements.service.ts:72,212` · `groups.service.ts:209,241,364` ·
`manage/assessment-authoring.service.ts:229,234,255` · `manage/grading.service.ts:97,194` ·
`manage/manage-live-sessions.service.ts:66,76,89` · `manage/manage-recordings.service.ts:65,75,96` ·
`manage/manage.service.ts:188,261` · `manage/work-analytics-gate.service.ts:75,102`.

The **two that do change** are both in `staff/staff.service.ts`: `:70` (`scopeFor`, whose
`assignments` member is replaced) and `:110,165,213,220` (`listStaffForCourse`/`assign`/
`findAssignment`/`unassign`, deleted with the routes).

> Note on `groups.service.ts:209,241`: these guard `addCourse`/`removeCourse`, which are **deleted**.
> The net is 18 untouched + 2 deleted + 2 changed. Do not read "20 untouched" as a target to hit.

**`staff-scope.service.spec.ts` is EXTENDED, never edited.** Existing cases
(`:35,41,49,55,85,92,106,119,128,140,147`) must pass unmodified against the new internals — that is
the proof the contract survived. The stub they inject is a `CourseStaffRepository`; substituting the
new repository token in the `beforeEach` is a **fixture** change, not a behaviour change, and is the
only permitted edit. If a case cannot pass without changing its assertion, **stop and report** — that
is the contract breaking.

### 4.5 Audit — each action costs three things

| Action | Target type | Union entry | `AUDIT_ACTION_VALUES` entry | Spec asserting the row |
|---|---|---|---|---|
| `student.accepted` | `student` (new target type) | ✓ | ✓ | accept writes `{after: {status:'active', groupId}}` |
| `student.rejected` | `student` | ✓ | ✓ | reject writes `{before:{status:'waiting'}, after:{status:'rejected'}}` |
| `course.created` | `course` (new target type) | ✓ | ✓ | ✓ |
| `course.updated` | `course` | ✓ | ✓ | before ≠ alias of after |
| `group.updated` | `group` (exists) | ✓ | ✓ | ✓ — replaces `group.renamed` for the widened PATCH |
| `assistant.scope_changed` | — | **not in this unit** | — | the route is unit 5 (`PEOPLE-4`) |

Every one is written **inside** the mutation's transaction — `AuditService.record` throws otherwise
(`CLAUDE.md` §9). Every `before` snapshot is a **copy**, never an alias.

### 4.6 Frontend — mirror only

`frontend/lib/types.ts`: delete `LearningMode` (`:33`), `RecordedProgress`/`LiveProgress` (`:57-81`)
→ one `CourseProgress` interface; drop `learningMode` at `:89,111,273,440,657,688`; add `status` to
the student/user types; add `schoolName`/`parentEmail`/`staffNotes`; update the group shape.
`frontend/lib/api.ts`: drop the `LearningMode` import (`:23`), update the group-write body (`:834`),
remove the enroll call.
**`cd frontend && npx tsc --noEmit 2>&1 | grep -c "lib/"` must be `0`.** The ~301 errors in `app/`
and `components/` are expected and must not grow — record the before/after count.

### 4.7 Tests

**Unit** (memory driver, no DB)
- `courses.service.spec` — progress returns one shape carrying **both** completion and attendance,
  for a student with recordings and no sessions, and for one with sessions and no recordings.
- **`student-groups.service.spec` — "resolves for an unplaced student"**: a student enrolled but in
  no group returns `[]` and the callers render an empty course rather than throwing. *This is the
  replacement for the `LearningModeService` fallback-chain test named in `PHASE_ROADMAP.md:190`;
  the chain is gone, but the case it protected is not.*
- `student-groups.service.spec` — tie-break: a student in two groups on one course returns the
  longest-standing placement first, by `GroupMembership.assignedAt`.
- `groups.service.spec` — `update` refuses a course change on a populated group with 409.
- `auth.service.spec` — register creates `waiting`; login refuses `waiting` **and** `rejected`
  **with the same `'Invalid credentials'` message as an unknown email**, and still performs one
  hash verification.
- `registration-approval.service.spec` — accept enrols + places + activates; accept on an `active`
  student → 409; accept with an unknown `groupId` → 404.
- `course-admin.service.spec` — create/update; audit `before` is not an alias of `after`.
- `staff-scope.service.spec` — **all eleven existing cases unmodified**, plus:
  - `all_groups` scope passes without any assignment row;
  - `assigned_groups` with a group on the course passes;
  - `assigned_groups` with a group on **another** course is refused;
  - an assistant with **no `assistant_scopes` row at all** is refused (fail closed);
  - the refusal message is `===` to the genuine-miss message.

**Authorization refusal tests — one per permission added or changed**

| Permission | Named test |
|---|---|
| reject a registration | `capabilities.spec.ts` / `students.e2e` — *"an assistant is refused with 403 on POST /admin/students/:id/reject"* |
| accept a registration | *"an assistant is refused on POST /admin/students/:id/accept"* |
| create a course | *"an assistant is refused on POST /admin/courses"* |
| update a course | *"an assistant is refused on PATCH /admin/courses/:id"* |
| self-enrol | *"POST /courses/:id/enroll no longer exists (404) for a student"* |
| out-of-scope course read | *"an assigned_groups assistant gets 404 with the identical message on another course's roster"* |
| sign in while waiting | *"a waiting account is refused at login with the byte-identical invalid-credentials message"* |

**Integration** (real Postgres, from an empty schema)
- `applies migrations idempotently` (existing, `:65`) must still pass with 15 files.
- **`013` aborts on two-course data** — the named test. Shape: drop schema, run migrations
  **001–012** only (a runner pointed at a filtered file list, or an explicit `readFile` loop),
  insert two `group_courses` rows for one `group_id`, then apply `013` and assert it **throws** with
  the message, and assert `group_courses` **still exists** and `groups.course_id` is absent — i.e.
  the transaction rolled back and the ledger has no `013` row (`migration-runner.ts:89-99`).
- **`013` aborts on a group with no course** — same shape, the second guard.
- Post-conditions asserted **directly against the database**, per `DATABASE_PLAN.md` §9: after `012`,
  `courses.default_learning_mode` is absent; after `013`, `group_courses` is gone,
  `groups.course_id` is `NOT NULL`, `groups_course_id_idx` exists, and the row count of `groups` is
  unchanged; after `014`, `users_waiting_idx` exists and `users_status_check` rejects `'pendng'`;
  after `015`, `course_staff_assignments` is gone and every seeded assistant has an
  `assistant_scopes` row.
- New `describe` blocks for the two new repository implementations; the existing
  `describe('course staff assignments')` (`:778`) is **replaced**, and `describe('groups')` (`:931`)
  and `describe('enrollments')` (`:214-222`) amended.

**e2e** — happy path and error case for each new route; the retired routes answer 404.

---

## 5. Files

### Expected to change
`backend/src/courses/{courses.service.ts,courses.controller.ts,interfaces/course-repository.interface.ts,repositories/{in-memory,postgres}-course.repository.ts,courses.controller.spec.ts}` ·
`backend/src/groups/{groups.service.ts,student-groups.service.ts,admin-groups.controller.ts,staff-groups.controller.ts,group-data.module.ts,groups.module.ts,dto/group.dto.ts,interfaces/group-repository.interface.ts,repositories/{in-memory,postgres}-group.repository.ts,groups.controller.spec.ts}` ·
`backend/src/dashboard/{dashboard.service.ts,dashboard.controller.spec.ts}` ·
`backend/src/manage/{manage.service.ts,manage.controller.spec.ts,assessment-authoring.controller.spec.ts}` ·
`backend/src/reports/{reports.service.ts,reports.controller.spec.ts}` ·
`backend/src/public/{public-courses.service.ts,public-courses.service.spec.ts}` ·
`backend/src/enrollments/interfaces/enrollment-repository.interface.ts` (delete the `LearningMode` type) ·
`backend/src/enrollments/repositories/in-memory-enrollment.repository.ts` (comment) ·
`backend/src/assessments/{interfaces/assessment-repository.interface.ts,repositories/*}` (comments only) ·
`backend/src/auth/{auth.service.ts,interfaces/user-repository.interface.ts,repositories/*}` ·
`backend/src/students/{interfaces/student-repository.interface.ts,repositories/*}` ·
`backend/src/staff/{staff-scope.service.ts,staff.service.ts,staff.module.ts,staff-scope.service.spec.ts (EXTEND ONLY),staff.controller.spec.ts}` ·
`backend/src/audit/{interfaces/audit-log-repository.interface.ts,dto/list-audit-log-query.dto.ts}` ·
`backend/src/database/{repository.provider.ts,seeds/00{1,2,3,4}_*.sql}` ·
`backend/src/app.module.ts` (comment at `:45,82`) ·
`backend/test/{postgres-repositories.integration-spec.ts,app.e2e-spec.ts,staff.e2e-spec.ts,public.e2e-spec.ts}` ·
`frontend/lib/{types.ts,api.ts}` ·
`docs/{IMPLEMENTATION_PLAN.md,PHASE_ROADMAP.md,DATABASE_PLAN.md,DOMAIN_MODEL.md,API_SPEC.yaml,AUTHORIZATION_MODEL.md,CHANGELOG.md,ARCHITECTURE.md,PRODUCT_SPEC.md}` · `project_log.md`

### To create
`backend/src/database/migrations/{012_retire_learning_mode,013_group_holds_one_course,014_registration_and_student_profile,015_assistant_group_scope}.sql` ·
`backend/src/staff/interfaces/assistant-scope-repository.interface.ts` ·
`backend/src/staff/repositories/{in-memory,postgres}-assistant-scope.repository.ts` ·
`backend/src/courses/{admin-courses.controller.ts,course-admin.service.ts,dto/course.dto.ts}` + spec ·
`backend/src/students/{admin-students.controller.ts,registration-approval.service.ts,dto/registration.dto.ts}` + spec ·
`docs/phases/unit-2/EXECUTION_NOTES.md`

### To delete
`backend/src/groups/learning-mode.service.ts` ·
`backend/src/staff/{interfaces/course-staff-repository.interface.ts,repositories/{in-memory,postgres}-course-staff.repository.ts,admin-staff.controller.ts}`

### NOT to touch, and why
- `backend/src/database/migrations/001-011` — **immutable**; the ledger records them by filename.
- `frontend/app/**`, `frontend/components/**` — unit 4 deletes them (`CLAUDE.md` §4.1). Patching
  them here is work thrown away.
- `backend/src/auth/{roles.enum.ts,staff-roles.ts,capabilities.ts,actor-role.ts}` — unit 1's
  boundary. `AUTH-2` changes *what* scope means, not *who* is unscoped.
- `staff-scope.service.spec.ts`'s **existing assertions** — extend only (§4.4).
- `backend/src/auth/role-guards.spec.ts`'s structure — it must be *updated* for the deleted
  `admin-staff.controller.ts` (25 controllers → 25, 63 routes → 60) and the two new controllers
  (→ 62), but its enumerating shape is unit 1's mechanism and stays.
- `database/schema.sql`, `database/seed.sql` at the repo root — not applied, design outline only.

---

## 6. Sequencing

```
 1. Renumber + doc amendment (§4.1)                    ─ no code
 2. DOM-0  : 012 → repos → services → union collapse → lib/types.ts → seeds 001/003
 3. DOM-1+2: 013 → GroupRepository ×2 → StudentGroupsService → GroupsService
             → admin-groups routes → seeds 003
 4. DOM-3+4: 014 → user/student repos ×2 → auth.service → accept/reject → enroll route moves
             → seeds 001/002
 5. AUTH-2 : 015 → assistant-scope repo ×2 → StaffScopeService internals
             → staff.service → delete admin-staff.controller → seeds 002
 6. DOM-5  : course CRUD
 7. DOM-6  : final seed pass + integration run from an empty schema
```

**Load-bearing orders, and what breaks if reversed**

| Order | If reversed |
|---|---|
| Renumber **before** any migration file is written | A `014` authored with no `013` applies straight after `012` and **aborts every boot and every integration run** (`migration-runner.ts:40-41`; unit-1 `PHASE_PLAN.md` §8 B-1). |
| `DOM-0` **before** `DOM-1` | The destructive collapse lands beside a half-removed mode axis; `013` would have to carry `learning_mode` and then drop it (`D-9`, `CHANGELOG.md:593-595`). |
| `013` verified **before** `015` is authored | `015`'s backfill joins `groups.course_id`. |
| `StaffScopeService` rewritten and green **before** `DROP TABLE course_staff_assignments` | `DATABASE_PLAN.md:129-131`. In practice: do not commit step 5's migration with an un-migrated caller. |
| Seeds updated **in the same step as each migration** | The integration suite calls `runner.seed()` at `:57-58` and fails at setup — the gate stops working (§0.3). |
| `lib/types.ts` in the **same step** as the response change | `lib/` stops being the 0-error island; `CLAUDE.md` §6 "make drift a compile error". |

---

## 7. Definition of Done for this unit

Applicable points from `IMPLEMENTATION_PLAN.md` §Definition of done, made concrete:

1. Each change in the layer `ARCHITECTURE.md` §6 names — no rule in a controller or repository.
2. **All four migrations run against real PostgreSQL from an empty schema**, with the output pasted
   into `EXECUTION_NOTES.md`. `DOM-1` is one-way; this happens *in* the unit.
3. Both drivers for `assistant_scopes` + `assistant_group_assignments`, and both updated for
   `groups`, `courses`, `users`, `student_profiles`.
4. A `class-validator` DTO on every new body; no undeclared field accepted.
5. Authorization in the service, not only `@Roles` — verified at all 22 `StaffScopeService` sites.
6. Five new audit actions, each with union entry + exhaustive `Record` entry + a spec asserting the
   row. Six retired members deliberately **retained** with a comment.
7. Every refusal test in §4.7 named and passing.
8. 404/identical-message, 409-on-conflict, and not-found covered.
9. n/a — no screen ships. The mirror is updated instead.
10. `API_SPEC.yaml` matches: `LearningMode`/`StudyMode` schemas removed, `Group`/`GroupWrite`
    reconciled, `/admin/courses` given real request/response schemas, retired paths deleted.
11. Commands below.
12. n/a — no screen ships.
13. `IMPLEMENTATION_PLAN.md` + `CHANGELOG.md` updated, plus the five other docs in §5.

**Exact commands and expected results**

```
npm test --workspace=backend                    # ≥467 passing, 0 failing, 0 skipped
npm run test:e2e --workspace=backend            # ≥216 passing
docker compose up -d postgres
TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest_u2 \
  npm run test:integration --workspace=backend  # ALL 15 migrations from an empty schema; >81 passing; 0 skipped
npm run lint                                    # clean
cd frontend && npx tsc --noEmit 2>&1 | grep -c "lib/"   # exactly 0
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS" # ≤301, and the delta explained
```
A skipped integration suite is a **failure**, not a pass (`CLAUDE.md` §10). Use a database created
beside the dev one, as `SPEC-12` did — the suite `DROP SCHEMA public CASCADE`s (`:53`).

---

## 8. Blockers and decisions required

### B-1 — `students.mode`: five documents say build it, the closed decision says do not. **Needs one line from the user.**

**Question.** Does `student_profiles` gain a `mode` column (`school | online`) with the conditional
CHECK, or not?

**Reading A — it is struck.** `CHANGELOG.md:488-499` (`D-4`, CLOSED 2026-09-20): *"`students.mode`
(School | Online) and session `mode` (On-ground | Online) are **not built**… `DOM-3` shrinks
accordingly."* `D-9` (`:572`) reinforces: *"There are now zero [axes]."*
**Reading B — it is built.** `IMPLEMENTATION_PLAN.md:112` (`DOM-3`, *"gains `mode`, … + the
conditional CHECK"*), `DOMAIN_MODEL.md:33,36`, `DATABASE_PLAN.md` §6 bullet 1,
`PRODUCT_SPEC.md:117`, and `API_SPEC.yaml:157,169,175,199,203` where `mode` is **required** in both
`StudentSummary` and `StudentWrite`.

**Impact.** Reading A: `014` has three columns, no CHECK; `StudentWrite` loses a required field;
five documents need amending. Reading B: `014` gains a fourth column and the conditional CHECK, and
`D-4` needs formally reopening in `CHANGELOG.md`.

**Blocks.** `DOM-3` only — and only its column list, not the task. I am **not** scoping `DOM-3` out:
`school_name`, `parent_email` and `staff_notes` are unaffected under either reading and are the bulk
of the task. `mode` is an additive nullable column that costs one `ALTER TABLE` to add later.

**My reading, labelled an assumption, not a decision.** Build **Reading A** — no `mode`, no CHECK.
`CLAUDE.md` §2.2 gives `CHANGELOG.md` ownership of decisions; `D-4` is the later artifact, is
explicitly closed, and explicitly names what it overrides. The four documents on the other side all
predate it and were simply not amended. **The executor must amend all five** as part of `DOM-3`.

### B-2 — does `groups.room` survive `D-9`? **Low impact; proceeding under an assumption.**

**Question.** `D-9` (`CHANGELOG.md:597-600`) says *"Combined with `D-4`, there is no `mode` and no
`room`"* — is that sentence about sessions only, or does it also strike `groups.room`?

**Reading A — sessions only.** The sentence sits under the heading "**Sessions**, consequently" and
resolves `PRODUCT_SPEC.md` §4.1's "a room **or** a meeting link" to the link. `groups.room` comes
from a different place — `PRODUCT_SPEC.md:140` and `DOMAIN_MODEL.md:84`, neither amended by `D-9`.
**Reading B — everything.** No on-ground mode anywhere means a room is dead data.

**Impact.** One nullable `TEXT` column and one optional `GroupWrite` field. **Blocks nothing.**

**Assumption.** Reading A — keep `groups.room`, nullable, in `013`. Two same-level documents name it
on the group; the `D-9` sentence is session-scoped; and a nullable column nobody fills is cheaper
than a column added back later. Flagged so a one-word "drop it" is cheap.

### B-3 — `StaffCourseSummary.assignedAt` has no source after `AUTH-2`. **Recommend; not a business question.**

`staff.service.ts:25-30` returns *"when this TA was assigned, or null for an admin"*. After group
scoping an assistant holds group assignments, not course ones, so a course has no single
`assignedAt` (one assistant, three groups on one course, three dates).
**Recommendation:** return `null` for everyone and keep the field, or drop it. I recommend
**MIN(assigned_at) over the groups that reach the course**, only because the field's documented
purpose is *"so the two paths are visibly different in the response instead of silently identical"*
and `null`-for-everyone destroys that. Cheapest correct option; executor's call if it costs a join.

### Not blockers — settled from the documents

| Question | Settled by |
|---|---|
| May a `waiting` account sign in? | **No.** `DOMAIN_MODEL.md:23` "Only `active` may authenticate." |
| May a `rejected` account sign in? | **No.** Same line; the account is never hard-deleted (`:25`). |
| Who may reject? | Teacher/admin. `AUTHORIZATION_MODEL.md` capability matrix; one of `AUTH-3`'s four withheld verbs. |
| Where does scope editing live? | `PATCH /admin/assistants/{userId}`, **unit 5** (`API_SPEC.yaml:597`). |
| Regenerate or migrate the seeds? | **Regenerate.** `D-5`, `CHANGELOG.md:501-504`. |

---

## 9. Risks, ranked

| # | Risk | How it shows up | Detect early by |
|---|---|---|---|
| R-1 | **`013` is one-way and cannot be tested by running it twice.** A defect found after `DROP TABLE group_courses` cannot be recovered from the database. | The integration suite passes; a later unit finds a group pointing at the wrong course. | Write the abort tests (§4.7) **before** the happy path. Assert row counts before and after the `UPDATE`. The suite starts from an empty schema every run, so this is recoverable *in test* — the exposure is a developer's own dev database. **Take a `pg_dump` before the first real run.** |
| R-2 | **The seeds break the migration gate** (§0.3). | `beforeAll` throws; 81 tests report as an error, or worse, the suite skips and CI's zero-test guard is the only thing standing. | Run the integration suite immediately after `012` alone, before writing `013`. |
| R-3 | **`assertAssigned`'s 404 message drifts by one byte** during the rewrite. | Nothing fails loudly; `staff-scope.service.spec.ts:55` passes because it compares against its own literal. | Extract the message to one exported `const` and assert `===` between the out-of-scope and genuine-miss paths in the **same** test. |
| R-4 | **A retired audit member is deleted "for tidiness."** | `GET /admin/audit-log?action=course_staff.assigned` answers **400**; historical rows become unreachable. | A spec that asserts all six retired members are still accepted by `ListAuditLogQueryDto`. |
| R-5 | **The progress union collapse is done halfway** — some callers updated, `lib/types.ts` not, or the two halves averaged into one number. | Frontend `lib/` error count > 0, or a `Meter` and a `Score` sharing a denominator later. | The `grep -c "lib/"` gate in §7, and a comment at the type declaration restating non-negotiable 2. |
| R-6 | **`GroupDataModule` stays `@Global()` for a reason nobody re-checked** after `LearningModeService` is deleted. | A fourth global module gets added later because "there are already three." | One line in `EXECUTION_NOTES.md` stating whether the `CoursesModule` ⇄ `GroupsModule` cycle (`groups.module.ts:14-26`) still exists. |
| R-7 | **`users.status DEFAULT 'active'`** is the right call for existing rows and the wrong one for new ones. | Every new registration lands `active` and the waiting queue is always empty — a **silent authorization hole**, not a cosmetic bug. | A unit test asserting `register` produces `'waiting'`, and an e2e asserting a freshly registered account cannot sign in. |
| R-8 | **The unit is oversized and lands as one unreviewable diff.** | The reviewer cannot verify the destructive migration under 4,000 lines of mechanical `learning_mode` deletion. | §10. |

---

## 10. Size assessment — **this unit should be split**

**Finding: no, this is not safely executable in one pass.** Measured, not estimated:

| Dimension | Count |
|---|---|
| Migrations | **4** (the plan budgeted 3) |
| Destructive migrations | **3** of 4, one of them one-way |
| Files referencing `learning_mode` | **99** (`grep -rln` across `backend/src`, `backend/test`, `frontend`); **46** are source files carrying logic |
| New tables | 2 → **4** new repository implementations |
| Changed tables | 4 → **8** touched repository implementations |
| New controllers | 2 · New services | 3 · Deleted services | 2 |
| New audit actions | 5 (× 3 artifacts each = 15) |
| Response shapes changed | 5, all frontend-visible |
| Routes added / retired | 4 added, 5 retired |
| `StaffScopeService` call sites to verify | 22 |

That is roughly the size of units 1, 3 and 5 combined, and it contains the single highest-risk
change in the project.

### Proposed boundary

| Slice | Tasks | Migrations | Exit |
|---|---|---|---|
| **2a — the group becomes the centre** | `DOM-0`, `DOM-1`, `DOM-2`, seeds for those | `012`, `013` | Integration suite green from an empty schema; `lib/` at 0 errors; `group_courses` referenced nowhere |
| **2b — scope, people and courses** | `DOM-3`, `DOM-4`, `AUTH-2`, `DOM-5`, final `DOM-6` | `014`, `015` | Integration suite green; `course_staff_assignments` referenced nowhere |

**Why here and not elsewhere.**
1. **The boundary is a verified migration gate.** `015`'s backfill joins `groups.course_id`; the
   documented requirement is that `013` *land and be verified* before it
   (`DATABASE_PLAN.md:255-259`). A unit boundary is the strongest form of "verified first" available.
2. **It separates the two irreversible drops into different reviews.** `DROP TABLE group_courses`
   and `DROP TABLE course_staff_assignments` are each worth a reviewer's full attention, and they
   share no code.
3. **It keeps `DOM-2` with `DOM-1`** — same table, same migration, and `PHASE_ROADMAP.md:177`
   already pairs them.
4. **It keeps `AUTH-2` with `DOM-2`'s outcome.** The `CHANGELOG.md:367-370` argument for co-locating
   them is that `groups.assistant_id` and `assistant_group_assignments` record the same fact twice.
   **That argument is satisfied by this plan, not by the unit boundary:** §4.1 fixes
   `groups.assistant_id` as the *display* field (who runs this group) and
   `assistant_group_assignments` as the *authorization* field, and **nothing reads
   `groups.assistant_id` for an access decision.** The executor must state that in a comment on the
   column. If the coordinator judges that insufficient, the alternative boundary is
   `2a = DOM-0/1/2 + AUTH-2`, `2b = DOM-3/4/5/6` — also defensible, and larger in slice 2a.
5. **`DOM-3`, `DOM-4` and `DOM-5` touch none of `DOM-0`'s or `DOM-1`'s files**, so nothing is
   double-handled by deferring them.

**If the coordinator rules "one pass anyway":** the plan above stands unmodified — §6's seven steps
are already the commit sequence, each is independently green, and the only cost is one very large
review. Nothing in §1–§9 assumes the split.

---

## 11. What I could not verify

- **None of `012`–`015` has been run against PostgreSQL.** They are not written yet; this is a plan,
  and the DDL above is drafted from `DATABASE_PLAN.md` §4 plus the live schema in
  `001`–`011`. Every one of `001`–`008` found something on its first real run.
- **I did not start Docker or run any suite.** The 467/28 baseline is the coordinator's, quoted.
- `pgcrypto`/`gen_random_uuid()` availability in the target Postgres 15 image is **assumed, not
  checked** — §4.1 avoids depending on it.
- The ~301 frontend error count is the coordinator's figure; I verified only that `lib/` is not
  among the affected directories by reading `CLAUDE.md` §4.1 and the unit-1 record.
