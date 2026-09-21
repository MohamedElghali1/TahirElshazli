# Phase plan — unit 3: Mail

**Planner:** Claude (orchestrator, this session — custom pipeline, see
[[ponytail-antigravity-pipeline]] / `docs/phases/unit-3/` note below) · **Date:** 2026-09-21 ·
**Branch:** `redesign` · **Base:** `e029336`
**Input read:** `PHASE_ROADMAP.md` §4 (unit 3), `IMPLEMENTATION_PLAN.md:171-175` (`MAIL-1..3`),
`CLAUDE.md` §3/§5/§6/§8/§9, the existing `FileStorage`/`UploadsService`/`StorageModule` port
(`backend/src/common/storage/`), `AuditService`/`AuditModule` (`backend/src/audit/`) for the
transaction-required-write pattern, `PasswordResetNotifier` + `LoggingPasswordResetNotifier` +
their call site in `AuthService.requestPasswordReset`, `repository.provider.ts`, `env.ts`'s
`resolveStorageDriver`, migration `002_staff_and_audit.sql` (table-design convention),
`backend/test/postgres-repositories.integration-spec.ts`.

**Note on process:** this unit runs through the custom pipeline the user asked for instead of
`/redesign-phase` — Claude plans and reviews in one continuous session, Antigravity implements via
`agy-delegate`. The roadmap's artifact names and completion protocol still apply.

---

## 1. Scope

### IN

| Task | What |
|---|---|
| `MAIL-1` | `MailSender` port (interface + `none\|log\|smtp` drivers), `MAIL_DRIVER` resolved once in `env.ts` exactly like `STORAGE_DRIVER`, 503 when unconfigured. Fold `PasswordResetNotifier` onto it — delete the old interface/class, `AuthService` calls the new port. |
| `MAIL-2` | `mail_deliveries` table (migration `016`) + both repository drivers, written in the same transaction as the action that triggered the send. Row stores **recipient and template only**, never the body. |
| `MAIL-3` | The four template renderers: password-reset (has a real caller today), invitation / sign-in-link / report / announcement (defined now per the roadmap's explicit scope for this unit; their real callers arrive in units 5/9/10 — see B-1). |

### OUT, and why

| Not in scope | Reason |
|---|---|
| Wiring invitation / sign-in-link / report / announcement sends into real flows | Those features don't exist yet — units 5 (`AUTH-4`, `PEOPLE-3`), 9 (`RPT-6`), 10 (`ANN-4`). This unit only builds the port and the four renderers those units will call. |
| Any frontend change | Mail has no UI surface in this unit. |
| A generic `find`/list method on `MailDeliveryRepository` | Nothing in scope reads deliveries back. Don't build a query path nobody asked for. |
| A 4th `@Global()` Nest module | `CLAUDE.md` §5 caps this at three (`DatabaseModule`, `AuditModule`, `GroupDataModule`) and explicitly says to resist a fourth. `MailModule` is imported explicitly by `AuthModule` (and by units 5/9/10 later), not made global. |

---

## 2. Design (mirrors two existing patterns, invents nothing new)

**The port** (`backend/src/mail/interfaces/mail-sender.interface.ts`) — shaped exactly like
`FileStorage`:
```ts
export type MailTemplate = 'password-reset' | 'invitation' | 'sign-in-link' | 'report' | 'announcement';
export interface SendMailInput { to: string; template: MailTemplate; data: Record<string, string>; }
export interface MailSender { send(input: SendMailInput): Promise<void>; }
export const MAIL_SENDER = Symbol('MAIL_SENDER');
```
- `LogMailSender` — mirrors `LoggingPasswordResetNotifier`: logs the **template name only**, never
  the recipient (PII, `CLAUDE.md` §8) or `data` (may carry a live token).
- `SmtpMailSender` — real transport via `nodemailer` (**new dependency** — no lighter option exists
  for real SMTP delivery with TLS/auth; used only inside this one file, nothing else imports it,
  satisfying the unit's "no consumer imports an SMTP SDK directly" exit criterion). Reads
  `MAIL_SMTP_HOST/PORT/USER/PASS/FROM` from env; missing values throw at construction (boot-time
  validation, mirrors `resolveStorageDriver`'s production refusal shape).
- `templates.ts` — one pure `renderTemplate(template, data): { subject: string; html: string }`,
  a small `switch`/map, one case per `MailTemplate`. Only `SmtpMailSender` calls it — `LogMailSender`
  must not render or log the body.
- `env.ts` additions: `MailDriver = 'none' | 'log' | 'smtp'`, `VALID_MAIL_DRIVERS`,
  `resolveMailDriver(nodeEnv, raw = process.env.MAIL_DRIVER)` — same shape as
  `resolveStorageDriver`: unset → `'none'` in production, `'log'` otherwise; invalid value throws.
  **No production refusal for `'log'`** (unlike `STORAGE_DRIVER=local`) — a swallowed email is not a
  data-loss risk the way an orphaned upload is, and `MAIL-1`'s own wording only requires "503 when
  unconfigured," not a refused combination. Flag if this reasoning turns out wrong (B-2).

**The delivery record** (`backend/src/mail/interfaces/mail-delivery-repository.interface.ts`),
mirrors `AuditLogRepository` reduced to what's needed:
```ts
export interface MailDelivery { id: string; recipient: string; template: string; createdAt: string; }
export interface NewMailDelivery { recipient: string; template: string; }
export interface MailDeliveryRepository { record(entry: NewMailDelivery): Promise<MailDelivery>; }
export const MAIL_DELIVERY_REPOSITORY = Symbol('MAIL_DELIVERY_REPOSITORY');
```
`InMemoryMailDeliveryRepository` + `PostgresMailDeliveryRepository`, wired via the existing
`repositoryProvider<T>()` helper — no new wiring pattern.

**The orchestrating service** (`backend/src/mail/mail.service.ts`), combines
`UploadsService`'s 503-when-unconfigured with `AuditService.record`'s
throws-outside-a-transaction contract — both patterns already exist separately, this is the first
caller that needs both at once:
```ts
async send(input: SendMailInput): Promise<void> {
  if (!this.sender) throw new ServiceUnavailableException('Mail is not configured on this server.');
  if (!this.db.inTransaction) throw new Error(
    `Refusing to send mail (template="${input.template}") outside a transaction...`);
  await this.sender.send(input);
  await this.deliveryRepo.record({ recipient: input.to, template: input.template });
}
```

**`mail.module.ts`** — NOT `@Global()`. Providers: `MailService`, `LogMailSender`,
`SmtpMailSender`, both repositories, the `MAIL_SENDER` factory (resolves the driver, returns `null`
for `'none'`), the `repositoryProvider` binding for `MAIL_DELIVERY_REPOSITORY`. Exports
`MailService`. `AuthModule` imports it.

**`AuthService`**: inject `MailService` in place of `PASSWORD_RESET_NOTIFIER`/
`PasswordResetNotifier`. Delete `backend/src/auth/interfaces/password-reset-notifier.interface.ts`
and `backend/src/auth/logging-password-reset-notifier.ts`, and the provider entry in
`auth.module.ts`. `requestPasswordReset` currently is **not** transaction-wrapped — it must become:
```ts
await this.db.runInTransaction(async () => {
  await this.userRepo.createPasswordResetToken(user.id, token, expiresAt);
  await this.mail.send({ to: user.email, template: 'password-reset', data: { token, expiresAt } });
});
```
so the token write and its delivery row commit together (`CLAUDE.md` §9). Update
`auth.service.spec.ts` / `auth.controller.spec.ts` mocks that reference the old notifier.

**Migration `016_mail_deliveries.sql`** — mirrors `audit_log`'s shape, minus what this table
doesn't need (no before/after, no actor, no course scoping — it isn't an audit trail):
```sql
CREATE TABLE mail_deliveries (
  id          TEXT PRIMARY KEY,
  recipient   TEXT NOT NULL,
  template    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mail_deliveries_recipient_idx ON mail_deliveries (recipient, created_at DESC);
```
No FK on `recipient` — it's a plain email string, not necessarily a live `users.id` (mirrors
`audit_log`'s no-FK reasoning, simpler case).

**`backend/package.json`**: add `nodemailer` (+ `@types/nodemailer` in devDependencies) — the one
new dependency this unit needs, confined to `smtp-mail-sender.service.ts`.

---

## 3. Tests required

- `mail.service.spec.ts` (new, mirrors `audit.service.spec.ts`'s shape): unconfigured driver → 503;
  configured driver → calls `sender.send` then `deliveryRepo.record`; throws when called outside
  `runInTransaction`.
- `env.ts`'s existing driver-resolution spec file gains `resolveMailDriver` cases: default per
  `NodeEnv`, invalid value throws. (Find the file that tests `resolveStorageDriver` today and add
  alongside it — don't create a new spec file for one function if one already covers the sibling.)
- `auth.service.spec.ts` / `auth.controller.spec.ts`: update the mocked collaborator from
  `PasswordResetNotifier` to `MailService`; assert `requestPasswordReset` still succeeds and now
  sends a `template: 'password-reset'` mail.
- `templates.ts` gets its own small spec: each of the five templates renders with the given `data`
  and produces non-empty `subject`/`html` — a smoke check, not a design review of copy.
- `backend/test/postgres-repositories.integration-spec.ts`: add `mail_deliveries` coverage
  (`PostgresMailDeliveryRepository`) following the file's existing per-table `describe` pattern.
  **This suite self-skips without `TEST_DATABASE_URL`** — if no local Postgres is available, say so
  plainly rather than claiming the migration was verified against real Postgres (`CLAUDE.md` §9's
  gate).

---

## 4. Security checklist (`CLAUDE.md` §8, applied)

- Parameterised SQL only in both new repositories.
- `mail_deliveries` stores recipient + template, **never** `data` or the rendered subject/html.
- `LogMailSender` logs the template name only — no recipient (PII), no `data`.
- SMTP credentials come from env vars only, never logged, never hardcoded.
- No new route, no new role, no new permission surface in this unit — no refusal test required
  beyond the existing coverage (this unit is pure backend infrastructure).

---

## 5. Definition of done for this unit

Universal criteria (`PHASE_ROADMAP.md` §3) plus the unit's own: no module outside
`smtp-mail-sender.service.ts` imports `nodemailer` or any SMTP SDK directly. `npm test` stays green
(currently 517 tests / 32 files, confirmed at session start). Both repository drivers exist for
`mail_deliveries`. `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`, and `CHANGELOG.md` updated at
close per `CLAUDE.md` §12.

---

## 6. Open items, disclosed rather than guessed silently

- **B-1**: the invitation/sign-in-link/report/announcement templates are built ahead of their real
  callers (units 5/9/10 don't exist yet). Their `data` field shapes are my best guess at what those
  units will need (an invite link, a sign-in link, a report URL, an announcement title+body) and
  **may need adjusting** when the real caller lands — that's expected, not a defect now.
- **B-2**: `'log'` is not refused in production the way `STORAGE_DRIVER=local` is. If this is wrong,
  say so before unit 3 closes and I'll add the refusal.
- **B-3**: the Postgres integration run for migration `016` depends on `TEST_DATABASE_URL` /
  Docker Postgres being available in this environment — unverified until the review step actually
  attempts it.
