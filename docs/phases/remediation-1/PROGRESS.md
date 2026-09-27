# Remediation 1 — launch blockers (agy-delegate queue)

Branch `remediation/launch-blockers` (from `audit/production-readiness-2026-09-27`). Implementer:
Antigravity CLI via `/agy-delegate`; the lead writes each brief, re-runs the gates, reviews the diff and
commits. One task, one commit. Tasks and acceptance criteria: `docs/REMEDIATION_PLAN.md`.

Out of scope by the user's instruction (2026-09-27): guardian consent (`REM-081`); creating the real
staff accounts (`D-61`); real site photos and WhatsApp number (`REM-016b`, needs client content);
weekly reports (`REM-031`, post-launch).

## Status

| # | Task | Status | Commit |
|---|---|---|---|
| T1 | REM-001 bootstrap-staff CLI | at implementer | |
| T2 | REM-002 group-grain scope on course-named staff routes (AUTH-6) | queued | |
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

## End-of-run checklist
- Full gates on the final tree (lint, drift, unit, e2e, integration against real PostgreSQL, both builds, both images).
- Replay migrations from an empty schema.
- Re-run the audit's live journeys T-13 and T-14 and the browser walk.
- Update `REMEDIATION_PLAN.md` boxes, `PRODUCTION_READINESS.md`, `CLAUDE.md` counts, `project_log.md`.
