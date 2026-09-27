# Production-readiness audit — Dr. Tahir LMS

**Date:** 2026-09-27 · **Commit audited:** `4687787` (`main`, clean tree) · **Verdict: NOT READY**
(see `docs/PRODUCTION_READINESS.md` for the checklist, `docs/REMEDIATION_PLAN.md` for the tasks,
`docs/HOSTINGER_DEPLOYMENT.md` for the deployment architecture and runbook).

**Method.** Six specialist reviewers (backend/API, security, DevOps, frontend, performance, and an
independent skeptic who re-verified every P0/P1) plus the lead's own dynamic testing. Static
inspection was checked against **running software**: the full toolchain, the production build, the
production container images, a production-mode API on an empty PostgreSQL 15 database, scripted API
journeys for all six roles, and a headless-Chrome walk of 60+ screens. The specialists' raw reports
are kept in `docs/phases/audit-2026-09-27/` for provenance; where this document disagrees with them,
this document is the adjudicated result and says why.

**A requirement changed during the audit.** The user ruled on 2026-09-27 that **recordings are
plain links**; Bunny Stream and signed video URLs are out of scope (`docs/CHANGELOG.md` `D-57`).
The findings below are graded against that.

---

## 1. Executive summary

The codebase is **well built and unfinished**. What exists is unusually disciplined: 1,399
automated tests pass (804 unit, 404 e2e, 191 integration against real PostgreSQL); both workspaces
typecheck at 0 errors; lint is clean; every production-unsafe configuration is refused at boot, and
we confirmed that by booting it. No mocked data was found anywhere in the frontend, every screen
calls the real API, and the core teaching loop (a student submits, a teacher grades and returns,
the student sees the mark) works end to end on the production artifact.

It is **not deployable today**, for reasons the green test suite cannot show:

1. **Nobody can sign in as staff on a fresh production database.** No route, CLI or setting creates
   the first teacher; seeding is (correctly) refused in production. Confirmed live: 0 users after
   migrating. → `AUD-01`, P0.
2. **Assistants see other cohorts' students.** A group-scoped assistant reads the full course roster
   and analytics, including groups they do not hold. Confirmed live. The client plans 2–3 assistants
   at launch. → `AUD-02`, P0 (interim mitigation: onboard assistants as `all_groups` only).
3. **The flagship feature is not built.** Weekly reports (roadmap Unit 9: "the flagship — 9 routes,
   none exist") are `[ ]`. The staff "Reports" menu item 404s. The client must decide whether launch
   waits for it. → `AUD-03`, P0 (decision).
4. **Mail is effectively mandatory and undocumented.** With the production default (`MAIL_DRIVER=none`)
   a teacher **cannot publish an announcement** (503, whole transaction rolled back), an admin cannot
   create a student, and password reset is unavailable. The five SMTP variables are in no template.
   → `AUD-04`, `AUD-05`.
5. **There is no production deployment configuration.** No production compose file, no reverse
   proxy config, a CI deploy job that only echoes, and Docker images on **Node 20, which reached
   end-of-life in April 2026**. → `AUD-10`…`AUD-13`.
6. **File uploads cannot work in production.** There is no R2 driver in code; the only
   production-legal storage setting is `none`. Homework file hand-in, avatars, blog images and marking
   annotations are therefore off. This needs the same kind of decision as recordings. → `AUD-06`.

None of these is a large engineering job except weekly reports (a whole unit) and, if wanted, R2.
The rest is roughly 3–5 focused days of work plus client decisions and credentials.

---

## 2. Architecture (as verified)

```
Browser ─► Next.js 16.3.3 (App Router, React 19.2.8, Tailwind v4)       frontend/
             app/(site)   marketing, Server Components, ISR 5 min
             app/(auth)   sign-in, register, reset, invitation, Google callback
             app/(app)    student console + /manage staff console (client components)
             lib/api.ts   the ONLY HTTP boundary; bearer JWT from sessionStorage
        ─► NestJS 12 API (TypeScript 6, class-validator DTOs)             backend/
             global JwtAuthGuard + RolesGuard + RateLimitGuard (in-process)
             Controller → Service (rules, StaffScopeService, audit, transactions)
             → Repository interface → InMemory* | Postgres*   (23 pairs)
             → DatabaseService (pg Pool, AsyncLocalStorage transactions)
        ─► PostgreSQL 15 — 26 hand-written migrations, no ORM
External ports: MailSender (none | log | smtp — nodemailer), FileStorage (none | local),
                Google OAuth/Forms (none | google). No Bunny, no R2, no payments in code.
```

- **Routes:** 143 mapped routes (counted from the production boot log): `/public/*` anonymous,
  student surface, `/staff/*` (teacher, admin, assistant through `StaffScopeService`), `/admin/*`
  (teacher, admin).
- **Auth:** bcrypt passwords; HS256 JWT, 1 h, with a `jti` denylist for logout; single-purpose tokens
  carry `purpose` and are refused as sessions; Google sign-in only through an explicit link.
- **Persistence:** every table has an in-memory and a Postgres repository behind one interface. The
  memory driver makes `npm run dev` work with no database, and is refused in production.
- **Deployment artefacts present:** `Dockerfile.backend`, `Dockerfile.frontend` (standalone),
  `docker-compose.yml` (**development only**: it seeds and publishes 5432), `.github/workflows/ci.yml`
  (lint, drift, build, unit, e2e, integration with a guard against a skipped suite, image build;
  deploy job inert).

**Is `CLAUDE.md` accurate?** Mostly, and it is unusually honest. Drift found: test counts (it says
803/402; actual 804/404); §3 and §8 describe Bunny Stream and signed video URLs (superseded by `D-57`);
§3 says Node 24 while both Dockerfiles and CI use Node 20; §3 lists R2 as file storage (no driver
exists); §4.1 says `manage/courses/[id]/staff` was deleted as orphaned, but a tab still links to it.
Updated in the same change as this audit where the fact is certain (see §11).

---

## 3. Feature status matrix

Statuses: **WORKING END-TO-END** = exercised live on the production artefact during this audit;
**WORKING** = covered by passing e2e/integration tests but not driven live; **IMPLEMENTED BUT
UNVERIFIED** = code and screens exist, no live or e2e evidence found; and so on as defined in the
brief.

| # | Feature | Frontend | API | DB | Tested how | Result | Sev |
|---|---|---|---|---|---|---|---|
| F-01 | Sign-in / sign-out / session expiry | ✓ | ✓ | ✓ | live T-01, T-10; UI login ×4 roles | **WORKING END-TO-END** | — |
| F-02 | Self-registration → staff acceptance into a group | ✓ | ✓ | ✓ | live T-06 | **WORKING END-TO-END** | — |
| F-03 | First staff account on a fresh install | ✗ | ✗ | — | live: 0 users after migrate | **MISSING** | P0 `AUD-01` |
| F-04 | Password reset | ✓ | ✓ | ✓ | live T-08: 503 without SMTP; e2e | **BLOCKED BY DEPENDENCY** (SMTP) | P0 `AUD-04` |
| F-05 | Admin creates student (invitation mail) | ✓ | ✓ | ✓ | live T-07: 503 without SMTP | **BLOCKED BY DEPENDENCY** (SMTP) | P0 `AUD-04` |
| F-06 | Assistant invitations | ✓ | ✓ | ✓ | e2e; needs SMTP | **BLOCKED BY DEPENDENCY** (SMTP) | P0 `AUD-04` |
| F-07 | Google sign-in / account link | ✓ | ✓ | ✓ | e2e 32 tests; no live Google round trip | **BLOCKED BY ENVIRONMENT** (client OAuth client) | — |
| F-08 | Student overview / dashboard | ✓ | ✓ | ✓ | live API + UI | **WORKING END-TO-END** | — |
| F-09 | Homework list/detail, submit (link / text) | ✓ | ✓ | ✓ | live T-09 | **WORKING END-TO-END** | — |
| F-10 | Homework submit (file upload) | ✓ | ✓ | — | uploads disabled in prod (`STORAGE_DRIVER=none`) | **BLOCKED BY DEPENDENCY** (no R2 driver) | P1 `AUD-06` |
| F-11 | Marking: grade, validate range, return, student sees mark | ✓ | ✓ | ✓ | live T-09, UI walk | **WORKING END-TO-END** | — |
| F-12 | PDF annotations on submissions | ✓ | ✓ | ✓ | e2e; needs stored files | **BLOCKED BY DEPENDENCY** (storage) | `AUD-06` |
| F-13 | Mark book + CSV export | ✓ | ✓ | ✓ | live API 200 + UI | **WORKING** | — |
| F-14 | Task authoring, drafts, targeting | ✓ | ✓ | ✓ | e2e (251 staff tests) + UI renders | **WORKING** | — |
| F-15 | Lessons / recordings (plain links) + progress | ✓ | ✓ | ✓ | live API + UI | **WORKING END-TO-END** (as links) | P2 copy `AUD-24` |
| F-16 | Materials | ✓ | ✓ | ✓ | live API + UI | **WORKING END-TO-END** | — |
| F-17 | Timetable, live sessions, attendance | ✓ | ✓ | ✓ | live API + UI; e2e | **WORKING** | — |
| F-18 | Notifications (in-app) | ✓ | ✓ | ✓ | live UI | **PARTIALLY IMPLEMENTED** — announcement links go to `/learn/…` → 404; list unbounded | P2 `AUD-20`, `AUD-40` |
| F-19 | Announcements: compose/draft/publish | ✓ | ✓ | ✓ | live T-14 | **BROKEN in prod default** (publish needs SMTP; any mail failure rolls back) | P1 `AUD-05` |
| F-20 | Classmates, profile, notification preferences | ✓ | ✓ | ✓ | live UI | **WORKING END-TO-END** | — |
| F-21 | Groups admin, bulk move, group summary | ✓ | ✓ | ✓ | live API + UI | **WORKING** | — |
| F-22 | Assistant scope (group-grain) | ✓ | ✓ | ✓ | live T-13 | **BROKEN** — course-named routes leak other cohorts | P0 `AUD-02` |
| F-23 | Audit log | ✓ | ✓ | ✓ | live: entries written for grade/return | **WORKING END-TO-END** | — |
| F-24 | Weekly reports: generate / review / send to parent (Unit 9) | ✗ (nav → 404) | ✗ | ✗ | roadmap `[ ]` | **MISSING** | P0 decision `AUD-03` |
| F-25 | Report documents shown to students | ✓ | ✓ read | ✓ | only seed rows; nothing creates them | **PARTIALLY IMPLEMENTED** | part of `AUD-03` |
| F-26 | Google Forms sync (external work) | ✓ | ✓ | ✓ | e2e; no live Google | **BLOCKED BY ENVIRONMENT** | — |
| F-27 | Blog (public read + staff CRUD) | ✓ | ✓ | ✓ | live UI; media upload off in prod | **WORKING** (URL media only) | — |
| F-28 | Public site: home, about, courses, course detail, blog, contact | ✓ | ✓ | ✓ | live UI | **WORKING END-TO-END** | P1 legal pages `AUD-15`; P2 SEO `AUD-27` |
| F-29 | Staff console navigation | ✓ | — | — | live UI walk ×2 roles | **PARTIALLY IMPLEMENTED** — 2 dead links; assistant sees admin-only items | P1/P2 `AUD-21`, `AUD-22` |
| F-30 | Settings / account | ✓ | ✓ | ✓ | UI renders | **IMPLEMENTED BUT UNVERIFIED** | — |
| F-31 | RTL / Arabic | partial | n/a | n/a | no toggle exists; `dir` fixed to `ltr` | **PARTIALLY IMPLEMENTED** | P2 `AUD-29` |
| F-32 | Payments | ✗ | ✗ | ✗ | — | **MISSING** — deferred by design (not in this release) | — |
| F-33 | Device / session management | ✗ | ✗ | ✗ | — | **MISSING** — dropped by decision `D-1` | — |

---

## 4. Critical findings (P0 / P1)

Every item has live or code evidence; the skeptic review's verdicts are folded in.

### AUD-01 · P0 · No way to create the first staff account in production
`auth.service.ts:134-146` hard-codes `/auth/register` to `Role.Student` / `waiting`;
`admin-students.service.ts:145-149` creates students only; invitations (`admin-assistants.service.ts:134`)
need an existing teacher/admin; `resolveAutoSeed` and `cli/seed.ts` refuse in production.
**Live:** migrated an empty DB with the production artefact → `select count(*) from users` = 0, and the
teacher login returns 401. **Fix:** a `bootstrap-staff` CLI in the style of `cli/migrate.ts`, idempotent
(refuses when any teacher/admin exists) → `REM-001`.

### AUD-02 · P0 (for launch with assistants) · Group-scoped assistants read other cohorts
`manage.service.ts:182` (`roster`), `work-analytics-gate.service.ts:68-104` (analytics and per-student
work), `assessment-authoring.service.ts:594` (course assessment list) and shared-task PATCH/DELETE call
`assertAssigned(courseId)` only. This is the documented, still-open `AUTH-6` remainder. **Live (T-13):**
created a group on course-1 not held by `assistant-1` and accepted a student into it; `assistant-1`
got 404 on `/staff/groups/<g>` and its members, but `/staff/courses/course-1/roster` listed that
student. **Interim mitigation:** create assistants with `all_groups` scope only (explicit, not a leak)
until fixed. **Fix:** narrow to `reachableGroupIds` like `GET /staff/tasks`; refusal tests both ways → `REM-002`.

### AUD-03 · P0 (decision) · Weekly reports — the flagship — are not built
`docs/PHASE_ROADMAP.md` Unit 9 "*(the flagship — 9 routes, none exist)*" `[ ]`; `docs/PRODUCT_SPEC.md`
§2.4 calls it "the largest new subsystem". Only an aggregate group summary
(`GET /staff/groups/:id/report`) exists, and "report documents" exist only as seed rows. The staff
sidebar's "Reports" item (`components/shell/console-shell.tsx:96`) 404s on every page. **Decision
needed:** does launch wait for Unit 9? → `REM-003` (decision), `REM-031` (build).

### AUD-04 · P0 (configuration) · SMTP is required in practice and documented nowhere
`MAIL_DRIVER` defaults to `none` in production; `smtp` needs `MAIL_SMTP_HOST/PORT/USER/PASS/FROM`
(`env.ts:438-520`). None of these appear in `.env.example`, `docker-compose.yml` or CI. `.env.example`
instead documents Resend/`EMAIL_SERVICE`, which nothing reads. **Live:** admin create-student → 503,
password reset → 503, announcement publish → 503. → `REM-004` (provision + document), `REM-012`.

### AUD-05 · P1 · Announcement publish is all-or-nothing on mail
`announcements.service.ts:201-243` marks published, fans out in-app notifications, then sends mail
**sequentially inside the same transaction**; `MailService.send` throws on `none`. **Live (T-14):** 503,
`published_at` null, 0 notifications. With SMTP on, one bad address rolls back the announcement after
earlier recipients were already emailed, so a retry double-mails, and the transaction holds a pool
connection for N × SMTP latency (~300 recipients). The skeptic review rejected the specialist's
`Promise.all` fix (it maximises duplicate mail). **Adjudicated fix:** capture failures per recipient
(publish always commits; the response reports `emailed / failed`) and enable nodemailer `pool: true`
so concurrency is bounded by the transporter. Whether announcements should email at all when mail is
off is a product call; the fix makes in-app publish work either way → `REM-005`.

### AUD-06 · P1 (decision) · No production file storage
`StorageDriver = 'none' | 'local'` (`env.ts:353`); `local` is refused in production; there is no R2
driver. File hand-in, avatars, blog media and annotation files are unavailable in production. **Decision
needed:** links/typed answers only at launch (as with recordings), or build an S3-compatible driver
(R2) → `REM-006`, `REM-030`.

### AUD-07 · P1 · Login and registration rate limits will lock out a classroom
`common/rate-limit/limits.ts`: login 5/min and register 3 per 5 min, keyed `route + IP`
(`rate-limit.guard.ts:100-103`), **counting successful logins**. **Live:** the 5th login from one IP
got 429. A class on school Wi-Fi (one NAT address) registering or signing in together will mostly
fail. **Fix:** key login on IP + normalised email and count failures only; raise the per-IP register
ceiling → `REM-007`.

### AUD-08 · P1 · Vulnerable `multer` on authenticated upload routes
`npm audit`: `multer ≤ 2.2.0` (via `@nestjs/platform-express`), 3 DoS advisories plus a size-limit
bypass; `qs` moderate. Guards run before interceptors, so an authenticated account is needed, but any
student account qualifies. `fixAvailable: true` → `REM-008`.

### AUD-09 · P1 · Assistant-scope checkboxes have no visible labels
`manage/assistants/page.tsx:186-203`: `Checkbox`'s `label` is `aria-label` only. On the screen that
configures an assistant's authorisation scope, the group picker is a row of unlabelled boxes →
`REM-009`.

### AUD-10 · P1 · Node 20 is end-of-life
`Dockerfile.backend:9,42`, `Dockerfile.frontend:8,32`, `ci.yml:24` pin Node 20 (EOL April 2026);
development runs 24.15.0. Next 16 and Nest 12 support 22/24 → `REM-011`.

### AUD-11 · P1 · No production compose, no reverse-proxy config
Only a development compose file exists (it seeds fixtures, publishes 5432, and uses a development
JWT secret) → `REM-020`, `REM-021`; target files are written out in `docs/HOSTINGER_DEPLOYMENT.md` §5.

### AUD-12 · P1 · `.env.example` is wrong for production
It documents 13 variables nothing reads (R2 ×4, Bunny ×2, `EMAIL_SERVICE`, `RESEND_API_KEY`, Paymob,
Stripe, `NEXT_PUBLIC_VIDEO_CDN`, `NEXT_PUBLIC_STORAGE_URL`) and omits `STORAGE_DRIVER`, `MAIL_DRIVER`
plus 5 SMTP variables, `FRONTEND_URL`, `UPLOAD_DIR`, `DATABASE_POOL_MAX`, `PGSSLMODE`, and
`INTERNAL_API_URL`. Its `TRUSTED_PROXY_HOPS=1` is wrong behind Cloudflare + nginx (2) → `REM-012`.

### AUD-13 · P1 · Grading dialog claims to be modal but traps nothing
`manage/courses/[id]/grading/page.tsx:301-386`: `role="dialog" aria-modal="true"` with no focus trap,
no Escape, no focus return. The working pattern is `CurriculumDrawer` (`lessons/page.tsx:430-468`) →
`REM-013`.

### AUD-14 · P1 · Dead "Assistants" course tab
`manage/courses/[id]/layout.tsx:54` links admins to `/manage/courses/:id/staff`, a page deleted in
unit 5 → 404 (live) → `REM-014`.

### AUD-15 · P1 (content, client) · Privacy and terms pages missing
The marketing footer links `/privacy` and `/terms`; both 404 (live). The platform stores minors' data
and parents' emails → `REM-015` (the client supplies the text).

---

## 5. Test results

### 5.1 Toolchain (all executed 2026-09-27, Node 24.15.0, npm 11.12.1)

| Check | Result |
|---|---|
| `npm run lint` (eslint + token resolver + oxlint) | **PASS** — 0 errors, 4 oxlint unused-variable warnings |
| `npm run typecheck:drift` | **PASS** |
| `npm test` | **PASS 804 / 48 files** |
| `npm run test:e2e` (one file per process) | **PASS 404 / 5 files**, every file reported a summary |
| `npm run test:integration` (real `postgres:15-alpine`, empty schema) | **PASS 191, 0 skipped** |
| `npm run build:backend` / `build:frontend` | **PASS** / **PASS** (57 app routes) |
| `tsc --noEmit` frontend / backend | **0 / 0 errors** |
| `docker build` backend / frontend images | **PASS / PASS** |
| `npm audit` | **FAIL** — 2 high, 1 moderate (`AUD-08`) |
| Frontend unit tests | **none exist** — recorded gap, not a failure (`REM-044`) |
| Browser E2E suite | **none exists**; the lead's headless walk substituted for it |

### 5.2 Production-artefact checks

| ID | Check | Expected | Actual | Status |
|---|---|---|---|---|
| P-01 | Boot with `NODE_ENV=production`, no `JWT_SECRET` | refuse | refused with guidance | PASS |
| P-02 | … `PERSISTENCE_DRIVER=memory` | refuse | refused | PASS |
| P-03 | … `DB_AUTO_SEED=1` | refuse | refused | PASS |
| P-04 | … `STORAGE_DRIVER=local` | refuse | refused | PASS |
| P-05 | Boot on empty DB with `DB_AUTO_MIGRATE=1` | 26 migrations, listening | 26 applied, `Listening on 3101 (production, persistence=postgres)` | PASS |
| P-06 | `node dist/database/cli/migrate.js` | idempotent | "Nothing to apply" | PASS |
| P-07 | `/health` + security headers | 200 + helmet | 200, CSP, HSTS, nosniff, XFO | PASS |
| P-08 | First staff login on fresh DB | possible somehow | impossible | **FAIL** `AUD-01` |
| P-09 | Seed CLI with `NODE_ENV=development` against a production URL | refuse | **seeds** published logins | FAIL (P3 `AUD-38`) |
| P-10 | Web image security headers | CSP / XFO / no `X-Powered-By` | none; `X-Powered-By: Next.js` | FAIL (P2 `AUD-26`) |
| P-11 | `robots.txt`, `sitemap.xml` | present | 404 / 404 | FAIL (P2 `AUD-27`) |
| P-12 | Old image vs newer schema (observed, not staged) | — | crash-loop on seed insert | rollback hazard, documented |

### 5.3 Test matrix — live journeys (production-mode API; fixtures loaded through the dev seed CLI)

| ID | Feature | Scenario | Expected | Actual | Status | Sev |
|---|---|---|---|---|---|---|
| T-01 | Auth | Login each of 6 roles | token | tokens | PASS | |
| T-02 | Student surface | 9 student endpoints | 200 | 200 (timetable needs `from`/`to`) | PASS | |
| T-03 | AuthZ | Student → `/staff/overview`, `/admin/students` | 403 | 403 | PASS | |
| T-04 | AuthN | No token / garbage token | 401 | 401 | PASS | |
| T-05 | Anti-enumeration | Unknown course | 404, generic | 404 | PASS | |
| T-06 | Onboarding | Register → accept into group → login | works without mail | works | PASS | |
| T-07 | Onboarding | Admin creates student, `MAIL_DRIVER=none` | usable path | 503 | FAIL | P0 `AUD-04` |
| T-08 | Password reset | Request, `MAIL_DRIVER=none` | usable path | 503 | FAIL | P0 `AUD-04` |
| T-09 | Marking | Submit link → grade 999 (400) → assistant-2 (404) → student grades (403) → grade 8 → return → student view | corrected 8/20 | as expected; audit rows written | PASS | |
| T-10 | Session | Logout, reuse token | 401 | "Session has been logged out" | PASS | |
| T-11 | CORS | Preflight from a foreign origin | no ACAO | none; allowed origin echoed | PASS | |
| T-12 | Input / errors | Bad JSON, bad date, SQL-ish cursor, 300-char id | 4xx, no leak | 400/400/200-empty/404 | PASS | |
| T-13 | Scope | Assistant vs unheld cohort on the same course | 404 everywhere | roster leaks the student | **FAIL** | P0 `AUD-02` |
| T-14 | Announcements | Publish to a group, `MAIL_DRIVER=none` | published in-app | 503, rolled back | **FAIL** | P1 `AUD-05` |
| T-15 | Rate limit | 5 logins from one IP in a minute | legit users unaffected | 5th = 429 | **FAIL** | P1 `AUD-07` |

### 5.4 Test matrix — browser (production web image, headless Chrome over DevTools)

| ID | Scope | Result |
|---|---|---|
| U-01 | 14 anonymous routes | render; auth pages guard to `/login`; **`/privacy` and `/terms` 404** (`AUD-15`); unbranded 404 page (`AUD-28`) |
| U-02 | Student, 15 routes, 1280 px | all render; **0 console errors, 0 uncaught exceptions**; notification links → 404 (`AUD-20`); `/manage` → redirected |
| U-03 | Student, 7 routes, 375 px | no horizontal scroll on any page |
| U-04 | Teacher, 29 staff routes | all render, 0 exceptions; **"Reports" nav 404 on every page** (`AUD-03`/`AUD-21`); **course "Assistants" tab 404** (`AUD-14`); greeting "Welcome back, Dr." (`AUD-35`) |
| U-05 | Assistant, 9 routes | admin-only nav items shown; those pages render raw "Forbidden resource" beside live "Create student" / "Invite assistant" buttons (`AUD-22`); server enforcement correct |
| U-06 | RTL | **not testable in the product**: no locale toggle; `dir="ltr"` fixed (`AUD-29`) |

Not exercised live (blocked): real SMTP delivery, Google OAuth round trip, file uploads (no production
driver), reboot recovery, backup restore. These appear as tasks in the remediation plan.

---

## 6. Findings by area (P2 / P3)

### Frontend
| ID | Sev | Finding | Where |
|---|---|---|---|
| AUD-20 | P2 | Announcement notifications link to retired `/learn/:courseId` → 404 on dashboard and notifications | `announcements.service.ts:231` |
| AUD-21 | P2 | "Reports" sidebar item 404 on every staff page — hide until Unit 9 | `console-shell.tsx:96` |
| AUD-22 | P2 | Assistant nav shows admin-only items that render raw 403 copy | shell nav config |
| AUD-23 | P2 | No `not-found.tsx` / `error.tsx` / `global-error.tsx` anywhere | `frontend/app/` |
| AUD-24 | P2 | Recording form hint promises "Playback is signed per request…" — false (links are handed to students as-is) | `manage/courses/[id]/recordings/page.tsx:291` |
| AUD-25 | P2 | Session: 1 h JWT, no refresh; any 401 signs out; unsaved grading/authoring text is lost | `lib/session.tsx:233`, `JWT_EXPIRY` |
| AUD-26 | P2 | Web app sends no security headers; `X-Powered-By` exposed | `next.config.ts` |
| AUD-27 | P2 | No `robots.txt` / `sitemap.xml` for the marketing site | `frontend/app/` |
| AUD-28 | P3 | Unbranded default 404 | `frontend/app/` |
| AUD-29 | P2 | RTL cannot be exercised in the product (no toggle, `dir` fixed) — conflicts with CLAUDE.md §11 "both directions" | `app/layout.tsx` |
| AUD-30 | P3 | Five silent CSS misses the token check cannot see (`FE-01b`, `FE-04`, `FE-05` card-in-card, `FE-07`, `FE-08`, undefined `--fs-h2` `FE-10`) — fix the checker once | `scripts/check-tokens.mjs` |
| AUD-31 | P3 | Quizzes page fetches each quiz's detail (N+1, bounded) | `quizzes/page.tsx:58-69` |
| AUD-35 | P3 | Staff greeting takes the first token of the name ("Dr.") | `/manage` overview |
| AUD-36 | P3 | Recording player still auto-detects Bunny hosts; stale Bunny comments | `recording-player.tsx:8-50`, `create-recording.dto.ts:53` |

### Backend / API
| ID | Sev | Finding | Where |
|---|---|---|---|
| AUD-40 | P2 | Notification list has no `LIMIT` (grows forever per account) | `postgres-notification.repository.ts:42-52` |
| AUD-41 | P2 | Task `externalUrl` accepts any string (e.g. `javascript:`); not rendered as a link yet | `manage/dto/assessment.dto.ts` |
| AUD-42 | P2 | Password-reset and invitation tokens stored in plaintext | `postgres-user.repository.ts:239-256`, `postgres-assistant-invitation.repository.ts` |
| AUD-43 | P3 | Returning marked work sends no notification to the student | `marking.service.ts` (product call) |
| AUD-44 | P3 | `expectedStudentIds` loops per group instead of the batched call | `work-analytics.service.ts:137-149` |
| AUD-45 | P3 | Dead `GET /courses/catalog`; duplicate `api.ts` announcement functions | `courses.controller.ts`, `lib/api.ts` |
| AUD-46 | P3 | No global exception filter — **not a leak** (Nest returns a generic 500; verified in source), but no single place for logging and correlation | `main.ts` |
| AUD-47 | P3 | `DATABASE_POOL_MAX` read without validation | `database.service.ts` |
| AUD-38 | P3 | Seed CLI's production refusal keys on `NODE_ENV` alone; run with `development` against a production `DATABASE_URL` it inserts the published-password accounts (live P-09) | `database/cli/seed.ts` |
| — | — | **Refuted:** "malformed UUID → 500" (ids are TEXT; live 404s); "raw driver messages on 500" (see AUD-46) | |

### Security (confirmed issues vs hardening)
- **Confirmed issues:** `AUD-02` (P0 cross-cohort read), `AUD-08` (vulnerable multer), `AUD-41`,
  `AUD-42`, `AUD-07` (availability via rate-limit design).
- **Hardening:** `AUD-26` (headers/CSP), `AUD-38` (seed CLI trusts `NODE_ENV` alone), per-account
  lockout in addition to per-IP limits, restrict the origin to Cloudflare IPs (required for
  `TRUSTED_PROXY_HOPS=2` to be sound, `HOSTINGER_DEPLOYMENT.md` §6), `AUD-46`.
- **Verified sound** (evidence in `docs/phases/audit-2026-09-27/security.md`): JWT secret enforcement;
  `purpose`-claim refusal; logout denylist (live); CORS refusal in production and origin echo (live);
  parameterised SQL everywhere (one template literal, built from a typed union); no attacker-reachable
  `dangerouslySetInnerHTML`; upload naming and MIME whitelist; staff-supplied URLs validated to http(s)
  (recording, meeting, course links); git history free of secrets; `.env` never tracked; production
  refusals (live); audit entries written transactionally (live).

### Performance
- **Confirmed bottleneck:** `AUD-05` (SMTP inside a transaction). **Unbounded growth:** `AUD-40`.
- **Checked and fine at ~300 students:** mark book, grading queue and dashboards are batched; pool of 10
  is adequate for one replica; rate-limiter and denylist maps prune; `pdfjs-dist` is code-split; no
  polling or fetch waterfalls found; memory at idle: web 55 MB, Postgres 62 MB. No cache, Redis or
  queue is warranted.

### DevOps
`AUD-10`, `AUD-11`, `AUD-12` above, plus: CI deploy job is echo-only (P3, `REM-022`); `npm run db:migrate`
cannot run inside the runtime image, but `node dist/database/cli/migrate.js` does (P2, runbook);
Docker logs are uncapped (P2, `logging:` in the production compose); tracked 0-byte junk files `0`,
`1036`, `and`, `backend/{const` (P3, `REM-050`).

---

## 7. Environment variables (source of truth: `backend/src/common/config/env.ts`)

| Variable | Required in prod | Prod default | Validated | Secret |
|---|---|---|---|---|
| `NODE_ENV` | yes (`production`) | `development` | yes | |
| `JWT_SECRET` | **yes** | boot fails | yes (length, placeholders) | **yes** |
| `JWT_EXPIRY` | no | `1h` | yes | |
| `PORT` | no | `3001` | yes | |
| `PERSISTENCE_DRIVER` | no | `postgres` (memory refused) | yes | |
| `DATABASE_URL` | **yes** | boot fails | yes | **yes** |
| `DATABASE_POOL_MAX` | no | `10` | **no** | |
| `PGSSLMODE` | only for a remote TLS DB | verify | no | |
| `DB_AUTO_MIGRATE` | no | `0` | yes | |
| `DB_AUTO_SEED` | never | refused | yes | |
| `CORS_ORIGIN` | **yes** | boot fails | yes | |
| `TRUSTED_PROXY_HOPS` | yes (correct value: 2) | `0` | yes | |
| `FRONTEND_URL` | **yes** | boot fails | yes | |
| `STORAGE_DRIVER` | no | `none` (local refused) | yes | |
| `UPLOAD_DIR` | dev only | `var/uploads` | no | |
| `MAIL_DRIVER` | **yes in practice** (`smtp`) | `none` | yes | |
| `MAIL_SMTP_HOST/PORT/USER/PASS/FROM` | with `smtp` | boot fails if partial | yes | `PASS` |
| `GOOGLE_DRIVER` + `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | only for Google | off | yes, all-or-nothing | `SECRET`, `KEY` |
| `GOOGLE_SIGN_IN_REDIRECT_URI`, `STAFF_GOOGLE_DOMAINS` | optional | off | yes | |
| `LOG_RESET_TOKENS` | never | off | — | |
| `NEXT_PUBLIC_API_URL` (build arg) | **yes** | `http://localhost:3001` | no | |
| `INTERNAL_API_URL` (web runtime) | recommended | falls back to the public URL | no | |

---

## 8. Hostinger VPS readiness — answers

| Question | Answer |
|---|---|
| Server | One KVM VPS, Ubuntu 24.04; KVM 2 (2 vCPU / 8 GB) recommended, KVM 1 minimum |
| Runtime | Docker Engine + Compose plugin. Node only inside images — **bump to Node 22 or 24** (`REM-011`) |
| Start command | `docker compose -f docker-compose.prod.yml up -d` (API `node dist/main.js`, web `node frontend/server.js`) |
| Environment | `HOSTINGER_DEPLOYMENT.md` §4 / §7 above |
| PM2? | **No.** Docker's restart policy + systemd already supervise; PM2 would duplicate them |
| NGINX? | **Yes**, on the host: TLS and two hostnames (`tahirelshazli.com` → :3000, `api.tahirelshazli.com` → :3001) |
| SSL? | Yes — Cloudflare Full (strict) + an origin certificate (Cloudflare Origin CA or Let's Encrypt) |
| Ports | 22 (key-only SSH), 80/443 from Cloudflare IP ranges only; 3000/3001 on 127.0.0.1; 5432 unpublished |
| Database | PostgreSQL 15 container with a named volume; migrations via `node dist/database/cli/migrate.js` before start; first staff account via `REM-001` |
| Persistent storage | Only the Postgres volume (no uploads in production, recordings are links) |
| Firewall | ufw default-deny + the rules above; Hostinger panel firewall mirrored |
| Health check | `GET /health` (liveness, in the image `HEALTHCHECK`); external monitor on `GET /public/courses` (reads the DB) |
| Reboot | Docker service at boot + `restart: unless-stopped`; **test once** |
| Updates | `git checkout <sha>` → pre-deploy `pg_dump` → build → migrate → `up -d` (runbook §8) |
| Unresolved | SMTP provider; uploads decision; weekly-reports decision; Google OAuth client; legal page text |

---

## 9. Final senior review — the ten questions

1. **Do we understand the whole application?** Yes: 143 routes, 57 screens, 26 migrations, and every
   external port were mapped and cross-checked against the code.
2. **Critical user journeys?** Onboarding, sign-in, homework, marking/return, announcements,
   scope-restricted staff access, public site — each driven live.
3. **Did we test the real application?** Yes. Production images, a production-mode API on real
   PostgreSQL, and a real browser, in addition to all 1,399 automated tests.
4. **Frontend/backend integration?** Yes. No mocked frontend data; the contract matches `lib/api.ts`
   (drift check green, spot-checked by hand); 0 console errors across 60+ screens.
5. **Production build?** Built, booted, refusals exercised, migrations from empty.
6. **Missing APIs?** Weekly reports (9 routes), first-staff bootstrap, R2 storage, a report-document
   writer. Payments and device management are absent by decision.
7. **Deployment blockers?** `AUD-01`, `AUD-02`, `AUD-03` (decision), `AUD-04`, `AUD-10`–`AUD-12`.
8. **Hostinger architecture?** `docs/HOSTINGER_DEPLOYMENT.md`.
9. **Security risks?** One confirmed cross-cohort read (P0), vulnerable multer, plaintext one-time
   tokens, one unvalidated URL field, and a hardening list. The rest of the security model was
   verified sound.
10. **Path to production?** `docs/REMEDIATION_PLAN.md`: Phase 1 (blockers) → Phase 7 (deployment prep)
    is roughly a working week plus client inputs; weekly reports is a separate unit if the client
    requires it at launch.

---

## 10. Open questions for the client / user

**Answered 2026-09-27** (`docs/CHANGELOG.md`): weekly reports ship **after** launch (`D-58`); students
upload **PDF and DOCX**, so R2 storage and a DOCX type are launch blockers (`D-59`); Google Form homework
via **CSV import** now, with the API fetch at the deadline later on the same ingestion seam (`D-60`);
real staff accounts are created **last** (`D-61`). New from drafting the privacy policy: guardian
consent at registration (`REM-081`, P0 legal) and `AUD-16` below.

**AUD-16 · P1 · Placeholder content on the public site.** Seven images load from `picsum.photos`
(random stock photos, including the "portrait" of Dr. Tahir on the home and About pages) and the
WhatsApp number is `201000000000` in the footer, contact page and in-app Help
(`frontend/lib/site-content.ts:20-29`, `next.config.ts:8`). Missed by the frontend pass because the
code comments mark them as placeholders; it is still what visitors would see → `REM-016b`.

Still open:
1. ~~Weekly reports before launch?~~ Decided (`D-58`).
2. ~~File uploads at launch?~~ Decided (`D-59`).
3. Which SMTP provider, and its credentials? (`REM-004`)
4. When mail is not configured or fails, should announcements still publish in-app? (Recommended: yes;
   `REM-005`.)
5. Privacy and terms text (`REM-015`).
6. Who is the first staff account — `teacher` (Dr. Tahir) or a separate `admin`? (`REM-001`)

---

## 11. Documentation changed by this audit

`docs/PROJECT_AUDIT.md`, `docs/PRODUCTION_READINESS.md`, `docs/REMEDIATION_PLAN.md`,
`docs/HOSTINGER_DEPLOYMENT.md` (new); `docs/phases/audit-2026-09-27/` (raw specialist reports);
`docs/CHANGELOG.md` (`D-57` recordings are links); `project_log.md` (entry); `CLAUDE.md` (test
counts, video/recordings rule, Node-version drift, pointers to the audit documents). No production
code was changed.
