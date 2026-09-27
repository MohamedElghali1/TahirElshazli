# Production readiness — checklist

**Current status (2026-09-27): NOT READY.** Evidence for every tick is in `docs/PROJECT_AUDIT.md`;
the task that clears every open box is named. Re-run this checklist before `REM-060` (go-live).

`[x]` verified by running it · `[ ]` open · `[?]` waiting on a client decision

## Code
- [x] Build passes — backend and frontend, and both Docker images (`PROJECT_AUDIT` §5.1)
- [x] Type checking passes — frontend 0, backend 0, mirror drift clean
- [x] Lint passes — 0 errors (4 warnings)
- [x] Critical tests pass — 804 unit, 404 e2e, 191 integration on real PostgreSQL
- [ ] Dependency audit clean — 2 high `multer` → `REM-008`
- [ ] Runtime supported — images on Node 20 (EOL) → `REM-011`

## Frontend
- [x] Main pages verified — 60+ screens walked in a real browser, 0 console errors
- [x] Main workflows verified — sign-in, homework, marking and return, groups, public site
- [x] API integrations verified — no mocked data; contract drift check green
- [ ] Navigation complete — "Reports" and course "Assistants" 404; assistant sees admin-only items → `REM-021a`, `REM-014`, `REM-017`
- [ ] Error states — per-screen states good; no app-level `not-found`/`error` boundaries → `REM-018`
- [x] Responsive — student pages at 375 px, no horizontal scroll
- [ ] Accessibility — grading dialog focus trap, unlabelled scope checkboxes → `REM-013`, `REM-009`
- [ ] RTL reachable in the product → `REM-041`
- [ ] Legal pages exist → `REM-015`

## Backend
- [x] Main endpoints verified — 143 routes mapped; journeys T-01…T-15 run live
- [x] Validation verified — DTO whitelist; bad input yields 400/404, never 500 (T-12)
- [x] Authentication verified — login, logout denylist, token misuse (T-01, T-04, T-10)
- [ ] Authorization verified — role gates pass; **group scope leaks on course routes** → `REM-002`
- [x] Database flows verified — migrations 001–026 from empty, integration suite, live writes
- [ ] Announcements publish in production → `REM-005` (+ `REM-004`)
- [ ] First staff account can be created in production → `REM-001`

## Security
- [x] Secrets protected — `.env` never tracked; history scan clean; production refuses placeholder secrets
- [x] Production configuration reviewed — every unsafe driver refused at boot (live)
- [x] Authentication reviewed
- [ ] Authorization reviewed and closed → `REM-002`
- [x] HTTPS requirements identified — Cloudflare Full (strict) + origin cert, HSTS already sent by the API
- [ ] Web security headers → `REM-047`
- [ ] One-time tokens hashed at rest → `REM-046`
- [ ] Rate limits safe for a shared school IP → `REM-007`

## Product scope (client decisions)
- [x] Weekly reports — after launch (`D-58`); hide the nav item for launch → `REM-021a`
- [x] File uploads — PDF + DOCX at launch (`D-59`) → build `REM-030`, `REM-082`
- [x] Google Form homework — CSV import now, API fetch later (`D-60`) → build `REM-080`
- [x] Real staff accounts created last (`D-61`); bootstrap CLI still needed → `REM-001`
- [?] First staff identity (teacher or admin) → `REM-010`
- [x] Recordings are plain links (`D-57`)
- [ ] Privacy policy reviewed, placeholders filled, published → `REM-015` (draft: `docs/legal/privacy-policy.md`)
- [ ] Real photos and WhatsApp number on the public site → `REM-016b`

## Deployment
- [x] Production build works — images build; production API boots on an empty database
- [x] Start command documented — `HOSTINGER_DEPLOYMENT.md` §7
- [ ] Environment variables documented in the repo template → `REM-012` (documented in `HOSTINGER_DEPLOYMENT.md` §4 meanwhile)
- [x] Hostinger runtime requirements identified — KVM 2, Ubuntu 24.04, Docker
- [x] Process management identified — Docker Compose restart policy; no PM2
- [x] NGINX configuration identified — `HOSTINGER_DEPLOYMENT.md` §5.2 (file to add: `REM-021`)
- [x] SSL requirements identified
- [ ] Production compose file in the repo → `REM-020`
- [ ] SMTP provisioned → `REM-004`
- [x] Database deployment identified — Postgres container, migrate CLI verified
- [x] Health check identified — `/health` liveness + `/public/courses` readiness
- [ ] Backups scripted and a restore rehearsed → `REM-023`, `REM-024`
- [ ] Origin locked to Cloudflare → `REM-025`
- [ ] Restart / reboot recovery tested → `REM-072` (documented, not yet run on a VPS)

## Release decision

| Status | Condition |
|---|---|
| **NOT READY** ← now | any P0 open, or `REM-003`/`REM-006` undecided |
| READY FOR FINAL QA | Phase 1 done (or explicitly waived by the client in writing), Phase 7 files in the repo, staging VPS passes §11 of the runbook |
| READY FOR DEPLOYMENT | final QA re-runs T-01…T-15 and U-01…U-05 green on staging, restore rehearsal done, SMTP delivering |
