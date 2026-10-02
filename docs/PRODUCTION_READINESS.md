# Production readiness — checklist

**Current status (2026-10-02, end of remediation run 1): NOT READY FOR DEPLOYMENT — blocked only on
items the client must supply or that can only happen on the real VPS.** Every code P0/P1 is done and the
production artifacts were rehearsed end to end on this machine (below). What still blocks go-live:

1. **SMTP credentials** (`REM-004`) — without them student creation, invitations and password reset 503.
2. **Hostinger VPS + Cloudflare account + R2 bucket and token** (`D-62`, `docs/CLOUDFLARE_SETUP.md`).
   No real R2 round trip has run yet.
3. **First staff identity** (`REM-010`) — then `bootstrap-staff` on the VPS (`D-61`: last).
4. **Legal placeholders and lawyer review** (`REM-015`), **real photos and WhatsApp number** (`REM-016b`).
5. On the VPS: restore rehearsal (`REM-024`), §11 smoke through Cloudflare, reboot test (`REM-070…072`).

Audit evidence: `docs/PROJECT_AUDIT.md`. Remediation evidence: `docs/phases/remediation-1/PROGRESS.md`.

**Production rehearsal, 2026-10-02** (tree `aa9f198`, `docker-compose.prod.yml` under an isolated
project name with throwaway secrets, `MAIL_DRIVER=log`, `STORAGE_DRIVER=none`): both images built on
`node:24-alpine` (v24.21.0); migrate CLI applied 001–029 to an empty database, then "Nothing to apply";
`bootstrap-staff` created the teacher and refused a second run; the seed CLI refused under production;
all three containers healthy; the weekly-report tick ran; journeys **T-01…T-15 all pass** (incl. T-07,
T-08, T-13, T-14, T-15 that failed in the audit); headless walk of every console nav item as teacher
and assistant, every student page and the public site — **0 console errors, 0 CSP violations** (a
deliberate probe confirmed the listener fires), no horizontal scroll. Scratch data deleted.

`[x]` verified by running it · `[~]` built, not yet run where it must be · `[ ]` open · `[?]` waiting on a client decision

## Code
- [x] Build passes — backend and frontend, and both Docker images (`PROJECT_AUDIT` §5.1)
- [x] Type checking passes — frontend 0, backend 0, mirror drift clean
- [x] Lint passes — 0 errors (4 warnings)
- [x] Critical tests pass — 954 unit (59 files), 419 e2e (5 files, every file counted), 198 integration on real PostgreSQL (2026-10-02)
- [x] Dependency audit clean — `npm audit` 0 vulnerabilities (`REM-008`)
- [x] Runtime supported — both images and CI on Node 24 (`REM-011`)

## Frontend
- [x] Main pages verified — 60+ screens walked in a real browser, 0 console errors
- [x] Main workflows verified — sign-in, homework, marking and return, groups, public site
- [x] API integrations verified — no mocked data; contract drift check green
- [x] Navigation complete — "Reports" shown to teacher/admin only (T12d, `REM-031`), course "Assistants" tab removed, admin-only items hidden from assistants (T9: `REM-021a`, `REM-014`, `REM-017`)
- [x] Error states — per-screen states plus app-level `not-found`, `error`, `global-error` (T9: `REM-018`)
- [x] Responsive — student pages and the weekly-report screens at 375 px, no horizontal scroll
- [x] Accessibility — grading dialog focus trap, visible scope-checkbox labels (T9: `REM-013`, `REM-009`)
- [ ] RTL reachable in the product → `REM-041`
- [x] Legal pages exist — `/privacy`, `/terms` (T11; drafts with `[[…]]` placeholders until the client fills them) → `REM-015`

## Backend
- [x] Main endpoints verified — journeys T-01…T-15 all pass against the production images (2026-10-02)
- [x] Validation verified — DTO whitelist; bad input yields 400/404, never 500 (T-12)
- [x] Authentication verified — login, logout denylist, token misuse (T-01, T-04, T-10)
- [x] Authorization verified — role gates and group scope on course routes (`REM-002`, T-13 passes)
- [x] Database flows verified — migrations 001–029 from empty (integration suite and the production migrate CLI), live writes
- [x] Announcements publish whatever mail does (`REM-005`, T-14 passes); mail itself needs `REM-004`
- [x] First staff account can be created in production — `bootstrap-staff` CLI, rehearsed (`REM-001`)

## Security
- [x] Secrets protected — `.env` never tracked; history scan clean; production refuses placeholder secrets
- [x] Production configuration reviewed — every unsafe driver refused at boot (live)
- [x] Authentication reviewed
- [x] Authorization reviewed and closed (`REM-002`)
- [x] HTTPS requirements identified — Cloudflare Full (strict) + origin cert, HSTS already sent by the API
- [x] Web security headers — CSP, X-Frame-Options, Referrer-Policy, nosniff; 0 CSP violations (`REM-047`). CSP still allows `'unsafe-inline'` scripts (no nonce middleware yet)
- [ ] One-time tokens hashed at rest → `REM-046`
- [x] Rate limits safe for a shared school IP — 30 classmates from one IP, no 429; one account capped (`REM-007`, T-15)

## Product scope (client decisions)
- [x] Weekly reports — built before launch after all (`D-63`, `D-66`, `REM-031`): drafts generated hourly for the last completed Sat–Fri Cairo week, teacher/admin publishes per group-week, students notified in-app and read them on `/marks`; live-checked end to end 2026-10-02
- [x] File uploads — PDF + DOCX at launch (`D-59`), R2 driver built (`REM-030`, `REM-082`); first real R2 round trip is a go-live check
- [x] Google Form homework — CSV import now, API fetch later (`D-60`) → build `REM-080`
- [x] Real staff accounts created last (`D-61`); bootstrap CLI built (`REM-001`)
- [?] First staff identity (teacher or admin) → `REM-010`
- [x] Recordings are plain links (`D-57`)
- [ ] Privacy policy reviewed, placeholders filled, published → `REM-015` (draft: `docs/legal/privacy-policy.md`)
- [ ] Real photos and WhatsApp number on the public site → `REM-016b`
- [ ] Public footer course links point at slugs that may not exist → `REM-054` (found in the rehearsal)

## Deployment
- [x] Production build works — both Node 24 images build; full stack rehearsed with `docker-compose.prod.yml`
- [x] Start command documented — `HOSTINGER_DEPLOYMENT.md` §7
- [x] Environment variables documented in `.env.example` (`REM-012`) and `HOSTINGER_DEPLOYMENT.md` §4
- [x] Hostinger runtime requirements identified — KVM 2, Ubuntu 24.04, Docker
- [x] Process management identified — Docker Compose restart policy; no PM2
- [x] NGINX configuration in the repo — `deploy/nginx/tahirelshazli.conf` (`REM-021`)
- [x] SSL requirements identified
- [x] Production compose file in the repo and rehearsed (`REM-020`)
- [ ] SMTP provisioned → `REM-004`
- [x] Database deployment identified — Postgres container, migrate CLI verified
- [x] Health check identified — `/health` liveness + `/public/courses` readiness
- [~] Backups scripted (`deploy/backup.sh`, `REM-023`); restore rehearsal still to run on the VPS (`REM-024`)
- [~] Origin lock scripted (`deploy/cloudflare-firewall.sh`, `REM-025`); to run on the VPS. Cloudflare click-path: `docs/CLOUDFLARE_SETUP.md`
- [ ] Restart / reboot recovery tested → `REM-072` (documented, not yet run on a VPS)

## Release decision

| Status | Condition |
|---|---|
| **NOT READY** ← now | any P0 open (now only `REM-004` SMTP, client-supplied), or `REM-010` undecided |
| READY FOR FINAL QA | Phase 1 done (or explicitly waived by the client in writing), Phase 7 files in the repo, staging VPS passes §11 of the runbook |
| READY FOR DEPLOYMENT | final QA re-runs T-01…T-15 and U-01…U-05 green on staging, restore rehearsal done, SMTP delivering |
