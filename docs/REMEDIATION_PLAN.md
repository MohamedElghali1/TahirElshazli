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

- [x] **REM-001 — First staff account on a fresh production database** · P0 · `AUD-01` — **done** (remediation-1 T1): `node dist/database/cli/bootstrap-staff.js`; verified on an empty DB, login as the created teacher → `/staff/overview` 200, second run no-op, weak password exit 1
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

- [x] **REM-003 — Decision: does launch wait for weekly reports (Unit 9)?** · `AUD-03`
  - **Decided 2026-09-27 (`D-58`): no.** Weekly reports ship after launch and must work well when they
    do. Launch hides the "Reports" nav item (REM-021a); REM-031 moves to Phase 10.

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

- [x] **REM-006 — Decision: file uploads at launch** · `AUD-06`
  - **Decided 2026-09-27 (`D-59`): yes — students upload PDF and DOCX.** REM-030 and REM-082 become
    launch blockers (P0).

- [ ] **REM-030 — S3-compatible (Cloudflare R2) storage driver** · **P0** · `AUD-06`, `D-59`
  - *Affected:* new `common/storage/r2-storage.service.ts` implementing the existing `FileStorage`
    port; `env.ts` `StorageDriver` gains `'r2'` with boot-time validation of its variables (all-or-
    nothing, like `GOOGLE_*`); `app.module`/storage module wiring; `.env.example`.
  - *Change:* use the S3 API R2 speaks. Adding `@aws-sdk/client-s3` + `s3-request-presigner` is
    justified (signing SigV4 by hand is the riskier choice). Private bucket; reads go through
    **short-lived presigned GET URLs** issued only after the existing object-level check (the privacy
    policy promises this). Keep server-minted UUID names and the MIME whitelist.
  - *Acceptance:* unit specs on the driver against a fake; boot refuses a half-configured R2; an
    e2e upload → submit → staff download round trip under the memory driver; one manual round trip
    against a real R2 bucket before go-live. `CLAUDE.md` §3 storage row updated.

- [ ] **REM-082 — DOCX as a submission type** · **P0** · `D-59`
  - *Affected:* `common/storage/upload-types.ts` (add
    `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → `docx`),
    `assessments/submission-rules.ts` (a `docx_upload` mode, or a `document_upload` mode covering PDF
    + DOCX — pick one and say which), task form mode picker, student hand-in screen.
  - *Change:* validate content server-side (DOCX = ZIP magic `PK\x03\x04` plus a
    `word/document.xml` entry; PDF = `%PDF-`), never the client's MIME. Marking: a DOCX is downloaded
    by the marker; the PDF annotation overlay stays PDF-only — say so in the grading UI.
  - *Acceptance:* specs: a renamed `.exe` claiming DOCX is refused; a real DOCX and a real PDF are
    accepted; a DOCX submission shows a download action (no annotation canvas) in grading.

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
  **Timing decided 2026-09-27 (`D-61`):** the real teacher and assistant accounts are created only
  once everything else is ready. REM-001 (the CLI) must still be built and tested before go-live;
  running it on production is a go-live step (REM-060), not before.

- [ ] **REM-080 — Google Form homework by CSV import, with per-student results** · **P1** · `D-60`
  - *Why:* the user wants Google Form homework now, without the Google Forms API; teachers export the
    responses CSV after the deadline and import it. A later automation will fetch at the deadline, so
    both paths must feed **one** ingestion.
  - *Reuse (do not duplicate):* `assessments/google-form-sync.service.ts` already maps a
    `GoogleFormResponse[]` to `NewExternalResult` (email → student matching, per-question answers in
    `raw`) and stores them with the idempotent `work.replaceResults`; the unmatched-response flow
    (`GET /staff/assessments/:id/unmatched`, `POST /staff/results/:id/attach`) and
    `users.google_email` matching already exist.
  - *Change:*
    1. Extract the mapping + `replaceResults` part of `sync()` into
       `ingest(assessmentId, responses, totalPoints)`; `sync()` calls it (behaviour unchanged, its
       specs still pass). This is the seam the future deadline automation calls.
    2. New `POST /staff/assessments/:assessmentId/results/import` (multipart, one `text/csv` file,
       ≤ 2 MB, `StaffScopeService` at the group grain, audited as a new `AuditAction`), usable with
       `GOOGLE_DRIVER=none`. It must not require an `assessment_google_forms` API binding: a
       Google-Form task in CSV mode stores only its responder link.
    3. A small RFC 4180 parser (quoted fields, embedded commas/newlines, UTF-8 BOM, Arabic text) in
       `common/` with its own spec. No new dependency. Map Google's export: `Timestamp`,
       `Email Address` (or `Username`), `Score` (`"7 / 10"` → score 7, max 10), and one column per
       question → `answers[]` with a stable question id (column index + header). Google's CSV has no
       per-question correctness, so per-question results show answer distributions (not right/wrong)
       unless the form was a quiz whose total score is present. `externalId` = a hash of
       timestamp + email + row content, so re-importing the same file is a no-op and an updated
       export replaces the set (existing `replaceResults` semantics).
    4. Analytics like Google Forms "Summary" and "Individual": per question, the answer distribution
       over the matched students in the staff member's reach; per student, their answers, score over
       its denominator, and submission time. Extend the existing
       `/staff/assessments/:assessmentId/analytics` and `/results` rather than adding parallel routes;
       the student sees only their own answers and score (after the deadline).
    5. Frontend: an "Import responses (CSV)" action on the task results screen with a preview (rows,
       matched, unmatched, errors) before committing; the existing unmatched-resolution UI.
  - *Security:* CSV cells beginning `=`, `+`, `-`, `@` are data, never re-exported unescaped into the
    mark-book CSV (formula injection); size and row caps; all text rendered as text.
  - *Acceptance:* parser specs over a real Google export (English and Arabic headers and answers);
    importing twice yields the same rows; unmatched rows can be attached; an assistant cannot import
    into a task for an unheld group; analytics numbers match a hand count for a 30-row fixture;
    `API_SPEC.yaml` updated.

- [ ] **REM-081 — Parent/guardian consent at registration** · **P0** (legal) · `docs/legal/privacy-policy.md` §5
  - *Why:* most IGCSE students are under 18; Egypt's PDPL (Law 151/2020) requires a guardian's
    consent, and the privacy policy says it is collected. Today `/auth/register` takes name, email
    and password only.
  - *Change:* registration asks whether the student is under 18; if so, a required guardian name and
    guardian email plus a consent checkbox linking `/privacy`; store the consent (who, when, policy
    version) on the student profile via a numbered migration; staff see it on the student record and
    in the acceptance queue. Exact wording and whether a confirmation email to the guardian is
    required: **client + lawyer decision** (record it).
  - *Acceptance:* an under-18 registration without consent is 400; the consent row is visible to
    staff; both repositories and a migration run from empty.

- [ ] **REM-016b — Replace placeholder content on the public site** · **P1** · `AUD-16`
  - *Why:* the About and home pages show random stock photos from `picsum.photos` as Dr. Tahir's
    portrait (7 `photo()` calls, `lib/site-content.ts`, `app/(site)/page.tsx:90`,
    `app/(site)/about/page.tsx:54`), and the WhatsApp number is `201000000000` (footer, contact
    page, in-app Help).
  - *Change:* the client supplies real photos (served from `frontend/public/`) and the real number;
    remove `picsum.photos` from `next.config.ts` `remotePatterns`.
  - *Acceptance:* `grep -r picsum frontend` is empty; the WhatsApp link opens the real chat.

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

- REM-030 (R2) and REM-080 (CSV import) are specified in Phase 1; REM-031 (weekly reports) is Phase 10.
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
- [~] **REM-015 — Privacy and terms pages** · P1 · `AUD-15` — **privacy policy drafted**
  (`docs/legal/privacy-policy.md`; placeholders and the product promises it depends on are listed in
  `docs/legal/README.md`). Remaining: lawyer review, placeholders, Arabic version, terms of use, and the
  `/privacy` + `/terms` pages in `app/(site)/` rendering the text as paragraphs (no raw HTML).
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

## Phase 10 — After launch

- [ ] **REM-031 — Weekly reports (Unit 9, `RPT-1…9`)** · `AUD-03`, `D-58` — "must function well after
  launch": run through `/redesign-phase 9`; on-demand only (`D-3`); pure composition over attendance,
  submissions (including imported Google Form results, REM-080) and progress; send is teacher/admin,
  needs `reviewed` + a guardian email with recorded consent (REM-081), audited, irreversible, no
  send-to-all. Re-enable the "Reports" nav item (reverse REM-021a) when it lands. Depends on REM-004.
- [ ] **REM-083 — Fetch Google Form responses automatically at the deadline** · `D-60` — a later step:
  call the existing API `sync()` (which already routes through the `ingest()` seam REM-080 extracts)
  once per task when its deadline passes. Needs the client's Google OAuth client (`GOOGLE_DRIVER=google`)
  and one scheduling decision (an in-process timer is enough on one replica; no queue — `CLAUDE.md` §5).
