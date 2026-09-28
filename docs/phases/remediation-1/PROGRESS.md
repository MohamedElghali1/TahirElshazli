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
| T7 | REM-080a Google Form CSV import + analytics (backend) | queued | |
| T8 | REM-080b CSV import + analytics (frontend) | queued | |
| T9 | Frontend fixes: REM-009, 013, 014, 016, 017, 018, 019, 021a | queued | |
| T10 | Deploy prep: REM-008, 011, 012, 020, 021, 050 | queued | |

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
