# Remediation run 1 — handoff (written 2026-10-02)

The session that ran T2–T8 hands over here. Read this, then `PROGRESS.md` (same folder), then
`CLAUDE.md`. Everything below is the state of the tree as written, not a plan to re-derive.

## Where things stand

Branch `remediation/launch-blockers` in `D:\Users\ghali\Za3blawy` (Windows 11). Nothing is pushed.
Base chain: `main` → `audit/production-readiness-2026-09-27` → this branch.
`D:\Users\ghali\TahirElshazli` branch `redesign` is at `4687787` and is an **ancestor** of this branch.

| # | Task | State |
|---|---|---|
| T1 | REM-001 bootstrap-staff CLI | committed `21b4433` |
| T2 | REM-002 group-grain scope (AUTH-6) | committed `20aadad` |
| T2b | D-65 one group per student per course | committed `b4bf2fb` |
| T3 | REM-005 announcement publish survives mail | committed `99efc56` |
| T4 | REM-007 classroom-safe rate limits | committed `428abc1` |
| T5 | REM-030 Cloudflare R2 driver | committed `e3980b3` |
| T6 | REM-082 DOCX + content sniffing (migration 027) | committed `302fb25` |
| T7 | REM-080a Google Form CSV import (backend) | committed `0da1d7d` |
| **T8** | REM-080b CSV import + results UI | **implemented, UNCOMMITTED, not yet lead-gated** |
| T9 | Nine frontend fixes | queued — brief `briefs/T9.txt` |
| T10 | Deployment prep | brief **not written yet** (spec below) |
| T11 | Legal pages | text drafted, **UNCOMMITTED** in `docs/legal/`; page-code brief not written |
| T12 | Weekly reports (Unit 9) | not started; decided by D-63 |

### Uncommitted files and which task owns them
- **T8:** `backend/src/assessments/interfaces/assessment-repository.interface.ts`,
  `backend/src/assessments/work-analytics.service.ts`,
  `backend/src/manage/assessment-authoring.service.ts`, `...assessment-authoring.controller.spec.ts`,
  `backend/src/manage/work-analytics-gate.service.spec.ts`, `frontend/lib/types.ts`,
  `frontend/app/(app)/manage/tasks/[id]/results/page.tsx`, `docs/REMEDIATION_PLAN.md`.
  T8 adds: Import responses (CSV) with dry-run preview; per-question Summary; per-student Individual
  view (from the Results table via the new `StudentWorkRow.resultId`, and from the Unmatched panel);
  "Sync now" shown only when `task.externalUrl === null` (API-bound form); `update()` clears
  `externalUrl` when a CSV-only form gains a live binding. Subagent's gates: lint 0 errors, drift ok,
  unit 925/56, e2e 412/5 files, both builds, both tsc 0.
- **T11 (legal text, written by the lead):** `docs/legal/privacy-policy.md` (guardian-consent
  promises removed, D-64; weekly reports described as in-app, D-63), `docs/legal/terms-of-use.md`
  (new), `docs/legal/README.md`. The README's "Status" column still describes the code *before*
  T2–T10 — update it when T11 is committed (R2 built, assistants scoped, CSV import built).

## Decisions in force (all in `docs/CHANGELOG.md` — do not re-ask)
D-57 recordings are links · D-58 weekly reports after launch · D-59 PDF+DOCX uploads, R2 ·
D-60 Google Form by CSV now, API later through `ingest()` · D-61 real staff accounts last ·
**D-62** Hostinger VPS for app+DB, Cloudflare for DNS/SSL(Full strict)/WAF/CDN, R2 for uploads ·
**D-63** weekly reports: student in-app only (no email), attendance + homework completion + marks for
the week, drafts auto-generated weekly (idempotent per group-week, in-process timer — no job
framework), teacher/admin reviews and publishes (audited, never overwritten) ·
**D-64** guardian consent out of scope entirely · **D-65** one group per student per course; a move
within a course replaces the membership; an assistant must hold both groups; changing course = place
on the new one + teacher/admin removes from the old.
Also from the user: placeholder photos and the WhatsApp number come from the client — list them in
the final report, don't block. Real staff accounts are created last.

## How work is done (rules learned the hard way)
- **Implementer:** Antigravity's quota is exhausted until about 2026-10-04 (Gemini and the Claude
  models inside agy alike). The user chose the `unit-implementer` subagent (model `sonnet`), whose
  prompt must start with "invoke the skill ponytail:ponytail". The lead writes a brief to
  `docs/phases/remediation-1/briefs/Tn.txt`, commits it, dispatches, then **reviews the diff, re-runs
  every gate itself, verifies live, and commits** (one task, one commit; message cites the REM id,
  says "Implemented by the unit-implementer subagent; reviewed and gated by the lead", and ends with
  the `Co-Authored-By` line). Subagent reports have twice been wrong in substance (a test-scoping bug,
  presigned URLs breaking echoed fields) — read the diff, don't trust the report.
- **Gates:** `bash tmp/audit/gates.sh <label>` runs lint, drift, unit, e2e, both builds, both tsc,
  integration (logs in `tmp/audit/gates/<label>/`). Integration needs Docker + container `remed-pg`
  (`postgresql://dev:devpassword@localhost:55433/remed_test`). Docker Desktop lives at
  `C:\Users\ghali\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`.
- **Memory (8 GB) is the main hazard.** Background gate runs get reaped when the session is idle and
  RAM is low; this session itself crashed once. Prefer running gates **in the foreground in two or
  three chunks** (each under the 10-minute tool limit). If a run is reaped, Claude Code says not to
  restart it unprompted: ask the user (multiple choice). Never run two suites/builds at once.
- **e2e on Windows:** a file may die with `0xC0000409` / exit `3221226505` and no summary — not a
  failure; `run-e2e.mjs` retries; re-run a still-missing file alone with
  `cd backend && npx vitest run --config ./vitest.config.e2e.ts --reporter=verbose test/<file>`.
  A file with no count is not a pass.
- **Live checks** (production mode against a fresh DB): see the scripts `tmp/audit/t13.sh`
  (scope + D-65 move), `t14.sh` (announcements), `t04.sh` (rate limits). Pattern: create DB in
  `remed-pg`, boot `backend/dist/main.js` with `NODE_ENV=production PERSISTENCE_DRIVER=postgres
  DB_AUTO_MIGRATE=1 JWT_SECRET=<32+ chars> CORS_ORIGIN=http://localhost:3102
  FRONTEND_URL=http://localhost:3102 PORT=3101`, seed with
  `NODE_ENV=development PERSISTENCE_DRIVER=postgres node dist/database/cli/seed.js`, run, then stop
  the API by port and drop the DB. Seed logins: `teacher@`, `assistant@`, `student@`,
  `student2@example.com`, password `password123`.
- **Junk files:** shell commands create 0-byte files in the repo root (`e`, `{,`, `a.id`…). Delete
  only after `git ls-files <name>` shows them untracked. **`0`, `1036`, `and` are TRACKED** (since
  unit 8) — remove them in T10 with `git rm`, along with `backend/{const` if it exists.
- **Not yours to stop:** containers `tahirelshazli-api` (crash-loops) and `tahirelshazli-db`. Stopping
  them would free memory — ask the user.
- Ask the user only through AskUserQuestion with 2–4 options, recommended first, one-line trade-off
  each. `.env.example` reads/edits are permission-blocked for shell tools — use Read/Edit, or ask.

## Remaining work, in order
1. **T8:** re-run all gates yourself; browser-check `/manage/tasks/<id>/results` (light + dark,
   `dir="rtl"`, a long Arabic value) with headless Chrome on `--remote-debugging-port=9333`
   (`tmp/audit/ui-walk.mjs` shows the pattern) against the production API + `next start`; import the
   user's **real** Google Forms export `tmp/audit/google-forms-real.csv` if it exists (else the
   fixture `backend/test/fixtures/google-forms-sample.csv`) and hand-check the per-question counts.
   Open point to settle against the real file: a timestamp **without** a zone is read as UTC
   (display-only) — if the real export has zoneless times, read them as `Africa/Cairo` instead
   (record a decision). Then commit T8 and update `PROGRESS.md`.
2. **T9:** dispatch `briefs/T9.txt` (REM-009/013/014/016/017/018/019/021a/045). Note REM-019 is the
   recording-form hint that says playback "is signed" (false since D-57) and REM-021a hides the unbuilt
   "Reports" nav item.
3. **T10 — deployment prep (write the brief first, from these items):**
   REM-008 `npm audit` to 0 high (multer/qs; `overrides` if needed);
   REM-011 both Dockerfiles, both stages, and CI to `node:24-alpine` / `24.x`, plus frontend
   `@types/node`;
   REM-012 rewrite `.env.example` from `backend/src/common/config/env.ts` (STORAGE_DRIVER + the four
   `R2_*`, MAIL_DRIVER + five `MAIL_SMTP_*`, FRONTEND_URL, INTERNAL_API_URL, DATABASE_POOL_MAX,
   PGSSLMODE, TRUSTED_PROXY_HOPS=2; remove BUNNY_*, NEXT_PUBLIC_VIDEO_CDN, CLOUDFLARE_R2_*, Resend);
   REM-020 `docker-compose.prod.yml`; REM-021 `deploy/nginx/tahirelshazli.conf` (R2 vars,
   `client_max_body_size` ≥ the upload cap); REM-023 `deploy/backup.sh` (pg_dump -Fc nightly +
   pre-deploy, retention, off-host copy hook); REM-025 `deploy/cloudflare-firewall.sh` (allow 80/443
   only from Cloudflare's published ranges); REM-047 security headers in `next.config.ts` (CSP allowing
   the API origin and `https://*.r2.cloudflarestorage.com` in connect-src/img-src/media-src,
   X-Frame-Options, Referrer-Policy, nosniff, `poweredByHeader: false`); REM-027 `app/robots.ts`;
   REM-050 `git rm 0 1036 and` (+ `backend/{const` if present). Lead runs: `npm audit`, both images
   built on Node 24.
4. **T11 — legal pages:** commit the drafted text (update `docs/legal/README.md` status rows to the
   code as it now is); brief the subagent for `/privacy` and `/terms` in `frontend/app/(site)/`:
   text stored as a typed structure in `frontend/lib/` (no Markdown parsing at runtime, never raw
   HTML), headings + paragraphs + lists, reached from the existing footer links, Metadata, marketing
   type scale, both themes.
5. **T12 — weekly reports (Unit 9, REM-031)** per D-63: write a plan (from D-63 +
   `docs/PHASE_ROADMAP.md` Unit 9 + `docs/PRODUCT_SPEC.md`), commit it, show the user a short summary,
   then slices: migration (next free number is **028**) → both repositories → service (pure
   composition, idempotent weekly generation via an in-process timer, never overwrite a published
   report) → routes (staff review/publish audited; student read) → tests → frontend; re-enable the
   "Reports" nav item. If the session runs long, commit the plan with a status note instead.
6. **End of run:** final gates on the final tree (lint, drift, unit, e2e every file counted,
   integration, both builds, both tsc, `npm audit` 0 high, both Docker images on Node 24, migrations
   001–028 from an empty schema); production rehearsal with `docker-compose.prod.yml` and test secrets
   only (migrate CLI, bootstrap-staff CLI, runbook §11 smoke test, audit journeys T-01…T-15, headless
   browser walk `tmp/audit/ui-walk.mjs`, no CSP violations); delete scratch data. Update docs to the
   truth: `PRODUCTION_READINESS.md` (READY FOR DEPLOYMENT or exactly what blocks it),
   `REMEDIATION_PLAN.md` boxes, `HOSTINGER_DEPLOYMENT.md` (real files, R2, Cloudflare Full strict,
   origin firewall, D-62), a new `docs/CLOUDFLARE_SETUP.md` (DNS records, SSL mode, origin cert, R2
   bucket + least-privilege API token, **bucket CORS allowing GET from the site origin** —
   `components/marking/use-file-bytes.ts` fetches presigned URLs by script — and cache rules that never
   cache `/staff`, `/admin` or API responses), `CLAUDE.md` (test counts; §3 file-storage row still says
   DOCX is open and `.env.example` lacks R2 — both stale after T6/T10; §3 Dockerfiles row after
   REM-011), `project_log.md`.
7. **Land:** fast-forward `D:\Users\ghali\TahirElshazli` branch `redesign` to this branch, full
   history (user, 2026-10-01). First confirm `redesign` is still `4687787` and has no new commits;
   never force. Then the final report (commits, gates, what the client must supply: SMTP, Cloudflare
   account + R2 bucket, the Hostinger VPS, legal placeholders, real photos and the WhatsApp number, the
   first staff identity), the exact deploy commands, and ask (multiple choice) whether to push and/or
   open a PR.

## Open items to carry
- `PROGRESS.md` "Needs your eyes": unidentified one-off staff e2e flake (T2); sign-in limits count
  successful attempts too (T4; failed-only would need `AuthService.login`).
- No real R2 round trip has been possible (no bucket) — a go-live step.
- The user is providing a real Google Forms CSV at `tmp/audit/google-forms-real.csv`.
