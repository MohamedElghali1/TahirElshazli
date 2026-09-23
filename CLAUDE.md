# CLAUDE.md — Dr. Tahir LMS

Durable engineering instructions for Claude Code working in this repository.

**What this file is.** The rules, boundaries and facts that hold across sessions. It is deliberately
short enough to read every time.

**What this file is not.** It is not the product specification, the API contract, the feature
backlog, the phase history or the changelog. Those live in `docs/` and are listed in §2. If you are
about to add a feature description, a task list or a decision narrative here, it belongs there
instead.

---

## 0. Framing — read this first, every time

**The requirements change.** This brief has shifted across three client meetings and a full redesign
phase, and it will shift again. Features get dropped, merged, narrowed and replaced.

- When a new instruction from the user conflicts with any document here, **the user wins** — then
  update the document so it stops being wrong.
- Do not argue from "the spec says".
- Do not build a feature because it appears in a wish list. The original brief's feature list
  (`brief.txt`, `context/`) is **a menu, not a checklist**.

**A redesign is in progress on the `redesign` branch, and it changes the product, not only the
paint.** The Claude Design handoff introduced, changed, removed and narrowed functionality. The
engineering job is to **reconcile** the existing implementation with the new requirements — not to
preserve the old application, and not to rebuild everything from the design.

**An existing feature is not evidence that it is still wanted. A designed component is not evidence
that it needs a backend.** `docs/PRODUCT_SPEC.md` classifies every feature as
`[EXISTING] / [CHANGED] / [NEW] / [REMOVED] / [UNCERTAIN]`. That classification, not the code and not
the design file, decides what to build.

---

## 1. Project identity

A premium educational platform for **Dr. Tahir Elshazli** (brand: *Dr. Tahir / English Team*) at
**tahirelshazli.com**, for **IGCSE and IELTS** students.

It is a public marketing site **plus** a Learning Management System. Two products, one repository,
two deliberately separate visual languages (§11).

**Product domains:** identity and access · teaching (tasks, marking, mark book, weekly reports) ·
people and groups · sessions and attendance · communication (announcements, notifications, mail) ·
the student surface · the public site.

**The scale it actually runs at, which constrains every design choice:** ~10 groups, ~30 students
each, **~300 students**, **two courses**, one teacher, 2–3 assistants, one containerized VPS, **one
replica**. A roster is thirty rows.

This is the single most useful number in the repository. It means: no virtualised tables, no faceted
search, no pagination furniture, no queue, no worker process, no Redis, no caching layer. It does
**not** excuse an `O(N)` fan-out on a screen someone opens daily, or materializing whole rows to
produce an integer — those are still worth fixing, and cheaply.

**Major constraints**
- The VPS must be migratable to AWS/DigitalOcean **without code changes**. Every infrastructure
  dependency stays behind a configured interface — never a direct SDK call at a call site.
- Third-party subscriptions (VPS, Bunny Stream, R2, mail, Google) are the client's responsibility.
  **Never assume a paid tier is provisioned.** Code must degrade to an explicit, honest failure.
- Arabic and English content both appear. Nothing may assume Latin metrics or survive only in LTR.

---

## 2. Source of truth

### 2.1 Authority order

Highest first. A higher entry beats a lower one on the subject it owns.

1. **What the user says in the current conversation.**
2. **`docs/`** — the reconciled specification set below. Each file owns one subject.
3. **The Claude Design handoff** (project `59f824fd-6470-4cb4-a675-7a756ef04a9f`) — the intended
   product experience and the visual system. It is the later artifact and the client commissioned it
   as final, so it outranks the older meeting reports on anything describing the frontend or the
   product. It says nothing about the stack.
4. **`context/download.pdf`** — the signed development agreement. Governs stack, scope, phases.
5. **The existing source code** — authoritative for *what is currently implemented*, and for nothing
   else. See §0.
6. **`context/`** meeting reports and prototype notes — historical input, already reconciled into
   `docs/`. Read for provenance, not for instruction.

### 2.2 Which document owns which subject

| Subject | Owner |
|---|---|
| Product requirements, feature-by-feature, with change classification | `docs/PRODUCT_SPEC.md` |
| Business/domain entities and their relationships | `docs/DOMAIN_MODEL.md` |
| Target API contract | `docs/API_SPEC.yaml` |
| Current-vs-target API delta | `docs/API_GAP_ANALYSIS.md` |
| Roles, scope, capability matrix, enforcement | `docs/AUTHORIZATION_MODEL.md` |
| Security controls, risks, known weaknesses | `docs/SECURITY.md` |
| Technical architecture, layers, patterns, where new code goes | `docs/ARCHITECTURE.md` |
| Schema, migrations, indexes, data risks | `docs/DATABASE_PLAN.md` |
| Detailed task checklist and Definition of Done — **what is done** | `docs/IMPLEMENTATION_PLAN.md` |
| Phase order, entry/exit criteria, chat boundaries | `docs/PHASE_ROADMAP.md` |
| Decisions and their reasoning, including reversals | `docs/CHANGELOG.md` |
| Design handoff ⇄ codebase mapping, token deltas, component map | `docs/redesign-mapping.md` |
| Google Forms integration setup | `docs/google-forms-setup.md` |
| Running narrative of how the project got here | `project_log.md` |

**Superseded, kept only as historical record:** `docs/frontend-design-system.md` describes the
retired Twenty-derived system. `docs/redesign-mapping.md` replaces it. Do not build from it; several
of its *warnings* still apply and are restated in §11.

### 2.3 When two sources conflict

1. Apply the §2.1 order. Most conflicts resolve there.
2. If two documents at the same level disagree, **that is a finding, not a puzzle to solve
   silently.** Record it in `docs/CHANGELOG.md`, and raise it.
3. If proceeding requires inventing business behaviour — who may do a thing, what a number means,
   what happens on failure — **stop that portion of the work and ask.** Do everything that does not
   depend on the answer first.
4. Never resolve a conflict by picking whichever reading is easier to implement.

---

## 3. Technology stack

Actual repository versions. Do not substitute generic knowledge for what is written here.

| Layer | Technology |
|---|---|
| Monorepo | **npm workspaces** (`frontend`, `backend`), single root `package-lock.json` |
| Runtime | **Node 24** (`v24.15.0`), npm 11 |
| Frontend | **Next.js 16.3.3** (App Router) · **React 19.2.8** · **TypeScript 5** |
| Frontend styling | **Tailwind CSS v4** (`@tailwindcss/postcss`, `@theme inline`) over CSS custom properties |
| Frontend libs | `motion` 13 · `@phosphor-icons/react` 2 (the UI kit's own `Icon` wraps ~115 Tabler glyphs) |
| Frontend lint | **eslint 9** + `eslint-config-next` |
| Backend | **NestJS 12** (separate service — *not* Next.js route handlers) · **TypeScript 6** |
| Backend validation | `class-validator` + `class-transformer` DTOs |
| Backend auth | `@nestjs/jwt` + `passport-jwt` · `bcryptjs` |
| Backend lint | **oxlint** (not eslint) |
| Tests | **vitest 4** — unit, e2e (`vitest.config.e2e.ts`), integration (`vitest.config.integration.ts`) |
| Database | **PostgreSQL 15** |
| Data access | **No ORM.** `DatabaseService` + parameterised SQL behind repository interfaces |
| Migrations | Hand-written SQL in `backend/src/database/migrations/`, run by `MigrationRunner` |
| Video | **Bunny Stream** — adaptive streaming, signed URLs only |
| File storage | **Cloudflare R2** (`STORAGE_DRIVER=r2`); `local` in dev, `none` in prod until provisioned |
| Hosting | **Hostinger VPS**, containerized (`docker-compose.yml`, two Dockerfiles), CI/CD in scope |
| Edge | **Cloudflare** — SSL, DNS, CDN, DDoS, WAF, caching |
| Design system | The Claude Design handoff, reimplemented as TSX + Tailwind v4 (§11) |
| Orchestration | Ruflo (`ruflo@latest` MCP server, registered as `claude-flow`) + `.claude/agents/` |

Backend TypeScript is `strict: true`, `module: nodenext`, `target: ES2023`, with
`strictPropertyInitialization: false` (NestJS DI requires it).

**Commands** (from the repo root):

```
npm run dev                  # both services, no database needed
npm test                     # backend unit — 771 tests, 45 files
npm run test:e2e             # backend e2e
npm run test:integration     # backend integration; SKIPS ITSELF without TEST_DATABASE_URL
npm run lint                 # frontend eslint + backend oxlint
npm run db:migrate           # or DB_AUTO_MIGRATE=1 at boot
npm run docker:up            # full stack: postgres + api + web
cd frontend && npx tsc --noEmit
```

---

## 4. Repository structure

```
backend/src/
  auth/            JWT, guards, roles, password reset. Global JwtAuthGuard + RolesGuard.
  common/          Cross-cutting: storage/ (FileStorage port), validators, env.ts
  database/        DatabaseService, MigrationRunner, migrations/, seeds/, repository.provider.ts
  audit/           @Global() AuditModule — AuditService, AuditAction union
  staff/           StaffScopeService — THE authorization chokepoint for /staff/*
  manage/          The staff/admin work surface: grading, authoring, directory, recordings, analytics
  groups/          @Global() GroupDataModule (GROUP_REPOSITORY + LearningModeService) + GroupsService
  courses/ enrollments/ assessments/ materials/ recordings/ live-sessions/
  dashboard/ reports/ notifications/ students/ announcements/ blog/ public/ integrations/
  <module>/interfaces/*-repository.interface.ts     the seam: a Symbol token + methods
  <module>/repositories/{in-memory,postgres}-*.ts   16 interfaces, 32 implementations
backend/test/      app.e2e-spec.ts, public.e2e-spec.ts, staff.e2e-spec.ts,
                   postgres-repositories.integration-spec.ts

frontend/
  app/(site)/      Marketing. Server Components. 17px type scale.
  app/(auth)/      Sign-in.
  app/(app)/       Signed-in consoles. Client components. Role guard → one shell, two consoles.
  app/tokens/      fig-tokens.css + semantic.css — ported from the handoff. THE token layer.
  app/globals.css  Tailwind import + the @theme inline bridge (named utilities)
  components/ui/   The design system primitives. Imports nothing from lib/.
  components/{app,site,blog}/   LEGACY — scheduled for deletion (§4.1)
  lib/             api · types · session (useApi) · roles · format · site-content. UNCHANGED by the redesign.

docs/              The specification set (§2.2)
context/           Client meetings, signed agreement, prototype notes — historical
database/          Scaffold-era schema.sql / seed.sql — NOT APPLIED, disagrees with migrations. Design outline only.
.claude/           agents/, commands/, settings.json, ruflo-guidance.md
project_log.md     The narrative
```

### 4.1 The frontend typechecks clean, as of unit 5 slice 5d (2026-09-21)

**Historical note, kept for the invariant it taught:** before unit 4, `npx tsc --noEmit` in
`frontend/` ran as high as ~401 errors, `0 in lib/`, while `app/` and `components/{app,site}` still
called the retired system's API. The total was expected to rise with each unit until `SHELL-4`
landed and was not what to gate on mid-redesign — `frontend/lib/` is the hand-written mirror of the
API, and a unit that changes a response shape updates the mirror in the same commit (§6), which
temporarily added errors to legacy screens already scheduled for deletion. **The invariant that
mattered during the redesign was** `npx tsc --noEmit 2>&1 | grep -cE "^lib/"` = `0`, not the total.
Beware the unanchored `grep -c "lib/"`: it matches the error *message* text `Module '"@/lib/types"'`
on files under `app/` and reads non-zero when `lib/` is clean.

**Current state: `npx tsc --noEmit` reports 0 errors.** `SHELL-4` (unit 4) got the frontend building
again at 22, all three pre-existing `AUTH-2` domain-model drift (`CourseStaffMember`, `LearningMode`
and related types/methods retired by migration 012/013 but still referenced by three unported
pages). Unit 5 slice 5d closed the count to zero: `manage/groups/page.tsx` and
`manage/courses/[id]/groups/page.tsx` were rewritten onto the current `Group` model (`courseId` a
column, no `learningMode` anywhere — the axis was retired outright by `D-9`, not moved), and
`manage/courses/[id]/staff/page.tsx` was deleted outright — confirmed orphaned (no nav item, no
other page linked to it) before deletion, the same consumer-count discipline `SHELL-4` used. **The
0 is now the thing to gate on going forward** — the mid-redesign exemption above no longer applies;
a PR that adds a `tsc` error should fail review the ordinary way.
`components/app/*` kept only `page-chrome.tsx` (relocated to `components/shell/` — it is live,
shared shell infrastructure, not legacy) and deleted the rest
(`page-parts.tsx`/`table.tsx`/`app-shell.tsx`, all confirmed dead by consumer count before
deletion). **`components/site/*` was not deleted** — unlike `components/app/*`, every file in it
was ported onto the current `components/ui` API *in place* during unit 4 rather than replaced, so
by the time `SHELL-4` ran nothing in that directory was legacy anymore; deleting it would have
destroyed live code (`docs/phases/unit-4/REVIEW_4D.md`). Do not read `SHELL-4`'s original wording
("delete `components/app/*`, `components/site/*`") as still describing the directory's contents —
verify against the actual consumer graph before treating either directory as legacy again.

The backend **is** green and must stay green: **771 unit / 45 files, 354 e2e, 179 integration**
(against real PostgreSQL 15.19, 001–022 from an empty schema) as of the units 10–12 reconciliation,
2026-09-23 (`docs/phases/RECONCILE_UNITS_10_12.md`; units 1–7 and 10–12 are `[x]`). **Backend `tsc
--noEmit` is not a CI gate yet** and specs are excluded from `nest build`; the remote line shipped a
backend that did not compile because of it (`RC-F1`).

---

## 5. Architecture rules

`docs/ARCHITECTURE.md` is the full account, including the five load-bearing patterns and a table of
where each kind of new code goes. Read it before adding a module. The boundaries that must not be
violated:

```
Browser
  ▼  Next.js App Router — lib/api.ts is the ONLY thing that knows the API exists
HTTP (bearer JWT)
  ▼  Controller     — routing, DTO validation, @Roles, HTTP status
  ▼  Service        — business rules, authorization, transactions, audit
  ▼  Repository interface  — a Symbol token and a set of methods. The seam.
  ▼  InMemory* | Postgres* — chosen once at wiring time by PERSISTENCE_DRIVER
  ▼  DatabaseService — the only thing that talks to Postgres
PostgreSQL
```

| Layer | Owns | Must never |
|---|---|---|
| Frontend | Presentation, navigation, the design system | Hold a business rule, or decide what a user may read |
| Controller | Path, verb, DTO, `@Roles`, status code | Query a repository directly, branch on business state |
| Service | Rules, invariants, scope checks, transactions, audit writes | Know about `Request`/`Response`, build SQL |
| Repository | Persistence for one aggregate | Enforce a business rule, call another repository |
| DatabaseService | Connections, transactions, the ambient transaction context | Hold a query specific to one feature |

- **Business logic lives in the service.** Not in a controller, not in a repository, not in a React
  component, not in a SQL view.
- **Validation is two-layered and non-overlapping.** Shape and type at the DTO; invariants and
  cross-entity rules in the service. A permission or an invariant lives in **exactly one place** — if
  the frontend disables a button, the service still refuses.
- **Authorization is in the service**, not only on the decorator (§7).
- **External integrations go behind a port** — `FileStorage`, `MailSender`, the Google client. Config
  selects the driver once at wiring time, validates at boot, refuses unsafe combinations in
  production, and degrades to an explicit 503 with a usable alternative. Never a silent no-op.
- **Shared utilities:** `backend/src/common/` for cross-cutting backend code, `frontend/lib/` for
  frontend. A `components/ui/` primitive that imports `lib/types` has stopped being a primitive.
- **Resist a fourth `@Global()` module.** There are three (`DatabaseModule`, `AuditModule`,
  `GroupDataModule`). Global providers are invisible in an import list, which is what makes them
  worth rationing.
- **Do not introduce** GraphQL, microservices, CQRS, event sourcing, a message queue, a background-job
  framework, an ORM, or Redis. `docs/ARCHITECTURE.md` §4 gives the reason for each. Redis has one
  named trigger: a second replica being configured, or device/session management being committed to.

---

## 6. API engineering rules

- **`docs/API_SPEC.yaml` is the target contract. The implementation must not drift from it.** When
  you change a route, update the spec in the same change.
- **No global `/api` prefix.** Routes are `/courses`, `/staff/*`, `/admin/*`, `/public/*`. If a prefix
  is ever wanted it belongs in `main.ts` as `setGlobalPrefix`, applied to every route at once.
- **Route split carries the authorization boundary at class level:**
  - `/public/*` — anonymous, rate-limited separately.
  - `/staff/*` — teacher, admin and assistant. **Every route routes through `StaffScopeService`.**
  - `/admin/*` — teacher and admin only, unscoped.
  - everything else — the student surface, `@Roles(Role.Student)`.
- **Naming:** plural resource nouns, kebab-free lowercase paths, `:id` path params. Verbs only for
  genuine actions on a resource (`/submissions/:id/grade`, `/students/:id/accept`).
- **HTTP semantics:** `GET` never mutates. `POST` creates or acts. `PATCH` partially updates. `DELETE`
  removes. 201 on create with the created resource, 200 with the updated resource, 204 only when
  there is genuinely nothing to return. 409 for a state conflict, 422 never — use 400.
- **Validation at the boundary, always.** A DTO with `class-validator` decorators on every field.
  Never trust the client, and never accept a field the DTO does not declare.
- **Status is computed server-side.** An assessment's `Locked / Available / Submitted / Corrected`, a
  report's stage, a session's live-ness — all derived on the server from timestamps and state. Never
  trust a client-supplied status, and never let the browser decide a publication time.
- **Errors leak nothing.** A consistent shape, a human-readable message, no stack traces, no SQL, no
  internal identifiers, no confirmation that a resource the caller may not see exists (§7).
- **Pagination and filtering:** only where the data genuinely grows — the audit log, the course list.
  A student's 1–3 courses and ~20 tasks do not need it (§1). Where a keyset cursor is used it must be
  **stable and complete**: order by `(timestamp, id)`, and store the timestamp at a precision the
  reader can represent (see §9).
- **Authentication:** bearer JWT on every route but the `@Public()` few. **Authorization:** §7.
- **The frontend mirror is a liability at this scale.** `frontend/lib/api.ts` and `lib/types.ts`
  mirror the backend by hand and have drifted before (the `AuditAction` union carried 6 of 27
  members, so the activity log rendered blank labels). Generate them from `API_SPEC.yaml`, or add a
  CI drift check. Make drift a compile error, not a code review.

---

## 7. Authentication and authorization

`docs/AUTHORIZATION_MODEL.md` is the full model — roles, scope, the capability matrix, the four
withheld verbs. The durable rules:

- **`JwtAuthGuard` + `RolesGuard` are global.** A new controller is protected by default. `@Public()`
  (health, register, login, password reset) and `@AnyRole()` (logout) are the only exits, and adding
  one is a security decision.
- **Roles** are `visitor | student | parent | assistant | admin | teacher`. `admin` is a full admin
  with the teacher's access under their own identity, because sharing one role destroys attribution and
  attribution is the whole point of the audit log. Added by `AUTH-1`, 2026-09-19. The pair is defined
  **once** as `STAFF_ADMIN` and the three staff roles once as `STAFF_ALL` (`auth/staff-roles.ts`),
  never written out at call sites; **`STAFF_ADMIN` must never contain `Role.Assistant`.** Because
  nothing in either workspace is a `Record<Role, …>` or a `switch` on a role, adding a role produces
  **no compile error at all** — `auth/role-guards.spec.ts` is the enumeration that stands in for one.
  The role to record on an audit entry comes from `actorRoleOf` (`auth/actor-role.ts`), never a
  ternary: fourteen hand-written ones mis-attributed an admin, in two opposite directions.
- **Scope is a query filter, never a UI filter.** An assistant carries an explicit scope
  (`all_groups | assigned_groups`). Stored as a column, never inferred from a row count — "no
  assignment rows" must never be ambiguous between "everything" and "not set up yet".
- **`StaffScopeService` is the single place that decides** whether a staff member may reach a
  resource. **Twelve** services call it, across 31 call sites (unit 7 recount; method in
  `ARCHITECTURE.md` §2.4). Its interface and behaviour are a contract
  (`staff-scope.service.spec.ts`); `AUTH-2` rewrote its internals from course-scoped to group-scoped
  on 2026-09-20 and **changed neither** — the seven contract cases passed unmodified.
- **Scope is held at the group grain.** `assistant_scopes` (how wide) + `assistant_group_assignments`
  (which groups); a *course* is reachable when a held group studies it, which is derivable because a
  group studies exactly one course (migration `013`). The reverse was never true, which is why the
  course grain leaked every cohort on a course. **A missing `assistant_scopes` row is "never
  configured" and refuses** — nothing in the product creates an assistant account yet, so whatever
  gains that ability must write the row.
- **Enforcement is at the group grain only where the route *names* a group.** `D-10` scoped the
  `/staff/groups/*` routes; a route naming a **course** still calls `assertAssigned(courseId)`, which
  after `015` no longer implies group scope — one held cohort reaches the whole course's roster,
  submission queue and analytics. Pre-existing, ruled on as `D-23` (narrow to held groups) and open as
  task `AUTH-6`. **Unit 6 (`D-33`) closed the targeting write and the course group list**; **unit 7
  (`D-44`) closed `POST /staff/submissions/:id/grade` and the items of the course submission queue**
  (whose per-task averages stay course-wide by ruling). `AUTH-6`'s remainder is the roster, analytics,
  the per-course assessment list, and `PATCH`/`DELETE` of a task shared with an unheld group. Every
  route naming a **submission** goes through `SubmissionAccessService` at the group grain. `GET /staff/tasks` and the draft routes were built at the
  group grain from birth. **Until it lands, do not read a "group scope" statement in
  `AUTHORIZATION_MODEL.md` as describing the course-named routes**, and do not add a new
  course-grained staff route without saying which grain it is on.
- **Object-level authorization is not optional.** A role check alone — "is this user an assistant?" —
  is the single easiest way to leak the whole platform through the API. Every request that names a
  resource must prove the caller may reach *that* resource. Enrollment alone is not enough where work
  is targeted per group: without the second check, an id is enough to read another cohort's task.
- **Anti-enumeration: 404, not 403, with a byte-identical message.** An out-of-scope resource and a
  nonexistent one must be indistinguishable. This is asserted by a spec and must survive every
  refactor. The exception is a resource listed on the caller's own screen — a 404 there would make
  the UI lie about a row it is showing; use 403.
- **Hiding a control is courtesy, never security.** The client-side redirect decides *where to send*
  someone, never *what they may read*. Every route is enforced server-side regardless of what the nav
  renders.
- **Audit every mutating staff and admin action** (§9).

---

## 8. Security rules

`docs/SECURITY.md` owns the detail, including six known weaknesses that are recorded rather than
hidden. **Consider every item below on any change that touches its area**, and say which you checked:

authentication · authorization and object-level access · input validation at the boundary · output
filtering and field minimisation · sensitive-data exposure · secrets management · token and session
security · CSRF · CORS · SQL injection · XSS · file-upload validation · path traversal · SSRF ·
rate limiting · brute-force lockout · error leakage · audit logging · dependency security ·
environment configuration.

Non-negotiable, because each failure is silent:

- **Parameterised SQL only.** No string-built queries, ever.
- **Never `dangerouslySetInnerHTML`.** Author-supplied text renders as paragraphs. Rich text needs a
  sanitiser and a schema, not a raw HTML sink.
- **Uploads:** the client filename is never read — the stored name is a server-minted UUID and its
  extension comes from the MIME whitelist, so traversal and double-extension tricks are structurally
  impossible rather than things a sanitiser must keep catching. **No SVG, no HTML, nothing
  executable** while files are served from the API's own origin. Validate server-side, cap size.
- **Media is served only through signed, expiring URLs.** Course video must not be directly linkable.
- **Secrets in env vars, never committed.** `.env` is gitignored; commit `.env.example`.
- **Never log** credentials, tokens, full payment details, student PII, or a rendered mail body.
- **Unsafe driver combinations are refused in production, not warned about.**
  `PERSISTENCE_DRIVER=memory`, `STORAGE_DRIVER=local` and auto-seeding are each rejected outright in
  production — the fixtures ship a published password hash, so seeding a real database hands out
  logins. A quiet degradation here is an account-takeover hole, not an inconvenience.
- **Per-process security state is a known limitation, not a design.** The rate limiter and the token
  denylist are in-process `Map`s. Correct on one replica; broken the moment there are two. Do not add
  a fourth per-process security structure.
- **Email is the highest-consequence new path.** A weekly report emails a child's marks to a parent
  and cannot be unsent. There is deliberately no send-to-all action.

**Never claim a feature is secure because the UI hides something, or because the happy path works.**
A security claim needs a test that proves the unauthorized case fails (§10).

---

## 9. Database rules

`docs/DATABASE_PLAN.md` owns the schema, the migration order, the indexes and the data risks.

- **Every schema change is a numbered SQL migration** in `backend/src/database/migrations/`. Never
  modify a schema out of band. Migrations run in order from an empty schema.
- **A migration is not done until it has run against real PostgreSQL from an empty schema.** This is
  a gate, not a nicety: migrations 001–008 were each verified this way and **every single first run
  found something** — including the audit log silently ending after page one, because
  `created_at` was microsecond `TIMESTAMPTZ` while the JavaScript cursor carried only milliseconds.
  **As of 2026-09-23, 001–022 have all run from an empty schema**, on `postgres:15-alpine` (15.19)
  for `019`–`022` (`docs/phases/unit-7/EXECUTION_NOTES.md`, `docs/phases/RECONCILE_UNITS_10_12.md`), including a one-off check of `019`'s backfill on a
  database populated before it ran. Keep it that way: authoring a migration on top of an unverified one buries whatever it gets wrong. Without
  Docker, a local `postgres` cluster pointed at by `TEST_DATABASE_URL` is enough.
- **Destructive migrations validate existing data first and raise rather than guess.** The
  `group_courses → groups.course_id` collapse must abort if any group holds two courses; silently
  picking one corrupts every session, task and report hanging off it.
- **Every new table adds two repository implementations, not one** — `InMemory*` and `Postgres*`,
  against one interface. A memory-only repository breaks every unit test that touches it; a
  Postgres-only one breaks `npm test`. This is the largest recurring cost in the plan and it is not
  optional.
- **Transactions:** `this.db.runInTransaction(async () => { … })`. Repositories join the in-flight
  transaction via `AsyncLocalStorage` without knowing they are in one. Nested calls join the outer
  transaction — Postgres has no nested transactions, and an inner `COMMIT` would end the outer one
  early. On the memory driver it is a passthrough with no rollback, and says so.
- **A mutation and its audit entry commit together.** `AuditService.record` **throws if called
  outside a transaction** — that refusal is what makes "every staff mutation is logged" a mechanism
  rather than a habit. A new audited action needs: the `AuditAction` union entry, the query DTO's
  exhaustive `Record<AuditAction, true>` entry (a missing one is a **compile error**, which is the
  point), and a spec asserting the entry it writes.
- **A `before` snapshot must not alias its `after`.** An in-memory read that feeds a `before` returns
  a **copy**. This bug shipped twice — the entry recorded a change that appeared never to have
  happened, which is evidence-shaped and empty, worse than no entry.
- **Any keyset cursor over a timestamp must store the precision the reader can represent.**
  `TIMESTAMPTZ(3)` where a JavaScript `Date` is the reader.
- **Conventions:** UUID primary keys · `created_at`/`updated_at` everywhere · soft-delete where
  history matters (submissions, grades, payments) · money in **minor units as integers** · timestamps
  stored **UTC**, rendered in the user's timezone · indexes on every foreign key a read filters on
  and on the sort key of any paged read.
- `database/schema.sql` and `database/seed.sql` at the repo root are **not applied** and disagree with
  the migrations. They are a design outline; their headers say so.

---

## 10. Testing rules

**"It compiles" is not a definition of done. "It looks right" is not a definition of done.**

| Level | Requirement |
|---|---|
| Unit | Every business rule and every derived status. Runs against the memory driver, no database. |
| Integration | Every `Postgres*` repository, against real PostgreSQL. Same contract as the memory driver. |
| API / e2e | Every route's happy path and its error cases. |
| Authorization | **A refusal test for every permission.** See below. |
| Database | Every migration, from an empty schema. Constraints, indexes and cascades exercised, not merely written. |
| Frontend | Typecheck and lint clean; integrated against the **real** API — no mock data presented as working. |

**For anything security-sensitive, a test must prove both directions: authorized access succeeds
*and* unauthorized access fails.** A test that only proves the happy path is not evidence of a
boundary. Where a 404-not-403 rule applies, assert the message is identical to a genuine miss.

Error cases that must be covered: not-found · out-of-scope · conflict · unconfigured driver ·
expired or reused token · missing required relation.

**A suite that skips itself is indistinguishable from one that passes.** The integration suite skips
without `TEST_DATABASE_URL`; CI has a guard step that fails the job if the suite reports no executed
tests. Keep it.

**When a list-shaped mirror of a union exists, derive it from an exhaustive `Record<Union, true>`.** A
spec that iterates an array can only prove that what is listed works, never that nothing is missing.
That distinction let six audit actions log correctly and then be rejected by the log's own filter.

---

## 11. Design system rules

`docs/redesign-mapping.md` is the contract. `docs/frontend-design-system.md` is the retired system —
historical only.

- **The Claude Design handoff is the visual and product-experience source of truth.** The existing
  codebase is the functionality source of truth. Both halves of that sentence matter.
- **The handoff's `.jsx` files are inline-styled reference prototypes, not importable code** — its own
  documents say so. Read them for exact structure, states and measurements; **reimplement** in TSX +
  Tailwind v4 over the ported tokens.
- **Tokens are ported verbatim** into `app/tokens/fig-tokens.css` and `app/tokens/semantic.css`.
  **Do not duplicate a token, and do not add a literal hex, rgb or px font-size that a token already
  expresses.** The one deliberate departure — a marked additive `[data-theme="dark"]` block for four
  washes hardcoded as literal black — is documented where it lives.
- **Do not reintroduce the legacy visual system because legacy components still exist** (§4.1). They
  are scheduled for deletion.
- **Use the component the system already defines.** `components/ui/` is the one place primitives live.
  Do not create an arbitrary variant, and do not fork a primitive to change one measurement.
- **Three rules that have each already cost a real build:**
  1. **Never `text-[var(--x)]`.** Tailwind cannot tell a colour from a size; where the element also
     carries a size utility the size wins and the colour is silently dropped. It typechecks, lints
     and builds — only the rendered stylesheet is wrong. **478 of these shipped unnoticed.** Use the
     named utilities: `text-fg`, `text-fg-2`, `text-accent`, `text-status-amber-text`. **The same
     holds for sizes:** Tailwind v4 compiles `text-[var(--fs-*)]` to `color:`, so it never sets a
     size at all (113 shipped, `F5-1`). A size from a variable is `text-(length:--x)`.
  2. **One utility per property.** Two `rounded-*` or two `text-*` in one class string are resolved
     by stylesheet source order, not the order you wrote them.
  3. **No card inside a card.** `Panel` is the application's one container.
- **Element rules in the token CSS must not sit outside a cascade layer** unless they are meant to
  beat every utility. An unlayered rule outranks all of `@layer utilities` whatever its specificity:
  the handoff's unlayered `a { color }` painted every nav link and link-button indigo until it moved
  into `@layer base`. `:focus-visible` is the one rule that stays unlayered on purpose.
- **A layout-critical transform or position needs a browser check in `dir="rtl"`, not a read.**
  `md:translate-x-0` lost to `rtl:translate-x-full` and hid both sidebars on RTL desktop. Scope a
  state to the breakpoint it belongs to (`max-md:`) rather than overriding it at a larger one.
- **Two type scales that never mix:** the marketing site's 17px body and display-to-68px, and the
  console's 13px. In the console, a heading differs from a caption by **tint, not size** — reach for
  the next tint before the next size.
- **Focus is a global `outline` on `:focus-visible`.** Never pair `outline-none` with a box-shadow
  ring; an ancestor's `overflow: hidden` clips it and the element has no focus indicator at all.
- **Both themes, and both directions.** Define the full light palette, redefine only what changes for
  dark, and check every screen against `dir="rtl"` and a long Arabic name (`ليلى فهمي` is in the
  fixtures for exactly this).

### 11.1 Product non-negotiables the design and the client arrived at independently

1. **No earnings widget, anywhere.** No total-revenue figure or earnings chart on any dashboard. A
   Payments *page* may show a transaction amount — operating a refund requires seeing it — and an
   operational count ("3 failed payments need review") is fine.
2. **Progress and performance never merge.** Progress = course completion (videos watched,
   checkpoints, lessons). Performance = grades and achievement. Completion gets a `Meter`;
   achievement gets a `Score` over its denominator. **Never the same bar, column or average.**
3. **Status colour is not the accent.** Indigo (`#3E63DD`) means *the one action here*.
4. **Bilingual.** Nothing may assume Latin metrics or survive only in LTR.
5. **Hiding a control is courtesy, never security.**

Plus the copy rules: sentence case · numbers with their denominator · **a missing mark is an em-dash,
never `0`** · mirrored data says when it last checked · amber for a queue, red only for failure · no
emoji.

---

## 12. Change management

- **Work happens on the `redesign` branch.** Verify the branch before writing code. Never commit to
  `main`.
- **Inspect `git status` before any destructive git operation.** Never reset, force, clean or discard
  uncommitted work to "tidy up". Never destroy work you did not create.
- **Small, reviewable, reversible changes.** One slice at a time: migration → both repositories →
  service → authorization → API → tests → frontend → check.
- **No unrelated refactors.** If you find something wrong outside your scope, record it and move on.
  A formatting pass nobody asked for makes a diff unreviewable.
- **Commit messages cite the requirement code** where one applies — `ACC-`, `CRS-`, `ASG-`, `QUZ-`,
  `PRG-`, `PAY-`, `CMS-`, `REP-`, `COM-`, `TA-R`, or the plan's task id (`AUTH-2`, `RPT-6`). It is a
  ready-made traceability map.
- **Finishing a piece of work includes the documentation.** Not afterwards as a chore:
  - `docs/IMPLEMENTATION_PLAN.md` — the task's status and anything learned.
  - `docs/PHASE_ROADMAP.md` — the phase's status.
  - `docs/CHANGELOG.md` — any decision that reversed or narrowed a previous one, with the reason.
  - `docs/API_SPEC.yaml` — if a route changed.
  - `project_log.md` — an entry for a material change (not for a typo fix).
  - **This file** — if a durable rule, boundary or repository fact changed.
- **Be honest in the record.** "Written but never run against a real database" is worth more than a
  green checkmark, and an entry that overstates what works is worse than no entry.

---

## 13. How to work in this repository

- **Inspect before editing.** Read the file, and the module around it. Match the surrounding code's
  style, naming and comment density.
- **Understand the existing architecture before extending it.** Five patterns already solve problems
  the new work will otherwise re-encounter (`docs/ARCHITECTURE.md` §2). Reuse them.
- **Avoid unnecessary rewrites.** The architecture is sound and is not being rewritten. Preserve
  working functionality unless a document in §2.2 marks it `[REMOVED]`.
- **Make no silent assumptions.** Where a requirement is ambiguous, name the ambiguity, name its
  impact, and either state the assumption you are proceeding under or ask — at the point it matters,
  having already done everything that does not depend on the answer.
- **Never invent business behaviour.** Who may do a thing, what a number means, what happens on
  failure: if no document answers it, it is a blocker, not a judgment call.
- **Build no speculative architecture.** No abstraction with one implementation and no second in
  sight, no configuration nobody sets, no extension point nobody extends. §1's numbers are the test.
- **Do not expand scope.** Deliver what was approved. Record what you found.
- **Verify with tests, and report faithfully.** If tests fail, say so with the output. If a step was
  skipped, say which. **Never declare completion on the basis of compilation or appearance.**
- **Definition of done** is the thirteen-point list in `docs/IMPLEMENTATION_PLAN.md`. A task is
  complete when all applicable points hold — not before.

---

## 14. Phase workflow

The project is executed **phase by phase**, deliberately.

- **`docs/PHASE_ROADMAP.md` controls the order of phases** and holds each phase's entry criteria,
  scope, dependencies, tests, security checks, exit criteria and documentation updates.
- **`docs/IMPLEMENTATION_PLAN.md` tracks detailed task completion** and owns the Definition of Done.
- **One major phase per Claude Code conversation.** Do not let a single chat casually implement
  several phases.

**Starting a phase:** read `docs/PHASE_ROADMAP.md`, identify the current phase, confirm its entry
criteria are met, read its scope and dependencies, then run the three-agent workflow (§15).

**Ending a phase:** summarize what was completed, update every document §12 lists, set the phase
status, record decisions and remaining work — **and stop.** The next phase begins in a new chat.

A phase is **COMPLETE** only when all nine conditions in `docs/PHASE_ROADMAP.md` §"Phase completion
protocol" hold, including a reviewer verdict of `APPROVED`. `APPROVED WITH FOLLOW-UP` and `REJECTED`
both leave the phase incomplete.

---

## 15. Agent workflow

Orchestration is Ruflo. The current mechanism is **named `Agent()` definitions in `.claude/agents/`
coordinated by the lead**, per `.claude/ruflo-guidance.md`. Do not invent MCP tool names; the
`claude-flow` MCP server is optional here and cold-starts slowly.

Three agents, **strictly sequential**:

```
redesign-planner  ──►  redesign-executor  ──►  redesign-reviewer
   (read-only)            (the only writer)       (read-only)
```

- **`redesign-planner`** reconciles the existing implementation with the new requirements and
  produces the phase plan. It **must not modify production source code**, and it documents
  uncertainty rather than guessing.
- **`redesign-executor`** implements **only** the approved plan. It is the only agent that writes. On
  a requirement conflict or a missing decision it **stops that portion, records the blocker, and does
  not invent business behaviour.**
- **`redesign-reviewer`** independently inspects the result **against the changed requirements** — not
  against the old code — and returns `APPROVED`, `APPROVED WITH FOLLOW-UP` or `REJECTED`. It does not
  modify production code unless explicitly authorized.

**The order is a contract.** The executor may not start before the planner finishes; the reviewer may
not start before the executor finishes. Never run them concurrently. Each receives the previous
agent's artifact explicitly — through the phase plan file and a `SendMessage` handoff — never through
unstructured conversation context alone.

Run the pipeline with **`/redesign-phase [phase id]`**. The full protocol, including the handoff
artifacts, is in `docs/PHASE_ROADMAP.md`.

**Also present:** twelve read-only `lms-*` review agents in `.claude/agents/tahir/` (`/swarm-review`).
They predate the redesign and cite the **old** CLAUDE.md section numbers, so some of their quoted
rules are stale. Useful for a focused security or scalability pass; not a substitute for
`redesign-reviewer`, and their spec citations need checking against §2.2 before you act on them.

**Rate limits are real.** Six parallel agents on a large diff exhausted the session limit and all six
died on HTTP 429. Cap concurrent agents at three, in waves.

---

## 16. Reference material

- `context/download.pdf` — signed development agreement: stack, scope, phases, 40-day timeline, IP,
  warranty, maintenance.
- `context/Report 2 - Mr Tahir Elshazli LMS.pdf` — client meeting, 6 Aug 2026 (prototype review).
- `context/report 1.pdf` — client meeting, 30 Jul 2026 (user stories review).
- `context/tahirlmstaadmincontext.md` — TA & Admin prototype walkthrough; source of the requirement
  codes in §12.
- `context/tahirlmsprojectknowledge.md` — background notes. **Its stack section is superseded by §3**
  (it proposes Next.js API routes + Supabase + Prisma; the signed agreement says NestJS + PostgreSQL).
- User-stories board (FigJam): `R17sOASEJqQ7iQC2LeyFFK` — 129 role-scoped stickies, nine sequence
  diagrams.
- Claude Design handoff: project `59f824fd-6470-4cb4-a675-7a756ef04a9f`.
- TA/Admin prototype: `sketch-manage-82110863.figma.site`
- Style references: gostars.online · bassthalk.com · mentoraeg.com · teachable.com

> The full transcriptions of the user-stories board and of the extended prototype document were
> supplied in conversation and are **not** in `context/`. Their substance is reconciled into `docs/`;
> the raw artifacts are not recoverable from this repository.
