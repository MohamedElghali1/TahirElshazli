# Remediation run 1 — handoff 2 (written 2026-10-02, after T12c)

Supersedes `HANDOFF.md` for **state**; `HANDOFF.md` still holds the working rules and the end-of-run
and landing item lists this file refers to. Read this, then `PROGRESS.md`, then `CLAUDE.md`.

## Where things stand

Branch `remediation/launch-blockers` in `D:\Users\ghali\Za3blawy`. Nothing is pushed.
`D:\Users\ghali\TahirElshazli` branch `redesign` is still at `4687787` (checked 2026-10-02) and is an
ancestor of this branch, so the landing is a fast-forward.

| # | Task | Commit |
|---|---|---|
| T1–T7 | see `HANDOFF.md` | committed |
| T8 | REM-080b CSV import + results UI | `aa3073a` |
| T9 | Nine frontend fixes (REM-009/013/014/016/017/018/019/021a/045) | `0aa8203` |
| T10 | Deployment prep (REM-008/011/012/020/021/023/025/027/047/050) | `ef89b96`, `f6959e1` |
| T11 | Legal text + `/privacy`, `/terms` (REM-015) | `58cc6e7`, `1d8c915` |
| — | CSV dates day/month, zoneless = Cairo, `Email` header (`D-67`) | `255013e` (peer session, lead-reviewed) |
| T12a | `weekly_reports` (migration 028) + both repositories | `2c1a73a` |
| T12b | Week maths, composition, hourly generation | `864ff56` |
| T12c | Routes, audit, notifications, migration 029 | `effec86` |
| **T12d** | **Screens — not started** | brief committed: `briefs/T12d.txt` |

**Gates on `effec86`** (run by the lead): lint 0 errors · drift ok · unit **954/59** · e2e **419 across
5 files** · integration **198/198** (001–029 from an empty schema) · both builds · both tsc 0 ·
`npm audit` 0 (as of T10) · both images build on `node:24-alpine` (as of T10).

Weekly reports work end to end on the API (live-checked, see `PROGRESS.md` T12c). What is missing is
only the UI: the console has no Reports page (the nav item is still hidden) and students cannot see
their reports anywhere.

## Decisions in force — do not re-ask
`D-57`…`D-65` (see `HANDOFF.md`), plus:
- **`D-66`** — weekly reports: Saturday 00:00 → Saturday 00:00 **Africa/Cairo** weeks; homework and
  marks cover **tasks due that week**; **assistants have no access** (routes are `/admin/*`).
- **`D-67`** — Google Form CSV: ambiguous numeric dates day/month; zoneless timestamps = Cairo; an
  `Email` header is the respondent email; impossible dates refused. (Closes T8's open point.)
- From the user (2026-10-02): publishing notifies each student in-app; publishing is per
  **group-week only** (no single-student publish, no publish-all-groups).

## Remaining work, in order

### 1. T12d — screens (`briefs/T12d.txt`, committed)
Console nav item "Reports" (admins only) → `/manage/reports` (group-weeks list, drafts as an amber
queue) → `/manage/reports/[groupId]/[weekStart]` (per-student rows, expandable full report,
"Publish N reports" behind a confirmation that says students are notified and it cannot be undone);
student `/marks` gains a "Weekly reports" section above the marks table. Lead's live check after the
subagent: production API + `next start` + headless Chrome — generate drafts (the bootstrap tick does
it; to get non-zero figures, create a session/task dated inside the last completed week first), walk
both screens as teacher (light, dark, `dir="rtl"`, 375 px, the long Arabic name), publish, then the
student's `/marks` and the notification link; assistant sees no Reports item and gets the no-access
state on the URL. Then: tick `REM-031` in `REMEDIATION_PLAN.md`, the readiness line in
`PRODUCTION_READINESS.md` §"Weekly reports", T12 row in `PROGRESS.md`, status line in `T12-PLAN.md`,
and `docs/PHASE_ROADMAP.md` Chat unit 9 → `[x]` with a state note (it still describes the superseded
parent-email/PDF design — say that `D-63`/`D-66` replaced it).

### 2. End of run — exactly `HANDOFF.md` item 6
Final gates on the final tree (every e2e file counted), `npm audit`, both images on Node 24,
migrations **001–029** from an empty schema; production rehearsal with `docker-compose.prod.yml` and
throwaway secrets (migrate CLI, bootstrap-staff CLI, runbook §11 smoke test, journeys T-01…T-15,
`tmp/audit/ui-walk.mjs`, **no CSP violations** in the console); delete scratch data. Docs to the
truth: `PRODUCTION_READINESS.md` (READY FOR DEPLOYMENT or exactly what blocks it),
`REMEDIATION_PLAN.md` boxes, `HOSTINGER_DEPLOYMENT.md`, **new `docs/CLOUDFLARE_SETUP.md`** (DNS,
Full strict, origin cert, R2 bucket + least-privilege token, bucket CORS allowing GET from the site
origin for `components/marking/use-file-bytes.ts`, cache rules that never cache `/staff`, `/admin`
or API responses), `CLAUDE.md` (counts above or newer; §3 file-storage row — DOCX done, `.env.example`
has R2; §3 Dockerfiles row — Node 24 done; §9 migrations 001–029; mention weekly reports' in-process
timer as the second sanctioned timer pattern), `project_log.md`.
Small fix to fold in: add `/var/` to the root `.gitignore` — a local-driver run from the repo root
writes uploads to `var/uploads/` (only `backend/var/` is ignored today); do **not** delete the
existing `var/` contents without the user.

### 3. Land — exactly `HANDOFF.md` item 7
Confirm `TahirElshazli` `redesign` is still `4687787` with no new commits; fast-forward it to this
branch with full history; never force. Final report (commits, gates, what the client must supply:
SMTP, Cloudflare account + R2 bucket, the Hostinger VPS, legal placeholders, real photos and the
WhatsApp number, the first staff identity), exact deploy commands, then ask (multiple choice) whether
to push and/or open a PR.

## How to work (unchanged rules, plus what this session learned)
- **Implementer:** `unit-implementer` subagent, `model: sonnet`, prompt starts with
  "invoke the skill ponytail:ponytail". **agy is out of quota until ~2026-10-04 19:00 (Cairo)**; the
  user has authorised `--dangerously-skip-permissions` for agy runs, so after the reset `/agy-delegate`
  is an option if the user asks for it. Brief → commit → dispatch → **read the full diff** → run every
  gate yourself → live/browser check → one commit per task citing the REM id, "Implemented by the
  unit-implementer subagent; reviewed and gated by the lead", `Co-Authored-By` line.
- **Subagent reports were wrong or incomplete in substance three more times this session** (an
  imported mark shown over the wrong denominator; `autoFocus` defeating the dialog's focus return —
  found only in a real browser; a `pg_dump` that could leave a truncated dump retained as "newest").
  Read the code; test the behaviour, not the claim.
- **Subagents stall or hit the account's usage limit.** If one dies mid-task, `git status` first —
  resume it with `SendMessage` to its id (it keeps its context) rather than re-dispatching; if it
  finished the code but not the gates, run the gates yourself.
- **Junk files:** unquoted `>`, `(`, `)`, `'`, `,` inside shell/`node -e`/`psql` commands create 0-byte
  files in the repo root (`users(id)`, `daysInMonth(y`, `'due'`…). Tell every subagent to quote such
  arguments; delete only after `git ls-files <name>` shows untracked and the file is empty.
- **Peer sessions:** a second Claude session once wrote into this tree concurrently (`255013e`).
  At session start run `ListAgents`; if another session is busy in this repository, ask the user
  before writing anything.
- **Memory (8 GB):** foreground gates, one at a time; never two builds/suites at once. The
  `tahirelshazli-api` container crash-loops and `tahirelshazli-db` idles — the user chose to leave
  them running; do not stop them without asking.
- **e2e on Windows:** `staff.e2e-spec.ts` intermittently dies with `0xC0000409` and no summary; re-run
  it alone (`cd backend && npx vitest run --config ./vitest.config.e2e.ts test/staff.e2e-spec.ts`).
  A file with no count is not a pass.
- **Git Bash path mangling:** an argument starting with `/` (a URL path) becomes a Windows path —
  prefix `MSYS_NO_PATHCONV=1` (this broke the headless-Chrome scripts until found).
- **Live-check recipe** (used for T8–T12c): fresh DB in `remed-pg`
  (`postgresql://dev:devpassword@localhost:55433/<name>`), `node dist/database/cli/migrate.js` and
  `seed.js` with `NODE_ENV=development PERSISTENCE_DRIVER=postgres DATABASE_URL=…`, then
  `node dist/main.js` with `NODE_ENV=production … JWT_SECRET=<32+ chars> CORS_ORIGIN=http://localhost:3100
  FRONTEND_URL=http://localhost:3100 PORT=3101`; frontend built with
  `NEXT_PUBLIC_API_URL=http://localhost:3101` and `next start -p 3100`; headless Chrome on
  `--remote-debugging-port=9333` with `tmp/audit/chrome-profile`; `tmp/audit/api.sh` (`login`, `g`)
  and `tmp/audit/ui-walk.mjs`. Sign in with `/login?next=…` only works for students — staff always
  land on `/manage`, so navigate after login. Stop by port, drop the DB.
- **`.env.example` is permission-blocked** for agents; the user copies files over it.

## Open items to carry (none blocks T12d)
- Follow-ups from T9: admin pages still render their create forms above the no-access message for an
  assistant who types the URL (server refuses every write); the 404 page has no `h1`.
- `staff.e2e-spec.ts` one-off unidentified flake (T2) — not seen again this session.
- Sign-in rate limits count successful attempts too (T4).
- No real R2 round trip yet (no bucket) — a go-live step.
- CSP keeps `'unsafe-inline'` scripts until a nonce middleware exists; `img-src`/`media-src` allow
  `https:` because course thumbnails and recording files are staff-pasted URLs.
- Weekly drafts of the last completed week refresh hourly until published, so a teacher can publish
  content a few minutes newer than what they reviewed; `generateWeek` reads at most 100 groups.
- Fixture quirk: group-2 is named "IGCSE Chemistry — Tuesday" but studies the IELTS course.
