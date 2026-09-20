# Phase plan — unit 1: Identity and authorization

Planner: `redesign-planner`, 2026-09-19. Read-only; nothing outside this file was written.

**Headline.** `AUTH-2` is not buildable in this unit and must not be attempted — its migration (014)
cannot execute until `DOM-1` (013) exists. `AUTH-4` is doubly blocked (`AUTH-2` **and** `MAIL-1`).
This unit ships `AUTH-1` + `AUTH-3`, and the plan below is scoped to exactly that. The unit **cannot
reach `APPROVED`** under the nine-condition protocol, because `SPEC-12` is unclosable on this machine
(§8, B-2) and this unit writes a migration.

---

## 1. Scope

### IN

| Task | What lands here |
|---|---|
| `AUTH-1` | `Role.Admin`; `STAFF_ADMIN`/`STAFF_ALL` constants; migration `011` widening two CHECK constraints; **14 `@Roles` decorator sites** covering **63 routes**; **nine `actorRole` derivations** replaced by one exhaustive helper; an `admin` fixture in both drivers; the assistants directory made able to list an admin; three lines in `frontend/lib/`. |
| `AUTH-3` | `auth/capabilities.ts` — the four withheld verbs as an exhaustive `Record<Capability, boolean>`; `DELETE /staff/groups/:groupId/members/:studentId` moves to teacher/admin with a **403**; one refusal test per verb. |

### OUT, and why

| Task | Why it is out |
|---|---|
| `AUTH-2` (course → group scoping) | **Structurally blocked on `DOM-1`.** Full reasoning in §8, B-1. Short form: `DATABASE_PLAN.md` §4.2's migration reads `JOIN groups g ON g.course_id = csa.course_id`; `groups.course_id` does not exist until `DOM-1` (013). `MigrationRunner.sqlFilesIn` sorts filenames lexicographically (`migration-runner.ts:41`), so a `014_*.sql` authored with no `013_*.sql` present applies straight after `012` and aborts — taking every boot and every integration run with it. |
| `AUTH-4` (assistant invitations) | Depends on `AUTH-2` for `scope`/`groupIds` (`API_SPEC.yaml:223-233` — `AssistantWrite` requires `scope`, which has no column until `assistant_scopes` exists) **and** on `MAIL-1`, which `IMPLEMENTATION_PLAN.md:89` names as a dependency and `PHASE_ROADMAP.md` §4 unit 1 omits. `MAIL-1` is unit 3. An invitation that cannot be emailed is not an invitation. |
| `AUTH-5` (device/session list) | `[!]` on decision `D-1`. `IMPLEMENTATION_PLAN.md:90`, `PHASE_ROADMAP.md` §6. Left `[!]`; §8, B-3. |
| Frontend role-based nav, rails, redirects | `SHELL-1`, unit 4. Only the three `lib/` lines that stop an admin landing on a broken page are in scope here (§4 Frontend). |
| `GET /admin/assistants` full modify (scope, groups, status, last-seen) | `PEOPLE-4`, unit 5. Only the *minimum* — an `admin` account being visible at all — is in scope. §4 Repositories, note (b). |
| Anything touching `course_staff_assignments` shape | `AUTH-2`. This unit leaves the table, its repository, both drivers and `StaffScopeService`'s internals **byte-untouched** except for one line (`staff-scope.service.ts:57`). |

---

## 2. Entry criteria — verified

Universal (`PHASE_ROADMAP.md` §3):

| Criterion | Evidence |
|---|---|
| Branch is `redesign`; `git status` inspected | `git rev-parse --abbrev-ref HEAD` → `redesign`. Modified: `CLAUDE.md`, `docs/CHANGELOG.md`, `docs/IMPLEMENTATION_PLAN.md`. Untracked: `.claude/agents/redesign/`, `.claude/commands/redesign-phase.md`, `docs/PHASE_ROADMAP.md`, `docs/phases/`. **No production source modified.** ✔ |
| Every dependency unit is `[x]` | **✘.** Unit 0 is `[~]`; `SPEC-12` is `[!]`. Proceeding on the user's explicit direction. See §8, B-2. |
| No open blocker gates a task in scope | `D-1` gates `AUTH-5`, which is out. No open decision gates `AUTH-1` or `AUTH-3`. ✔ |
| Backend suite green at the start | `npm test --workspace=backend` → **26 files, 383 tests passed**, 18.04s, exit 0. Run 2026-09-19 19:58. ✔ |

Unit-1-specific, established rather than assumed:

| Fact | Evidence |
|---|---|
| e2e green | `npm run test:e2e --workspace=backend` → **3 files, 179 tests passed**, exit 0. ✔ |
| `Role` has five members; no `admin` | `backend/src/auth/roles.enum.ts:1-7`. ✔ |
| Frontend typecheck baseline | `npx tsc --noEmit` → **301 `error TS`**, across `app/` and 7 files in `components/{app,site}` — **zero in `lib/`**. So the three-line `lib/` edit is verifiable by the count not rising. ✔ |
| `AuditAction` has **27** members, not 39 | `audit/interfaces/audit-log-repository.interface.ts:16-84` (27 union members); `audit/dto/list-audit-log-query.dto.ts:27-55` (27 `Record` keys); 27 distinct `action: '…'` literals in `src/`. **The briefing's "39" and `SPEC-13`'s "39 audit actions not 27" are both wrong — the code says 27, and `CLAUDE.md` §5.4's "twenty-seven" is correct.** ✔ |
| `StaffScopeService` has **nine** callers, not eight | Injection sites: `announcements.service.ts:40`, `groups/groups.service.ts:64`, `manage/assessment-authoring.service.ts:104`, `manage/grading.service.ts:76`, `manage/manage-live-sessions.service.ts:42`, `manage/manage-recordings.service.ts:45`, `manage/manage.service.ts:96`, `manage/work-analytics-gate.service.ts:49`, `staff/staff.service.ts:47`. 22 `assertAssigned`/`scopeFor` call sites. `AUTHORIZATION_MODEL.md` §6 / `ARCHITECTURE.md` §2.4 / `CHANGELOG.md:91` all say "eight". ✔ (Not load-bearing this unit — no caller changes — but it is the number `AUTH-2` will be planned against.) |
| Migrations 001–010 on disk; 009/010 never run real | `ls backend/src/database/migrations/` → 001…010. `DATABASE_PLAN.md:1-5`. ✔ |
| `SPEC-12` cannot be closed here | `docker info` **hung past 120s** and had to be backgrounded — the daemon is not running. Worse: `df -h` reports **`C:` 110G used of 110G, 0 bytes available, 100%**. Docker Desktop's VM disk, its image store and `%TEMP%` all live on `C:`. Starting the daemon and pulling `postgres:15` will fail for want of space before it fails for any other reason. This is a **harder** blocker than "the daemon is not running", and it also makes shell pipelines through `%TEMP%` fail intermittently — several during this planning session did. ✘ |
| 17 repository interfaces, 17 + 17 implementations | `ARCHITECTURE.md:68`. Not re-counted; nothing in this scope adds a table, so the count does not move. |

---

## 3. Reconciliation

Classification per `PRODUCT_SPEC.md`'s scheme. Citations are `file:line` or `doc §`.

| Question | Finding |
|---|---|
| **Features that remain unchanged — do not touch** | The three global guards and their order (`RateLimitGuard` → `JwtAuthGuard` → `RolesGuard`), `SECURITY.md` §1. `RolesGuard`'s fail-closed default (`roles.guard.ts:62-73`) — **do not relax it**, `AUTHORIZATION_MODEL.md` §5. `JwtStrategy`'s per-request role re-read (`jwt.strategy.ts:44-50`). The 7 `@Public()` routes — **this unit adds none**. `course_staff_assignments`, `CourseStaffRepository` and both its drivers. `StaffScopeService`'s public interface, its 404 semantics and its error string. `EnrollmentsService.assertEnrolled`. Every student-facing controller's `@Roles(Role.Student)` (11 sites) — a student never becomes an admin. |
| **Features that changed** | (1) **Staff identity.** Old: two people share `role = 'teacher'`; `CLAUDE.md` §2.1 said explicitly *"don't add a third role"*. New: a distinct `admin`, identical in permission, distinct in identity. `CHANGELOG.md:53-66`, `AUTHORIZATION_MODEL.md:22-28`. Delta: one enum member, two CHECK constraints, 14 decorator sites, nine `actorRole` derivations, `staff-scope.service.ts:57`, `blog.service.ts:394`. (2) **Assistants cannot remove people.** Old: `DELETE /staff/groups/:groupId/members/:studentId` is TA-reachable (`staff-groups.controller.ts:43` class-level `@Roles(Assistant, Teacher)`, method at :91). New: teacher/admin, **403** (`API_SPEC.yaml:713-727`). `CHANGELOG.md:95-106`, `AUTHORIZATION_MODEL.md:128-144`. Delta: a method-level `@Roles` override plus a service-level capability assertion. |
| **Features removed** | None in this scope. `course_staff.*` audit actions and the `course_staff_assignment` target type are retired **as write paths** only in `AUTH-2`, and even then the union members **must stay** — see the audit note below. |
| **Features that are new** | `AssistantCapabilities` — no backend today, and `AUTHORIZATION_MODEL.md:186-192` records it as a Medium gap: *"Assistant capability is implicit in which controller a route sits on, not declared."* No table, no repository, no migration; a pure module with an exhaustive `Record`. |
| **Missing APIs** | **None this unit.** All five `AUTH-4` routes (`POST`/`PATCH`/`DELETE /admin/assistants*`, `POST /admin/assistants/:id/resend`, `POST /auth/invitations/:token/accept`) are already fully specified in `API_SPEC.yaml:554-649` and are out of scope. |
| **APIs to modify** | Zero *shape* changes. 63 routes gain `admin` in their role set; one route narrows to teacher/admin. **Nothing is breaking for `frontend/lib/api.ts`** — no path, verb, DTO or response schema changes. The only frontend-visible change is that a `role` value of `'admin'` can now arrive in a login response, which is why the three `lib/` lines are in scope. |
| **Obsolete APIs** | None retired here. |
| **Domain changes** | `Role` gains `admin`. `DOMAIN_MODEL.md` and `AUTHORIZATION_MODEL.md` §1 already describe six roles; the code describes five. No entity, field or relationship changes. |
| **Database changes** | Migration `011_full_admin_role.sql`. Two `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT`, widening `users_role_check` (`001_student_platform.sql:27`) and `audit_log_actor_role_check` (`002_staff_and_audit.sql:65-66`) to admit `'admin'`. **Non-destructive**: no column dropped, no row rewritten, no data loss possible. DDL and the failure analysis are in §4 Database. |
| **Authorization changes** | See the full per-route enumeration in §4 Authorization. Summary: 6 Teacher-only decorator sites → `STAFF_ADMIN`; 7 Assistant+Teacher sites → `STAFF_ALL`; `notifications` → `Student` + `STAFF_ALL`; one route narrows. `/admin/*` **does not widen to `assistant`** — asserted by an existing `it.each` (`test/staff.e2e-spec.ts:111-125`) that must stay green unchanged. |
| **Security implications** | §4 Authorization and §7's `CLAUDE.md` §8 walk-through. The two that matter most: adding a `Role` member produces **zero compile errors** (verified — no `Record<Role, …>` and no `switch` on role exists in either workspace), so the compiler applies **no pressure at all** here; and nine `actorRole` ternaries silently mis-attribute an admin's actions, which destroys the one property `Role.Admin` exists to provide. |
| **Frontend/backend dependencies** | Backend `AUTH-1` must land before `SHELL-1` can render a role-based rail (`IMPLEMENTATION_PLAN.md:121`). Within this unit, nothing in the frontend blocks anything in the backend; the three `lib/` lines depend on the `Role` union being widened first, which is the same commit. |
| **Architectural risks** | Low. Nothing crosses a boundary in `ARCHITECTURE.md` §1. The one judgement call: `auth/capabilities.ts` is a **pure module, not a provider** — no DI, no module, no fourth `@Global()` (`ARCHITECTURE.md:215-218` asks explicitly for restraint there). It holds no state and needs no repository, so a provider would buy only ceremony. |
| **Migration risks** | The realistic failure is a **constraint-name mismatch**, not data corruption. `MigrationRunner.applyPending` wraps each file in `db.transaction` and only then writes the ledger (`migration-runner.ts:89-99`), so a failed `011` rolls back whole and is retried on the next boot. The **real** risk is inherited: `011` will be applied for the first time in the same run as the never-executed `009` and `010`, so a failure in either masks `011` entirely. Named candidates in §9, R-2. |
| **Testing requirements** | §4 Tests. Nine named additions, one refusal test per withheld verb, one parity table proving admin ≡ teacher over all 25 teacher-only routes, and one enumerating guard test that is a *mechanism* rather than a checklist. |
| **Unresolved product decisions** | Four, all in §8: B-1 (`AUTH-2` sequencing — I rule on this rather than deferring it), B-2 (`SPEC-12`), B-3 (`AUTH-5`/`D-1`), plus four smaller open questions D-a…D-d (`all_tas` audience, `lastSeenAt` with no source, migration-number collision on 011, whether invitation accept/resend are audited). |

---

## 4. Changes by layer

### Database

**One migration: `backend/src/database/migrations/011_full_admin_role.sql`.**

```sql
-- 011_full_admin_role.sql
--
-- The Full admin becomes a real role (CLAUDE.md §2.1 as amended, CHANGELOG
-- 2026-09-19). Identical permission to the teacher, distinct identity - which is
-- the entire reason it is a role and not a second teacher account: an audit
-- entry that says `teacher` when the admin acted answers nobody's question.
--
-- Non-destructive. Two CHECK constraints widen; no column is added, dropped or
-- rewritten, and no existing row can fail the new constraint because the new
-- constraint is strictly looser.

-- `DROP CONSTRAINT` without `IF EXISTS`, deliberately. If Postgres named the
-- inline CHECK from 001 something other than `users_role_check`, this aborts
-- loudly and the whole migration rolls back. With `IF EXISTS` it would silently
-- drop nothing, then ADD a second constraint - and the *intersection* of the old
-- narrow one and the new wide one is still narrow, so inserting an `admin` would
-- fail later with an error naming a constraint nobody knew was still there.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('visitor', 'student', 'parent', 'assistant', 'admin', 'teacher'));

-- The same widening on the audit log's actor role. This column records the role
-- *at the time of the action* (002_staff_and_audit.sql:62-64), so it must be
-- able to hold `admin` before the first admin does anything - otherwise the
-- first admin write fails at the audit INSERT, inside the transaction, and takes
-- the action with it.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_role_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_role_check
  CHECK (actor_role IN ('visitor', 'student', 'parent', 'assistant', 'admin', 'teacher'));
```

- **Destructive?** No. Forward-only, per `DATABASE_PLAN.md`'s convention (no down-migrations
  anywhere in this project); nothing needs one, because the change is additive to a value domain.
- **Data risk:** none. The new domain is a superset of the old, so every existing row satisfies it.
- **How it refuses bad data:** it still does. `role` and `actor_role` remain constrained to six
  literals; a typo'd `'admln'` is still rejected at the database. The widening does **not** open the
  column to free text.
- **Ordering inside the file matters in one way only:** `audit_log`'s widening must land in the same
  migration as `users`', not a later one. An `admin` user who can be *created* but whose actions
  cannot be *logged* is worse than no admin at all — `AuditService.record` runs inside the action's
  transaction (`audit.service.ts:54-62`), so a CHECK violation there rolls the action back and the
  admin sees an opaque 500 on every write.
- **No new table, therefore no repository implementations.** Stated explicitly because the standing
  rule is that every new table costs two (`DATABASE_PLAN.md:21`, `ARCHITECTURE.md:71`): **this unit
  adds zero tables and therefore zero repository pairs.** `AUTH-2` adds two tables (`assistant_scopes`,
  `assistant_group_assignments`) = **four** implementations, and `AUTH-4` adds one
  (`assistant_invitations`) = **two** more. None of those six are in this unit.

**Seeds** — `backend/src/database/seeds/002_staff_fixtures.sql:12-15`. Add one row to the existing
`INSERT INTO users`, keeping the `ON CONFLICT (id) DO NOTHING` idempotency:

```sql
('admin-1', 'admin@example.com', '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'admin', 'Mona Saleh', '2026-01-20T09:00:00Z')
```

The password hash is the same published `password123` hash every other fixture uses. `resolveAutoSeed`
already refuses production (`CLAUDE.md` §7.4), which is what keeps that safe.

### Repositories

**No interface changes required by `AUTH-1` itself.** `UserRepository.create` already takes a
`role: Role` (`user-repository.interface.ts:116-121`), so creating an admin needs nothing new, and
`StoredUser.role` is typed `Role` (`:7`) so it widens for free.

Two deliberate calls:

**(a) `InMemoryUserRepository` fixtures — required.**
`backend/src/auth/repositories/in-memory-user.repository.ts:20-69`. Add `admin-1` /
`admin@example.com` / `Role.Admin` / `'Mona Saleh'`, mirroring the seed. This is not optional: the
whole e2e suite runs on the memory driver (`test/staff.e2e-spec.ts:56-67` logs in by email), so
without it there is no admin token to test with. The existing comment at `:48-50` already documents
the memory/seed mirroring obligation — extend it, do not replace it.

**(b) `UserRepository.findByRole` — one interface change, and it is a judgement call.**
`findByRole(role: Role, …)` takes a single role (`:67-70`). `DirectoryService.listAssistants`
(`manage/directory.service.ts:63`) calls it with `Role.Assistant`, so **the moment `admin-1` exists it
is invisible in the only staff directory the product has** — `GET /admin/assistants` would not list
the person who has full access. `API_SPEC.yaml:210-221` already says the `Assistant` schema carries
`role: [assistant, admin]`, so the contract expects both.

Change: widen to `findByRole(roles: readonly Role[], options)` (or add a second method — the executor
should prefer widening, because two methods with one differing parameter is the shape that drifts).
**Cost: one interface, two implementations (`postgres-user.repository.ts:69`,
`in-memory-user.repository.ts:87`), one entry in `test/postgres-repositories.integration-spec.ts`,
and `DirectoryService.listStudents` (`:44`) updated to pass `[Role.Student]`.** Note the interface
comment at `:61-66` explains that `role` is required *so that no call shape returns every account* —
that safety property must survive: the parameter stays required and non-empty, and the executor
should reject an empty array rather than treating it as "all".

Emit `role` on the assistants list response so the console can distinguish the tiers. **Do not** add
`scope`, `groupIds`, `status` or `lastSeenAt` — those are `PEOPLE-4` (and `lastSeenAt` has no source
at all; §8, D-b).

*If the coordinator prefers to cut (b),* say so and it moves to `PEOPLE-4`; the visible consequence
in the interim is that an admin account exists and appears in no list, which is confusing but not
unsafe.

### Services

**New: `backend/src/auth/roles.enum.ts`** — add `Admin = 'admin'`. Place it between `Assistant` and
`Teacher` so the declaration order matches the privilege order, which is how every doc lists it.

**New: `backend/src/auth/staff-roles.ts`** (or appended to `roles.enum.ts` — one file either way):

```ts
/** Teacher and admin. Identical in permission, distinct in identity. */
export const STAFF_ADMIN = [Role.Teacher, Role.Admin] as const;

/** Every staff role. The `/staff/*` surface. */
export const STAFF_ALL = [Role.Assistant, Role.Teacher, Role.Admin] as const;
```

Two constants, not one, and each named for the *boundary* it draws. `AUTHORIZATION_MODEL.md:30-37`
asks for the first; the second is what stops someone writing `@Roles(Role.Assistant, ...STAFF_ADMIN)`
by hand at seven sites and getting one of them wrong — which is the same argument, one level up.
**`STAFF_ADMIN` must never contain `Role.Assistant`**; the guard test below is what holds that.

**New: `backend/src/auth/capabilities.ts`** — `AUTH-3`. A pure module: no `@Injectable`, no provider,
no module. It holds no state and reads no repository, and `ARCHITECTURE.md:215-218` asks explicitly
that a new provider earn its keep.

```ts
/** The verbs an assistant may never perform (AUTHORIZATION_MODEL.md §"The four withheld verbs"). */
export type Capability =
  | 'account.delete'         // 1. delete or deactivate an account
  | 'enrollment.remove'      // 2. unenrol a student from a course
  | 'group.member.remove'    // 3. remove a student from a group
  | 'registration.reject';   // 4. reject a pending registration

/**
 * Exhaustive `Record`, for the reason the audit DTO is one
 * (`list-audit-log-query.dto.ts:14-24`): adding a `Capability` without deciding
 * whether an assistant holds it is a compile error, not an oversight.
 */
const ASSISTANT_CAPABILITIES: Record<Capability, boolean> = {
  'account.delete': false,
  'enrollment.remove': false,
  'group.member.remove': false,
  'registration.reject': false,
};

export function may(actor: { role: string }, capability: Capability): boolean { … }
export function assertMay(actor: { role: string }, capability: Capability): void { … }
```

Semantics, stated so the executor does not have to guess:
- `Role.Teacher` and `Role.Admin` hold every capability.
- `Role.Assistant` holds exactly what the `Record` says — all four `false` today.
- **Any other role holds nothing.** Default-deny, matching `RolesGuard`'s fail-closed posture and
  `staff-scope.service.spec.ts:93-100`'s "should not treat any other role as unscoped".
- `assertMay` throws `ForbiddenException` with a **fixed, capability-independent message** so the
  refusal does not tell the caller which of four rules it tripped.

**Refactor: one `actorRole` derivation, replacing nine.** This is the highest-value change in the
unit and it is a **silent-failure fix**, not a tidy-up. Nine expressions currently collapse the role
to a binary, in two families that fail in **opposite** directions for an admin:

| `file:line` | Expression | An admin is logged as |
|---|---|---|
| `announcements/announcements.service.ts:152` | `=== Assistant ? Assistant : Teacher` | **`teacher`** |
| `blog/blog.service.ts:190` | same | **`teacher`** |
| `blog/blog.service.ts:257` | same | **`teacher`** |
| `blog/blog.service.ts:318` | same | **`teacher`** |
| `blog/blog.service.ts:352` | same | **`teacher`** |
| `manage/manage-live-sessions.service.ts:62` | same | **`teacher`** |
| `manage/manage-recordings.service.ts:62` | same | **`teacher`** |
| `groups/groups.service.ts:75` | `=== Teacher ? Teacher : Assistant` | **`assistant`** |
| `integrations/google/google-integration.service.ts:102` | same | **`assistant`** |
| `manage/assessment-authoring.service.ts:121` | same | **`assistant`** |
| `manage/grading.service.ts:233` | same | **`assistant`** |
| `manage/work-analytics-gate.service.ts:58` | same | **`assistant`** |

(Twelve expressions across nine services; `blog.service.ts` carries four.) Migration `011` makes the
*database* able to store `'admin'`, so nothing errors — the log simply records the wrong role, on
every audited action an admin performs. `CHANGELOG.md:62-64` is explicit that attribution is the
whole point of the role, and the `assistant` family is the worse half: the Assistant activity screen
(`PEOPLE-5`) filters on exactly this column, so an admin's actions would appear inside the assistant
audit trail.

Replace all twelve with one helper — `actorRoleOf(actor: StaffActor): Role` — living beside
`StaffActor` (`staff/staff-scope.service.ts:20-23`) or in `auth/`. It must **validate and throw**
rather than defaulting: a `StaffActor.role` that is not a `Role` member is a bug upstream, and
silently filing it as `assistant` is how this class of defect recurs. A `Record<Role, Role>`-shaped
lookup makes a future sixth role a compile error at one site instead of a silent mis-attribution at
twelve.

Leave `staff/staff.service.ts:180,228` — two hardcoded `actorRole: Role.Teacher` — for `AUTH-2`,
which replaces that service's write paths wholesale. Note in the code that they are knowingly wrong
for an admin actor and will be correct when `AUTH-2` lands. *(If the executor prefers, routing them
through `actorRoleOf` is a two-line change and strictly better; it is not required.)*

**`GroupsService.removeMember`** — add `assertMay(actor, 'group.member.remove')` as the first
statement, before the group is read. `IMPLEMENTATION_PLAN.md`'s Definition of Done point 5 requires
the rule in the **service**, not only at `@Roles`; the decorator is the cheap outer gate and this is
the real one.

### Authorization

**The complete widening table.** `@Roles` is applied at **class level throughout** (verified: 25
decorator sites, zero method-level), so the work is **14 decorators covering 63 routes** — not the
"~30 call sites" in `AUTHORIZATION_MODEL.md:36`, `CHANGELOG.md:66` and `SECURITY.md:81`. Route counts
are `@Get|@Post|@Patch|@Put|@Delete` per file.

| `file:line` | Controller path | Routes | Today | Becomes |
|---|---|---|---|---|
| `announcements/admin-announcements.controller.ts:36` | `admin` | 2 | `Teacher` | `...STAFF_ADMIN` |
| `audit/admin-audit.controller.ts:17` | `admin/audit-log` | 1 | `Teacher` | `...STAFF_ADMIN` |
| `groups/admin-groups.controller.ts:48` | `admin` | 6 | `Teacher` | `...STAFF_ADMIN` |
| `integrations/google/admin-google-integration.controller.ts:41` | `admin/integrations/google` | 5 | `Teacher` | `...STAFF_ADMIN` |
| `manage/admin-manage.controller.ts:53` | `admin` | 8 | `Teacher` | `...STAFF_ADMIN` |
| `staff/admin-staff.controller.ts:28` | `admin/courses/:courseId/staff` | 3 | `Teacher` | `...STAFF_ADMIN` |
| | | **25** | | |
| `announcements/staff-announcements.controller.ts:38` | `staff` | 2 | `Assistant, Teacher` | `...STAFF_ALL` |
| `blog/staff-blog.controller.ts:53` | `staff/blog` | 6 | `Assistant, Teacher` | `...STAFF_ALL` |
| `common/storage/uploads.controller.ts:44` | `staff` | 2 | `Assistant, Teacher` | `...STAFF_ALL` |
| `groups/staff-groups.controller.ts:43` | `staff` | 5 | `Assistant, Teacher` | `...STAFF_ALL` **+ one method override** |
| `manage/staff-manage.controller.ts:57` | `staff` | 12 | `Assistant, Teacher` | `...STAFF_ALL` |
| `manage/work-analytics.controller.ts:44` | `staff` | 7 | `Assistant, Teacher` | `...STAFF_ALL` |
| `staff/staff.controller.ts:22` | `staff` | 1 | `Assistant, Teacher` | `...STAFF_ALL` |
| | | **35** | | |
| `notifications/notifications.controller.ts:41` | `notifications` | 3 | `Student, Assistant, Teacher` | `Role.Student, ...STAFF_ALL` |
| | | **3** | | |

**Total: 63 routes, 14 decorator sites.** The eleven student-only sites and the four public
controllers are **not touched** — list them in the commit so the reviewer can confirm by absence:
`announcements/student-announcements.controller.ts:27`, `assessments/assessments.controller.ts:27`,
`courses/courses.controller.ts:25`, `dashboard/dashboard.controller.ts:11`,
`dashboard/student-home.controller.ts:22`, `groups/classmates.controller.ts:21`,
`live-sessions/live-sessions.controller.ts:15`, `materials/materials.controller.ts:12`,
`recordings/recordings.controller.ts:25`, `reports/reports.controller.ts:12`,
`students/students.controller.ts:26`.

**The one narrowing — `AUTH-3`.** `groups/staff-groups.controller.ts:91` —
`DELETE /staff/groups/:groupId/members/:studentId`. Add a **method-level** `@Roles(...STAFF_ADMIN)`.
This works because `RolesGuard` reads `getAllAndOverride(ROLES_KEY, [context.getHandler(),
context.getClass()])` (`roles.guard.ts:56-59`) — handler metadata wins over class metadata. Do **not**
move the method to `AdminGroupsController`: the path stays `/staff/groups/…` per `API_SPEC.yaml:713`,
and moving it would change the URL.

**403, not 404, on that route** — and the distinction is deliberate. `API_SPEC.yaml:726` specifies
`'403'`. `AUTHORIZATION_MODEL.md` §2's 404 rule is about **scope** (you must not learn that a resource
you do not hold exists); this is about **capability** (you can see the group, you can see the student,
the *verb* is refused). The same reasoning that puts a 403 on
`BlogService.assertMayMutate` (`blog.service.ts:388-391`: *"the post is listed on the caller's own
console… pretending otherwise would just make the UI lie about a row it is showing"*). The assistant
is looking at the roster; a 404 would claim the student is not in the group they can see them in.

**Object-level authorization, per route touched.** Role is never sufficient (`AUTHORIZATION_MODEL.md`
§4), so for each of the 63 widened routes: **the object-level gate is unchanged and still runs.**
Concretely, the admin takes the same path as the teacher —
`StaffScopeService.assertAssigned` returns `null` for an unscoped actor
(`staff-scope.service.ts:72-84`), and the per-resource checks downstream
(`assertEnrolled`, `submission.studentId`, `assertMayMutate`) are role-independent. The executor must
verify this by running the parity table below, not by reasoning about it.

**The one line that decides whether an admin can do anything at all:**
`staff/staff-scope.service.ts:55-58`

```ts
private isAdmin(actor: StaffActor): boolean {
  return actor.role === Role.Teacher;
}
```

Must become `actor.role === Role.Teacher || actor.role === Role.Admin` (or a `STAFF_ADMIN.includes`
check). **If it is missed, the failure is loud and safe**: an admin passes `RolesGuard`, falls through
to `staffRepo.find(courseId, actor.id)`, finds no assignment row, and gets **404 on every course**.
A broken console, not a leak. Say so in the commit; the reviewer should confirm the direction of the
failure, not just the fix.

**The same shape, twice more, and both fail safe:**
- `blog/blog.service.ts:394` — `if (actor.role === Role.Teacher) return;` in `assertMayMutate`.
  Unfixed, an admin cannot edit an assistant's post (403). Fix with `STAFF_ADMIN`.
- `groups/groups.service.ts:75` and the other four `=== Teacher ? … : …` sites — covered by the
  `actorRoleOf` refactor above, which fixes attribution at the same time.

**`/admin/*` does not widen to `assistant`.** Guaranteed two ways: `STAFF_ADMIN` contains no
`Assistant` (held by the guard test), and `test/staff.e2e-spec.ts:111-125` already asserts a TA token
gets 403 on five `/admin/*` reads plus `:127-139` on two writes. **Those tests must pass unchanged.**

**Audit — what this unit adds, and what it must not remove.**

This unit adds **no new `AuditAction`**. `AUTH-1` changes only *which value* the existing 27 actions
record in `actorRole`; `AUTH-3` refuses a write rather than adding one. So there is **no** union
entry, **no** `Record<AuditAction, true>` entry and **no** new "asserts the entry written" spec to
add. (`AUTH-4` will add three — `assistant.invited`, `assistant.scope_changed`, `assistant.removed`
per `API_SPEC.yaml:583,604,610` — each costing the union entry, the `Record` entry and a spec; none
of them here.)

Two standing rules still apply and one is easy to trip:

- **Do not delete `course_staff.assigned` / `course_staff.unassigned` from the union, or
  `course_staff_assignment` from `AuditTargetType`, when `AUTH-2` retires the table.** The audit log
  has no foreign keys precisely so it outlives what it describes (`SECURITY.md:29`), and
  `ListAuditLogQueryDto`'s `@IsIn` is built from the union — removing a member makes every historical
  row of that action unfilterable with a 400, which is exactly the failure
  `list-audit-log-query.dto.ts:19-24` documents. Flagged here because it is the next unit's trap.
- `AuditService.record` **throws outside a transaction** (`audit.service.ts:54-61`), and a `before`
  snapshot **must not alias its `after`**. Neither changes in this unit — no new audited mutation is
  added — but the `actorRoleOf` refactor touches twelve `audit.record` call sites, so the executor
  must not relocate any of them out of its enclosing `runInTransaction`.

### API

**`API_SPEC.yaml` delta: zero lines.**

This is worth stating plainly because it is unusual. The spec was written against the post-redesign
target: every staff/admin operation already carries `x-roles: [teacher, admin]` or
`[assistant, teacher, admin]` (54 `x-roles` keys), the `Assistant` schema already has
`role: [assistant, admin]` (`:217`), and the narrowed route already reads
`x-roles: [teacher, admin]` with a `'403'` response and the description *"MOVED to teacher/admin by
the 2026-09-19 decision"* (`:713-727`). **The work is making the code match the contract, not
changing the contract.**

So for this unit, Definition of Done point 10 ("`API_SPEC.yaml` matches what was built") is satisfied
by *verification*, not by editing. The executor should spot-check the 14 controllers against their
`x-roles` entries and report any that disagree — a disagreement would be a real finding, since the
spec is `[x]` and validated (`IMPLEMENTATION_PLAN.md:53`).

No method, path, DTO, response body or status code changes. The only new status code reachable
anywhere is the 403 on the group-member delete, already in the spec.

### Frontend

**Three lines, and they are not cosmetic.** All in `frontend/lib/`, which `SHELL-4` does not delete
and which currently contributes **zero** of the 301 typecheck errors.

| File | Change | Why it cannot wait for `SHELL-1` |
|---|---|---|
| `frontend/lib/types.ts:11` | `Role` union gains `'admin'` | Without it, a login response carrying `role: 'admin'` is a type lie the moment the backend can issue one. |
| `frontend/lib/roles.ts:15` | `isStaffRole` accepts `'admin'` | `homePathFor` (`:20-22`) sends a non-staff role to `/dashboard`. An admin would land on the student dashboard and collect a 403 from `GET /courses` — the exact symptom `CLAUDE.md` §7.1 records as having already happened once for the teacher. |
| `frontend/lib/roles.ts:28` | `isAdminRole` accepts `'admin'` | It currently reads `role === 'teacher'` with a comment saying *"the teacher* is *the admin"* — now false. Unfixed, an admin gets the assistant rail and no admin nav. Update the comment too; a stale comment here is what produced the wrong reading in the first place. |

No screen, no component, no API call changes. `frontend/lib/api.ts` is untouched — no route shape
moved.

Verification: `npx tsc --noEmit` must still report **301** errors (not 302+), and `npx eslint .` must
not gain a finding in `lib/`. The 301 are `SHELL-4`'s and **must not be touched here**
(`PHASE_ROADMAP.md:180-182`).

### Tests

Named, with the file each belongs in. Every permission changed has a refusal test.

**New file: `backend/src/auth/role-guards.spec.ts`** — the mechanism test, and the most valuable
single item in this list. Because adding a `Role` member produces **no compile error anywhere**
(verified: no `Record<Role, …>`, no `switch` on role in either workspace), nothing but enumeration
can catch a missed or over-widened decorator. So enumerate it once, in a test:

1. A table of all 25 controller classes → the exact expected `Role[]`, read back with
   `Reflect.getMetadata(ROLES_KEY, Controller)`.
2. `expect(STAFF_ADMIN).not.toContain(Role.Assistant)` — the over-widening guard.
3. For every controller whose path starts `admin`, assert its role set contains neither
   `Role.Assistant` nor `Role.Student`.
4. Assert **every** controller has exactly one of `@Roles` / `@Public` / `@AnyRole` — so a future
   controller cannot land undecorated and rely on `RolesGuard`'s 403 to hide it.

This is the same trick as the exhaustive `Record` one layer up: it turns a checklist into a failure.

**`backend/test/staff.e2e-spec.ts`**

5. `it.each` extension — `'refuses a student token on %s'` (`:92-109`) and
   `'refuses a TA token on the admin route %s'` (`:111-125`) stay **unchanged and green**. That is the
   `/admin/*`-does-not-widen assertion.
6. **New parity table: admin ≡ teacher.** `it.each` over all **25** teacher-only routes (method +
   path + minimal body), issuing each with the teacher token and the admin token and asserting the
   two status codes are **identical**. This is the "one test proving admin ≡ teacher"
   `PHASE_ROADMAP.md:130` asks for, with teeth — it proves parity on every route rather than on one.
7. **New: assistant ≠ admin.** An admin token succeeds on `/admin/students`, `/admin/assistants`,
   `/admin/audit-log`; an assistant token 403s on the same three. Both directions, one test.
8. **New: attribution.** An admin performs an audited mutation (grade a submission is the cheapest),
   then `GET /admin/audit-log?action=submission.graded` and assert
   `{ actorId: 'admin-1', actorRole: 'admin' }`. **This is the test that fails today** against every
   one of the twelve ternaries, and it is the one that proves `Role.Admin` does the job it exists for.
   Model it on the existing `:245-262`.
9. **New, `AUTH-3` refusal:** an assistant token on
   `DELETE /staff/groups/group-1/members/student-1` → **403**, and a follow-up read proving the
   student is **still in the group** (a refusal that refuses but writes is not a refusal). Then the
   same call with the admin and teacher tokens → **204**. Model on `:787-847`.
10. **New, `AUTH-3` non-regression:** an assistant token on
    `POST /staff/groups/group-1/members` → still **201**. "Add stays, remove moves"
    (`AUTHORIZATION_MODEL.md:137-140`) is two assertions, not one.

**`backend/src/groups/groups.controller.spec.ts`**

11. Unit-level refusal: `GroupsService.removeMember` with an assistant actor throws
    `ForbiddenException` **before** touching the repository (assert the repository spy was not
    called). This is the DoD-point-5 test — the rule in the service, independent of the decorator.

**New file: `backend/src/auth/capabilities.spec.ts`**

12. **One refusal test per withheld verb**, all four, even though three have no route yet — the
    preset is the thing being tested, and the routes will arrive in `DOM-4`/`PEOPLE-1`:
    - `assertMay({role:'assistant'}, 'account.delete')` throws
    - `… 'enrollment.remove'` throws
    - `… 'group.member.remove'` throws
    - `… 'registration.reject'` throws
    - each of the four **resolves** for `teacher` and for `admin`
    - `student`, `parent`, `visitor` and `''` are refused all four (default-deny, matching
      `staff-scope.service.spec.ts:93-100`)
    - the thrown message is **identical** across all four capabilities.

**`backend/src/staff/staff-scope.service.spec.ts` — the contract that must survive**

Nothing in this unit rewrites the internals, so every existing assertion must pass **unchanged**.
List them so the reviewer can check, and so `AUTH-2` inherits the list:

- `:28-32` an assigned TA is let through and gets their assignment back
- `:34-40` a TA on a course they do not hold is refused
- `:42-46` a TA with no assignments at all is refused
- **`:48-63` the anti-enumeration test** — a held-but-wrong course and a nonexistent course both
  throw `NotFoundException` **and** `denied.message === missing.message`. This is *the* property;
  `AUTHORIZATION_MODEL.md:63-65`, `CHANGELOG.md:86-89` and `SECURITY.md:22` all name it.
- `:65-71` an admin is let through with no assignment row, on both a real and an imaginary course
- `:74-91` `scopeFor` returns only assigned courses for a TA, `[]` (never everything) for an
  unassigned TA, `{unscoped:true}` for an admin
- `:93-100` **no other role is unscoped**
- `:103-135` assign/unassign idempotency and immediate effect

**One addition here, and only one:** extend `:65-71` and `:89-91` to run for `ADMIN_FULL = {id:
'admin-1', role: 'admin'}` as well as the existing `teacher-1`. That is the unit test half of
`isAdmin`'s widening; without it, `staff-scope.service.ts:57` could be missed and only the e2e parity
table would catch it.

**Commands and expected results** are in §7.

---

## 5. Files

### Expected to change

| File | Change |
|---|---|
| `backend/src/auth/roles.enum.ts` | `Admin = 'admin'` |
| `backend/src/auth/staff-roles.ts` *(new)* | `STAFF_ADMIN`, `STAFF_ALL` |
| `backend/src/auth/capabilities.ts` *(new)* | `Capability`, the exhaustive `Record`, `may`, `assertMay` |
| `backend/src/database/migrations/011_full_admin_role.sql` *(new)* | two CHECK widenings |
| `backend/src/database/seeds/002_staff_fixtures.sql` | one `users` row |
| `backend/src/auth/repositories/in-memory-user.repository.ts` | one fixture; `findByRole` signature |
| `backend/src/auth/repositories/postgres-user.repository.ts` | `findByRole` signature |
| `backend/src/auth/interfaces/user-repository.interface.ts` | `findByRole(roles: readonly Role[], …)` |
| `backend/src/manage/directory.service.ts` | `:44` `[Role.Student]`; `:63` `[Role.Assistant, Role.Admin]`; emit `role` |
| `backend/src/staff/staff-scope.service.ts` | `:55-58` `isAdmin` widens; `actorRoleOf` may live here beside `StaffActor` |
| `backend/src/blog/blog.service.ts` | `:190,257,318,352` → `actorRoleOf`; `:394` `assertMayMutate` teacher→`STAFF_ADMIN` |
| `backend/src/announcements/announcements.service.ts` | `:152` → `actorRoleOf` |
| `backend/src/groups/groups.service.ts` | `:75` → `actorRoleOf`; `removeMember` gains `assertMay` |
| `backend/src/integrations/google/google-integration.service.ts` | `:102` → `actorRoleOf` |
| `backend/src/manage/assessment-authoring.service.ts` | `:121` → `actorRoleOf` |
| `backend/src/manage/grading.service.ts` | `:233` → `actorRoleOf` |
| `backend/src/manage/manage-live-sessions.service.ts` | `:62` → `actorRoleOf` |
| `backend/src/manage/manage-recordings.service.ts` | `:62` → `actorRoleOf` |
| `backend/src/manage/work-analytics-gate.service.ts` | `:58` → `actorRoleOf` |
| The 14 controllers in §4 Authorization | `@Roles` → `STAFF_ADMIN` / `STAFF_ALL`; one method-level override |
| `backend/test/staff.e2e-spec.ts` | items 5–10 |
| `backend/src/staff/staff-scope.service.spec.ts` | the one `ADMIN_FULL` addition |
| `backend/src/groups/groups.controller.spec.ts` | item 11 |
| `backend/test/postgres-repositories.integration-spec.ts` | `findByRole` multi-role coverage |
| `frontend/lib/types.ts` | `:11` `'admin'` |
| `frontend/lib/roles.ts` | `:15`, `:28`, and the stale comment at `:26` |
| `docs/IMPLEMENTATION_PLAN.md` | `AUTH-1` `[x]`, `AUTH-3` `[x]`, `AUTH-2`/`AUTH-4` re-sequenced to unit 2 / unit 3+ |
| `docs/PHASE_ROADMAP.md` | unit 1 status + scope corrected; unit 2 gains `AUTH-2` |
| `docs/CHANGELOG.md` | the `AUTH-2` re-sequencing decision; the 27-vs-39 correction |
| `docs/AUTHORIZATION_MODEL.md` | "~30 call sites" → 14 decorators / 63 routes; "eight services" → nine |
| `docs/ARCHITECTURE.md` | §2.4 "Eight services call it" → nine |
| `docs/DATABASE_PLAN.md` | §2's `users.status`→011 attribution (see §8, D-c) |
| `CLAUDE.md` | §5.4's action count if touched; §2.1 already amended |
| `project_log.md` | one entry |
| `backend/src/auth/role-guards.spec.ts` *(new)* | items 1–4 |
| `backend/src/auth/capabilities.spec.ts` *(new)* | item 12 |

### NOT to touch, and why

| File / area | Why |
|---|---|
| `backend/src/auth/roles.guard.ts` | Fail-closed by design. `AUTHORIZATION_MODEL.md:174-176`: *"must not be relaxed."* Widening a role set never requires touching the guard. |
| `backend/src/auth/jwt.strategy.ts` | The per-request role re-read is correct and is what makes `admin` take effect immediately. (`users.status` is **not** checked here — that is `DOM-4`'s problem, not this unit's; noted so it is not "fixed" speculatively.) |
| `backend/src/staff/interfaces/course-staff-repository.interface.ts` and both drivers | `AUTH-2`. One line in `StaffScopeService` is the whole of this unit's contact with scoping. |
| `staff-scope.service.ts`'s `assertAssigned` body, `scopeFor`, `findAssignment`, `assign`, `unassign` | The interface must not change (`ARCHITECTURE.md:105-107`). Nine callers depend on it. |
| The `NotFoundException` string `'Course not found or not assigned to you'` | Byte-identical-message property. A reworded message breaks `staff-scope.service.spec.ts:60-62` and, worse, could differ from a genuine miss. |
| `frontend/app/*`, `frontend/components/{app,site}/*` | The 301 errors are `SHELL-4`'s. `PHASE_ROADMAP.md:180-182`: *"Do not patch those errors in an earlier unit."* |
| `docs/API_SPEC.yaml` | Already correct (§4 API). Editing it would move the contract away from the target. |
| `backend/src/database/migrations/001`–`010` | Immutable. `011` is a new file. (The one precedent for amending in place — migration 002 — required proof the file had never been applied anywhere real; 001–008 have been.) |
| `database/schema.sql`, `database/seed.sql` at the repo root | Scaffold-era, not applied, and their headers say so (`CLAUDE.md` §7.1). |

---

## 6. Sequencing

Ordered. Where the order is load-bearing, what breaks if it is reversed.

1. **`011_full_admin_role.sql`.**
   *Load-bearing.* Write it first even though it cannot be executed here, because it is what the
   integration suite will run and because writing the code first invites a fixture that no database
   can hold.
2. **`Role.Admin` + `STAFF_ADMIN`/`STAFF_ALL`.**
   *Load-bearing.* Everything else references these. **Nothing breaks at compile time if you skip
   it** — which is precisely the danger; see §9, R-1.
3. **`actorRoleOf` and the twelve call sites.**
   *Load-bearing, and it must come before step 4.* If the decorators widen first, there is a window
   in which an admin can perform audited mutations that are logged under the wrong role. On a shared
   dev database those entries are permanent — the audit log has no update and no delete
   (`SECURITY.md:29`). Reversing this order writes wrong history that cannot be corrected.
4. **`staff-scope.service.ts:57` `isAdmin`, and `blog.service.ts:394`.**
   *Load-bearing, before step 5.* Widen the decorators first and an admin reaches 63 routes that all
   404 or 403 from the service layer — a console that looks catastrophically broken. Fails safe, but
   it will be mistaken for a bug in the widening.
5. **The 14 `@Roles` decorators.** The mechanical step. Do it in one commit so the reviewer can read
   the whole boundary change as one diff.
6. **Fixtures: `in-memory-user.repository.ts`, then `002_staff_fixtures.sql`.**
   *Load-bearing, before step 7.* No admin fixture, no admin token, no test.
7. **`findByRole` widening + `DirectoryService`.** Independent of 3–5; can run in parallel.
8. **`role-guards.spec.ts`.** *Deliberately after step 5, not before.* Written first it is a
   to-do list; written after, it is a regression barrier. Either way it must fail if step 5 is
   reverted — verify that by reverting one decorator locally and watching it go red.
9. **`capabilities.ts` + `capabilities.spec.ts`** (`AUTH-3`, part 1). Depends only on step 2.
10. **`GroupsService.removeMember` + the method-level `@Roles` override** (`AUTH-3`, part 2).
    *Load-bearing:* the service assertion and the decorator go in the **same** commit. A decorator
    without the service check passes `@Roles` review and fails DoD point 5; a service check without
    the decorator leaves `API_SPEC.yaml:720` disagreeing with the reflected metadata.
11. **e2e items 5–10, then the `staff-scope.service.spec.ts` addition, then item 11.**
12. **`frontend/lib/` three lines.** Last of the code. Independent; done last so a frontend
    typecheck run is attributable.
13. **Docs.** `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `CHANGELOG.md`,
    `AUTHORIZATION_MODEL.md`, `ARCHITECTURE.md`, `DATABASE_PLAN.md`, `project_log.md`.
    *Load-bearing in one respect:* `CHANGELOG.md` must record the `AUTH-2` re-sequencing **before**
    unit 2 is planned, or unit 2's planner re-derives the same argument from scratch.

---

## 7. Definition of Done for this unit

The applicable points from `IMPLEMENTATION_PLAN.md` §Definition of done, made concrete. Points 3, 4
and 9 are **N/A** and the reason is given, rather than being quietly skipped.

| # | Point | Concretely |
|---|---|---|
| 1 | Implementation in the right layer | Role constants and capabilities in `auth/`; the capability assertion in `GroupsService` (service layer); `@Roles` on controllers. `ARCHITECTURE.md` §6: *"Invitations → `backend/src/auth/`"* — capabilities sit beside them. |
| 2 | **Migration run against real Postgres from an empty schema** | **NOT MET — blocked on environment.** See below. |
| 3 | Both repository drivers | **N/A for new tables — zero are added.** Applies to the `findByRole` widening: **both** `in-memory-user.repository.ts:87` and `postgres-user.repository.ts:69` must change, plus an integration-suite entry. |
| 4 | DTO validation | N/A — no new DTO, no new body field. |
| 5 | Authorization enforced in the **service** | `assertMay(actor, 'group.member.remove')` inside `GroupsService.removeMember`, asserted by test item 11 with a repository spy. |
| 6 | Audit inside the transaction, union + `Record` | N/A — **no new `AuditAction`.** The obligation here is negative: the twelve `audit.record` call sites must stay inside their enclosing `runInTransaction`, and the 27-member union and its `Record` must stay in step (they already are). |
| 7 | Unit + integration + **a refusal test for every permission** | Items 1–12 in §4 Tests. Four withheld verbs → four refusal tests. One narrowed route → a 403 refusal test **plus** a proof the write did not happen. `/admin/*` → the existing assistant-403 table, unchanged. |
| 8 | Error cases | 403 on the capability refusal with a capability-independent message; 404-with-identical-message preserved on scope (`staff-scope.service.spec.ts:48-63`); no new conflict or unconfigured-driver path. |
| 9 | Frontend on the real API | N/A — no screen in scope. The three `lib/` lines touch no fetch. |
| 10 | `API_SPEC.yaml` matches | Satisfied by **verification, not editing** (§4 API). The executor reports any of the 14 controllers whose reflected roles disagree with their `x-roles`. |
| 11 | Frontend + backend gates clean | Commands below. |
| 12 | Design adherence (the eight questions) | N/A — no screen. State that explicitly in `EXECUTION_NOTES.md` rather than leaving the reviewer to infer it. |
| 13 | `IMPLEMENTATION_PLAN.md` + `CHANGELOG.md` updated | Step 13 in §6, including the `AUTH-2` re-sequencing decision and the 27-vs-39 audit-action correction. |

### Commands that must pass, with expected results

```
npm test --workspace=backend
#   expected: 26+ files, 383 + N tests, 0 failed.
#   Baseline verified 2026-09-19: 26 files / 383 tests / exit 0.
#   N grows by capabilities.spec.ts + role-guards.spec.ts + the two spec additions.
#   NO test deleted or skipped to get here (PHASE_ROADMAP.md §3 Exit).

npm run test:e2e --workspace=backend
#   expected: 3 files, 179 + M tests, 0 failed.
#   Baseline verified 2026-09-19: 3 files / 179 tests / exit 0.
#   M >= 30: the 25-route parity table plus items 7-10.

npm run lint --workspace=backend          # oxlint src/ test/ — no new finding

cd frontend && npx tsc --noEmit
#   expected: EXACTLY 301 "error TS", all in app/ and components/{app,site}.
#   Verified 2026-09-19: 301, zero in lib/. A 302nd error is a regression, not
#   pre-existing debt.

cd frontend && npx eslint .               # no new finding in lib/
```

```
# The gate that CANNOT be run here:
docker compose up -d db
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tahir_test \
  npm run test:integration --workspace=backend
#   expected on an EMPTY schema: migrations 001..011 all applied in order,
#   and the suite reporting executed tests (79 + N), not self-skipping.
#   `test/postgres-repositories.integration-spec.ts` skips itself when
#   TEST_DATABASE_URL is unset, and a self-skipping suite is indistinguishable
#   from a passing one - CI has a guard step for exactly this.
```

### Point 2 — NOT MET, blocked on environment

**Stated plainly: this phase cannot reach `APPROVED` until someone starts Docker and runs the
integration suite against an empty schema.** `PHASE_ROADMAP.md:115-117` makes `SPEC-12` a **hard
gate on every later unit that writes a migration**, and this unit writes `011`.
`PHASE_ROADMAP.md` §2 condition 4 requires *"integration against real PostgreSQL where a migration is
in scope. Real output recorded, not asserted."*

What I verified myself, rather than taking on report:
- `docker info` **hung past 120 seconds** and had to be backgrounded. The daemon is not running.
- `df -h` reports **`C:` at 110G / 110G, 0 bytes available, 100% used.** Docker Desktop's VM disk,
  its image store and `%TEMP%` all live there. Starting the daemon and pulling `postgres:15` will
  fail for want of space before anything else. Several shell pipelines during this planning session
  failed with *"No space left on device"* for the same reason. **`SPEC-12` is therefore blocked on
  disk space first and the daemon second** — which is more than the roadmap currently records, and
  it changes the remediation from "start Docker Desktop" to "free space on `C:`, then start Docker
  Desktop".

Why this matters more than usual, in this unit's own terms: `DATABASE_PLAN.md:1-5` records that
001–008 were each verified this way and `IMPLEMENTATION_PLAN.md:74-76` that **every single first run
found something** — the audit log's microsecond keyset-cursor bug among them. `011` will be applied
for the first time in the same run as the never-executed `009` and `010`, so a failure in either
**masks `011` entirely**: the runner stops at the first failing file (`migration-runner.ts:89-99`),
and you learn nothing about `011` until `009`/`010` are green. Specific candidates in §9, R-2.

The honest reading: `011` is the lowest-risk migration in the whole plan — it widens two CHECK
constraints and cannot lose data — so proceeding on the user's direction is defensible in a way that
proceeding with `DOM-1`'s `DROP TABLE` would not be. But *defensible* is not *done*, and the unit
status must stay `[~]` with this recorded.

---

## 8. Blockers and decisions required

### B-1 — `AUTH-2` depends on `DOM-1`, which is in unit 2. **I rule on this.**

**The question.** Defer `AUTH-2` (a), pull `DOM-1` into this unit (b), or build `AUTH-2` against the
current `group_courses` shape and re-touch it after `DOM-1` (c)?

**Ruling: (a) — defer `AUTH-2` to unit 2, immediately after `DOM-1` and beside `DOM-2`.** With it,
`AUTH-3`'s three unrouted verbs stay unrouted (they always were) and `AUTH-4` defers to a unit where
`MAIL-1` exists.

**Reasoning, from the code and not only the docs.**

*Can group-scoped assignment be built at all while a group may hold two courses?* **The assignment
table can; the derived course reach cannot be built once.**
`assistant_group_assignments(user_id, group_id)` never mentions a course, so scope *storage* is
indifferent to `DOM-1`. But nine services and 22 call sites ask
`assertAssigned(courseId, actor)` — a **course** question — and under group scoping that must become
"does this assistant hold a group that studies this course". Against `group_courses` that is
`assistant_group_assignments ⋈ group_courses`; after `DOM-1` it is
`assistant_group_assignments ⋈ groups`. One query, **two driver implementations, written twice.**

*Does (c) mean writing `StaffScopeService` twice?* **No, and that is the honest answer even though it
weakens my own case.** `StaffScopeService`'s public interface, its admin bypass and its 404-with-
identical-message are untouched by which table the reach query joins. (c) costs one repository
method × two drivers × two rewrites, plus an integration-suite entry written twice. Bounded.

*So why (a)?*

1. **The migration cannot run.** `DATABASE_PLAN.md` §4.2's DDL is
   `JOIN groups g ON g.course_id = csa.course_id`. `groups.course_id` arrives in `013`.
   `MigrationRunner.sqlFilesIn` sorts filenames lexicographically (`migration-runner.ts:40-41`), so a
   `014_*.sql` with no `013_*.sql` present applies straight after `012` and raises. Each migration is
   wrapped in its own transaction and the ledger is written only on success (`:89-99`), so nothing
   is half-applied — but **every boot and every integration run aborts** until `013` exists. Under (c)
   this is survivable only by renumbering `014` → `012`, which means amending `DATABASE_PLAN.md`'s
   documented numbering and shifting `DOM-3`.
2. **Four of five same-level sources already sequence it after `DOM-1`.**
   `IMPLEMENTATION_PLAN.md:87` lists `AUTH-2`'s deps as `AUTH-1, DOM-1`; its graph (`:228`) draws
   `DOM-1 → AUTH-2`; `PHASE_ROADMAP.md` §5's graph draws `unit 2 (DOM) → unit 1 (AUTH-2)`; the
   critical path in both files is `SPEC-12 → DOM-1 → AUTH-2`. Only `PHASE_ROADMAP.md` §4's scope
   line puts `AUTH-2` in unit 1, and §4 itself concedes the dependency in the next line. **This is a
   document-internal conflict, and the resolution is not "whichever is cheaper" — it is that the
   dependency graph is derived from the data and the scope line is not.**
3. **`groups.assistant_id` (`DOM-2`) and `assistant_group_assignments` (`AUTH-2`) record the same
   fact twice.** `DATABASE_PLAN.md` §3 lists the join table; `IMPLEMENTATION_PLAN.md:99` adds
   `groups.assistant_id`. Two places that can disagree about which assistant has a group, one of
   them authorization-bearing. **Designing them in different units is how they end up disagreeing.**
   This is the argument I would keep even if points 1 and 2 were solved, and it is why (a) beats (c)
   rather than merely tying it.
4. **Nothing between unit 1 and unit 5 consumes group scoping.** Unit 5 depends on units 1 **and** 2
   anyway (`PHASE_ROADMAP.md:194`). Deferring `AUTH-2` by one unit delays nothing downstream.

**What (b) would cost, for completeness.** `DOM-1` is *"the highest [risk] in the project… destructive,
one-way"* (`IMPLEMENTATION_PLAN.md:98`) and `CLAUDE.md` §6.1 argued against the shape and was
knowingly overruled. It touches `GroupRepository` ×2, `LearningModeService`, `StudentGroupsService`,
`GroupsService`, the dashboard, reports, assessment targeting and the seeds. Pulling it in would make
unit 1 the largest and riskiest unit in the plan, duplicate unit 2's scope, and drag `DOM-2` and
`DOM-6` with it. Rejected.

**Impact of the ruling.** Unit 1 ships `AUTH-1` + `AUTH-3`. `AUTH-2` and `AUTH-4` move:
`IMPLEMENTATION_PLAN.md`'s Phase 1 table and `PHASE_ROADMAP.md` §4 need amending, and the amendment
belongs in this unit's doc updates (§6, step 13) so unit 2's planner inherits it rather than
re-deriving it. **`AUTH-4` also needs `MAIL-1` (unit 3)** — so its natural home is unit 5 beside
`PEOPLE-4`, which `IMPLEMENTATION_PLAN.md:136` already couples to it. That is a coordinator call, not
mine; I flag it and recommend it.

**Labelled assumption.** Absent a coordinator override I have written this plan for
`AUTH-1` + `AUTH-3` only. **Assumption:** the coordinator accepts a smaller unit 1 over a
renumbered migration and a twice-written reach query. If the coordinator prefers (c), the plan needs
one addition — the `014`→`012` renumber and the `group_courses` variant of §4.2's DDL — and
everything else in §4–§7 stands.

### B-2 — `SPEC-12` cannot be closed on this machine

**The question.** Proceed with a migration on top of two never-executed ones, or stop?

**Reading 1 (the roadmap's).** `PHASE_ROADMAP.md:115-117` and `IMPLEMENTATION_PLAN.md:78`: the gate
closes before Phase 1 starts. Under this reading unit 1 does not begin.
**Reading 2 (the user's direction).** Proceed; `011` is the least dangerous migration in the plan.

**Impact.** Under reading 1, nothing ships and `AUTH-1` blocks `SHELL-1`, `DOM-4` and `DOM-5` —
four tasks and two units stall on a disk-space problem. Under reading 2, `011` is written and
reviewed but unverified, and the unit cannot satisfy completion condition 4.

**Blocks.** Formally, every task in this unit. Practically, only DoD point 2.

**Recommendation — and this is the user's decision already taken, not mine to re-litigate:**
proceed, mark DoD point 2 **NOT MET**, hold the unit at `[~]`, and **do not** mark `AUTH-1` `[x]`
(DoD point 2 is "applicable" here). Record in `EXECUTION_NOTES.md` that the environment blocked it,
not the work. **Assumption:** `011`'s two CHECK widenings are low enough risk to author unverified —
which I believe, because the change cannot lose data and the migration is atomic. I would *not* make
the same call for `DOM-1`.

**Remediation, in order:** free space on `C:` (0 bytes available today) → start Docker Desktop →
`docker compose up -d db` → run the integration suite with `TEST_DATABASE_URL` against an **empty**
schema → record the real output → close `SPEC-12` → re-run this unit's integration gate.

### B-3 — `AUTH-5` / decision `D-1`

**The question.** Redis for shared session state, or drop the Account → Security tab for launch?
(`PHASE_ROADMAP.md` §6, `IMPLEMENTATION_PLAN.md:273`, `PRODUCT_SPEC.md` §1.4.)

**Reading 1 — Redis.** The denylist and rate limiter become shared and enumerable, `AUTH-5`'s two
routes become buildable, and `SECURITY.md` §3.1's main known weakness closes. Cost: a component to
operate, back up and fail over, which `CLAUDE.md` §7.3 says is not warranted at 300 students on one
replica and names the trigger as **a second replica, not a student count**.
**Reading 2 — drop the tab.** Zero cost; `PRODUCT_SPEC.md` §1.4 already classifies it `[UNCERTAIN]`.

**Impact.** Two routes and one frontend tab.
**Blocks.** `AUTH-5` only. **Scoped out of this plan entirely**, as `PHASE_ROADMAP.md` §6 requires
(*"A unit does not guess past one of these"*).

**Recommendation, labelled assumption.** Drop the tab for launch. `CLAUDE.md` §7.3's trigger has not
fired, and introducing Redis to power one screen would also be the fourth per-process security
structure replaced for the wrong reason. `AUTH-5` stays `[!]`. **Assumption**, not a decision — the
single question that closes it: *is a second API replica planned before launch?*

### D-a — Does an `all_tas` announcement reach the full admin?

`announcements/announcements.service.ts:180` resolves the audience as
`findIdsByRole(Role.Assistant)`, live at send time per `CLAUDE.md` §5.14. Once `admin` exists, an
`all_tas` broadcast **silently misses** the full admin. Reading 1: `all_tas` means literally
assistants. Reading 2: it is the staff broadcast channel and an admin is staff — and
`PHASE_ROADMAP.md:262` says to keep `all_tas` precisely because *"staff broadcast has no other
route"*. **Impact:** one line. **Blocks:** nothing. **Recommendation, labelled assumption:** include
admins — `findIdsByRole` over `[Role.Assistant, Role.Admin]`, reusing the same multi-role widening
`findByRole` needs. A missed recipient is silent; a redundant one is visible. Not done unless the
coordinator agrees, because it changes who receives mail.

### D-b — `Assistant.lastSeenAt` has no source anywhere

`API_SPEC.yaml:221` declares `lastSeenAt: [string, 'null']`. Grepping the whole repository for
`lastSeen|last_seen` returns **that line and nothing else** — no column in `DATABASE_PLAN.md` §2 or
§3, no task in `IMPLEMENTATION_PLAN.md`, no code. **Impact:** `PEOPLE-4` cannot populate it.
**Blocks:** nothing here. **Recommendation, labelled assumption:** emit `null` always and file a task;
the field is already nullable so the contract holds and the console can render an em-dash. The
alternative — a `users.last_seen_at` written on every authenticated request — is a new write on the
hot path for a figure nobody has asked to act on, which is the shape `CLAUDE.md` §9 warns about.

### D-c — Two units are both assigned migration `011`

`DATABASE_PLAN.md` §2 attributes the role CHECKs **and** `users.status` to `011`;
`IMPLEMENTATION_PLAN.md:86` gives `AUTH-1` → `011` and `:101` gives `DOM-4` → `011`. **A migration
file is immutable once applied** — the ledger records it by filename — so unit 2 cannot append to
this unit's file after it has run. **Impact:** unit 2 either amends `011` (legal *only* while it has
provably never been applied anywhere real — the precedent is migration 002, and it required exactly
that proof) or takes a new number. **Blocks:** nothing here; it is a trap for unit 2.
**Recommendation, labelled assumption:** this unit writes `011_full_admin_role.sql` with the two
CHECK widenings **and nothing else**, and `DOM-4` takes its own number. Correct
`DATABASE_PLAN.md` §2's attribution in this unit's doc updates so unit 2 does not inherit the
collision.

### D-d — Are invitation accept and resend audited?

`API_SPEC.yaml:583,604,610` give `x-audit` for invite / scope-change / remove; the **accept**
(`:622-649`) and **resend** (`:612-620`) operations carry none. An account coming into existence is
an account event, and resending mails a fresh credential to an address — both are squarely what
`CLAUDE.md` §5.4's admin-side tier ("money, enrollment, or accounts") covers. Reading 1: accept is
performed by the invitee, not staff, and §5.4 is about staff mutations. Reading 2: *"an assistant
account came into existence and here is who caused it"* is exactly the attribution question.
**Impact:** two actions × three things each (union entry, `Record` entry, spec asserting the entry).
**Blocks:** `AUTH-4`, not this unit. **Recommendation, labelled assumption:** add
`assistant.invitation_accepted` (actor = the invitee) and `assistant.invitation_resent`; flagged now
so `AUTH-4`'s planner costs them rather than discovering them.

---

## 9. Risks

Ranked by expected cost × likelihood. For each: what goes wrong, how it shows up, how to detect it
early.

**R-1 — A missed or over-widened `@Roles`, with no compiler pressure at all. (High × Medium)**
Verified: there is **no `Record<Role, …>` and no `switch` on a role value anywhere in `backend/src`
or `frontend/`**, so adding `Role.Admin` produces **zero compile errors**. Every one of the 14
decorator sites, 12 `actorRole` expressions and 3 `=== Role.Teacher` bypasses must be found by
enumeration. A *missed* widening is loud (an admin gets 403 on a route they should reach). An
*over*-widening — `Role.Assistant` reaching `/admin/*` — is **silent and is the whole hole
`SECURITY.md` §2.7 names**.
*Early signal:* `role-guards.spec.ts` (§4 Tests, items 1–4) reflecting `@Roles` metadata off all 25
controllers and asserting `STAFF_ADMIN` excludes `Assistant`. Verify the test is real by reverting one
decorator locally and watching it fail. The existing TA-on-`/admin/*` 403 table
(`staff.e2e-spec.ts:111-125`) is the second net; **it must not be edited.**

**R-2 — `011` is authored on top of `009` and `010`, which have never run. (High × Medium)**
`DATABASE_PLAN.md:1-5`; every prior first run found something (`IMPLEMENTATION_PLAN.md:74-76`). The
runner stops at the first failing file, so a defect in `009`/`010` **masks `011` completely**.
Named candidates, from reading the two files:
- **`010:172-177` — `score NUMERIC(10,2)` and `max_score NUMERIC(10,2)`.** `pg` returns `NUMERIC` as
  a **string**, not a number. Any repository or analytics read that treats it as numeric gets
  `'85.00'`. This is the single most likely first-run finding and it is invisible on the memory
  driver, where the fixture is a JS number. Closest precedent in this codebase: the audit log's
  microsecond-vs-millisecond cursor — a type the reader could not represent.
- **`010:224-229` — `ALTER TABLE users ADD COLUMN google_email` plus a partial expression index
  `ON users (lower(google_email)) WHERE google_email IS NOT NULL`.** `011` also alters `users`. A
  CHECK swap does not rebuild indexes, so the interaction is benign — but `011` runs *after* `010`
  in the same fresh run, so if `010` aborts on this index, `011` never executes and its own
  correctness is untested.
- **`010:56-58` — `assessments_link_needs_url`**, a named table-level CHECK added after a column with
  `DEFAULT 'file_upload'`. Safe on seeded rows, but it is the only *named* constraint added in
  either file, and `011` depends on the *inline* naming convention (`users_role_check`,
  `audit_log_actor_role_check`) being what Postgres actually produced.
- **`009:65` — `scopes TEXT[] NOT NULL DEFAULT '{}'`** and **`010:186` — `raw JSONB NOT NULL DEFAULT
  '{}'::jsonb`.** Both shapes are already proven by `008` (`TEXT[]` default, `BIGINT` round trip), so
  these are the lower-risk half.
*Early signal:* the first real run, and nothing before it. This is the argument for freeing disk and
closing `SPEC-12` before unit 2 rather than after.

**R-3 — Twelve `actorRole` ternaries mis-attribute an admin, permanently. (High × High if unfixed)**
The full table is in §4 Services. Seven sites log an admin as **`teacher`**, five as **`assistant`**.
Nothing errors — `011` makes the column able to hold `'admin'`, so the database accepts the lie. This
destroys the one property `Role.Admin` exists to provide (`CHANGELOG.md:62-64`), and the
`assistant` half poisons the Assistant activity screen (`PEOPLE-5`). **Worst of all, the audit log
has no update and no delete** (`SECURITY.md:29`), so entries written during the window are wrong
forever.
*Early signal:* e2e item 8 — an admin grades a submission, then `GET /admin/audit-log` asserts
`actorRole: 'admin'`. **Write this test first and watch it fail**; it is the only thing in the suite
that fails today for the right reason. Sequencing step 3 before step 5 (§6) keeps the window closed.

**R-4 — The 404-with-identical-message property is weakened while nobody is looking. (High × Low
this unit, High × Medium in unit 2)**
`staff-scope.service.spec.ts:48-63` compares `denied.message` to `missing.message`. Nothing in this
unit rewrites those internals — the exposure is one line (`:57`) — but the same property is what
`AUTH-2` must carry through a full rewrite, and the message string is a **plain literal** in
`staff-scope.service.ts:79`, so a well-meaning reword breaks it.
*Early signal:* the existing spec, unchanged, plus `staff.e2e-spec.ts:190-202`'s four-route 404
table. Neither may be edited in this unit; if either needs editing, that is the finding.

**R-5 — Migration `011` aborts on a constraint-name mismatch. (Low × Medium)**
`users_role_check` and `audit_log_actor_role_check` are the names Postgres generates for inline
column CHECKs (`<table>_<column>_check`), both well under the 63-character identifier limit, and
`001:27` / `002:65-66` are unambiguously inline. But this has never been observed against a real
database for these two tables.
*Early signal:* the integration run. Consequence if wrong: the migration aborts inside its own
transaction, the ledger is not written, nothing is half-applied, and the boot fails loudly. **This is
why `DROP CONSTRAINT` is written without `IF EXISTS`** — the `IF EXISTS` variant would leave the old
narrow constraint standing and add a second, and the intersection is still narrow, so the first
`admin` insert would fail at runtime with a confusing message.

**R-6 — The `findByRole` widening loses its safety property. (Medium × Low)**
The interface comment (`user-repository.interface.ts:61-66`) says `role` is required **so that no
call shape returns every account** — the student directory cannot accidentally list teachers, the TA
picker cannot list students. Widening to an array invites `findByRole([], …)` being read as "all".
*Early signal:* an integration test asserting an empty array **throws or returns `[]`**, never
everything, plus a unit test that `listStudents` returns no staff.

**R-7 — An admin lands on the student dashboard. (Medium × Medium)**
`frontend/lib/roles.ts:15` / `:20-22` route any non-staff role to `/dashboard`, which is
`@Roles(Role.Student)` end to end. Unfixed, an admin sees a broken page and a 403 — the precise
symptom `CLAUDE.md` §7.1 records as having already happened for the teacher.
*Early signal:* impossible to catch with `tsc` (the union widens silently). Catch it by signing in as
`admin@example.com` against `npm run dev` and confirming the landing path is `/manage`. Note this
needs the **backend** to be able to issue an admin token, so it comes after step 6.

**R-8 — Doc drift is carried forward rather than corrected. (Low × High)**
Three drifted facts found while planning, each repeated in several files: the audit-action count is
**27**, not 39 (`SPEC-13` and the briefing both say 39; the union, the `Record` and the literal count
all say 27); `StaffScopeService` has **nine** callers, not eight
(`AUTHORIZATION_MODEL.md:192`, `ARCHITECTURE.md:102`, `CHANGELOG.md:91`); and the role widening is
**14 decorator sites / 63 routes**, not "~30 call sites"
(`AUTHORIZATION_MODEL.md:36`, `SECURITY.md:81`, `CHANGELOG.md:66`).
*Early signal:* none — drift is silent by nature, which is why it is worth one commit. The 63-route
figure matters operationally: an executor planning for "~30" will stop at half the boundary.

---

## Appendix — one-line fixes found, deliberately not applied

Per this planner's contract, found and recorded rather than fixed:

1. `frontend/lib/roles.ts:26` — the comment *"there is no separate 'admin' role; the teacher* is *the
   admin"* is now false (`CLAUDE.md` §2.1 as amended). It is in scope for step 12; noted separately
   because a stale comment is what produced the wrong reading.
2. `backend/src/staff/staff-scope.service.ts:38-47` — the class doc still describes course scoping as
   *"the design"*. Correct with `AUTH-2`, not here; `CLAUDE.md` §7.1's rule is to fix such comments
   as the work touches each file rather than in a sweep.
3. `backend/src/enrollments/interfaces/enrollment-repository.interface.ts` —
   `countDistinctStudents`'s comment says *"a student in two of the teacher's groups"* meaning
   *courses*, which `CLAUDE.md` §5.16 made wrong. Same rule: fix it when group work touches the file.
4. `docs/DATABASE_PLAN.md` §2 attributes `users.status` to migration `011`, which this unit claims.
   §8, D-c. Correct in step 13.
