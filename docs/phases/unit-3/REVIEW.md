# Review — unit 3: Mail

**Reviewer:** Claude (orchestrator, same continuous session — custom pipeline for units 3-5, see
`PHASE_PLAN.md`'s header note) · **Date:** 2026-09-21

## Verdict: **APPROVED**

## What was actually checked (not the self-report)

- Read every new/changed source file in `backend/src/mail/`, the migration, the `env.ts` additions,
  and the `AuthService`/`AuthModule` fold-in myself, line by line, against `PHASE_PLAN.md` §2.
- Re-ran `npm test --workspace=backend` independently: **536 passed, 34 files.**
- Re-ran `npm run lint --workspace=backend` independently: clean but for one pre-existing warning
  unrelated to this diff, left alone.
- Started the repo's dedicated (previously-stopped) test-Postgres container and ran
  `npm run test:integration --workspace=backend` against it from an empty schema: **112 passed**,
  migration `016` applied without incident. This is the actual `CLAUDE.md` §9 gate, not a claim.
- `git status --porcelain`: every changed/created/deleted path is inside the scope the brief named
  (`backend/src/mail/`, the one new migration, the `auth/` fold-in, `env.ts`/`env.spec.ts`, the
  integration spec, `package.json`/lockfile, `docs/phases/unit-3/`). Nothing in `frontend/` or any
  other module touched.
- `grep`ed for dangling references to the deleted `PasswordResetNotifier`/`PASSWORD_RESET_NOTIFIER`
  across the whole backend: the only remaining hit is a prose mention inside a doc comment in
  `log-mail-sender.ts` ("mirrors `LoggingPasswordResetNotifier`'s approach") — not a code reference.
- `grep`ed for `nodemailer` across `backend/src`: only imported in `smtp-mail-sender.ts` (`env.ts`
  mentions the package name in a doc comment, not an import). Exit criterion satisfied.
- Confirmed `MailModule` is not `@Global()` and is imported explicitly by `AuthModule` only.
- Confirmed `mail_deliveries` — both the table and both repository `record()` methods — accepts and
  stores only `id`/`recipient`/`template`/`created_at`; `MailService.send` never passes `data` or a
  rendered subject/html to the repository.
- Confirmed `LogMailSender.send` logs only the template name (`this.logger.log(`[mail]
  template=${input.template}`)`) — no recipient, no data.
- Confirmed `MailService.send` throws when `!this.db.inTransaction`, and that
  `AuthService.requestPasswordReset` — previously **not** transaction-wrapped, a genuine gap this
  unit closes — now wraps the token write and the mail send in one `runInTransaction` call.

## Findings

None blocking. Two non-blocking notes, both already recorded as disclosed decisions rather than
silent gaps:

1. **Minor style deviation** — migration `016` uses `CREATE TABLE IF NOT EXISTS` /
   `CREATE INDEX IF NOT EXISTS`; sibling migrations use the plain form. Harmless under the
   migration ledger (each migration runs exactly once); noted in `EXECUTION_NOTES.md` for the next
   migration author to match convention, not worth a rework cycle on its own.
2. **B-1 (provisional template data shapes)** and **B-2 (`log` driver not refused in production)**
   from `PHASE_PLAN.md` §6 stand as disclosed, reasoned decisions — not defects. Both are recorded
   in `PHASE_ROADMAP.md`'s unit-3 entry for whoever lands units 5/9/10 to revisit.

## Security checklist applied (`CLAUDE.md` §8)

Parameterised SQL only (both new repositories use `$1`/`$2`/... placeholders) · no PII or secret in
any log line this unit adds · SMTP credentials only via env vars, validated at boot, never
hardcoded · no new route/role/permission surface, so no new refusal test was required · secrets
never committed (checked `package.json`/lockfile diff — only version pins, no embedded config).

## Completion protocol (`PHASE_ROADMAP.md` §2) — all nine

1. Plan produced and approved (this session, `PHASE_PLAN.md`) — ✅
2. Executor (Antigravity, finished by the orchestrator after a quota exhaustion) completed the
   approved scope — ✅
3. This review: **APPROVED** — ✅
4. Tests: unit 536/536, integration 112/112 against real Postgres from empty schema — ✅ (real
   output above, not asserted)
5. Security checklist applied — ✅ (above)
6. Docs updated: `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, `CHANGELOG.md`, `project_log.md` — ✅
   (`API_SPEC.yaml` not touched — this unit adds no route; `CLAUDE.md` not touched — no durable rule
   changed)
7. `IMPLEMENTATION_PLAN.md` task statuses updated (`MAIL-1..3` → `[x]`) — ✅
8. `PHASE_ROADMAP.md` unit status updated (`[x]` COMPLETE) — ✅
9. Zero unresolved blockers in scope — ✅ (B-1/B-2 are disclosed decisions, not blockers)
