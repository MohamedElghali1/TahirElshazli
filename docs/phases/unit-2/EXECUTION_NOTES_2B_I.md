# Execution notes — unit 2, slice 2b-i (people and courses)

**Executor:** `redesign-executor` · **Date:** 2026-09-20 · **Branch:** `redesign`
**Base:** `ab2e324` (working tree clean but for `COORDINATOR_RULINGS.md`, which was the
coordinator's own uncommitted edit and which I did not touch).
**Input:** `PHASE_PLAN_2B.md` §6 steps 1–2 · `COORDINATOR_RULINGS.md` R-2, R-5, R-6, R-7, R-8.

**Baseline re-measured before writing anything:** 473 unit / 29 files. Integration re-run against a
freshly created database after `014` alone: 87 passing, 0 skipped, 14 migrations from nothing.

---

## What was built

### `DOM-3` — student profile staff fields

| File | What |
|---|---|
| `backend/src/database/migrations/014_registration_and_student_profile.sql` | **new.** Additive only: `users.status` + partial index, and `student_profiles.school_name / parent_email / staff_notes`. **No `mode`, no conditional CHECK** (R-2). |
| `backend/src/students/interfaces/student-repository.interface.ts` | `StudentProfile` gains the three fields. `StudentProfileUpdate` deliberately does **not** — see Deviations. |
| `backend/src/students/repositories/{in-memory,postgres}-student.repository.ts` | both drivers read and return them; the in-memory fixture mirrors `seeds/001` exactly. |
| `backend/src/students/students.service.ts` | **new `StudentProfileView`**, built key by key, and `toStudentView`. `getProfile`/`updateProfile` return it. A spread would carry the next staff column added to the table onto `GET /students/me/profile`. |
| `backend/src/students/students.controller.ts` | return type follows. |
| `backend/src/database/seeds/001_development_fixtures.sql` | `profile-1` carries all three values, `profile-2` none. A fixture of nulls cannot tell "never read" from "never leaked". |

### `DOM-4` — the registration queue

| File | What |
|---|---|
| `backend/src/auth/interfaces/user-repository.interface.ts` | `UserStatus`; `StoredUser.status`; `create` takes a **required** `status`; **new** `setStatus`; `findByRole` takes an optional `status`. |
| `backend/src/auth/repositories/{in-memory,postgres}-user.repository.ts` | both drivers. Postgres writes `status` explicitly in the `INSERT` and filters with `($5::text IS NULL OR status = $5)`. |
| `backend/src/auth/auth.service.ts` | `register` passes `status: 'waiting'` **explicitly** and returns `{ status: 'waiting' }` — new `RegistrationResult`, no token (R-6). `login` gains `\|\| user.status !== 'active'` as a **third clause on the existing condition**, after the single verify, same message. |
| `backend/src/auth/jwt.strategy.ts` | **the second gate.** `if (!user \|\| user.status !== 'active')` on the read that already ran. |
| `backend/src/auth/auth.controller.ts` | register's return type. |
| `backend/src/manage/registration-approval.service.ts` | **new.** `accept` = one `runInTransaction`: 404/409 → read group → `setStatus('active')` → `CoursesService.enroll` → `groupRepo.addMember` → audit. `reject` = `assertMay` **first, outside the transaction**, then 404/409/`setStatus`/audit. |
| `backend/src/manage/dto/registration.dto.ts` | **new.** `AcceptRegistrationDto` (`groupId` required), `RejectRegistrationDto` (`reason?` with `@IsOptionalNotNull`). |
| `backend/src/manage/admin-manage.controller.ts` | `POST /admin/students/:studentId/{accept,reject}`; `GET /admin/students` passes `status` through. |
| `backend/src/manage/dto/queries.dto.ts` | `status` on `ListDirectoryQueryDto`, `@IsIn` over the three values. |
| `backend/src/manage/directory.service.ts` | `StudentDirectoryEntry` gains `status`; optional `status` filter; **new** `student(userId)` — the accept response's row, built where the shape is owned. |
| `backend/src/manage/manage.module.ts` | provides `RegistrationApprovalService`. No new import edge. |
| `backend/src/courses/courses.controller.ts` | `@Post(':id/enroll')` **deleted**; `CoursesService.enroll` untouched. |
| `backend/src/audit/interfaces/audit-log-repository.interface.ts` · `dto/list-audit-log-query.dto.ts` | `student.accepted`, `student.rejected` + target type `student`, in the union **and** the exhaustive `Record`. |
| `backend/src/database/seeds/{001,002}.sql` | every seeded account writes `status` out rather than leaning on the default. |
| `frontend/lib/{types,api,session}.ts` | `UserStatus`, `RegistrationResult`, `StudentDirectoryEntry.status`; `api.auth.register` return; `api.courses.enroll` **deleted**; `admin.acceptRegistration`/`rejectRegistration`; `session.register` no longer adopts a session. |

### `DOM-5` — course lifecycle

| File | What |
|---|---|
| `backend/src/courses/interfaces/course-repository.interface.ts` | `NewCourse`, `CoursePatch`, `create`, `update`. |
| `backend/src/courses/repositories/in-memory-course.repository.ts` | `create`/`update`; fixtures moved from the shared module constant to a **per-instance copy**, because they became writable. Field-by-field patch, and `update` returns a copy. |
| `backend/src/courses/repositories/postgres-course.repository.ts` | `create`; `update` with **COALESCE per column** and the extra boolean for the one nullable column. New `toCourse` helper. |
| `backend/src/courses/course-admin.service.ts` | **new.** `create` (409 on a taken slug, **draft by default**) and `update` (`before` snapshotted **before** the write, as a flat copy), both inside `runInTransaction` with their audit entries. |
| `backend/src/courses/dto/course.dto.ts` | **new.** `CreateCourseDto`/`UpdateCourseDto`; `@IsOptionalNotNull` on every NOT NULL field, plain `@IsOptional` only on `thumbnailUrl`; `@IsUrl` with an explicit `http/https` protocol list, because the value is rendered as an image source. |
| `backend/src/courses/admin-courses.controller.ts` | **new.** `@Controller('admin/courses')`, `@Roles(...STAFF_ADMIN)`. |
| `backend/src/courses/courses.module.ts` | registers both. |
| `backend/src/audit/…` | `course.created`, `course.updated` + target type `course`, union **and** `Record`. |

### Authorization, as checked

- **The two gates both exist**, with the named tests:
  `registration-status.spec.ts` → *"refuses a waiting account with the byte-identical
  invalid-credentials message"*, *"runs exactly one hash verification on all four paths"*, and
  ***"a token for a rejected account is refused on every route"***.
- **Object-level:** `accept`/`reject` resolve the student and refuse a non-student with the **same**
  404 message as a missing one. `accept`'s group is resolved before any write.
- **Capability:** `assertMay(actor, 'registration.reject')` is the **first statement** of `reject`,
  outside the transaction, so a refused assistant learns nothing about whether the id names anybody
  — asserted in both directions.
- **`grep -rn "assistantId\|assistant_id" backend/src --include=*.ts`** → every hit is a DTO field, a
  stored-interface field, an audit payload value or a doc comment. **No service reads it for an
  access decision.** (2b-ii's concern, verified not regressed here.)
- **`StaffScopeService` and its 21 call sites were not touched.** `git diff --stat` shows no file
  under `backend/src/staff/`.
- **Rate limiting:** `@RateLimit(AUTH_ENUMERATION_LIMIT)` on register and
  `@RateLimit(AUTH_ATTEMPT_LIMIT)` on login are unchanged, and the status refusal happens **inside**
  the service the limited route calls, not before the guard.
- **`audit.service.spec.ts` was not edited.** Nothing was removed from either union.

---

## Deviations from the plan

1. **`StudentProfileUpdate` does not gain the three staff fields.** The plan (§4.2) said "and
   `StudentProfileUpdate` likewise". Nothing writes them in this slice — `PEOPLE-1` (unit 5) owns
   `PATCH /admin/students/:id` — and that interface is used by `PATCH /students/me/profile`, the one
   update path a **student** drives. A writable member with no writer there is an open door waiting
   for someone to widen the DTO. The columns are read by both drivers and exercised from seeds.
   *For the reviewer: if you want them writable now, it is one interface change plus a staff-only
   DTO, and it needs a route that does not exist yet.*

2. **`StudentProfile` keeps the staff fields; `StudentsService` projects them out.** The plan said
   the fields must never reach a student-facing response but not where the boundary sits. Putting it
   in the service (a `StudentProfileView` listing allowed keys) rather than in the repository means
   one stored shape, both drivers exercised, and an exact-key-set test that fails on a field added
   later.

3. **`reject`'s audit `after` carries `reason`.** The plan's table (§4.5) showed
   `after: {status:'rejected'}`. A `reason` that is validated and then dropped is drift, and this
   entry is the only durable record of why a person was refused. It is staff's own words about their
   own decision — no student PII, asserted (`expect(JSON.stringify(entry.after)).not.toContain('@')`).
   `null` when absent, so the field is always present.

4. **The retired enrol route's tests were retargeted, not deleted.** Seven cases in
   `courses.controller.spec.ts` exercised `controller.enroll`. `CoursesService.enroll` did not go
   anywhere — `accept` calls it — and its three properties (idempotent, 404 on an unknown course,
   refuses an unpublished one) are exactly what that transaction depends on. They now call the
   service. Deleting them with the route would have dropped the coverage and kept the risk.

5. **`InMemoryCourseRepository` moved its fixtures to a per-instance copy.** They were a shared
   module constant, which was harmless while read-only and is a cross-test leak now that `create`
   and `update` exist. Every other in-memory driver here already holds its rows on the instance.

6. **`vitest.config.e2e.ts` switched from the forked-process pool to `pool: 'threads'`.** See
   Blockers/findings §F-1 — this is a test-infrastructure change I made deliberately and it is the
   one config file I edited.

7. **The `/admin/*` parity table in `staff.e2e-spec.ts` grew 22 → 26** and the four new routes moved
   with it into a new file; see §F-1. Both probes name an *active* student and a taken slug, so both
   roles get the same 4xx and neither call mutates.

8. **`API_SPEC.yaml` gained `/auth/register`,** which was not in the file at all. The plan asked for
   register's response to be amended; there was nothing to amend. `/auth/login` and the other auth
   routes are still absent — recorded, not fixed, as it is outside this slice.

---

## Blockers hit

**None.** No requirement conflict and no missing business decision arose that R-2/R-5/R-6 had not
already settled. Nothing is left `[!]` in `IMPLEMENTATION_PLAN.md`.

### Findings — recorded, not fixed

**`F-1` — the e2e forked worker started dying silently, and I changed the pool to stop it.**

After this slice's additions, `npm run test:e2e` began exiting a worker mid-run roughly **one run in
three**, with *"Worker exited unexpectedly"* and **every assertion that had run still green** — the
summary reads `181 passed (228)` with `0 failed`, which is the worst shape a flake can take.

Measured rather than assumed:

| Tree | Runs | Result |
|---|---|---|
| Baseline (`git stash`, my source changes only reverted for the e2e files) | 6 | 217/217, **0 worker exits** |
| This slice, forks pool, block inside `staff.e2e-spec.ts` | 4 | 3 of 4 crashed |
| This slice, forks pool, block split into its own file | 6 | 2 of 6 crashed |
| This slice, forks pool, `NODE_OPTIONS=--max-old-space-size=4096` | 4 | 1 of 4 crashed |
| This slice, **threads pool** | 13 total | **228/228 every time, 0 worker exits** |

So it is a resource failure, not a test bug, and `vitest.config.e2e.ts`'s own existing comment
already attributes this exact symptom to resources (`fileParallelism: false` was the previous
mitigation for it). A worker **thread** shares the parent's heap instead of paying for a second V8
per file. I also split the new cases into `backend/test/registration.e2e-spec.ts`, which helped but
did not fix it on its own, and memoized the admin login in `app.e2e-spec.ts`, which did not help at
all (so it is not bcrypt).

**For the reviewer: this is the one build-config file I touched and it deserves your attention.**
If you would rather the pool stayed `forks`, the suite is green on `forks` more often than not, and
the honest alternative is to accept a flake that reports as a pass.

**`F-2` — the two drivers disagree about `enrolledCourseCount`.** `InMemoryStudentRepository` stores
it on the row and never recomputes it; `PostgresStudentRepository` derives it with a subquery. So
after any enrolment written later, the memory driver reports a stale number. Found because the e2e
*"gives a newly registered student a usable profile"* asserted `0` and, post-acceptance, should have
been `1` — it is `0` on the memory driver. **I did not fix it**: the in-memory repository cannot
count enrollments without calling another repository, which `CLAUDE.md` §5 forbids, so the fix is a
design decision (move the count to a service) and not mine to make in this slice. The e2e now
asserts the field's type and names this note; the property itself is asserted against Postgres.

**`F-3` — a signed-in student with zero enrollments is no longer reachable through the API.**
Acceptance is the only activation path and it always enrols. Four e2e cases needed such an account;
they now use one accepted into a group studying `course-2`, which holds no assessment, recording or
report fixture — the property they actually needed. The empty-state behaviour itself still has unit
coverage (`courses.controller.spec.ts`, `dashboard.controller.spec.ts`). **Worth a product
decision** in a later unit: there is no way to activate a student without enrolling them, which also
means no way to accept someone into a group whose course is unpublished (`CoursesService.enroll`
refuses a draft, and the whole accept transaction aborts with `Course not found`).

**`F-4` — junk in the repository root.** The planner flagged untracked files named `1`, `[a.id`,
`before`, `value`. They are still there and are not mine. I created three of my own by the same
mistake (`e.targetId`, `m.studentId)`, `!d.components.schemas[r])`) and **deleted those three**. The
original four are untouched.

---

## Tests — the real output

### Unit

```
$ npm test --workspace=backend

 Test Files  32 passed (32)
      Tests  515 passed (515)
   Start at  18:24:36
   Duration  16.82s
```

473 → **515**, 29 → **32 files**. 0 failing, **0 skipped**. New files:
`auth/registration-status.spec.ts` (10), `manage/registration-approval.service.spec.ts` (13),
`courses/course-admin.service.spec.ts` (10); the rest are cases added to existing files.

### e2e

```
$ npm run test:e2e --workspace=backend
exit=0

 Test Files  4 passed (4)
      Tests  228 passed (228)
   Start at  18:24:14
   Duration  14.72s

$ grep -c "Worker exited" <output>
0
```

217 → **228**. Ten consecutive runs on the threads pool, zero worker exits (§F-1).

### Integration — real PostgreSQL 15, from an empty database

```
$ docker exec tahirelshazli-db psql -U dev -d postgres \
    -c "DROP DATABASE IF EXISTS lms_migtest_u2bi;" -c "CREATE DATABASE lms_migtest_u2bi;"
DROP DATABASE
CREATE DATABASE

$ TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/lms_migtest_u2bi \
    npm run test:integration --workspace=backend
exit=0

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
[MigrationRunner] Applied 014_registration_and_student_profile.sql
[MigrationRunner] Seeded 001_development_fixtures.sql
[MigrationRunner] Seeded 002_staff_fixtures.sql
[MigrationRunner] Seeded 003_group_fixtures.sql
[MigrationRunner] Seeded 004_blog_fixtures.sql

 Test Files  1 passed (1)
      Tests  103 passed (103)
```

87 → **103**, **0 skipped**, **all 14 migrations from nothing**, on a database created empty
immediately before the run. Run twice: once with `014` alone before any service code was written
(87 passing — the R-5/§6 step-0 gate), and again at the end.

`014`'s post-conditions are asserted against the catalog, not inferred: the CHECK refuses `'pendng'`,
`users_waiting_idx` is partial on `status = 'waiting'`, the three profile columns exist and are
nullable, an insert without `status` still defaults to `'active'`, and **no `mode` column exists**.
The `accept` rollback is proved here — `setStatus('active')` then a throw inside `runInTransaction`
leaves the row `waiting`.

### Lint

```
$ npm run lint
…
src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars): Identifier 'EXTERNAL_WORK_BINDER' is imported but never used.
```

Exit 0. The one warning is **pre-existing** and was named in the brief.

### Frontend

```
$ cd frontend && npx tsc --noEmit 2>&1 | grep -cE "^lib/"
0
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
328
$ npx eslint .          # exit 0
```

**`lib/` at 0**, path-anchored. The legacy total moved **326 → 328**, and both are under `app/`,
both caused by this slice's contract changes, both in files unit 4 deletes:

| File | Error | Cause |
|---|---|---|
| `app/(app)/catalog/page.tsx:49` | `Property 'enroll' does not exist` | `api.courses.enroll` retired (`DOM-4`) |
| `app/(auth)/register/page.tsx:50` | `Property 'role' does not exist on type 'RegistrationResult'` | register returns no user (R-6) |

Both are the *correct* errors: they mark the two screens that unit 4 has to rebuild — a catalog with
no self-enrol button, and a sign-up that shows "waiting for approval" instead of navigating.

---

## Not done, and why

- **`AUTH-2`, `D-10`, migration `015`, the final `DOM-6` pass, `backend/src/staff/**`,
  `admin-staff.controller.ts`** — out of 2b-i by ruling R-5. **`015` was not authored, not even as
  an empty file.** `git diff --stat` shows nothing under `backend/src/staff/`;
  `staff-scope.service.spec.ts` is byte-identical.
- **`frontend/app/**` and `frontend/components/**`** — untouched (unit 4 deletes them).
- **Migrations `001`–`013`** — untouched.
- **`seeds/002`'s `assistant_scopes` row** — belongs with `015`, in 2b-ii.
- **`GET /courses/catalog`** — `PRODUCT_SPEC.md:205` marks Catalog `[REMOVED]` *"with open
  enrolment"*, but `DOM-4` retires only the enrol route. Still a candidate task, still not done
  (the plan §1 recorded it the same way).
- **`DELETE /admin/students/{id}/enrollments/{courseId}`** — not named by `DOM-4`; needs a
  `student.unenrolled` audit action. Not this slice.

---

## Documents updated

| Document | What changed |
|---|---|
| `docs/IMPLEMENTATION_PLAN.md` | `DOM-3`/`DOM-4`/`DOM-5` → `[x]` with what landed and what was learned; `DOM-6` notes seeds `001`/`002` moved with `014` and that `002` still owes its `assistant_scopes` row. |
| `docs/PHASE_ROADMAP.md` | Records the **2b-i / 2b-ii split** (R-5) with a slice table, what is explicitly out of 2b-i, and 2b-i's measured exit numbers. The security line now says the enrol route is *retired*, not re-roled. |
| `docs/CHANGELOG.md` | `D-13` (R-2's five documents amended), `D-14` (no token on register; the gate in `JwtStrategy`), `D-15` (enrol retired outright, and its consequence), `D-16` (`accept` returns a directory row), `D-17` (staff fields, never student-facing). |
| `docs/API_SPEC.yaml` | `+/auth/register`; accept/reject responses and status codes; `/admin/students` → `StudentDirectoryEntry`; `/admin/courses` `POST`/`PATCH` bodies and responses; **new** `StudentDirectoryEntry`, `Course`, `CourseWrite`, `CoursePatch`; **removed** `StudyMode` and `mode` from `StudentSummary`/`StudentWrite`. Parses clean, 42 paths, 33 schemas, **no dangling `$ref`**. |
| `docs/DOMAIN_MODEL.md` | `StudentProfile` loses `mode` and its conditional invariant; gains the "never student-facing" rule and how it is enforced. |
| `docs/DATABASE_PLAN.md` | `014` recorded as **run**, with its post-conditions and the `DEFAULT 'active'` trap; the `mode` column row and the conditional CHECK struck. |
| `docs/PRODUCT_SPEC.md` | the student record no longer gains `mode`. |
| `docs/SECURITY.md` | new §2.1a — the registration queue, both gates, why the refusals leak nothing, and the explicit `'waiting'`. |
| `project_log.md` | narrative entry for the slice. |
| `CLAUDE.md` | **not touched.** No durable rule, boundary or repository fact changed that it states. |

---

## For the reviewer — what I am least sure of

1. **The `pool: 'threads'` change in `vitest.config.e2e.ts`** (§F-1). It is a build-config edit made
   to fix a flake my own work exposed, and it is the judgment call in this slice I would most like
   a second opinion on. The measurements are above; the alternative is a suite that dies silently
   one run in three while reporting `0 failed`.
2. **`reject`'s audit payload carrying `reason`** (deviation 3). I departed from the plan's table
   because a validated-then-dropped field is drift. If you disagree, the field should be removed
   from the DTO too, not just from the payload.
3. **`StudentProfileUpdate` left without the staff fields** (deviation 1). The plan asked for them.
   I think a writable member with no writer on a student-driven path is worse than a gap, but it is
   a gap.
4. **`accept` calling `CoursesService.enroll`** — the plan specified it, and it means **accepting a
   student into a group whose course is unpublished fails the whole transaction with
   `Course not found`** (§F-3). That is arguably correct (you should not enrol someone on a draft)
   and arguably a confusing message for staff. Not a decision I made; a consequence I am flagging.
5. **`InMemoryCourseRepository`'s per-instance fixtures** (deviation 5). Correct, but it changes
   behaviour for anything that constructed two instances expecting shared state. Nothing did — all
   473 pre-existing tests still pass — but it is the kind of change that bites later.
6. **The `enrolledCourseCount` driver divergence** (§F-2) is real and untouched. It predates this
   slice and the fix is a design decision.

---

# Review follow-ups — closed 2026-09-20

`REVIEW_2B_I.md` returned **APPROVED WITH FOLLOW-UP**: no security, authorization, correctness or
requirements failure. All three items are documentation/evidence and none changes behaviour. The
reviewer reproduced every number independently, including 228 e2e across four consecutive runs with
zero worker exits, and **accepted the `pool: 'threads'` change**.

| Item | Status | What changed |
|---|---|---|
| **`F2B-1`** | `[x]` | `backend/src/audit/interfaces/audit-log-repository.interface.ts` — the comment on `AuditTargetType`'s `student` member claimed `accept` also writes a `group.student_assigned` entry. It does not. Rewritten to say what is actually written and **why one entry is right**: `student.accepted`'s `after` already carries `groupId` and `courseId`, and a second entry would be redundant *and* would mean routing through `GroupsService.addMember`, opening a nested transaction inside the one `accept` already holds. Since `DOM-4`, acceptance is the only placement path at registration, so no history is lost; `group.student_assigned` is still written by the staff placement route. The same correction is recorded in `PHASE_PLAN_2B.md` §4.5, where the claim originated. **Comment only — no code change, and none wanted.** |
| **`F2B-2`** | `[x]` | `backend/src/students/students.service.ts:30` cited `students.service.spec.ts`, which does not exist. The exact-key-set assertion is in `students.controller.spec.ts`. Citation fixed. |
| **`F2B-3`** | `[x]` | `backend/test/registration.e2e-spec.ts` — the case named *"400s a body the DTO does not declare"* never sent an undeclared field, and could not have proved that name: `whitelist: true` **strips** an undeclared field, it does not reject one. Renamed to *"400s a null over a NOT NULL column, a malformed slug and a missing required field"*, which is what its three assertions actually prove, with a comment naming the strip behaviour so the next reader does not re-file the finding. The `@IsOptionalNotNull` half was already sound and is untouched. |

**`SHELL-5` in `IMPLEMENTATION_PLAN.md` was corrected by the coordinator**, not by me: it said the
`JwtStrategy` refusal carries `'Invalid credentials'`; it carries `'Account no longer exists'`
(`jwt.strategy.ts:57`), identical to a deleted account, which is the correct property there.

**Recorded from the reviewer's `F2B-3` note: the threads pool is headroom, not immunity.** A
**fifth** booted `AppModule` will find the same wall. `fileParallelism: false` is still doing the
real work and `isolate` stays at its `true` default, so no two apps share a heap concurrently — the
thread pool only removed the second V8 per file. The next set of e2e cases that needs a booted app
should go into one of the four existing files, and a fifth file is a decision, not a default.

## Verification after the follow-ups

```
$ npm test --workspace=backend
 Test Files  32 passed (32)
      Tests  515 passed (515)

$ npm run test:e2e --workspace=backend
 Test Files  4 passed (4)
      Tests  228 passed (228)
```

**The integration suite was not re-run, and did not need to be:** all three items are a comment, a
citation and a test name, none of which is reachable from `postgres-repositories.integration-spec.ts`
or from any migration or SQL. Its last run stands as recorded above — 103 passing, 0 skipped, all 14
migrations from an empty database.
