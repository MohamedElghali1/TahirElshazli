# Lead — dynamic verification results (2026-09-27)

Environment: Windows 11, Node v24.15.0, npm 11.12.1, Docker 29.7.2, throwaway `postgres:15-alpine`
on :55432 (`audit_test` for integration, `audit_prod` for the live run). `npm ci` from the lockfile.

## Toolchain (all run, logs in tmp/audit/logs)
| Check | Command | Result |
|---|---|---|
| Lint (FE eslint + token check + BE oxlint) | `npm run lint` | PASS, 0 errors, 4 oxlint warnings (unused vars) |
| Mirror drift (OPS-1) | `npm run typecheck:drift` | PASS |
| Backend unit | `npm test` | PASS 804 / 48 files (CLAUDE.md says 803 — doc drift) |
| Backend e2e | `npm run test:e2e` | PASS 404 / 5 files (CLAUDE.md says 402 — doc drift) |
| Backend integration (real PG 15) | `TEST_DATABASE_URL=… npm run test:integration` | PASS 191 / 1 file, 0 skipped |
| Backend build | `npm run build:backend` | PASS |
| Frontend build | `npm run build:frontend` | PASS, 57 routes, no warnings |
| Frontend tsc | `npx tsc --noEmit` | 0 errors |
| Backend tsc | `npx tsc --noEmit -p tsconfig.json` | 0 errors |
| npm audit | `npm audit` | 2 high (multer ≤2.2.0 via @nestjs/platform-express: DoS ×3, size-limit bypass), 1 moderate (qs). fix available |
| Docker images | `docker build -f Dockerfile.backend/.frontend .` | both PASS (node:20-alpine) |

## Production-artifact boot (`NODE_ENV=production node dist/main.js`)
- Refuses boot, verified by running: no JWT_SECRET; PERSISTENCE_DRIVER=memory; DB_AUTO_SEED=1; STORAGE_DRIVER=local. All four PASS.
- Boots on empty schema with DB_AUTO_MIGRATE=1: 26 migrations applied, `/health` 200, helmet headers present (CSP, HSTS, nosniff, XFO).
- `node dist/database/cli/migrate.js` works from dist (the path a runtime image must use; `npm run db:migrate` needs `nest build`).
- **LEAD-01 (P0) CONFIRMED LIVE**: after migrate, `users` = 0; teacher login 401; `/auth/register` creates a `waiting` student that only staff can accept; every staff-creation path needs an existing staff member (invitations). A fresh production DB cannot be operated without hand-written SQL.
- Seed refusal keys only on NODE_ENV: `NODE_ENV=development node dist/database/cli/seed.js` with a prod DATABASE_URL seeds the published-password accounts (P3 hardening).

## Live API journeys (production-mode API on :3101, fixtures loaded via dev seed CLI)
| ID | Journey | Result |
|---|---|---|
| T-01 | Login ×6 roles | PASS |
| T-02 | Student: dashboard, courses, course detail/assessments/recordings/materials/dashboard, notifications, profile, timetable(from/to), attendance | PASS (200s) |
| T-03 | Student → /staff/*, /admin/* | 403 PASS |
| T-04 | No token / garbage token | 401 PASS |
| T-05 | Unknown course | 404 generic PASS |
| T-06 | Register → admin accept (needs groupId) → login | PASS end-to-end, no mail needed |
| T-07 | Admin create student | **503 "Mail is not configured"** in prod default (LEAD-03) |
| T-08 | Password reset request | **503** in prod default (LEAD-03) |
| T-09 | Student submit link answer → teacher grade (score>max → 400; assistant-2 → 404; student → 403) → return → student sees `corrected` 8/20 | PASS end-to-end; audit entries written |
| T-10 | Logout then reuse token | 401 "Session has been logged out" PASS |
| T-11 | CORS preflight from evil origin | no ACAO header PASS; allowed origin echoed PASS |
| T-12 | Malformed JSON / bad query / injection-ish cursor / 300-char id | 400/400/200-empty/404 — no 500, no leak PASS |
| T-13 | **AUTH-6 live**: admin created group on course-1 not held by assistant-1, accepted a student into it. assistant-1: `/staff/groups/<g>` 404, `/members` 404, BUT `/staff/courses/course-1/roster` lists that student | **FAIL — cross-cohort leak confirmed live (SEC-01)** |
| T-14 | **Announcement publish with MAIL_DRIVER=none (prod default)** | **503, whole transaction rolled back: not published, 0 notifications** (LEAD-04) |
| T-15 | Rate limit: login | 5/min per route+IP **including successful logins**; register 3 per 5 min per IP (LEAD-02) |

## Live UI walk (production frontend image `audit-frontend`, headless Chrome over CDP)
- Anonymous: 14 routes. Public pages render; `/dashboard` and `/manage` redirect to `/login`. **Footer links `/privacy` and `/terms` → 404 on every marketing page (LEAD-06).** Unbranded Next 404 page. **No robots.txt / sitemap.xml.** **Frontend sends no security headers; `X-Powered-By: Next.js` exposed** (corroborates SEC-04).
- Student (1280px): 15 pages render, 0 console errors, 0 uncaught exceptions. **Notification links `/learn/...` → 404** (LEAD-05, from `announcements.service.ts:231`). Student → `/manage` redirects to `/dashboard`.
- Student (375px): 7 pages, no horizontal scroll.
- Teacher: 29 staff pages render, 0 exceptions. **`/manage/reports` (sidebar "Reports", `components/shell/console-shell.tsx:96`) 404 on every page** — the unbuilt Unit 9 screen. **`/manage/courses/:id/staff` ("Assistants" tab, `manage/courses/[id]/layout.tsx:54`) 404** — deleted page still linked. Greeting reads "Welcome back, Dr." (first-token of name).
- Assistant: nav shows admin-only "Students"/"Assistants"/"Activity"/"Groups"; those pages call `/admin/*` → 403 and render raw "Forbidden resource / Try again" beside "Create student"/"Invite assistant" buttons (LEAD-07, UX only — server enforcement is correct).

## Verified false positives / downgrades
- **API-06 (ParseUUIDPipe → 500)**: FALSE. No id column is UUID-typed (all TEXT); malformed ids return clean 404s (T-12).
- **SEC-03 (raw driver messages on 500)**: FALSE as stated. Nest `BaseExceptionFilter.handleUnknownError` returns `{statusCode:500,message:"Internal server error"}` unless the error has `statusCode` (pg errors do not). Downgrade to P3 hardening.
- **FE-11 (Reports nav) P0**: over-rated — dead link, P2; the real issue is the missing Unit 9 feature (LEAD-08).

## Product-level finding
- **LEAD-08 (P0 for feature-complete launch / needs client decision)**: `docs/PHASE_ROADMAP.md` Unit 9 "Weekly reports — the flagship — 9 routes, none exist" is `[ ]`. Only an aggregate group summary (`GET /staff/groups/:id/report`) and seed-only report documents exist; no production route creates report documents; generate/review/send-to-parent is MISSING.
- **Uploads**: no `r2` driver exists; production must run `STORAGE_DRIVER=none` → file-upload submission modes, avatars, blog media, annotation files all 503. Needs the same kind of decision the user made for recordings (links-only?).
