# Remediation plan — from audit to production

Source: `docs/PROJECT_AUDIT.md` (2026-09-27). Each task names its finding (`AUD-nn`). Tick a box only
when its **verification** has been run and passed, and record the evidence in
`docs/IMPLEMENTATION_PLAN.md` as usual (`CLAUDE.md` §12).

**How code tasks are executed.** At the user's instruction, code changes go through the
`/agy-delegate` workflow (Antigravity implements, the lead reviews the diff and lands it), one task
per brief, on a branch rather than `main` (`CLAUDE.md` §12). Every brief below already names the
files, the change and the acceptance check. Keep the lean, reuse-first discipline: each fix reuses
an existing pattern in this repository and names it.

**Status key:** `[ ]` open · `[~]` in progress · `[x]` verified · `[?]` waiting on a client decision

---

## Phase 0 — Audit baseline `[x]`

- [x] **REM-000** — Full audit, dynamic verification, documents. Evidence: `docs/PROJECT_AUDIT.md` §5.

---

## Phase 1 — Release blockers (P0) and the decisions that gate scope

- [ ] **REM-001 — First staff account on a fresh production database** · P0 · `AUD-01`
  - *Why:* a fresh install has no way to sign in as staff (verified live).
  - *Affected:* new `backend/src/database/cli/bootstrap-staff.ts`; `backend/package.json` script.
  - *Change:* mirror `cli/migrate.ts` (`NestFactory.createApplicationContext`, no HTTP). Read
    `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_ROLE` (`teacher`|`admin`, default `teacher`).
    Refuse (exit 0 with a message) if any `teacher`/`admin` exists. Create the user `active` through
    `UserRepository.create` with the existing `PasswordHasher`; take the password from
    `BOOTSTRAP_PASSWORD` (≥ 12 chars, never logged). Record an audit entry inside a transaction
    (actor `system`) if `AuditService` permits it, otherwise document why not.
  - *Depends on:* REM-010 (who is first: teacher or admin).
  - *Acceptance:* on an empty migrated DB, the CLI creates exactly one active staff user who can log
    in; a second run changes nothing; a unit spec covers both; works inside the runtime image via
    `node dist/database/cli/bootstrap-staff.js`.
  - *Verify:* rerun `PROJECT_AUDIT` P-05/P-08 against a fresh database.

- [ ] **REM-002 — Narrow the course-named staff routes to held groups (`AUTH-6` remainder)** · P0 · `AUD-02`
  - *Why:* a group-scoped assistant reads other cohorts' roster and analytics (verified live, T-13).
  - *Affected:* `manage/manage.service.ts:182` (`roster`), `manage/work-analytics-gate.service.ts`
    (`assertMayRead`, `studentWork`), `manage/assessment-authoring.service.ts:594` (`list`), and
    PATCH/DELETE of a task shared with an unheld group.
  - *Change:* reuse `StaffScopeService.reachableGroupIds` exactly as `GET /staff/tasks` and
    `grading.service.ts` `queue` already do; filter members/submissions to held groups; a task shared
    with any unheld group is read-only for a scoped assistant (403 on write — it is listed on their
    own screen, so 404 would lie, `CLAUDE.md` §7).
  - *Acceptance:* new e2e cases in `test/staff.e2e-spec.ts` (no sixth e2e file): scoped assistant
    sees only held-group students on roster/analytics/list; `all_groups` assistant and teacher
    unchanged; refusal tests both directions. `docs/AUTHORIZATION_MODEL.md` and `CLAUDE.md` §7 updated;
    `AUTH-6` closed in `IMPLEMENTATION_PLAN.md`.
  - *Interim, until done:* create assistants with scope `all_groups` only.
  - *Verify:* rerun T-13 → roster must not list the unheld student.

- [?] **REM-003 — Decision: does launch wait for weekly reports (Unit 9)?** · P0 decision · `AUD-03`
  - *Why:* the roadmap's "flagship" has 0 of 9 routes; the staff "Reports" item 404s.
  - *Options:* (a) launch without reports, hide the nav item (REM-021a), build Unit 9 next;
    (b) build Unit 9 first (REM-031), then launch.
  - *Acceptance:* the decision is recorded in `docs/CHANGELOG.md` with its date.

- [ ] **REM-004 — Provision SMTP and make mail configuration explicit** · P0 (config) · `AUD-04`
  - *Why:* without SMTP, production cannot create students, reset passwords, invite assistants or
    publish announcements (verified live).
  - *Affected:* client provides SMTP; `.env.example` (with REM-012); `docs/HOSTINGER_DEPLOYMENT.md` §4.
  - *Acceptance:* with `MAIL_DRIVER=smtp` and real credentials on a staging box, a password reset
    email arrives and its link works; `mail_deliveries` gets a row.
  - *Depends on:* client.

- [ ] **REM-005 — Announcement publish must not be all-or-nothing on mail** · P1 · `AUD-05`
  - *Affected:* `announcements/announcements.service.ts:201-243`; `mail/smtp-mail-sender.ts`.
  - *Change:* keep publish + notification fan-out + audit in the transaction; per recipient, try
    `mail.send` and collect failures instead of throwing (a 503 from `MAIL_DRIVER=none` counts as
    "not emailed"). Return `{ emailed, failed }` with the published announcement so the UI can say
    "published; 3 emails could not be sent". Set nodemailer `pool: true` (bounded `maxConnections`)
    in `SmtpMailSender`. **Do not** use `Promise.all` (a failure would roll back after most mails
    left — the skeptic review's finding).
  - *Acceptance:* unit spec: publish with the null sender commits, creates notifications, reports
    `emailed: 0`; a sender that fails for one recipient still commits and writes delivery rows for
    the others; the frontend composer shows the counts.
  - *Verify:* rerun T-14 → announcement published, notifications created.

- [?] **REM-006 — Decision: file uploads at launch** · P1 decision · `AUD-06`
  - *Options:* (a) links and typed answers only (as for recordings); hide upload affordances when
    `/staff/uploads/config` says `enabled:false` (check they already are); (b) build REM-030.
  - *Acceptance:* decision recorded in `docs/CHANGELOG.md`.

- [ ] **REM-007 — Rate limits that survive a classroom** · P1 · `AUD-07`
  - *Affected:* `common/rate-limit/rate-limit.guard.ts` (`buildKey`), `limits.ts`, `auth.controller.ts`.
  - *Change:* for login and password-reset request, key on `IP + normalised email` and count only
    failed attempts (reset on success); raise the register ceiling (e.g. 30 per 10 min per IP) while
    keeping the per-IP global limit. No new store — reuse the in-memory store.
  - *Acceptance:* unit specs: 30 different accounts succeed from one IP within a minute; the 6th
    failed attempt for one email is 429; a success resets that email's counter.

- [ ] **REM-008 — Patch vulnerable dependencies** · P1 · `AUD-08`
  - *Change:* `npm audit fix` (lockfile only; no major bumps). If multer cannot move without a Nest
    major, pin via `overrides` in the root `package.json`.
  - *Acceptance:* `npm audit` reports 0 high; all suites green.

- [ ] **REM-009 — Visible labels on assistant scope checkboxes** · P1 · `AUD-09`
  - *Affected:* `frontend/app/(app)/manage/assistants/page.tsx:186-203`.
  - *Change:* pair each `Checkbox` with a visible label exactly as `manage/tasks/task-form.tsx:499-506`.
  - *Acceptance:* the Invite/Edit panels show each group's name next to its box; lint and tsc clean.

- [?] **REM-010 — Decision: the first staff identity** (teacher `Dr. Tahir` or a separate admin) · feeds REM-001.

---

## Phase 2 — Core functionality fixes

- [ ] **REM-013 — Grading dialog focus trap** · P1 · `AUD-13` — copy `CurriculumDrawer`'s effect
  (`lessons/page.tsx:430-468`) into `GradeDialog`. *Acceptance:* Tab cycles inside, Escape closes,
  focus returns to the opener. Consider extracting one `Dialog` primitive into `components/ui/` only
  if a second caller adopts it in the same change.
- [ ] **REM-014 — Remove the dead "Assistants" course tab** · P1 · `AUD-14` —
  `manage/courses/[id]/layout.tsx:54`. *Acceptance:* no link to `/staff` remains; walk U-04 clean.
- [ ] **REM-016 — Fix announcement notification links** · P2 · `AUD-20` — `announcements.service.ts:231`:
  link to `/dashboard` (where announcements render) or `null`; migration-free. Also fix the
  in-memory fixture links. *Acceptance:* U-02 shows no `/learn` requests.
- [ ] **REM-017 — Assistant navigation matches capability** · P2 · `AUD-22` — hide admin-only items
  for `assistant` using the existing capability preset (`lib/roles.ts`), not a new rule.
  *Acceptance:* U-05 shows no page rendering "Forbidden resource".
- [ ] **REM-018 — Error and not-found boundaries** · P2 · `AUD-23`, `AUD-28` — add `app/not-found.tsx`,
  `app/error.tsx`, `app/global-error.tsx` from existing UI primitives.
- [ ] **REM-019 — Correct the recording copy and drop Bunny detection** · P2 · `AUD-24`, `AUD-36` —
  replace the false "signed per request" hint; remove the `bunny` branch and comments from
  `recording-player.tsx` and `create-recording.dto.ts`. Keep YouTube/Vimeo embeds unless the user
  wants every recording to be a plain outbound link.

---

## Phase 3 — API / backend completion

- [ ] **REM-031 — Weekly reports (Unit 9, `RPT-1…9`)** · P0 if REM-003 = (b) · `AUD-03` — run through
  `/redesign-phase 9`; on-demand only (`D-3`); send is teacher/admin, needs `reviewed` + `parentEmail`,
  audited, no send-to-all. Depends on REM-004 (mail).
- [ ] **REM-030 — S3-compatible (R2) storage driver** · only if REM-006 = (b) · `AUD-06` — implement the
  existing `FileStorage` port; signed GET URLs; `STORAGE_DRIVER=r2` with boot-time validation; both
  test levels.
- [ ] **REM-032 — Validate task `externalUrl`** · P2 · `AUD-41` — add `@IsPublicHttpUrl()` (already used
  by `zoomLink`); a `javascript:` negative test.
- [ ] **REM-033 — Cap the notification list** · P2 · `AUD-40` — `LIMIT 50` in both repositories.
- [ ] **REM-034 — Batch `expectedStudentIds`** · P3 · `AUD-44` — use `findMembersForGroups`.
- [ ] **REM-035 — Notify the student when work is returned** · P3 · `AUD-43` — product decision first.
- [ ] **REM-036 — Remove `GET /courses/catalog` and duplicate `api.ts` functions** · P3 · `AUD-45`.

## Phase 4 — Frontend completion

- [ ] **REM-021a — Hide the "Reports" nav item until Unit 9 exists** · P2 · `AUD-21`.
- [ ] **REM-040 — Session expiry that does not lose work** · P2 · `AUD-25` — minimal: set
  `JWT_EXPIRY=8h` for production (the denylist already handles logout) and document the trade-off;
  larger (refresh cookie) only if the client asks.
- [ ] **REM-041 — RTL: decide how Arabic is reached** · P2 · `AUD-29` — `dir="auto"` on user text is
  done; a site-level direction switch is a product decision.
- [ ] **REM-042 — Close the token-checker gaps** · P3 · `AUD-30` — teach `check-tokens.mjs` the
  `text-(length:--x)` shorthand and unknown-utility names; fix the five sites it then reports.
- [ ] **REM-043 — Quizzes page N+1** · P3 · `AUD-31`.
- [ ] **REM-045 — Greeting uses the display name correctly** · P3 · `AUD-35`.
- [ ] **REM-015 — Privacy and terms pages** · P1 · `AUD-15` — client supplies text; pages in `app/(site)/`.
- [ ] **REM-027 — `robots.ts` and `sitemap.ts`** · P2 · `AUD-27` — Next metadata routes; sitemap from
  the public courses and blog endpoints; disallow `/manage`, `/dashboard`.

## Phase 5 — Security hardening

- [ ] **REM-046 — Hash one-time tokens at rest** · P2 · `AUD-42` — SHA-256 on write and lookup for
  password-reset and invitation tokens; a migration that invalidates outstanding plaintext rows.
- [ ] **REM-047 — Web security headers** · P2 · `AUD-26` — `headers()` in `next.config.ts`
  (CSP matching the API origin, `X-Frame-Options`, `Referrer-Policy`, `nosniff`),
  `poweredByHeader: false`. Verify no console CSP violations on U-01…U-05.
- [ ] **REM-048 — Seed CLI refuses a non-local database unless explicitly forced** · P3 · `AUD-38`.
- [ ] **REM-049 — Per-account login lockout** · P3 — after REM-007, a short lockout per email.
- [ ] **REM-051 — Global exception filter for consistent logs** · P3 · `AUD-46` — hardening only; the
  response shape is already safe.

## Phase 6 — Performance and reliability

- [ ] **REM-052 — Validate `DATABASE_POOL_MAX`** · P3 · `AUD-47` — a `resolve*` function like the others.
- [ ] **REM-044 — Frontend test gate** · P3 — CI has no frontend runtime test; at minimum make the
  lead's CDP walk (`tmp/audit/ui-walk.mjs`) a documented smoke script, or add one Playwright smoke if
  the team wants a dependency.

## Phase 7 — Hostinger deployment preparation

- [ ] **REM-011 — Node 22/24 in images and CI** · P1 · `AUD-10` — both Dockerfiles (both stages), `ci.yml`
  `NODE_VERSION`, `frontend/package.json` `@types/node`. *Acceptance:* images build; unit, e2e and
  integration green under the new base.
- [ ] **REM-012 — Rewrite `.env.example` from `env.ts`** · P1 · `AUD-12` — remove the 13 unread
  variables; add storage, mail (+5), `FRONTEND_URL`, `INTERNAL_API_URL`, pool, SSL mode;
  `TRUSTED_PROXY_HOPS=2` for Cloudflare + nginx.
- [ ] **REM-020 — `docker-compose.prod.yml`** · P1 · `AUD-11` — exactly `HOSTINGER_DEPLOYMENT.md` §5.1.
- [ ] **REM-021 — nginx site config in the repo** (`deploy/nginx/tahirelshazli.conf`) · P1 · §5.2.
- [ ] **REM-022 — Real deploy job** · P3 — SSH + runbook §8 option B, gated on `DEPLOY_ENABLED`.
- [ ] **REM-023 — `backup.sh` + cron** · P1 — nightly and pre-deploy `pg_dump -Fc`, off-host copy.
- [ ] **REM-024 — Restore rehearsal** · P1 — restore a dump into a scratch DB and boot the API on it.
- [ ] **REM-025 — Origin firewall to Cloudflare ranges** · P1 — required for `TRUSTED_PROXY_HOPS=2`.
- [ ] **REM-050 — Remove tracked junk files** `0`, `1036`, `and`, `backend/{const` · P3. *Root cause
  (observed during the audit, when five more appeared and were deleted):* agent shell commands run
  through `cmd.exe` with an unquoted `>` inside a search pattern, which redirects to a file named after
  the next token. Check `git status` for 0-byte files before every commit.
- [ ] **REM-053 — Update `docs/` for drift** — `CLAUDE.md` counts and stack rows (partly done in this
  audit), `docs/SECURITY.md` (recordings no longer signed), `README.md` quick-start mail note.

## Phase 8 — Production deployment

- [ ] **REM-060** — Execute `HOSTINGER_DEPLOYMENT.md` §7 on the VPS. *Depends on:* every P0/P1 above,
  or an explicit, recorded client waiver.

## Phase 9 — Post-deployment verification

- [ ] **REM-070** — Smoke test §11 through Cloudflare (all four checks).
- [ ] **REM-071** — Re-run T-01…T-15 against production with a throwaway student (then delete it).
- [ ] **REM-072** — Reboot the VPS; confirm all containers return and the smoke test passes.
- [ ] **REM-073** — External uptime monitor on `/public/courses` and `/`; alert to the client.
- [ ] **REM-074** — First nightly backup present off-host; restore rehearsal repeated on it.
- [ ] **REM-075** — One week later: `docker stats` and `pg_stat_activity` review; resize the plan if needed.
