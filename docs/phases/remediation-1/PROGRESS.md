# Remediation 1 — launch blockers (agy-delegate queue)

Branch `remediation/launch-blockers` (from `audit/production-readiness-2026-09-27`). Implementer:
Antigravity CLI via `/agy-delegate`; the lead writes each brief, re-runs the gates, reviews the diff and
commits. One task, one commit. Tasks and acceptance criteria: `docs/REMEDIATION_PLAN.md`.

Out of scope by the user's instruction (2026-09-27): guardian consent (`REM-081`, deleted — `D-64`); creating the real
staff accounts (`D-61`); real site photos and WhatsApp number (`REM-016b`, needs client content);
weekly reports (`REM-031`, post-launch).

## Status

| # | Task | Status | Commit |
|---|---|---|---|
| T1 | REM-001 bootstrap-staff CLI | reviewed + committed | 21b4433 |
| T2 | REM-002 group-grain scope on course-named staff routes (AUTH-6) | reviewed + committed | (this commit) |
| T2b | D-65 one group per student per course (move replaces membership) | reviewed + committed | (this commit) |
| T3 | REM-005 announcement publish not all-or-nothing on mail | reviewed + committed | (this commit) |
| T4 | REM-007 classroom-safe rate limits | reviewed + committed | (this commit) |
| T5 | REM-030 Cloudflare R2 storage driver | reviewed + committed | (this commit) |
| T6 | REM-082 DOCX submissions | reviewed + committed | (this commit) |
| T7 | REM-080a Google Form CSV import + analytics (backend) | reviewed + committed | (this commit) |
| T8 | REM-080b CSV import + analytics (frontend) | reviewed + committed | (this commit) |
| T9 | Frontend fixes: REM-009, 013, 014, 016, 017, 018, 019, 021a, 045 | reviewed + committed | (this commit) |
| T10 | Deploy prep: REM-008, 011, 012, 020, 021, 023, 025, 027, 047, 050 | reviewed + committed | (this commit) |

## Review notes

## Needs your eyes
- **"Move N to group" only added a membership** (found by the live T-13 rerun). Ruled by the user as
  `D-65` (one group per student per course; move replaces) → queued as T2b.
- **One unidentified e2e flake in `staff.e2e-spec.ts`** during the T2 gate run (`256 passed, 1
  failed` after a crash-retry; the runner prints no name). Six further solo runs: two clean
  `257 passed`, four died mid-file with the known `0xC0000409` crash and no failing test. Watch for it.

## End-of-run checklist
- Full gates on the final tree (lint, drift, unit, e2e, integration against real PostgreSQL, both builds, both images).
- Replay migrations from an empty schema.
- Re-run the audit's live journeys T-13 and T-14 and the browser walk.
- Update `REMEDIATION_PLAN.md` boxes, `PRODUCTION_READINESS.md`, `CLAUDE.md` counts, `project_log.md`.
- **Land on `D:/Users/ghali/TahirElshazli` branch `redesign` by fast-forward, full history** (user,
  2026-10-01). `TahirElshazli/redesign` (4687787) is an ancestor of this branch, so a fast-forward is
  possible; check first that `redesign` has not moved, and never force.

### T1 — REM-001 bootstrap-staff CLI
- First dispatch auto-denied (headless agy cannot prompt for command permission). The user chose
  `--dangerously-skip-permissions` per run (2026-09-27); every run is still reviewed and re-gated.
- Landed: `backend/src/database/cli/bootstrap-staff.ts` (+ spec), `UserRepository.hasStaffAccount()`
  in both implementations (EXISTS query), integration case, `db:bootstrap-staff` script.
- Lead's gates: lint 0 errors; unit 812/49; integration 192/192 on real PostgreSQL 15; build; tsc 0.
- Lead's live check on an empty DB: weak password → exit 1; first run creates one active teacher
  (email normalised); second run "bootstrap is not needed"; production API login → `/staff/overview` 200.
- Unasked addition kept: `InMemoryUserRepository.withUsers()` test helper (harmless; spec uses it).

### Implementer change (2026-09-27)
Antigravity's account quota ran out (HTTP 429, resets in ~7 days) — for Gemini and for the Claude
models inside agy alike. By the user's choice, remaining tasks go to the `unit-implementer` subagent
(Claude Sonnet, Ponytail discipline). The lead still reviews, re-gates and commits each task.

### T2 — REM-002 group-grain scope (AUTH-6)
- agy (Gemini, then Claude Sonnet 4.6 inside agy) wrote the service changes before its quota ended;
  `unit-implementer` finished the tests and docs, and fixed a test-scoping bug in the partial spec.
- Landed: `roster` narrows to held-group members; `assertMayRead` 404s `ASSESSMENT_NOT_FOUND` for a
  missing task, one on an unheld course, or one with no held group in its audience (this also closes
  an older oracle: an unheld-course task used to answer with the course message); `results` rows
  narrow; `studentWork` 404s `COURSE_NOT_IN_SCOPE` for a student in no held group (identical to an
  unknown student); `list` narrows; `update`/`remove`/`setTargets` 404 when no held group is in the
  audience and 403 when the audience is shared. Aggregates stay course-wide (`D-44`).
- Lead's gates: lint 0 errors; drift ok; unit 834/50; e2e 410 across 5 files (staff 257 on solo
  reruns, see the flake note); integration 192/192 on PostgreSQL 15; both builds; both tsc 0.
- Lead's live T-13 (production API, fresh DB, fixtures): after removing student-2 from group-1 and
  placing them only in a new unheld group, `assistant-1`'s roster lists student-1 only, and
  student-2's work is a 404 byte-identical to an unknown student's; the teacher sees both. **PASS.**

### T3 — REM-005 announcement publish survives mail failure
- `unit-implementer`: per-recipient try/catch in `publish()` (sequential), `delivery: {emailed, failed}`
  on the response, SMTP transport pooling, mirror type + drift check, status line on the page.
- Lead's fix: the page said "0 emails could not be sent" when no recipient had an email; now
  "Published.", and a partial failure reads "N of M emails could not be sent."
- Lead's gates: lint 0 errors; drift ok; unit 836/50; e2e 4 files 153 + staff 257 on a solo rerun
  (the runner's three attempts all hit the 0xC0000409 crash); integration 192/192; both builds; tsc 0.
- Lead's live T-14 (production API, `MAIL_DRIVER` unset → `none`, fresh DB): publish to `group:group-1`
  → 200, `publishedAt` set, `delivery {emailed: 0, failed: 2}`, student's notifications 4 → 5, log
  line names the announcement id and counts only. **PASS.**

### T2b — D-65 one group per student per course
- `unit-implementer`: `GroupsService.replaceCourseMembership` removes a student's other membership on
  the target's course (audited `group.student_removed`) before `addMember` and each `bulkMove`
  placement; an assistant must reach the source group (`GROUP_NOT_FOUND` otherwise). The same rule in
  `RegistrationApprovalService.accept` (found by tracing every write path). Staff e2e fixture that
  re-created two same-course memberships fixed.
- Lead's review: acceptance duplicates the small removal loop instead of sharing the private helper;
  accepted as-is.
- Lead's gates: lint 0 errors; drift ok; unit 844/50; e2e 411 across 5 files (staff 258 on retry);
  integration 192/192; both builds; tsc 0.
- Lead's live check (production API, fresh DB): "Move to group" of student-2 into a new group on
  course-1 removed their group-1 membership (student-1's course-2 group untouched); audit shows
  `group.student_removed` + `group.student_assigned`; assistant roster lists student-1 only. **PASS.**

### T4 — REM-007 classroom-safe rate limits
- `unit-implementer`: `RateLimitRule.by` (`ip` | `ip+email`), `@RateLimit` takes an array, every rule
  must pass. login 5/min per account + 60/min per IP; reset request 3/5min per account + 30 per IP;
  register 30/10min per IP. Found and fixed a key collision (rule index now in the key).
  `AUTH_ENUMERATION_LIMIT` removed as dead. Google sign-in routes unchanged (no email in body).
- Needs your eyes: every request counts, including successful sign-ins (the plan's original
  "failed only" idea needs a change in `AuthService.login`); recorded as a possible follow-up.
- Lead's gates: lint 0 errors; drift ok; unit 850/51; e2e 411 across 5 files, all first-try;
  integration 192/192; both builds; tsc 0. (The first gate run was reaped for low memory.)
- Lead's live check (production API): 30 distinct emails from one IP → 30×401, no 429; a real
  login right after → 200; 6 wrong attempts on one account → 401×5 then 429. **PASS.**

### T5 — REM-030 Cloudflare R2 storage driver
- `unit-implementer`: `R2Storage` (private bucket, `@aws-sdk/client-s3` + `s3-request-presigner`, the
  only new dependencies); port gains `readUrl`; `FileUrls` helper converts stored → presigned (15 min,
  60 min for public blog media ≥ 2× the ISR window). Stored values unchanged — no migration.
- Lead's review sent it back once: under `r2` nothing serves `/uploads/*`, so any screen rendering a
  stored-form URL breaks. Fixed with companion read fields where the stored form must be echoed back
  (`SubmissionDocument.readUrl`, `SubmissionView.fileReadUrl` + `files[].readUrl`,
  `AnnouncementView.mediaReadUrl`); report documents were a further gap, converted. The minute-rounded
  signing trick was removed.
- **For T10 / `CLOUDFLARE_SETUP.md`:** the browser fetches presigned URLs by script in one place,
  `components/marking/use-file-bytes.ts` (pdf.js/canvas on the marking and marked-copy views) → the
  bucket needs a CORS rule allowing GET from the site origin. CSP must allow the R2 endpoint in
  `connect-src`, `img-src`, `media-src`. `.env.example` could not be edited by the subagent (permission
  block) — add `R2_*` in T10.
- Lead's gates: lint 0 errors; drift ok; unit 866/53; e2e 411 across 5 files first try; integration
  192/192; both builds (the frontend build was reaped for low memory once, re-run alone: compiled);
  both tsc 0.
- Lead's live boot check (production mode): `r2` missing two vars → refuses naming both; `local` →
  refused; `r2` with all four → boots, health 200, secret absent from the log. No real bucket
  reachable, so a real upload/presigned-read round trip is still owed (go-live step).

### T6 — REM-082 DOCX submissions + content sniffing
- `unit-implementer`: a separate `docx_upload` mode end to end (union, rules, DTO, mirror, task form,
  hand-in page); DOCX in the upload whitelist; magic-byte sniffing for PDF, DOCX (`PK` +
  `word/document.xml` entry), PNG, JPEG, WebP before anything is stored; migration **027** widens 018's
  CHECK. Staff marking already routes a non-PDF/non-image to an "Open original" link on the read URL
  and never into pdf.js (T5's `SubmissionDocument.kind`), so no marking change was needed.
- Lead's gates: lint 0 errors; drift ok; unit 875/53; e2e 412 across 5 files (staff 259 on retry);
  integration 192/192; both builds; both tsc 0.
- Lead's migration check: fresh DB, `migrate.js` applied 001–027; the CHECK now lists `docx_upload`;
  an update to `{pdf_upload,docx_upload}` succeeds and `{exe_upload}` is refused by the constraint.

### T7 — REM-080a Google Form CSV import + per-question analytics (backend)
- The first `unit-implementer` run was cut off when the session ended; a second one verified the draft
  file by file, found it correct, and added the missing `API_SPEC.yaml` route and schemas.
- Landed: `ingest()` extracted from `sync()` (the seam the deadline automation will call, `REM-083`);
  RFC 4180 parser (`common/csv/parse-csv.ts`); Google Forms CSV → responses (`google-form-csv.ts`:
  headers by name, then structural fallback for a non-English form; `7 / 10` scores; two timestamp
  shapes; multi-select kept as one string); `POST /staff/assessments/:id/results/import` (`dryRun`,
  2 MB / 2000 rows / 200 columns, gated like `/sync`, audited `work.results_imported`);
  `WorkAnalytics.questions` (distributions over the caller's reach, aggregates course-wide per `D-44`);
  CSV-only `google_form` tasks need no API binding (responder link in `external_url`, no migration).
- **Fixture time bomb fixed in the same commit:** `assess-1`'s window closed 2026-09-30, so from
  2026-10-01 a staff e2e case failed for everyone. Moved to 2027-09-30 in the in-memory fixture and
  `001_development_fixtures.sql`.
- Open: a timestamp **without** a zone is read as UTC (display-only; no deadline comparison uses
  imported times). Decide against the user's real export in T8 — Cairo time is the likely right
  reading.
- Lead's gates: lint 0 errors; drift ok; unit 924/56; e2e 412 across 5 files; both builds; both tsc 0;
  integration 192/192 (first two attempts crashed the worker on low memory with Docker's other
  containers running; third clean). The gate run was reaped once for low memory; Docker Desktop was
  restarted by the lead at the user's request.
- Live check with a **real** Google export: owed, in T8 (the user is providing
  `tmp/audit/google-forms-real.csv`).

### T8 — REM-080b CSV import + results UI (frontend)
- `unit-implementer`: "Import responses (CSV)" with a dry-run preview (rows / matched / unmatched /
  questions + parser errors) then Import/Cancel; "Responses by question" (neutral bars, `n of answered`
  label, `dir="auto"` values); per-student Individual view from the Results table via the new
  `StudentWorkRow.resultId` and from the Unmatched panel; "Sync now" only when the task has a live
  API binding (`externalUrl === null` on a `google_form` task); `update()` clears `externalUrl` when a
  CSV-only form gains a live binding (spec added).
- Lead's fix: the import preview was a bordered box inside the `Panel` (card in a card, §11) → a
  divided section like its neighbours.
- Lead's gates: lint 0 errors; drift ok; unit 925/56; e2e 412 across 5 files first try; integration
  192/192; both builds; both tsc 0.
- Lead's live check (production API on a fresh DB, `next start`, headless Chrome): CSV-only task on
  group-1; the committed fixture with row 1's email changed to `student@example.com` → dry run and
  import both `30 rows, 2 matched, 28 unmatched, 3 questions`. Hand-checked against the two matched
  rows: capital Cairo 1 / Alexandria 1, book 2, «نعم» 2, average 1.5/10 — exactly what the page
  shows. Distributions cover the caller's matched reach only (T7's design, `D-44`); unmatched rows
  are excluded and the existing "understated" banner says so. Light, dark and `dir="rtl"` checked
  with an Arabic task title and the long Arabic answer expanded: no horizontal scroll, no console
  error. The only failed request is the `/manage/reports` prefetch (REM-021a, T9). **PASS.**
- **Not done:** no real Google export was available (user, 2026-10-02: "use the fixture, I'll add it
  later"). The zoneless-timestamp rule therefore stays **UTC (display-only)** and is still open —
  check it when `tmp/audit/google-forms-real.csv` arrives; Cairo time is the likely right reading.

### Implementer attempt (2026-10-02)
The user asked to try Antigravity first for T9. The dispatch (with `--dangerously-skip-permissions`,
as on T1) was refused by Claude Code's permission classifier before it ran, so T9 went to the
`unit-implementer` fallback the user had approved. agy needs a permission rule from the user to be used again.

### T9 — nine frontend fixes (REM-009/013/014/016/017/018/019/021a/045)
- `unit-implementer`: visible scope-checkbox labels; grading dialog focus trap / Escape / focus
  return; course "Assistants" tab and the "Reports" nav item removed; Students/Groups/Assistants/
  Assistant activity shown to admins only (the "People" heading omitted when empty) and those pages
  say "You don't have access to this page." on a 401/403; app-level `not-found`, `error`,
  `global-error`; announcement notifications link to `/dashboard` and the in-memory fixtures to real
  routes; recordings copy and player no longer mention Bunny/signed playback; the greeting skips an
  honorific.
- Lead's fixes: (1) `global-error.tsx` repeated the root layout's theme script via
  `dangerouslySetInnerHTML`, which is a second place deciding the theme (§11, F14-1) → removed; the
  last-resort page is light-only. (2) The grading dialog **did not return focus**: found live
  (headless Chrome) — the score input's `autoFocus` fired before the effect, so the effect "restored"
  focus to the input it had just captured. Removed `autoFocus` (the effect sets initial focus),
  mounted the effect once with `onClose` read through a ref. Re-tested live: initial focus inside,
  Tab wraps, Escape closes, focus returns to the opener. (3) The same stale `/learn/...` links in
  `seeds/001_development_fixtures.sql` (flagged by the subagent) → real routes. (4) `error.tsx`'s
  component renamed so it no longer shadows the global `Error`.
- Lead's gates: lint 0 errors; drift ok; unit 925/56; e2e 412 across 5 files; integration 192/192;
  both builds; both tsc 0.
- Lead's live check (production API, fresh DB, `next start`): assistant sidebar has no People
  section and no Reports; `/manage/students` and `/manage/groups` reached directly show "You don't
  have access to this page."; teacher greeting "Welcome back, Tahir"; course tabs without
  "Assistants"; `/no-such-page` renders the branded 404. **PASS.**
- Follow-ups (not in the brief): the admin pages still render their create forms above the
  no-access message when an assistant reaches them by URL (server refuses every write); the 404
  page has no `h1`.

### T10 — deployment prep (REM-008/011/012/020/021/023/025/027/047/050)
- `unit-implementer`: `npm audit` 6 (1 critical, 4 high) → **0**, all within existing ranges (`next`
  16.3.3 → 16.3.8 for a critical `next/og` RCE, `@nestjs/platform-express` 12.1.2 → multer 2.4.0,
  `qs`, `fast-uri`, `brace-expansion`; `eslint-config-next` bumped to match); both Dockerfiles (both
  stages) and CI on Node 24, frontend `@types/node` ^24; `docker-compose.prod.yml`;
  `deploy/nginx/tahirelshazli.conf` (api body cap 70m from the real 64 MB multer ceiling, `real_ip`
  deliberately omitted so the app's own `TRUSTED_PROXY_HOPS=2` counting stays the one decider);
  `deploy/backup.sh` (30-day retention to match the privacy policy); `deploy/cloudflare-firewall.sh`;
  security headers + CSP in `next.config.ts` (each source grep-justified; `img-src`/`media-src`
  include `https:` because course thumbnails and recording files are staff-pasted URLs with no fixed
  host; `'unsafe-inline'` scripts until a nonce middleware exists); `app/robots.ts`; `git rm` of the
  tracked 0-byte `0`, `1036`, `and`, `backend/{const`; `.env.example` rewritten from `env.ts`.
- Lead's fixes: `backup.sh` wrote `pg_dump` straight to the final name, so a dump dying midway left a
  truncated `*.dump` that retention would keep as "newest" → writes `.part`, renames on success.
  `PGSSLMODE` commented out in the example rather than set blank. `.env.example` copied in by the user
  (permission-blocked for agents).
- Lead's gates: `npm audit` 0 vulnerabilities; lint 0 errors; drift ok; unit 925/56; e2e 412 (4 files
  153 + `staff` 259 on a solo rerun — the known `0xC0000409` crash killed it four times, once at test
  151 with nothing failed); integration 192/192; both builds; both tsc 0; **both images built on
  `node:24-alpine` (node v24.21.0)**; the web image serves the CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`, and `/robots.txt`.
- Not run here: `cloudflare-firewall.sh` and `backup.sh` (VPS-only; syntax-checked).
