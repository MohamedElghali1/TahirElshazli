# Execution notes — unit 1 (`AUTH-1` + `AUTH-3`)

Executor: `redesign-executor`, 2026-09-19. Written against `PHASE_PLAN.md` and
`COORDINATOR_RULINGS.md`; nothing here re-litigates a ruling.

Appended **as each step of `PHASE_PLAN.md` §6 completed**, deliberately, because the previous
executor run died on a session limit having written nothing and its progress was unrecoverable.

## Preflight

| Check | Result |
|---|---|
| Branch | `git rev-parse --abbrev-ref HEAD` → `redesign` ✔ |
| Working tree | `M CLAUDE.md`, `M docs/CHANGELOG.md`, `M docs/IMPLEMENTATION_PLAN.md`; untracked `.claude/agents/redesign/`, `.claude/commands/redesign-phase.md`, `docs/PHASE_ROADMAP.md`, `docs/phases/`. **No production source modified — nothing to reconcile.** ✔ |
| Baseline unit | `npm test --workspace=backend` → **26 files, 383 passed**, 34.73s, exit 0 ✔ |
| Baseline e2e | `npm run test:e2e --workspace=backend` → **3 files, 179 passed**, 22.22s, exit 0 ✔ |
| Baseline frontend | `cd frontend && npx tsc --noEmit \| grep -c "error TS"` → **301** ✔ |

All three baselines matched the coordinator's stated figures exactly.

## Step log (§6 sequencing) — all thirteen complete

- [x] 1. `011_full_admin_role.sql` — written, **not executed** (no Postgres; ruling 7)
- [x] 2. `Role.Admin` + `STAFF_ADMIN` / `STAFF_ALL` — `auth/roles.enum.ts`, new `auth/staff-roles.ts`
- [x] 3. `actorRoleOf` + **fourteen** call sites — new `auth/actor-role.ts`
- [x] 4. `isAdmin` → `isUnscopedStaffRole`; `blog.service.ts` `assertMayMutate` likewise
- [x] 5. The 14 `@Roles` decorators — all 25 sites re-listed and checked individually
- [x] 6. Fixtures: `admin-1` / `admin@example.com` / Mona Saleh in both drivers
- [x] 7. `findByRole` **and** `findIdsByRole` widened to `readonly Role[]`, both drivers, empty
       throws; `DirectoryService`; `all_tas` includes admin (ruling 3)
- [x] 8. `role-guards.spec.ts` — 34 tests. **Proved it can fail**, twice.
- [x] 9. `capabilities.ts` + `capabilities.spec.ts` — 39 tests
- [x] 10. `GroupsService.removeMember` `assertMay` + method-level `@Roles(...STAFF_ADMIN)`, one change
- [x] 11. e2e items 5–10; `staff-scope.service.spec.ts` addition; `groups.controller.spec.ts` item 11
- [x] 12. `frontend/lib/` — the three lines
- [x] 13. Docs

---

## What was built

### `AUTH-1`

**Migration.** `backend/src/database/migrations/011_full_admin_role.sql` — two
`ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT` widening `users_role_check` and
`audit_log_actor_role_check` to admit `'admin'`. `DROP CONSTRAINT` **without** `IF EXISTS`,
deliberately: the `IF EXISTS` variant would silently drop nothing and then add a second constraint,
and the intersection of the old narrow one and the new wide one is still narrow — so the first
`admin` insert would fail at runtime naming a constraint nobody knew was still there. Per ruling 5
it contains the two CHECK widenings **and nothing else**; `users.status` is `DOM-4`'s and takes its
own number.

**Role constants.** `backend/src/auth/roles.enum.ts` gains `Admin = 'admin'`, declared between
`Assistant` and `Teacher` so declaration order matches privilege order. New
`backend/src/auth/staff-roles.ts` holds `STAFF_ADMIN`, `STAFF_ALL` and `isUnscopedStaffRole`.

**The `actorRoleOf` refactor — the highest-value change in the unit.**
New `backend/src/auth/actor-role.ts`. Replaces **fourteen** derivations (the plan said twelve; see
Deviations): six private helper methods deleted, six inline ternaries replaced, and two hardcoded
`actorRole: Role.Teacher`. It validates against an exhaustive `Record<Role, true>` and **throws**
rather than defaulting.

| File | Sites | Old expression | An admin was logged as |
|---|---|---|---|
| `announcements/announcements.service.ts` | 1 | `=== Assistant ? Assistant : Teacher` | `teacher` |
| `blog/blog.service.ts` | 4 | same | `teacher` |
| `manage/manage-live-sessions.service.ts` | 3 (one helper) | same | `teacher` |
| `manage/manage-recordings.service.ts` | 3 (one helper) | same | `teacher` |
| `groups/groups.service.ts` | 6 (one helper) | `=== Teacher ? Teacher : Assistant` | `assistant` |
| `integrations/google/google-integration.service.ts` | 2 (one helper) | same | `assistant` |
| `manage/assessment-authoring.service.ts` | 4 (one helper) | same | `assistant` |
| `manage/grading.service.ts` | 1 | same | `assistant` |
| `manage/work-analytics-gate.service.ts` | 1 (one helper) | same | `assistant` |
| `staff/staff.service.ts` | 2 | hardcoded `Role.Teacher` | `teacher` |

**Authorization — the 14 decorator sites, checked individually, not pattern-matched.** All 25
`@Roles` sites in the build were re-enumerated from source and each classified before editing. Every
one of the six `Teacher`-only sites was confirmed to be an `@Controller('admin…')` before widening,
and every one of the seven `Assistant, Teacher` sites confirmed `@Controller('staff…')`, so
`STAFF_ADMIN` could not land on a `/staff/*` controller nor `STAFF_ALL` on an `/admin/*` one.

| Site | Path | Routes | → |
|---|---|---|---|
| `announcements/admin-announcements.controller.ts` | `admin` | 2 | `...STAFF_ADMIN` |
| `audit/admin-audit.controller.ts` | `admin/audit-log` | 1 | `...STAFF_ADMIN` |
| `groups/admin-groups.controller.ts` | `admin` | 6 | `...STAFF_ADMIN` |
| `integrations/google/admin-google-integration.controller.ts` | `admin/integrations/google` | 5 | `...STAFF_ADMIN` |
| `manage/admin-manage.controller.ts` | `admin` | 8 | `...STAFF_ADMIN` |
| `staff/admin-staff.controller.ts` | `admin/courses/:courseId/staff` | 3 | `...STAFF_ADMIN` |
| | | **25** | |
| `announcements/staff-announcements.controller.ts` | `staff` | 2 | `...STAFF_ALL` |
| `blog/staff-blog.controller.ts` | `staff/blog` | 6 | `...STAFF_ALL` |
| `common/storage/uploads.controller.ts` | `staff` | 2 | `...STAFF_ALL` |
| `groups/staff-groups.controller.ts` | `staff` | 5 | `...STAFF_ALL` + method override |
| `manage/staff-manage.controller.ts` | `staff` | 12 | `...STAFF_ALL` |
| `manage/work-analytics.controller.ts` | `staff` | 7 | `...STAFF_ALL` |
| `staff/staff.controller.ts` | `staff` | 1 | `...STAFF_ALL` |
| | | **35** | |
| `notifications/notifications.controller.ts` | `notifications` | 3 | `Role.Student, ...STAFF_ALL` |
| **Total** | | **63** | |

**Untouched, confirmable by absence** — the eleven student-only sites
(`student-announcements`, `assessments`, `courses`, `dashboard`, `student-home`, `classmates`,
`live-sessions`, `materials`, `recordings`, `reports`, `students`) and the four public controllers.
`roles.guard.ts` was not opened. No `@Public()` route added. Guard order unchanged.

**The two `=== Role.Teacher` bypasses.** `staff/staff-scope.service.ts` `isAdmin` and
`blog/blog.service.ts` `assertMayMutate` both now call `isUnscopedStaffRole`. `StaffScopeService`'s
`assertAssigned`, `scopeFor`, `findAssignment`, `assign`, `unassign` and the
`'Course not found or not assigned to you'` string are byte-untouched; `course_staff_assignments`,
`CourseStaffRepository` and both its drivers were never opened (ruling 1).

**Fixtures.** `admin-1` / `admin@example.com` / `Role.Admin` / `'Mona Saleh'` in
`in-memory-user.repository.ts` and `002_staff_fixtures.sql`, same published `password123` hash.

**Repositories (ruling 2).** `findByRole(role: Role, …)` → `findByRole(roles: readonly Role[], …)`,
and `findIdsByRole` likewise. The safety property is preserved and strengthened: the parameter stays
required, and **both drivers throw on an empty array** rather than treating it as "all accounts".
The Postgres driver uses `role = ANY($1::text[])` — still parameterised, no concatenation.
`DirectoryService.students` passes `[Role.Student]`; `assistants` passes
`[Role.Assistant, Role.Admin]` and emits `role` via a new `StaffDirectoryEntry`. No `scope`,
`groupIds`, `status` or `lastSeenAt`.

**`all_tas` (ruling 3).** `announcements.service.ts` resolves over `[Role.Assistant, Role.Admin]`.
`STAFF_ALL` deliberately **not** used: the teacher is the sender, not an audience member.

### `AUTH-3`

`backend/src/auth/capabilities.ts` — a pure module, no `@Injectable`, no provider, no fourth
`@Global()`. `Capability` is the four withheld verbs; `ASSISTANT_CAPABILITIES` is an exhaustive
`Record<Capability, boolean>` (all four `false`); `may` / `assertMay`; teacher and admin hold
everything, every other role holds nothing, one capability-independent refusal message.

`DELETE /staff/groups/:groupId/members/:studentId` → method-level `@Roles(...STAFF_ADMIN)` on
`StaffGroupsController.removeMember` (path unchanged, handler not moved to the admin controller), and
`assertMay(actor, 'group.member.remove')` as the **first statement** of `GroupsService.removeMember`
— both in the same change. 403, not 404, per `API_SPEC.yaml:726`.

### Frontend

`frontend/lib/types.ts` — `Role` union gains `'admin'`. `frontend/lib/roles.ts` — `isStaffRole` and
`isAdminRole` accept `'admin'`, and the now-false comment ("there is no separate 'admin' role; the
teacher *is* the admin") is replaced (appendix fix 1). No component, no screen, no `lib/api.ts`.

---

## Security — `CLAUDE.md` §8 walk-through

Items that **applied**, and how each was addressed:

- **Authorization / object-level access.** The whole unit. 63 routes widened, 1 narrowed. Every
  object-level gate downstream is role-independent and unchanged — `StaffScopeService.assertAssigned`
  returns `null` for an unscoped actor, so the admin takes the teacher's exact path. Verified by the
  24-route parity table rather than by reasoning: an admin gets byte-identical status codes to the
  teacher on every `/admin/*` route.
- **Over-widening (`SECURITY.md` §2.7 — the silent failure).** Addressed three ways. (1) `STAFF_ADMIN`
  contains no `Assistant`, asserted directly. (2) Every `admin/`-mounted controller is asserted to
  admit neither `Assistant` nor `Student` nor `Parent` nor `Visitor`, with the count of admin
  controllers pinned at 6 so a seventh cannot arrive unexamined. (3) The pre-existing TA-on-`/admin/*`
  403 table was **kept unedited** and still passes.
- **Anti-enumeration (404-not-403).** `staff-scope.service.spec.ts:48-63` **not edited** — the
  identical-message assertion passes unchanged. The four-route 404 table in `staff.e2e-spec.ts` **not
  edited**. Extended, never weakened: the admin cases were added as `it.each` rows beside the existing
  teacher ones, and the diff removes only the two `it(` headers being converted.
- **Error leakage.** The capability refusal message names no capability, so a caller cannot map the
  permission model one refusal at a time; asserted identical across all four verbs. The e2e 403 body
  is asserted to contain no SQL, no stack, no group id and no student id.
- **Fail-closed default.** `roles.guard.ts` untouched. Additionally `role-guards.spec.ts` asserts no
  route handler *relies* on it — every handler resolves to an explicit `@Roles` / `@Public` /
  `@AnyRole`, so a controller cannot land undecorated and be hidden by a 403.
- **CSRF / token & session security.** The `@Public()` surface is now pinned to exactly ten handlers
  by a test, so adding one becomes a test failure rather than a one-line diff. No `@Public()` added.
  `jwt.strategy.ts` untouched — its per-request role re-read is what makes `admin` take effect
  immediately.
- **SQL injection.** The one new predicate is `role = ANY($1::text[])`, parameterised. No string
  building. Migration `011` is static DDL with literal values.
- **Sensitive-data exposure / field minimisation.** `StaffDirectoryEntry` adds `role` and nothing
  else; asserted that `passwordHash` is absent from the directory row.
- **Audit logging.** The unit adds **no** `AuditAction`, so no union entry and no
  `Record<AuditAction, true>` entry were needed — the 27 members are unchanged. All fourteen
  `audit.record` call sites stayed inside their enclosing `runInTransaction`; none was relocated.
  `actorRoleOf` is evaluated inside the transaction, as the ternaries were.
- **Environment configuration.** The seed adds a row carrying the published fixture hash;
  `resolveAutoSeed` already refuses production, and the seed file now says so at the point of risk.

Items that **did not apply**: input validation (no new DTO, no new body field), file upload / path
traversal, SSRF, XSS / `dangerouslySetInnerHTML`, rate limiting and brute-force lockout, secrets
management, dependency security, CORS. **One judgement call inside "validation":** the Google OAuth
state token's role is now resolved by `actorRoleOf` inside the existing `try`, so a state token
carrying no usable role is refused as the invalid state token it is (403, existing message) rather
than throwing a 500 from inside the audit write. See Deviations.

**Design questions (`IMPLEMENTATION_PLAN.md` §Verification): N/A, stated explicitly rather than
left to inference.** This unit touches no screen. The only frontend change is three lines in
`frontend/lib/`, which render nothing.

---

## Deviations from the plan

All four are additive or clarifying; none narrows the plan. Recorded because an unrecorded deviation
is the failure mode.

1. **Fourteen `actorRole` sites, not twelve.** The plan's table listed twelve and separately said
   `staff/staff.service.ts:180,228`'s two hardcoded `actorRole: Role.Teacher` could be left for
   `AUTH-2`, noting that routing them through `actorRoleOf` "is a two-line change and strictly better;
   it is not required." **I took the offered option.** Reason: both sit on
   `AdminStaffController`, which this unit widens to the admin, so leaving them would have opened
   exactly the window step 3 exists to close — an admin assigning a TA would be filed as Dr. Tahir,
   permanently. `staff.service.ts` is not on ruling 1's do-not-touch list and the change is two lines
   plus a comment.
2. **The Google OAuth state role is resolved at verification, not at the audit write.** The plan said
   replace at the record site. Doing only that would make a state token with no role throw a 500 from
   inside `runInTransaction`, aborting the connect — where the old code silently filed it as
   `assistant`. Resolving it inside the existing `try` means such a token is refused as an invalid
   state token, which is what it is, with the existing message and status. No new behaviour invented,
   smaller blast radius.
3. **`findIdsByRole` was widened too, not just `findByRole`.** Forced by ruling 3 (`all_tas` must
   reach the admin), which the plan describes as "reusing the same multi-role widening". Both now
   throw on an empty array — for `findIdsByRole` that property matters more, since "no filter" there
   would mail the whole platform.
4. **Method, not substance, on "watch the R-3 test fail first."** The coordinator asked me to write
   the attribution e2e test before the fix and watch it fail. §6 step 3 requires the `actorRoleOf`
   refactor **before** the decorators widen, precisely so the wrong-attribution window never opens; I
   kept §6's order, which means no admin could act while the ternaries were live. I proved the test
   can fail by the equivalent, isolated method instead — reverting the specific line under test. Real
   output in Tests below. I also added a second attribution test on a different service family
   (`groups.service.ts`, which failed in the *opposite* direction) so the fix is not one site deep.

**Two existing tests changed their expected values**, because settled decisions changed the
behaviour they assert. Neither was deleted, skipped or weakened, and both gained a comment saying
what changed and why:
- `announcements.controller.spec.ts` `all_tas` recipient count `3` → `4`, and
  `staff.e2e-spec.ts` `2` → `3` (ruling 3 — the admin is now a recipient).
- `staff.e2e-spec.ts` "lets a TA place and remove a student" → "lets a TA place a student, and no
  longer lets them remove one": the removal is now 403 for the assistant and 204 for the teacher.
  That is `AUTH-3`'s narrowing, and keeping both halves in one test is what makes "add stays, remove
  moves" two assertions rather than one.
- `manage.controller.spec.ts` "lists assistants for the assignment picker" asserted
  `email.includes('assistant')`, which `admin@example.com` fails. Rewritten to assert the **roles**
  present, which is what the test meant, and strengthened with explicit include/exclude ids.

---

## Blockers hit

**One, and it is the environment, not the work.** Ruling 7 already settled it; re-verified myself
rather than taken on report.

**`SPEC-12` / DoD point 2 — migration `011` has never run against real PostgreSQL.**

```
$ df -h /c        → C: 110G size, 102G used, 8.5G avail, 93%
$ </dev/tcp/127.0.0.1/5432   → 5432 closed
$ command -v psql            → no psql
$ docker info                → failed to connect to the docker API at
                               npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is
                               correct and if the daemon is running
```

**One factual update to the planner's finding:** `C:` now reports **8.5 GB available**, not the 0
bytes `PHASE_PLAN.md` §2 recorded. So the disk half of the blocker has eased and the remediation is
now the shorter one — **start Docker Desktop → `docker compose up -d db` → run the integration suite
with `TEST_DATABASE_URL` against an empty schema → record the real output → close `SPEC-12`**. 8.5 GB
is enough for `postgres:15`, though not generous.

Per ruling 7: **`AUTH-1` is `[~]`, not `[x]`. Unit 1 is `[~]`, not complete.**

**Residual risk this leaves (`PHASE_PLAN.md` §9 R-2).** `011` will be applied for the first time in
the same run as `009` and `010`, which have also never run. `MigrationRunner` stops at the first
failing file, so a defect in either **masks `011` entirely** — you learn nothing about `011` until
`009`/`010` are green. The likeliest first-run finding is `010`'s `NUMERIC(10,2)` columns, which `pg`
returns as **strings**; invisible on the memory driver, where the fixture is a JS number.

No other blocker. No task was left `[!]` for a missing decision: nothing in `AUTH-1` or `AUTH-3`
required inventing business behaviour, because rulings 1–8 had already decided every open question
the planner raised.

---

## Tests — real output

### `npm test --workspace=backend`

```
 Test Files  28 passed (28)
      Tests  467 passed (467)
   Start at  23:24:13
   Duration  10.39s (transform 4.12s, setup 0ms, import 38.01s, tests 13.98s, environment 9ms)
```

Baseline 26 files / 383. **+2 files, +84 tests.** Nothing deleted, nothing skipped.
New: `auth/role-guards.spec.ts` (34), `auth/capabilities.spec.ts` (39). Additions to
`staff-scope.service.spec.ts` (13 → 15), `groups.controller.spec.ts` (26 → 32),
`manage.controller.spec.ts` (+2).

### `npm run test:e2e --workspace=backend`

```
 Test Files  3 passed (3)
      Tests  216 passed (216)
   Start at  23:24:33
   Duration  12.21s (transform 1.61s, setup 0ms, import 6.62s, tests 5.03s, environment 0ms)
```

Baseline 179. **+37**, against the plan's "M ≥ 30".

### `npm run test:integration --workspace=backend` — **SKIPPED, not passing**

```
 Test Files  1 skipped (1)
      Tests  81 skipped (81)
   Start at  23:24:46
   Duration  1.08s (transform 269ms, setup 0ms, import 892ms, tests 0ms, environment 0ms)
```

**81 tests skipped. This is not a pass and must not be read as one.** The suite skips itself without
`TEST_DATABASE_URL`, and there is no reachable PostgreSQL on this machine. Three integration tests
were **written** against the new behaviour and have **never executed**: the `admin` role surviving a
real round trip (the one thing only a real database can prove, since migration `011` is what lets
`users_role_check` accept the value), multi-role `findByRole`, and `findByRole([])` /
`findIdsByRole([])` rejecting rather than returning everything.

### `npm run lint --workspace=backend`

```
src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars): Identifier 'EXTERNAL_WORK_BINDER' is imported but never used.
```

The one warning is **pre-existing** — confirmed by `git stash -u`, re-running lint (same single
warning), and `git stash pop`. It is in a spec file this unit never opened. No new finding. Thirteen
`Role` imports that my own edits made unused were removed rather than left.

### `cd frontend && npx tsc --noEmit | grep -c "error TS"`

```
301
```

Exactly the baseline. **Zero in `lib/`** (`grep -c "^lib/"` → `0`), which is the whole reason the
count is a valid check for a `lib/`-only change. The 301 are `SHELL-4`'s and were not touched.

### `cd frontend && npx eslint .`

```
(no output — clean)
```

### Proving the guard test can fail — `role-guards.spec.ts`

A guard test that cannot fail is a comment. Two experiments, opposite directions, both reverted.

**A — over-widening (the silent failure).** `admin-audit.controller.ts`'s import changed to
`STAFF_ALL as STAFF_ADMIN`, so `/admin/audit-log` admits an assistant:

```
× AdminAuditController carries exactly its expected roles
× no controller under admin/ admits an assistant, student, parent or visitor
      Tests  2 failed | 32 passed (34)
```

**B — missed widening (the loud failure).** `staff-manage.controller.ts` reverted to
`@Roles(Role.Assistant, Role.Teacher)`:

```
× StaffManageController carries exactly its expected roles
      Tests  1 failed | 33 passed (34)
```

Both files restored; `git diff` confirms each now differs from `HEAD` by exactly the intended
two-line widening, and the spec is back to `34 passed (34)`.

### Proving the R-3 attribution test can fail

`grading.service.ts`'s `actorRole` temporarily reverted to the original
`actor.role === Role.Teacher ? Role.Teacher : Role.Assistant`, then the e2e attribution test run:

```
× records the admin as admin in the audit log, not as a teacher or an assistant
AssertionError: expected { actorId: 'admin-1', …(9) } to match object { actorId: 'admin-1', …(2) }
-   "actorRole": "admin",
+   "actorRole": "assistant",
      Tests  1 failed | 215 skipped (216)
```

**`actorRole: 'assistant'` — the admin's marking filed inside the assistant activity trail**, which
is exactly the defect R-3 describes and the half that poisons `PEOPLE-5`. Restored; `git diff` on the
file shows only the intended two-line change, and the test re-runs `1 passed | 215 skipped (216)`.

### Proving the "before the repository is touched" assertion can fail

This one caught a weak test of my own. The first version spied on `findMembers` and `removeMember`.
With `assertMay` deliberately moved *after* `requireGroup`:

```
      Tests  32 passed (32)      ← still green. The test could not fail.
```

`assertMay` still threw before `findMembers`, so the spy proved nothing about ordering. Strengthened
to spy on `findById` — the actual first read, via `requireGroup` — and re-run with `assertMay` still
misplaced:

```
× refuses an assistant before the repository is touched
AssertionError: expected "findById" to not be called at all, but actually been called 1 times
      Tests  1 failed | 31 passed (32)
```

`assertMay` restored to the first statement; `32 passed (32)`.

### The three tests the coordinator marked must-not-edit

All three pass **unchanged**. Verified by reading the diff rather than by assertion:
`git diff -U0 backend/test/staff.e2e-spec.ts | grep "^-"` removes exactly four lines — three from the
`all_tas` recipient-count comment and count, and one `it(` header being renamed for the `AUTH-3`
narrowing. Neither the TA-on-`/admin/*` 403 table nor the four-route 404 table appears among them.
`git diff -U0 src/staff/staff-scope.service.spec.ts | grep "^-"` removes six lines, all from the two
`it(` headers converted to `it.each` and the "no other role" role list being extended — **nothing from
the anti-enumeration test**. I did not need to edit any of the three, so there is no finding here.

---

## Not done, and why

- **Migration `011` never executed.** DoD point 2 NOT MET. Environment. Above.
- **The three integration tests written for this unit have never run.** Above.
- **`AUTH-2`, `AUTH-4`, `AUTH-5`** — out of scope by ruling 1. `AUTH-5` stays `[!]` on `D-1`.
- **`API_SPEC.yaml` not edited**, and that is correct: the spec was written against the
  post-redesign target, so this unit's job was to make the code match the contract. DoD point 10 is
  satisfied by verification, below.
- **`D-d`** (are invitation accept/resend audited) left open for `AUTH-4`'s planner, flagged in
  `IMPLEMENTATION_PLAN.md` so it is costed rather than discovered.
- **`D-b`/ruling 4** — `lastSeenAt` emits `null`; no hot-path write added. Filed as `PHASE_PLAN.md`
  appendix fixes 2 and 3 were left alone, as ruling 8 directs.

---

## API spec verification (DoD point 10)

Checked all 53 `x-roles` entries programmatically against the implemented boundary.

> **Corrected 2026-09-19 in the remediation pass.** The sentence below originally read "**No
> disagreement on any implemented route**", which overstated what was checked: the comparison was
> **role sets only**, not response schemas, and `GET /admin/assistants` does disagree on its schema —
> `API_SPEC.yaml:563` responds `Assistant[]`, whose `required` set includes `scope` and `status`
> (both absent, deferred by ruling 2), and `createdAt` is returned but undeclared. Filed for
> `PEOPLE-4` in `IMPLEMENTATION_PLAN.md`, which is where `scope`/`status` actually land. See
> `REVIEW.md` finding 5.

**No disagreement on any implemented route's role set** — response schemas were not compared; see the
correction above. Every `/admin/*` entry carries both `teacher` and
`admin`; every `/staff/*` entry carries `admin`. The only implemented `/staff/*` entry that excludes
`assistant` is `/staff/groups/{groupId}/members/{studentId}` → `[teacher, admin]` with a `'403'`,
which is exactly the narrowing built.

Three findings, all **recorded, not fixed** — fixing any would move the contract away from the target:

1. **`/notifications` is absent from `API_SPEC.yaml` entirely.** Three implemented routes, widened by
   this unit to `Role.Student, ...STAFF_ALL`, with no path entry in a spec marked `[x]` and validated.
   The most substantive of the three.
2. **Two `/admin/*` entries admit an assistant** — `/admin/students/{studentId}:460`
   `[teacher, admin, assistant]` and `/admin/announcements/reach:1124`
   `[assistant, teacher, admin]` — against `CLAUDE.md` §6's rule that `/admin/*` is teacher/admin and
   unscoped. Both are **unimplemented** target routes, so no code is wrong; the contract disagrees
   with itself, and whoever implements them has to resolve it.
3. **`/me/profile` and `/me/notification-preferences`** are specified at `/me/*` with
   `[assistant, teacher, admin]`, but the implemented routes are `students/me/profile` on
   `StudentsController` with `@Roles(Role.Student)`. Different paths and different audiences — a staff
   self-service surface that does not exist yet, not a drift in what is built.

Also cosmetic: the four unimplemented `/staff/*` session and report routes already read
`[teacher, admin]`, so `SESS-` and `RPT-` inherit narrowings they should not rediscover.

---

## Documents updated

| File | What changed |
|---|---|
| `docs/IMPLEMENTATION_PLAN.md` | `AUTH-1` → `[~]` with DoD point 2 recorded NOT MET and the real figures; `AUTH-3` → `[x]` with its dependency corrected from `AUTH-2` to `AUTH-1`; `AUTH-2` re-homed to unit 2 with the reason; `AUTH-4` re-homed to unit 5; `DOM-4` told to take its own migration number; new `PEOPLE-6` `[!]` for `lastSeenAt` (ruling 4) |
| `docs/PHASE_ROADMAP.md` | §4 unit 1 rescoped to `AUTH-1`+`AUTH-3` and set `[~]` with why it cannot reach `[x]`; unit 2 gains `AUTH-2` plus the inherited `AuditAction`-retirement trap; unit 5 gains `AUTH-4` and what it inherits; §5's graph corrected — it no longer draws a loop between units 1 and 2 |
| `docs/CHANGELOG.md` | Two new decisions: the `AUTH-2`→unit 2 / `AUTH-4`→unit 5 re-sequencing with the full argument including the point that weakens our own case, and `all_tas` reaching the admin (ruling 3 — recorded as a decision because it changes who receives mail). Plus two in-place corrections at their source: "~30 `@Roles` sites" → 14 sites / 63 routes, and "eight calling services" → nine |
| `docs/DATABASE_PLAN.md` | §7 migration order — `011` is the two CHECK widenings **and nothing else**, `users.status` moved to `012`+ (ruling 5 / D-c), with why a migration file is immutable; §8's 009/010 risk row updated to say the mitigation was **not** met and what exposure remains |
| `docs/AUTHORIZATION_MODEL.md` | §1 the real size of the widening and both constants, plus the note that the compiler gives no help; §3 the four withheld verbs recorded as **built**, with the three properties of the preset and the two-layer refusal; §6 the `admin`-role and assistant-capability gaps closed, with `011`'s unverified state stated |
| `docs/ARCHITECTURE.md` | §2.4 "Eight services call it" → **nine**, named, with why the count matters for `AUTH-2` |
| `docs/SECURITY.md` | §2.7 "~30 routes" → 63 routes / 14 sites; that adding a `Role` produces zero compile errors; and the mitigation as actually built, including that the guard test was verified to fail in both directions |
| `CLAUDE.md` | **Four factual corrections only, no rule changed:** the two `383 tests, 26 files` figures → `467 tests, 28 files`; the role list now includes `admin` with `STAFF_ALL`, the never-`Assistant` rule, the no-compile-error fact and `actorRoleOf`; "Eight services call it" → nine. Flagged explicitly here because it is `CLAUDE.md` |
| `project_log.md` | One entry: what landed, why the `actorRole` refactor was the part that mattered, the two tests made to fail on purpose, what is not done, the narrowed scope, and the follow-ups |

---

## For the reviewer — what I am least sure of

1. **Migration `011` is unverified, and that is the single thing that keeps this unit from
   `APPROVED`.** I believe the constraint names `users_role_check` and `audit_log_actor_role_check`
   are what Postgres generated for the inline column CHECKs at `001:27` and `002:65-66`, both
   unambiguously inline and well under the 63-character limit — but this has **never been observed
   against a real database for these two tables**. If either name differs, `011` aborts inside its own
   transaction, the ledger is not written, nothing is half-applied, and the boot fails loudly. That is
   the intended failure mode and the reason `IF EXISTS` is absent. **Please check the reasoning, not
   the result — there is no result.**
2. **The 24-route parity table proves parity through status-code equality, which required choosing
   repeatable request shapes.** Mutating routes address nonexistent resources (404) or the
   unconfigured Google driver (503). That is a real design compromise: it proves the *role gate* is
   passed identically, which is what `AUTH-1` changes, but it does **not** exercise the admin
   performing a successful mutation on most of those routes. The successful-mutation case is covered
   separately and narrowly — the admin grading a submission, creating a group, and removing a group
   member. If you think the table should drive real writes on all 24, say so; I judged a repeatable
   status comparison more trustworthy than an order-dependent one.
3. **`role-guards.spec.ts` uses `import.meta.glob`**, which is Vite's and needed a locally-declared
   `ViteImportMeta` interface because the backend `tsconfig.json` does not pull in `vite/client`. I
   chose that over adding `vite/client` to the whole workspace's ambient types for one spec. It is the
   only unusual thing in the diff and worth a second opinion. Its `expect(CONTROLLERS).toHaveLength(29)`
   is intentional friction: a new controller fails this test until someone decides its roles.
4. **`GET /admin/assistants` now returns a row the course-staff picker cannot act on.** Ruling 2
   required listing the admin and emitting `role`; `StaffService.assign` refuses a non-assistant
   (`staff.service.ts:153`). So the admin appears in a picker whose action would 400 on her. The
   emitted `role` is what lets the console suppress the action, but **no frontend consumes it yet** —
   that is `PEOPLE-4`. A settled ruling, and a consequence worth seeing rather than discovering.
5. **The Google OAuth state deviation (Deviations #2)** is the only place I changed a failure path
   rather than a role set. I believe it is strictly better and invents nothing, but it is a behaviour
   change on an error path with no test exercising a role-less state token — the token is minted by
   the same service and always carries `actor.role`, so I could not construct one without weakening
   the mint. Worth a look.
6. **`actorRoleOf` throws `InternalServerErrorException`** on an unrecognised role. That is deliberate
   — the role came off a verified JWT, so an unknown value is our bug, and filing it as `assistant` to
   keep the request alive is how this defect class recurs. But it means a corrupted actor now fails a
   mutation that previously succeeded with a wrong audit entry. I think a refused write beats a false
   record in an append-only log; it is a judgement call and it is unexercised by any test, because
   nothing in the codebase can currently produce such an actor.

---

# Remediation pass

Executor: `redesign-executor` (second run), 2026-09-19, after `REVIEW.md` returned
`APPROVED WITH FOLLOW-UP`. Scope was fixed by the coordinator: the six items below and nothing else.
No refactor, no re-touching `@Roles`, no `AUTH-2`/`AUTH-4` work, `CLAUDE.md` not opened.

**Preflight.** `git rev-parse --abbrev-ref HEAD` → `redesign`. Working tree as the coordinator
described it. Baseline re-measured before any edit: **28 files, 467 passed**, exit 0.

## What was built

### F-1 — the frontend mirror carries `role`

- `frontend/lib/types.ts` — new `StaffDirectoryEntry extends DirectoryEntry { role: Role }`,
  mirroring `manage/directory.service.ts:31-33`, with the reason `role` is on the wire and the note
  that `scope`/`status`/`lastSeenAt` are `PEOPLE-4`.
- `frontend/lib/api.ts:852` → `request<StaffDirectoryEntry[]>`. The `DirectoryEntry` import became
  unused and was removed, `StaffDirectoryEntry` added in its alphabetical place — otherwise
  `npx eslint .` would have gained a warning this pass introduced.

`DirectoryEntry` itself is unchanged and still the base of both `StudentDirectoryEntry` and
`StaffDirectoryEntry`, so nothing else in `lib/` moved.

### F-2 — the capability spec is now a mechanism

Two changes, because one was not enough:

- `backend/src/auth/capabilities.ts` — new exported
  `ALL_CAPABILITIES: readonly Capability[] = Object.keys(ASSISTANT_CAPABILITIES)`. Derived at run
  time from the preset's own keys, deliberately **not** a second literal: a literal would reintroduce
  the mirror it exists to remove. `ASSISTANT_CAPABILITIES` stays private.
- `backend/src/auth/capabilities.spec.ts` — `WITHHELD` is no longer a hand-written `Capability[]`. It
  is `Object.keys` of an exhaustive `WITHHELD_PRESET: Record<Capability, true>`, and the first test now
  asserts `[...WITHHELD].sort()` **equals** `[...ALL_CAPABILITIES].sort()` instead of
  `toHaveLength(4)`.

The comment that claimed the list "is asserted against the exhaustive `Record` the module holds" is
now **true**, and says which of the two failures is load-bearing: vitest transpiles without
typechecking, so the compile error alone would not turn `npm test` red.

**Proved it can fail.** Temporarily added a fifth capability `'payment.refund'` to the `Capability`
union and to `ASSISTANT_CAPABILITIES` — so the module still compiled, a value *was* decided, which is
exactly the case the old spec let through:

```
 ❯ src/auth/capabilities.spec.ts (39 tests | 1 failed) 20ms
     × covers every capability in the union 9ms

 FAIL  src/auth/capabilities.spec.ts > assistant capabilities > covers every capability in the union
AssertionError: expected [ 'account.delete', …(3) ] to deeply equal [ 'account.delete', …(4) ]

- Expected
+ Received

  [
    "account.delete",
    "enrollment.remove",
    "group.member.remove",
-   "payment.refund",
    "registration.reject",
  ]

 ❯ src/auth/capabilities.spec.ts:48:34
 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
```

And the compile-time half, `npx tsc --noEmit -p tsconfig.json` while still patched:

```
src/auth/capabilities.spec.ts(23,7): error TS2741: Property '"payment.refund"' is missing in type
'{ 'account.delete': true; 'enrollment.remove': true; 'group.member.remove': true;
'registration.reject': true; }' but required in type 'Record<Capability, true>'.
```

**Reverted.** `grep -c "payment.refund" backend/src/auth/capabilities.ts` → `0`, and the spec back to
`1 passed (1)` / `39 passed (39)`.

### Finding 3 — the guard test reads the resolved, per-handler verdict

`backend/src/auth/role-guards.spec.ts`. The `/admin/*` boundary test — renamed from "no **controller**
under admin/ admits…" to "no **route** under admin/ admits…" — now iterates `handlersOf(entry)` and
reads `resolve<Role[]>(ROLES_KEY, entry.cls, fn)`, the file's own reproduction of
`getAllAndOverride([handler, class])`, instead of `Reflect.getMetadata(ROLES_KEY, entry.cls)`. It
asserts per handler that the resolved set is non-empty and contains none of assistant, student, parent
or visitor. The six-controller count assertion is unchanged, and a new assertion fails a `/admin/*`
controller that exposes no route at all.

`:166`'s exact-match test was deliberately **left reading class metadata**: `EXPECTED` is a per-class
table, and `staff-groups.controller.ts:109` is a legitimate method-level *narrowing*, so making that
test per-handler would assert a boundary the design does not hold. The admin boundary test is where
the handler-level check belongs.

**Proved it can fail.** Temporarily added `@Roles(...STAFF_ALL)` to
`AdminManageController.assistants` — a method-level over-widening on a `GET`, the exact scenario the
review named:

```
 ❯ src/auth/role-guards.spec.ts (34 tests | 1 failed) 22ms
       × no route under admin/ admits an assistant, student, parent or visitor 7ms

 FAIL  src/auth/role-guards.spec.ts > the authorization boundary > the /admin/* boundary >
 no route under admin/ admits an assistant, student, parent or visitor
AssertionError: AdminManageController.assistants (admin) admits assistant:
expected [ 'assistant', 'teacher', 'admin' ] to not include 'assistant'
 ❯ src/auth/role-guards.spec.ts:236:19
 Test Files  1 failed (1)
      Tests  1 failed | 33 passed (34)
```

**Note which tests stayed green under that patch: every other one, including
`'AdminManageController carries exactly its expected roles'`.** That is the gap, demonstrated rather
than argued — one failure now where there would have been none before.

**Reverted.** `git diff -- backend/src/manage/admin-manage.controller.ts` is back to unit 1's four
intended lines (`Role.Teacher` → `...STAFF_ADMIN`, `DirectoryEntry` → `StaffDirectoryEntry`) with no
`STAFF_ALL` import and no `EXPERIMENT` marker anywhere in the file.

### Finding 5 — `IMPLEMENTATION_PLAN.md`'s second dependency graph

`docs/IMPLEMENTATION_PLAN.md` §Dependency graph. `├─> AUTH-2 ──> AUTH-3 ──> (all /staff/*)` became
`├─> AUTH-2 ──> (all /staff/* rescoped group-wise)`, and `AUTH-3` now hangs off `AUTH-1` beside
`DOM-4` and `DOM-5`. A sentence under the critical path records the correction and why it matters — a
planner reading the old edge would budget a slice for work that shipped in unit 1. The critical path
itself is unchanged and still correct: it never ran through `AUTH-3`.

### Finding 6 — the orphaned docblock and the misnamed message

- `backend/src/auth/repositories/in-memory-user.repository.ts` — the `SEED_PASSWORD_HASH` docblock is
  back immediately above `SEED_PASSWORD_HASH`; `requireRoles` and its own docblock now sit below the
  constant.
- Both drivers: `'findByRole requires at least one role'` → `'a role filter requires at least one
  role'` (`in-memory-user.repository.ts:27`, `postgres-user.repository.ts:41`), because the same
  function guards `findIdsByRole`. No test asserts the string — `grep -rn "requires at least one role"
  backend/src backend/test` returns only the two throw sites — so nothing was weakened to make this
  pass; the three `rejects.toThrow()` assertions are message-agnostic and still assert the refusal.

### Finding 4 and the escalation — filed, not fixed

- **`EXECUTION_NOTES.md:442` corrected in place** with a marked block: the `x-roles` check compared
  **role sets only**, so "no disagreement on any implemented route" overstated it.
- **`PEOPLE-4`** now carries the `Assistant` response-schema gap explicitly: `scope`/`status` absent
  (ruling 2, both need `AUTH-2`), `createdAt` returned but undeclared at `API_SPEC.yaml:563`, and the
  note that `scope`/`status` will need the same mirror treatment `role` just got.
- **`SPEC-16` `[!]`** — reconcile `/notifications` into `API_SPEC.yaml`. Three implemented routes
  (`GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read`, verified off
  the controller rather than copied from the notes), no path entry. **The spec was not authored** —
  that is a contract decision. Blocked on new **`D-8`**.
- **`SPEC-17` `[!]`** — the two `/admin/*` spec paths carrying `assistant` in `x-roles`
  (`API_SPEC.yaml:460`, `:1124`, both unimplemented). Blocked on new **`D-7`**: either the spec is
  wrong or `CLAUDE.md` §6 is, and that is the user's call.
- **`SPEC-5`'s `[x]` marked overstated** in its own row: validation proved the document is well-formed
  and its `$ref`s resolve, not that it covers what is implemented.
- Counts updated: tasks 84 → 86, blocked 6 → 8.

## Deviations from the plan

1. **F-2 was implemented with both mechanisms, not one.** The coordinator offered a choice — export the
   `Record` or export a derived array. I exported a derived `readonly Capability[]` **and** made the
   spec's own list an exhaustive `Record<Capability, true>`, because each catches a different mistake:
   the `Record` catches a capability added to the union, the runtime equality catches a capability
   added to the module without the spec noticing, and only the second turns `npm test` red. Slightly
   more than asked, in the same files, and the reviewer should either agree it is warranted or say
   which half to drop.
2. **`:166` in `role-guards.spec.ts` was deliberately left class-level** (reasoned above). The
   coordinator's finding 3 named both `:166` and `:196`; I closed the gap at one of them and explain
   why closing it at the other would assert something false.
3. **Two documentation edits nobody listed**, both consequences of what was asked: the `AUTH-1` row
   records the review verdict and that the follow-ups landed, and the `AUTH-3` row records the spec
   strengthening. `AUTH-1` remains `[~]`, `AUTH-3` remains `[x]`.
5. **Two empty files were created in the repository root by one of my own shell invocations** — a
   heredoc whose content contained lines beginning with `>` and text in backticks, which bash partly
   interpreted as redirections before failing to parse. They were `AUTH-4` and `` `REVIEW.md` ``, both
   **0 bytes**, both mine, both **deleted**. `git status --porcelain` now shows the same untracked set
   `REVIEW.md` §"Scope reviewed" records and nothing else. Recorded rather than quietly removed,
   because "no stray file in the repo root" is one of the reviewer's own checks and it should be
   checkable against a record of what happened.
4. **One self-inflicted defect, caught and fixed before the run.** My first edit to `capabilities.ts`
   inserted `ALL_CAPABILITIES` **between** the `REFUSAL` docblock and `REFUSAL` itself — the same "new
   symbol inserted between a comment and its subject" defect as finding 6, in the same pass that was
   fixing finding 6. Moved above the docblock; verified by reading `capabilities.ts:44-72`.

## Blockers hit

**None.** No item in this pass required inventing business behaviour. The two that would have — what
`/notifications` should look like in the contract, and whether `/admin/*` may admit an assistant — were
filed as `SPEC-16`/`SPEC-17` against decisions `D-8`/`D-7`, as instructed.

## Tests

Real output, after all edits and after both experiments were reverted.

`npm test --workspace=backend`:

```
 Test Files  28 passed (28)
      Tests  467 passed (467)
   Start at  23:51:45
   Duration  9.82s (transform 3.61s, setup 0ms, import 38.78s, tests 13.79s, environment 7ms)
```

`npm run test:e2e --workspace=backend`:

```
 Test Files  3 passed (3)
      Tests  216 passed (216)
   Start at  23:52:02
   Duration  12.10s (transform 1.45s, setup 0ms, import 6.33s, tests 5.15s, environment 0ms)
```

`cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"` → `301`.
The same run piped through `grep -c "^lib/"` → `0`.

`cd frontend && npx eslint .` — clean, exit 0, no output.

`npm run lint --workspace=backend`:

```
src/dashboard/dashboard.controller.spec.ts:17:27: warning eslint(no-unused-vars): Identifier
'EXTERNAL_WORK_BINDER' is imported but never used. help: Consider removing this import.
```

The one pre-existing warning, unchanged; that file is still absent from `git status`.

**`npm run test:integration --workspace=backend` — SKIPPED, not passing:**

```
 Test Files  1 skipped (1)
      Tests  81 skipped (81)
```

Baselines held exactly: **467 unit / 216 e2e / 301 frontend with 0 in `lib/`**.

## Not done, and why

- **Migration `011` still has never run against real PostgreSQL. DoD point 2 is still NOT MET,
  `AUTH-1` is still `[~]`, and unit 1 is still NOT complete.** Nothing in this pass changes that, and
  it was not in scope to try. Re-checked at the end of the pass so the record is current rather than
  inherited: `docker info` → `failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine … The system cannot find the file specified`, and
  `127.0.0.1:5432` → `Connection refused`. The daemon is still down and there is still no database.
- **The three integration tests written in unit 1 have still never executed.** They sit inside the 81
  skipped.
- **`API_SPEC.yaml` not edited.** Both spec disagreements are filed as tasks against decisions.
- **`CLAUDE.md` not opened**, as instructed; the coordinator holds that file.
- **The three protected tests not touched.** `staff.e2e-spec.ts`'s TA-on-`/admin/*` 403 table, its
  four-route 404 table and `staff-scope.service.spec.ts`'s identical-message assertion are absent from
  this pass's diff.
- **The eight design questions** — still not applicable. This pass touched no screen, no component and
  no token. Its only frontend change is an interface and an import in `lib/`, which render nothing.

## Documents updated

| File | What changed |
|---|---|
| `docs/IMPLEMENTATION_PLAN.md` | §Dependency graph `AUTH-2 ──> AUTH-3` corrected to `AUTH-1 ──> AUTH-3`, with a note under the critical path; `SPEC-5`'s `[x]` marked overstated; new `SPEC-16` `[!]` (`/notifications` absent from the spec) and `SPEC-17` `[!]` (two `/admin/*` paths admitting an assistant); new decisions `D-7` and `D-8`; `PEOPLE-4` gains the `Assistant` response-schema gap; `AUTH-1` records the review verdict and that the follow-ups landed, while staying `[~]`; `AUTH-3` records the spec strengthening; counts 84 → 86 tasks, 6 → 8 blocked |
| `docs/phases/unit-1/EXECUTION_NOTES.md` | This section, and the in-place correction of the "no disagreement on any implemented route" overstatement under §"API spec verification" |

Not updated, deliberately: `PHASE_ROADMAP.md` (unit 1's status is unchanged — still `[~]`, still not
complete, for the same reason), `CHANGELOG.md` (nothing here reverses or narrows a previous decision;
the two new spec findings are filed as open questions, not decisions), `API_SPEC.yaml` (no route
changed), `project_log.md` (a review-remediation pass that changes no behaviour is not a material
change; the narrative already records unit 1 and `EXECUTION_NOTES.md` carries the detail), `CLAUDE.md`
(out of scope this pass).

## For the reviewer — what I am least sure of

1. **Deviation 1: F-2 landed two mechanisms where the brief offered a choice.** I believe both are
   justified — the compile error catches the union widening, the runtime equality is the only one that
   reddens `npm test` — but it is more than was asked for, and if you judge the spec-side `Record`
   redundant ceremony, it is four lines to drop and the runtime assertion still holds the property.
2. **Deviation 2: I did not change `:166`.** If you read finding 3 as requiring both tests to go
   per-handler, then I closed half of it. My reasoning is that `EXPECTED` is a per-class table and
   `staff-groups.controller.ts:109` is a legitimate per-handler narrowing, so a per-handler exact-match
   test would fail on correct code. Worth a second opinion.
3. **`ALL_CAPABILITIES` leans on `Object.keys` insertion order** for a string-keyed object literal —
   true in every engine, and made irrelevant to the assertion by the `.sort()` on both sides. Flagged
   because it is the one place the new mechanism rests on a runtime property rather than a type.
4. **Nothing in this pass has been exercised against a database**, for the same reason as unit 1. The
   `requireRoles` message change touches the Postgres driver, and only the memory driver's copy of that
   refusal has ever executed.

---

## Remediation pass — final verification (by the coordinator)

`executor3` completed every remediation item but died on a session limit before running the closing
suites. Re-run by the coordinator, 2026-09-20, real output:

```
npm test --workspace=backend      → Test Files 28 passed (28) · Tests 467 passed (467)
npm run test:e2e --workspace=backend → Test Files 3 passed (3) · Tests 216 passed (216)
cd frontend && npx tsc --noEmit    → 301 errors total, 0 in lib/
```

Baseline held exactly: 467 / 216 / 301 with zero in `lib/`. No test deleted, skipped or weakened.
`npm run test:integration` still **SKIPPED** (no `TEST_DATABASE_URL`) — not a pass.

Remediation items confirmed present by inspection:

| Item | Evidence |
|---|---|
| F-1 | `lib/types.ts:543` `StaffDirectoryEntry extends DirectoryEntry`; `lib/api.ts:852` uses it |
| F-2 | `capabilities.ts:60` exports `ALL_CAPABILITIES` derived from the Record's keys; `capabilities.spec.ts:23` is a `Record<Capability, true>` asserted against it — fails **twice** on a fifth capability, and the runtime failure is the load-bearing one because vitest transpiles without typechecking |
| 3 | `role-guards.spec.ts:216-221` iterates handlers per controller through `resolve()`, the guard's own `getAllAndOverride` precedence — method-level overrides now covered |
| 4 | Overstatement corrected at `:674`; shape disagreement filed for `PEOPLE-4` |
| 5 | `IMPLEMENTATION_PLAN.md:246` graph no longer draws `AUTH-2 ──> AUTH-3` |
| 6 | `in-memory-user.repository.ts:25` message names `findIdsByRole`; `SEED_PASSWORD_HASH` docblock restored |
| escalation | `SPEC-16` filed `[!]` with `D-8`; `SPEC-5`'s `[x]` marked overstated |

**Unit 1 remains `[~]`. `AUTH-1` remains `[~]`.** DoD point 2 is still unmet — migration `011` has
never run against real PostgreSQL. Nothing in this pass changed that, and nothing in this pass
needed to.
