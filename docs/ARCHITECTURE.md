# Architecture

**The existing architecture is sound and is not being rewritten.** It already has the layer
separation this redesign needs, and several of its choices (driver-selected persistence, the
transaction-asserted audit log, the single scoping chokepoint) are load-bearing for the new
features. This document records the shape so that new work lands in the right layer, and names the
three places where the redesign genuinely extends it.

---

## 1. Layers

```
Browser
  │
  ▼
Next.js 16 App Router  ────────────── frontend/
  │   Server Components render marketing; client components own the consoles.
  │   lib/api.ts is the ONLY thing that knows the API exists.
  ▼
HTTP (bearer JWT)
  │
  ▼
Controller  ──────────────────────── *.controller.ts
  │   Routing, DTO validation, @Roles. No business logic, no SQL.
  ▼
Service  ─────────────────────────── *.service.ts
  │   Business rules, authorization beyond the role gate, transactions, audit.
  ▼
Repository interface  ────────────── interfaces/*-repository.interface.ts
  │   A Symbol token and a set of methods. The seam.
  ▼
InMemory* | Postgres*  ───────────── repositories/
  │   Chosen once at wiring time by PERSISTENCE_DRIVER.
  ▼
DatabaseService  ─────────────────── database/database.service.ts
  │   The only thing in the codebase that talks to Postgres.
  ▼
PostgreSQL
```

### Responsibilities, stated so they are not blurred

| Layer | Owns | Must never |
|---|---|---|
| **Frontend** | Presentation, navigation, optimistic UI, the design system | Hold a business rule, or decide what a user may read |
| **Controller** | Path, verb, DTO, `@Roles`, HTTP status | Query a repository directly, branch on business state |
| **Service** | Rules, invariants, scope checks, transactions, audit writes | Know about `Request`/`Response`, build SQL |
| **Repository** | Persistence for one aggregate | Enforce a business rule, call another repository |
| **DatabaseService** | Connections, transactions, the ambient transaction context | Contain a query specific to one feature |

The rule that keeps this honest: **a permission or an invariant lives in exactly one place.** If the
frontend disables a button, the service still refuses. If a DTO caps a string, the service does not
re-cap it — but if the service caps a score against `maxScore`, the DTO does not pretend to.

---

## 2. The five patterns this codebase runs on

Reuse these. Each already exists, is tested, and solves a problem the redesign will otherwise
re-encounter.

### 2.1 Driver-selected persistence
```ts
repositoryProvider<CourseRepository>(COURSE_REPOSITORY, InMemoryCourseRepository, PostgresCourseRepository)
```
Both classes are constructed; the factory picks one **once per process** from `PERSISTENCE_DRIVER`.
Seventeen interfaces, thirty-four implementations, all paired. Unit tests run against memory with no
database; the integration suite runs the same contract against real Postgres.

**Every new table in this redesign adds two implementations, not one.** This is the single biggest
recurring cost of the plan and is not optional — a memory-only repository breaks every unit test
that touches it, and a Postgres-only one breaks `npm test`.

### 2.2 Ambient transactions via `AsyncLocalStorage`
```ts
await this.db.runInTransaction(async () => {
  const before = await repo.findById(id);
  const after  = await repo.update(id, patch);
  await this.audit.record({ action: 'thing.updated', before, after, … });
  return after;
});
```
Repositories join the in-flight transaction **without knowing they are in one** — which is why the
audit gap was closable without threading a client parameter through thirteen interfaces. Nested
calls join the outer transaction rather than opening a second (Postgres has no nested transactions;
an inner `COMMIT` would end the outer one early).

On the memory driver it is a passthrough with no rollback — but the context is still *entered*, so
the assertion below stays live in unit tests.

### 2.3 Audit as a mechanism, not a convention
`AuditService.record` **throws if called outside a transaction**. `AuditAction` is a string union, so
a new audited action cannot be logged until it is declared — and the query DTO mirrors both unions
as an exhaustive `Record<Union, true>`, so forgetting to add it there is a **compile error** rather
than a 400 discovered in production. (That is not hypothetical; the file documents the incident.)

The redesign adds ~17 actions. Each needs the union entry, the `Record` entry, and a spec asserting
the entry it writes.

### 2.4 One scoping chokepoint
`StaffScopeService` is the only place that answers "may this staff member reach this?". **Nine**
services call it, across 22 `assertAssigned`/`scopeFor` call sites. It 404s rather than 403s, with a
message identical to a genuine miss.

(Corrected from "eight" on 2026-09-19. The nine are `announcements`, `groups`,
`manage/assessment-authoring`, `manage/grading`, `manage/manage-live-sessions`,
`manage/manage-recordings`, `manage/manage`, `manage/work-analytics-gate`, `staff/staff`. Planning a
chokepoint rewrite against eight of nine callers leaves one un-migrated.)

`AUTH-2` rewrites its internals from course-scoped to group-scoped. **Its interface and its 404
behaviour must not change** — the nine callers and the anti-enumeration property both depend on
them, and `staff-scope.service.spec.ts` is the contract.

### 2.5 Config ports with honest degradation
`FileStorage` (`STORAGE_DRIVER=none|local`) and the Google integration (`GOOGLE_DRIVER=none|google`)
both: resolve once at wiring time, validate at boot, **refuse unsafe combinations in production**,
and degrade to an explicit 503 with a usable alternative rather than silently doing nothing.

`MailSender` is built to this exact shape. Nothing else.

---

## 3. What the redesign adds to the architecture

Three things, and only three. Everything else is a new table, service and controller in the existing
mould.

### 3.1 `MailSender` port  *(new integration seam)*
```
MailSender (interface, MAIL_SENDER token)
  ├── NoopMailSender   — MAIL_DRIVER=none, production default; every send is a 503
  ├── LogMailSender    — MAIL_DRIVER=log, development
  └── SmtpMailSender   — MAIL_DRIVER=smtp
```
Consumers: invitations, report delivery, announcement fan-out, notification preferences, and the
existing `PasswordResetNotifier` (which folds onto it and stops being a bespoke interface).

Every send writes a `mail_deliveries` row in the same transaction as the action that caused it.

### 3.2 Report generation  *(the first scheduled work in the project)*
`WeeklyReportService.generate(week)` composes existing read services — attendance, submissions,
recording progress — and writes `weekly_reports` rows. It is **pure composition**: it owns no
figures of its own, which is what keeps the report and the screens it summarises from disagreeing.
This is the same discipline that produced `GET /dashboard`.

Trigger is open (a cron, the "Regenerate week" button, or both). Whichever is chosen, generation
must be **idempotent and must never overwrite a report already `sent`.**

No queue, no worker process. At ~300 students a week's generation is a few hundred rows; a
background job framework would be infrastructure to operate for no user benefit.

### 3.3 A single frontend API client, regenerated from the contract
`frontend/lib/api.ts` and `lib/types.ts` mirror the backend by hand today, and `lib/types.ts` says so
in its own header — it has drifted before (the `AuditAction` union carried 6 of 27 members, so the
activity log rendered blank labels). With ~48 new routes the manual mirror becomes a liability.

Generate both from `docs/API_SPEC.yaml`, or add a CI check that fails when they diverge. The pattern
to copy is the exhaustive `Record<Union, true>`: make drift a compile error, not a code review.

---

## 4. Deliberately NOT introduced

| Not doing | Why |
|---|---|
| GraphQL | One client, one consumer. REST + DTOs already fit. |
| Microservices | One teacher, 300 students, one VPS. |
| CQRS / event sourcing | The audit log already provides the history CQRS is usually reached for. |
| Message queue | The only async work is weekly report generation — hundreds of rows, once a week. |
| A background-job framework | Same. A cron entry calling an endpoint is the right size. |
| An ORM | `DatabaseService` + parameterised SQL is working, is fast, and keeps the repository seam honest. |
| Redis | Only when a second replica is configured, or when device/session management forces it — `CLAUDE.md` §7.3's named trigger, not a student count. |

`CLAUDE.md` §3's rule stands: the VPS must be migratable to AWS/DigitalOcean **without code
changes**. Every infrastructure dependency stays behind a configured interface — which is exactly
why `MailSender` is a port rather than a direct SDK call.

---

## 5. Frontend architecture

Unchanged in shape; wholly changed in content.

```
app/(site)   Server Components, marketing type scale (17px), reads lib/site-content.ts
app/(auth)   Sign-in card — marketing typography, product-density controls
app/(app)    Client components. Role guard → one shell, two consoles.
components/ui/   The design system. No component here imports lib/api or lib/types —
                 a primitive that knows what an Enrollment is has stopped being a primitive.
lib/         api · types · session (useApi) · roles · format. Untouched by the visual work.
```

Data flow at every screen is one shape, and the redesign keeps it:

```tsx
const { data, error, loading, reload } = useApi((token) => api.x.y(token, id), [id]);
```

Two boundaries that must not blur: the **marketing scale never touches the console's 13px**, and
**server-consumed vs browser-consumed API URLs are two settings** (`INTERNAL_API_URL` vs
`NEXT_PUBLIC_API_URL`) even though `npm run dev` cannot tell them apart — `CLAUDE.md` §7.4 records
the outage that taught this.

---

## 6. Where new code goes

| New thing | Home |
|---|---|
| Weekly reports | `backend/src/reports/` (beside the existing student-facing reports) |
| Task drafts | `backend/src/manage/` (beside `AssessmentAuthoringService`) |
| Annotations | `backend/src/manage/` (beside `GradingService`) |
| Sessions rework | `backend/src/live-sessions/` (rename to `sessions/` only if it stays cheap) |
| Attendance | `backend/src/live-sessions/` — it hangs off a session |
| Assistant scope | `backend/src/staff/` — `StaffScopeService` already lives there |
| Invitations | `backend/src/auth/` |
| Mail | `backend/src/common/mail/` — mirrors `common/storage/` |
| Notification preferences | `backend/src/notifications/` |

Resist a fourth `@Global()` module. There are three (`DatabaseModule`, `AuditModule`,
`GroupDataModule`) and `CLAUDE.md` §7.1 is right that global providers are invisible in an import
list, which is what makes them worth rationing. `MailSender` is imported explicitly by the four
modules that send.
