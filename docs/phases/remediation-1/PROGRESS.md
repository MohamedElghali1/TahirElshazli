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
| T3 | REM-005 announcement publish not all-or-nothing on mail | queued | |
| T4 | REM-007 classroom-safe rate limits | queued | |
| T5 | REM-030 Cloudflare R2 storage driver | queued | |
| T6 | REM-082 DOCX submissions | queued | |
| T7 | REM-080a Google Form CSV import + analytics (backend) | queued | |
| T8 | REM-080b CSV import + analytics (frontend) | queued | |
| T9 | Frontend fixes: REM-009, 013, 014, 016, 017, 018, 019, 021a | queued | |
| T10 | Deploy prep: REM-008, 011, 012, 020, 021, 050 | queued | |

## Review notes

## Needs your eyes
- **`POST /admin/groups/:id/members/bulk` ("Move N to group") only adds.** It never removes the
  student's existing membership, so a "moved" student ends up in two groups on the same course and
  every assistant holding either group sees them. Found during the live T-13 rerun (2026-09-27).
  Pre-existing and out of T2's scope; needs a product ruling (should "move" remove the old
  same-course membership?) before anyone changes it.
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
