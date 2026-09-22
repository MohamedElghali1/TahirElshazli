# Execution notes — unit 3: Mail

**Executor:** Antigravity (`agy-delegate`, model `claude-opus-4-6-thinking`) for the bulk of the
build, finished by Claude (orchestrator) for the loose ends after Antigravity's quota was
exhausted mid-run. **Date:** 2026-09-21.

## What was built

Exactly the file inventory in `PHASE_PLAN.md`: `backend/src/mail/` (port, `LogMailSender`,
`SmtpMailSender`, `templates.ts`, both `MailDeliveryRepository` drivers, `MailService`,
`MailModule`), migration `016_mail_deliveries.sql`, `env.ts`'s `resolveMailDriver`/
`resolveSmtpConfig`, the `PasswordResetNotifier` fold-in (`AuthService`, `AuthModule`, both
deleted files, the spec files that mocked the old notifier), and the `mail_deliveries` section of
`postgres-repositories.integration-spec.ts`. `nodemailer` + `@types/nodemailer` added, imported
only in `smtp-mail-sender.ts`.

## Deviations from the plan, and why

- Migration uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` where sibling
  migrations (e.g. `002_staff_and_audit.sql`) use plain `CREATE TABLE`/`CREATE INDEX`. Harmless —
  the migration ledger means this only ever runs once — but a style inconsistency worth matching
  next time a migration is authored. Not fixed here; not worth a re-dispatch for a comment-level
  nit.
- `SmtpMailSender` is constructed manually (`new SmtpMailSender(config)`) inside the `MAIL_SENDER`
  factory rather than through Nest's DI container, so its `@Inject(SMTP_CONFIG)` decorator is
  vestigial (harmless — a plain constructor parameter still receives the value). This mirrors how
  `StorageModule` already treats `LocalDiskStorage` differently from a factory-only class; consistent
  with the codebase's existing wiring style for this shape of provider.

## Blocker hit mid-run

Antigravity's own per-account API quota was exhausted partway through (`Individual quota reached...
resets in 4h39m`), after the module, migration, service, and auth fold-in were built and its own
unit-test run reportedly passed, but before it ran lint, attempted the integration suite, or
produced its structured final report. Per the user's standing instruction for this pipeline, the
remainder was finished directly by Claude (orchestrator) rather than waiting ~4.5 hours for the
quota reset:
- Removed one unused-import lint warning in `mail.service.spec.ts` (Antigravity's own code).
- Started the repo's existing (previously stopped) dedicated test-Postgres container
  (`tahir-test-db`, `POSTGRES_DB=tahirelshazli_test`, host port `55432` — **not** the live
  `tahirelshazli-db` container on `5432`, which was never touched) and ran the real integration
  suite against it.
- Verified the full diff file-by-file against the phase plan (scope, PII handling, the
  not-`@Global()` requirement, the nodemailer-confinement requirement) before landing it.

## Tests run, with real output

- `npm test --workspace=backend` → **536 passed, 34 files** (from 517/32 baseline).
- `npm run lint --workspace=backend` → clean except one **pre-existing, unrelated** warning
  (`dashboard.controller.spec.ts`) — left untouched, out of scope.
- `npm run test:integration --workspace=backend` (`TEST_DATABASE_URL` pointed at `tahir-test-db`)
  → **112 passed** (from 110), migration `016` applied cleanly from a schema dropped and recreated
  immediately before the run.

## Documents updated

`IMPLEMENTATION_PLAN.md` (`MAIL-1..3` → `[x]`), `PHASE_ROADMAP.md` (unit 3 → `[x]` COMPLETE, with
verified numbers and the disclosed open items), `CHANGELOG.md`, `project_log.md`. `CLAUDE.md` not
touched — no durable rule changed (the `@Global()` cap held at three; no new architectural
pattern).
