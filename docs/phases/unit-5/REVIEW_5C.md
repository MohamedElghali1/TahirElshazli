# Review — unit 5, slice 5c: `PEOPLE-4`/`PEOPLE-5`/`PEOPLE-6`/`AUTH-4` (assistants)

**Implementer/reviewer:** Claude (orchestrator, done directly — one agent throughout, per the user's
standing instruction) · **Date:** 2026-09-21

## Verdict: **APPROVED WITH FOLLOW-UP**

Two follow-ups, both disclosed below rather than guessed past: no integration run against real
Postgres (environment has no Docker), and no interactive browser verification (the Chrome
automation tool's renderer hung — reported as a product bug, curl-based live verification
substituted).

## What was built

**Migration**: `017_assistant_invitations.sql` — `assistant_invitations` table, no `user_id` column
(accepting is what creates the user, in one transaction), a partial index on `email` for pending
rows, a plain index on `token`. `name` is on the row despite `DATABASE_PLAN.md`'s terse column list
omitting it — the invite body requires it and there is nowhere else for it to live before an account
exists; noted as an omission in that list's shorthand, not a deviation, in the migration's own
comment.

**Backend**:
- `manage/interfaces/assistant-invitation-repository.interface.ts` + `InMemory`/`Postgres`
  implementations + a dedicated `AssistantInvitationRepositoryModule` (same cross-module-repository
  pattern as `StudentRepositoryModule`).
- `staff/assistant-scope-repository.module.ts` — extracted `ASSISTANT_SCOPE_REPOSITORY` out of
  `StaffModule` into its own module. `AuthModule` needed the same repository instance for
  `acceptInvitation` and already sat downstream of `StaffModule`'s import of `AuthModule` — a
  circular edge either direction. Same fix `StudentRepositoryModule` already models.
- `AuthService.acceptInvitation(token, password)`: validates the token (unknown, already-used and
  expired all answer the same message — the same anti-enumeration shape `confirmPasswordReset`
  already uses), creates the user `active` immediately (no queue — an invitation *is* the admin
  decision), sets scope, assigns every listed group, marks the invitation accepted, writes a
  self-attributed `assistant.invitation_accepted` audit entry (there is no staff caller on this route
  — the new account is the actor of its own activation, the same way a login is), issues a token. One
  transaction. `POST /auth/invitations/:token/accept`, `@Public()`, rate-limited like login.
- `manage/admin-assistants.service.ts` (new) — `list`, `invite`, `update`, `remove`, `resend`. One
  response shape (`Assistant`) for a real account and a still-pending invitation, because the two
  backing tables differ and the frontend has no reason to know which one it's looking at.
  - `update` resolves a real account first, a pending invitation otherwise — same route, same
    action (`assistant.scope_changed`), targeting whichever id the assistant currently has.
  - **`remove` is scoped to pending invitations only.** This codebase has no precedent for
    hard-deleting or deactivating an already-active account (CLAUDE.md's own money/soft-delete
    conventions point the other way), and building one was not asked for. A `userId` naming a real
    account 404s the same as an unknown one — disclosed as an open decision, not guessed past.
    Verified live: `DELETE /admin/assistants/assistant-1` → 404, the account still lists afterward.
  - `resend` answers 409, not 404, when there is nothing pending — `API_SPEC.yaml`'s own route
    documents no 404 for it.
  - Cross-field validation (`groupIds` non-empty iff `scope: assigned_groups` and `role !== admin`,
    empty otherwise; every named group must actually exist) lives in the service, not the DTO — a
    business invariant, not a shape check (CLAUDE.md §6).
- Five new `AuditAction`s (`assistant.invited`, `.invitation_accepted`, `.invitation_resent`,
  `.scope_changed`, `.removed`) and one `AuditTargetType` (`assistant`), in both the union and the
  exhaustive `Record`s — the DTO's own compile-time gate caught a missing entry immediately.
- `mail/templates.ts`'s `'invitation'` case rewritten: it was built for a group-student-invite this
  codebase does not have (`groupName`), never exercised until now. Rewritten for the actual
  assistant-invitation shape (`inviterName`, `role`, `link`, `expiresAt`).
- `manage/directory.service.ts`'s `assistants()` method and `StaffDirectoryEntry` **deleted** — its
  one caller (`GET /admin/assistants`) now goes through `AdminAssistantsService.list()`, which
  returns a strict superset. Dead code removed rather than left orphaned (ponytail: deletion over
  addition).
- `API_SPEC.yaml`'s `Assistant` schema: `scope`/`groupIds`/`status`/`lastSeenAt` moved from
  declared-but-optional to `required`, per the schema's own comment ("move each into required in the
  same change that populates it").
- Incidentally fixed while touching the same file: `frontend/lib/types.ts`'s `AuditAction` mirror was
  missing six pre-existing backend actions (`student.*` ×4, `course.*` ×2) that predate this slice —
  the file's own doc comment names this exact hazard ("adding an action on the backend means adding
  it here too"). Low-cost to close while already editing the union for my own five; the six were
  genuinely absent, confirmed by reading the full prior union, not assumed.

**Frontend**:
- `lib/types.ts`/`lib/api.ts`: `Assistant`, `AssistantWrite`, `AssistantScope` types; five new
  `api.admin.*` methods (`assistants`, `inviteAssistant`, `updateAssistant`, `removeAssistant`,
  `resendAssistantInvitation`); `auditLog()` gained an `actorId` filter it never had a caller for
  before this slice.
- `app/(app)/manage/assistants/page.tsx` (new) — list, an invite panel, an edit panel (scope +
  group checkboxes, resend/cancel offered only on invited rows — an active account's row never shows
  a remove control, sidestepping the 404-vs-403 question CLAUDE.md §7 raises for a listed resource:
  the affordance for that action is simply not offered on that row type).
- `app/(app)/manage/activity/page.tsx` (existing, from unit 4 slice 4d) — extended to read an
  optional `?actorId=` query param and filter through it (`PEOPLE-5`: "a read over `AuditService.find`
  scoped to one actor"). No new route: the phase plan's draft assumption that a dedicated
  `/admin/assistants/:id/activity` endpoint was needed turned out wrong — `GET /admin/audit-log`
  already accepted `actorId` server-side and simply had no frontend caller yet. Also gained the five
  new `AuditAction` labels/tones (the `Record<AuditAction, ...>` there is exhaustive too, so this was
  compile-blocking, not optional polish).
- `app/(auth)/accept-invitation/page.tsx` (new) — sets a password, same shape as `reset-password`.
  `useSession` gained `acceptInvitation`, mirroring `signIn`'s `adopt`-then-return-account shape
  exactly, so it lands in the shell like every other authenticated route rather than needing its own
  redirect logic.

## Verification

- `npm test --workspace=backend`: **548 passed, 35 files** (17 new: `admin-assistants.service.spec.ts`
  — invite/list/update/remove/resend, the cross-field 400s, duplicate-email and pending-invite 409s,
  group-assignment add *and* remove on an existing account; `auth.controller.spec.ts` gained
  `acceptInvitation` success + the three-way anti-enumeration equality).
- `npx tsc --noEmit --project backend`: clean.
- `npm run lint`: clean (one pre-existing, unrelated `no-unused-vars` warning in
  `dashboard.controller.spec.ts`, untouched by this slice).
- `npx vitest run --config ./vitest.config.e2e.ts` (direct invocation, not the `npm` wrapper —
  `project_log.md`'s already-recorded Windows teardown-exit-code caveat): **242 passed, 4 files** (up
  from 234 — 4 new entries in `staff.e2e-spec.ts`'s exhaustive admin-route parity table, whose count
  assertion moved 26 → 30; 4 new assistant-refusal 403 tests in `registration.e2e-spec.ts`).
- **Integration suite: not run.** No Docker in this environment — the same disclosed gap `REVIEW_5B.md`
  already carries, now also covering migration `017` and `PostgresAssistantInvitationRepository`.
  `017` has therefore **never been run against a real empty schema**, which CLAUDE.md §9 treats as a
  gate, not a nicety — recorded honestly rather than assumed correct because the SQL reads clean.
- `npx tsc --noEmit` in `frontend/`: **22**, unchanged from the disclosed `AUTH-2` baseline. `lib/`
  still **0**. `npx eslint` on every touched/new frontend file: clean.

## Live-verified against the real running dev stack, not just compiled

Backend, via direct requests against the actually-running dev server (not a test double):
`GET /admin/assistants` (shows the real seed fixture, `scope`/`groupIds`/`status`/`lastSeenAt`
populated); `POST /admin/assistants` (invite, `assigned_groups` with a real group id — response
`status: "invited"`); `PATCH /admin/assistants/:id` on a real account (widened to two real groups,
response reflects it); `POST .../resend` (`{ok:true}`); `DELETE` on the just-invited row (204,
disappears from the list) and on a real active account (**404**, confirmed the account still lists
afterward — the disclosed `remove` scoping, proven rather than asserted); the two cross-field 400s
(admin + non-empty `groupIds`; `assigned_groups` with none) and the duplicate-email 409.

**Interactive browser verification did not complete** — the Chrome automation tool's tab became
unresponsive to `computer` clicks and typing on two separate fresh tabs (confirmed via
`read_network_requests` showing zero requests fired after repeated submit-button clicks; a later
`zoom` call on the same tab timed out reporting the renderer frozen). This is a tooling failure, not
observed to be caused by anything this slice wrote — the new pages render (200, no SSR error) when
fetched directly, and every backend route they call was independently verified above. Reported as
product feedback with repro steps. **Follow-up**: re-run the interactive check (invite → resend
mail path via the real `LogMailSender` console output → accept-invitation page → land in the
console) once the tool is usable again.

## Outstanding

- Integration coverage for `PostgresAssistantInvitationRepository` and migration `017`'s real-schema
  run, once Docker/Postgres is available.
- Interactive browser verification of the three new screens, once the Chrome automation tool
  recovers (see above).
- Unit 5 slice 5d remains: `GROUP-3` (bulk move), `GROUP-4` (group report + PDF), and closing the
  (now still 22, unchanged) `AUTH-2`-broken pages (`manage/groups`, `manage/courses/[id]/groups`,
  `manage/courses/[id]/staff`).
