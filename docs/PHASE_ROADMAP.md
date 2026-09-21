# Phase roadmap

**This file controls the order of phases and the boundary of each Claude Code conversation.**
`IMPLEMENTATION_PLAN.md` owns the task-level checklist and the Definition of Done; this file owns
*what may be worked on now*, *what must be true before it starts*, and *what must be true before it
is called done*.

One **chat unit** per Claude Code conversation. At the end of a chat unit: update the documents,
set the status, record decisions and remaining work, and **stop**.

Status: `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked

---

## 1. The three-agent pipeline

Every chat unit runs the same pipeline, strictly sequentially:

```
redesign-planner  ──►  redesign-executor  ──►  redesign-reviewer
   read-only            the only writer          read-only
       │                      │                      │
   PHASE_PLAN.md        the diff + tests        REVIEW.md verdict
```

Run it with `/redesign-phase <chat unit id>`.

- The **executor may not start** until the planner has produced the phase plan and the coordinator
  has approved its scope.
- The **reviewer may not start** until the executor reports completion.
- **Never run the three concurrently.** Read-only research agents may run alongside a phase, capped
  at three at once.

### 1.1 Handoff artifacts

State passes through files, not conversation context. Each lives in
`docs/phases/<unit-id>/` and is committed with the phase.

| Artifact | Written by | Read by | Contents |
|---|---|---|---|
| `PHASE_PLAN.md` | planner | executor, reviewer | Scope, files, API/domain/DB changes, authz and security requirements, tests required, Definition of Done for this unit, blockers |
| `EXECUTION_NOTES.md` | executor | reviewer | What was built, deviations from the plan and why, blockers hit, tests run with real output, documents updated |
| `REVIEW.md` | reviewer | coordinator | Verdict, findings ranked by severity with `file:line`, remediation checklist if not `APPROVED` |

Each agent also sends a short `SendMessage` handoff naming its artifact and its headline. **The
message is the signal; the file is the payload.** An agent that cannot find its input artifact stops
and says so rather than reconstructing it.

---

## 2. Phase completion protocol

A chat unit is **COMPLETE** only when **all nine** hold:

1. `redesign-planner` completed and its plan was approved.
2. `redesign-executor` completed the approved scope.
3. `redesign-reviewer` returned **`APPROVED`**.
4. Required tests pass — unit, e2e, and **integration against real PostgreSQL** where a migration is
   in scope. Real output recorded, not asserted.
5. Security checks for the areas touched (`SECURITY.md` §6, `CLAUDE.md` §8), including a refusal test
   for every permission added or changed.
6. Documentation updated: `API_SPEC.yaml` if a route changed, `CHANGELOG.md` for any decision,
   `project_log.md` for a material change, `CLAUDE.md` if a durable rule changed.
7. `IMPLEMENTATION_PLAN.md` task statuses updated.
8. This file's phase status updated.
9. **Zero unresolved blockers** in the unit's scope.

`APPROVED WITH FOLLOW-UP` → the unit stays `[~]`; the follow-up is added to
`IMPLEMENTATION_PLAN.md` and must be closed before the status changes.
`REJECTED` → the unit stays `[~]`; the executor addresses the remediation checklist and the reviewer
runs again.

**A phase is never marked complete because the code compiles, the screen renders, or the plan was
followed.**

---

## 3. Universal entry and exit criteria

Applies to every chat unit, in addition to its own.

**Entry**
- Current branch is `redesign`; `git status` inspected.
- Every dependency unit is `[x]`.
- No open blocker in `IMPLEMENTATION_PLAN.md` §Blocked gates a task in scope. If one does, the unit
  proceeds on the unblocked tasks and the blocked ones stay `[!]` — it does not guess.
- Backend suite green at the start (`npm test`) — so a later failure is attributable.

**Exit**
- Backend suite still green, with no test deleted or skipped to achieve it.
- No new `any`, no disabled lint rule, no commented-out test.
- Both repository drivers implemented for every new table.
- Nothing mock presented as working; no important state kept only in the browser.

---

## 4. The roadmap

### Chat unit 0 — Specification `[~]`

**Scope** `SPEC-1` … `SPEC-12`. The `docs/` set, the `CLAUDE.md` audit, and the migration gate.
**Entry** none — this is the root.
**Exit** all twelve `[x]`.

**`SPEC-12` closed 2026-09-20** — all eleven migrations ran in order from an empty schema, 81/81
integration tests passed. Unit 0 stays `[~]` only because `SPEC-16` and `SPEC-17` (both `API_SPEC.yaml`
reconciliations, found during unit 1) are filed `[!]` pending decisions `D-7`/`D-8`. How it was run,
against a fresh database created beside the dev one rather than wiping it:

```
docker compose up -d db
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
```

against an **empty** schema, so all ten migrations run in order.

> **This remains a hard gate on every later unit that writes a migration.** 001–008 were each verified
> this way and every first run found something; 009–011 were the first to come back clean. Unit 2's
> `DOM-1` is destructive and one-way, so it needs this run *before* it is authored, not after.

Units 4 (frontend shells) and 13 (frontend-only) do not depend on it and may proceed.

---

### Chat unit 1 — Identity and authorization `[x]` COMPLETE

**Scope, as narrowed on 2026-09-19:** `AUTH-1` + `AUTH-3` **only**. Add `Role.Admin`,
`STAFF_ADMIN`/`STAFF_ALL`, and the `AssistantCapabilities` preset.
**`AUTH-2` moved to unit 2** (its migration `014` joins `groups.course_id`, which `DOM-1`'s `013`
creates; `MigrationRunner` sorts lexicographically, so a `014` with no `013` aborts every boot).
**`AUTH-4` moved to unit 5** (needs `AUTH-2` *and* `MAIL-1`, which is unit 3). Full reasoning in
`docs/CHANGELOG.md` and `docs/phases/unit-1/PHASE_PLAN.md` §8 B-1.
**Depends on** unit 0 (`SPEC-12`).
**Migrations** 011 only — the two role CHECK widenings and nothing else.
**Tests** `role-guards.spec.ts` enumerates `@Roles` off all 25 controllers; a 24-route admin ≡ teacher
parity table; one refusal test per withheld verb; the audit log asserted to record `actorRole: 'admin'`.
**Security** this unit *is* the security boundary. The **404-not-403 rule and its byte-identical
message must survive** — `staff-scope.service.spec.ts` is the contract and was extended, never
edited. **`/admin/*` does not widen to `assistant`**, which is silent when broken and is why the
enumerating guard test exists.
**Exit** universal, plus: all **14 decorator sites / 63 routes** use `STAFF_ADMIN` or `STAFF_ALL`
(not "~30 call sites"); no route lost a guard; `AUTHORIZATION_MODEL.md` matches what was built.
**Blocked within scope** `AUTH-5` (device/session list) — decision `D-1`.

**Status `[x]` — COMPLETE 2026-09-20.** All nine conditions of §2 hold:

| # | Condition | Evidence |
|---|---|---|
| 1 | Planner completed, plan approved | `PHASE_PLAN.md` + `COORDINATOR_RULINGS.md` |
| 2 | Executor completed approved scope | `EXECUTION_NOTES.md`; `AUTH-1` + `AUTH-3` |
| 3 | Reviewer `APPROVED` | `REVIEW.md` gave `APPROVED WITH FOLLOW-UP` and pre-committed: *"once the blocker closes and F-1/F-2 land, the verdict is APPROVED. Nothing else holds it back."* Both landed and were verified; the blocker closed with `SPEC-12`. |
| 4 | Tests pass, **integration against real PostgreSQL** | 467 unit · 216 e2e · **81 integration, all 11 migrations from an empty schema** · frontend 301, 0 in `lib/` |
| 5 | Security checks | `role-guards.spec.ts` enumerates `@Roles` per **handler** via the guard's own `getAllAndOverride` precedence; both guard tests proved able to fail; one refusal test per withheld verb; the 404-identical-message contract extended, never edited; `011` verified to accept `admin` and reject `'admln'` |
| 6 | Documentation updated | `CHANGELOG.md`, `DATABASE_PLAN.md`, `AUTHORIZATION_MODEL.md`, `ARCHITECTURE.md`, `SECURITY.md`, `project_log.md`, `CLAUDE.md` (facts only) |
| 7 | `IMPLEMENTATION_PLAN.md` updated | `AUTH-1` `[x]`, `AUTH-3` `[x]`, `SPEC-12` `[x]` |
| 8 | This file updated | this block |
| 9 | Zero unresolved blockers **in scope** | `AUTH-5` is out of scope (`D-1`); `SPEC-16`/`SPEC-17` are new Phase 0 filings, not unit-1 scope |

**What the migration run found: nothing** — and that is worth recording, because 001-008 each found
something. The review's specific prediction (`010`'s `NUMERIC` returning a string) was probed and is
already handled in `postgres-work.repository.ts`. Real output: `docs/phases/unit-1/EXECUTION_NOTES.md`.

> `AUTH-2` and `DOM-1` gate more work than anything else in the plan, and they are now in the same
> unit, which is the point of moving `AUTH-2`: `groups.assistant_id` (`DOM-2`) and
> `assistant_group_assignments` (`AUTH-2`) record the same fact twice, and designing them in
> different units is how they end up disagreeing.

---

### Chat unit 2 — Domain reshaping **— SPLIT into 2a and 2b (ruling R-1, 2026-09-20)**

The unit was measured, not estimated, and found too large for one safe pass: four migrations, three
destructive, one of them one-way; 46 source files carrying `learning_mode` logic; two new tables
(four repository implementations); five frontend-visible response shapes; 22 `StaffScopeService`
call sites. Roughly units 1, 3 and 5 combined. **The boundary is itself a verified migration gate** —
`015`'s backfill joins `groups.course_id`, and `DATABASE_PLAN.md` requires `013` landed and verified
first — and it puts the two irreversible `DROP TABLE`s in different reviews.

#### Unit 2a — the group becomes the centre `[x]` COMPLETE

**Scope** `DOM-0`, `DOM-1`, `DOM-2`, the migration renumber, and seeds for those.
**Migrations** `012_retire_learning_mode.sql`, `013_group_holds_one_course.sql`. **Both run against
real PostgreSQL 15 from an empty schema.**
**Binding condition on 2a (ruling R-1):** `groups.assistant_id` is the **display** field;
`assistant_group_assignments` (2b) is the **authorization** field. **Nothing may read
`groups.assistant_id` for an access decision, ever.** Stated on the column, on the interface field,
in the frontend mirror, and asserted by an e2e test.
**Exit, met** 471 unit · 217 e2e · 87 integration from an empty schema, 0 skipped; `frontend/lib/`
at 0 typecheck errors; `group_courses` referenced nowhere outside migrations 006/007/013.
**Landed** 2026-09-20. See `docs/phases/unit-2/EXECUTION_NOTES.md`.
**On the status.** The executor set `[x]` on its own account of its work; the coordinator reset it to
`[~]`, because §2 condition 3 requires a `redesign-reviewer` verdict of `APPROVED`. The reviewer
returned **`APPROVED WITH FOLLOW-UP`** (`docs/phases/unit-2/REVIEW.md`, 2026-09-20), which under §2 leaves the unit `[~]`
until the nine follow-ups in `IMPLEMENTATION_PLAN.md` §"Slice 2a follow-ups" close. **No security or
authorization finding; no regression.** The reviewer independently re-ran all three suites on a
dropped-and-recreated database and reproduced every number: 471 unit · 217 e2e · 87 integration,
0 skipped, all 13 migrations from nothing. **None of the follow-ups blocks slice 2b.**
**Remediation pass, 2026-09-20:** `F2A-1`…`F2A-7` closed by the executor (`EXECUTION_NOTES.md`
§"Remediation pass"); `F2A-8` was the coordinator's; **`F2A-9` stays `[!]`** — `012` is applied and
immutable, so the correction belongs in a later migration, not an edit. Suites after the pass:
**473 unit · 217 e2e · 87 integration**, 0 skipped, empty schema.

**`APPROVED` 2026-09-20** on the re-check (`REVIEW.md`, appended). All nine §2 conditions hold:

| # | Condition | Evidence |
|---|---|---|
| 1 | Planner completed, plan approved | `PHASE_PLAN.md` + `COORDINATOR_RULINGS.md` (rulings R-1…R-4) |
| 2 | Executor completed approved scope | `EXECUTION_NOTES.md`; `DOM-0`, `DOM-1`, `DOM-2`; `git diff` confirms `backend/src/staff/**`, `frontend/app/**`, `frontend/components/**` untouched and `014`/`015` not authored |
| 3 | Reviewer `APPROVED` | `APPROVED WITH FOLLOW-UP` → remediation → **`APPROVED`**. No security or authorization finding at either pass. |
| 4 | Tests pass, **integration against real PostgreSQL** | **473 unit / 29 files · 217 e2e · 87 integration, 0 skipped**, all 13 migrations from an empty schema. Re-run independently by the reviewer on a database created empty immediately before, every number reproduced. |
| 5 | Security checks | `013`'s two abort paths proved to fail without their guards; `groups.assistant_id`'s display-only rule proved **behaviourally** (an assistant named on a group but not assigned still gets 404), so a 2b query reading it for access breaks the test; the seven retained audit members verified still accepted by `ListAuditLogQueryDto`'s exhaustive `Record`; `@IsOptionalNotNull` verified field-by-field against the schema in **both** directions — no NOT NULL field missed, no nullable field swept up (`{room: null}` → 200 is the regression guard). |
| 6 | Documentation updated | `DATABASE_PLAN.md`, `DOMAIN_MODEL.md`, `API_SPEC.yaml`, `CHANGELOG.md` (incl. **`D-10`**), `IMPLEMENTATION_PLAN.md`, `project_log.md`, `CLAUDE.md` §4.1 |
| 7 | `IMPLEMENTATION_PLAN.md` updated | `DOM-0`/`DOM-1`/`DOM-2` `[x]`; `F2A-1`…`F2A-8` closed, `F2A-9` `[!]` |
| 8 | This file updated | this block |
| 9 | Zero unresolved blockers **in scope** | `F2A-9` is recorded as unfixable-by-edit, not open work. `D-10` is closed and lands in `AUTH-2` (2b). |

**What the first real run of `012` and `013` found: nothing** — and `009`/`010`, which
`DATABASE_PLAN.md` §8 recorded as never having run, applied cleanly, closing that risk row. That
breaks the streak where 001–008 each found something on their first run.

**Two nits recorded, neither a condition of approval.** `groups.service.ts:250` takes `.length` of
`findMembers` where `countMembersByGroups` exists — thirty rows, below §1's threshold, and it
matches what `get()` already does; the notes call it "one count", which it is not.
The unit is `[~]` until a reviewer verdict of `APPROVED` (§2 condition 3).

#### Unit 2b — scope, people and courses `[x]` COMPLETE **— SPLIT into 2b-i and 2b-ii (ruling R-5, 2026-09-20)**

Both slices carry an `APPROVED`-family verdict: 2b-i `APPROVED` 2026-09-20, 2b-ii
`APPROVED WITH FOLLOW-UP` 2026-09-21 with both gating findings closed. **Unit 2 is complete; unit 3
begins in a new conversation.**

Same reasoning that produced the 2a/2b split, and that split worked: the only irreversible drop
gets its own review, and `AUTH-2` is the only item carrying an **authorization contract** — seven
spec cases that must pass unmodified, two byte-identical messages, 21 call sites and `D-10`'s
both-directions refusal tests. 2b measured the same size as 2a, and 2a was tractable **and still
returned nine findings.** The two slices share four files, all additive on one side, and neither
needs anything from the other's migration.

| Slice | Tasks | Migration | Status |
|---|---|---|---|
| **2b-i — people and courses** | `DOM-3`, `DOM-4`, `DOM-5`, seeds `001`/`002` for `014` | `014`, additive | `[x]` **COMPLETE — `APPROVED` 2026-09-20** |
| **2b-ii — scope** | `AUTH-2` + `D-10`, final `DOM-6` | `015`, destructive | `[x]` **COMPLETE — `APPROVED WITH FOLLOW-UP` 2026-09-21.** 517 unit / 32 files · 228 e2e · 110 integration, **0 skipped**, all 15 migrations from an empty schema. `course_staff_assignments` referenced nowhere; the seven contract cases pass unmodified — all re-run and re-derived by the reviewer on its own tree, with the fifteen migrations applied into a database created empty. **No finding was attributable to the change itself.** The two that gated it are closed: `AUTHORIZATION_MODEL.md`'s overstated row (F2) is qualified, and the user ruled on the course door as `D-23` → task `AUTH-6`. Remaining follow-ups `F2B2-3`…`F2B2-5` are recorded in `IMPLEMENTATION_PLAN.md` and **none blocks phase 3**. `docs/phases/unit-2/REVIEW_2B_II.md`. |

**Out of 2b-i, explicitly:** `AUTH-2`, `D-10`, migration `015` (not authored, not even as an empty
file), the final `DOM-6` pass, `backend/src/staff/**` including `staff-scope.service.spec.ts`, and
`admin-staff.controller.ts`. None was touched.

**2b-i exit, as measured:** 515 unit / 32 files · 228 e2e · 103 integration, **0 skipped**, all 14
migrations from an empty schema; `frontend/lib/` at 0 typecheck errors; the registration queue works
end to end over HTTP. `EXECUTION_NOTES_2B_I.md` carries the pasted output.

**`APPROVED` 2026-09-20** (`docs/phases/unit-2/REVIEW_2B_I.md`). The verdict was `APPROVED WITH
FOLLOW-UP` on three documentation/evidence findings — no security, authorization, correctness or
requirements failure at either pass. All three closed in `ab0f492`/`662c8c1` and confirmed.
Every number was reproduced on the reviewer's own machine, including **228 e2e across four
consecutive runs with zero worker exits**.

> The status above read `[x] COMPLETE, pending review` when the executor set it. Those are
> contradictory: §2 condition 3 makes a reviewer verdict of `APPROVED` part of what `[x]` *means*.
> Corrected by the coordinator once the verdict landed — as in 2a, where the same reset was needed.

**Both status gates, and they carry two different byte-identical messages on purpose:** `login`
refuses with `'Invalid credentials'` — identical to a wrong password and an unknown email, so
registration cannot be enumerated — and **`JwtStrategy.validate` refuses with `'Account no longer
exists'`** (`jwt.strategy.ts:57`), identical to a *deleted* account. A gate at `login` alone would
leave every already-issued token working and could not cover a token minted before a rejection.
Consequence for unit 4, filed as `SHELL-5`: **no API error distinguishes waiting from rejected from
wrong-password from deleted**, so the waiting state is knowable only from register's own 201 body.

**Scope (the unit as a whole)** `DOM-3`, `DOM-4`, `AUTH-2`, `DOM-5`, the final `DOM-6` pass. Student
profile columns; registration approval; course scoping → group scoping; course CRUD.
**Depends on** unit 2a (verified `013`). `DOM-4` and `AUTH-2` depend on `AUTH-1` (unit 1, built).
**Migrations** `014_registration_and_student_profile.sql`, `015_assistant_group_scope.sql`.
**Not authored in 2a, not even as empty files** — a `014` present with no `013` applies straight
after `012` and aborts every boot.
**Rulings carried in:** R-2 — `students.mode` is **not built**, `D-4` stands, and `DOM-3` amends the
five documents that still say otherwise. R-4 — `StaffCourseSummary.assignedAt` becomes
`MIN(assigned_at)` over the groups that reach the course.
**Begins in a new conversation** (`CLAUDE.md` §14).
**Inherited trap for `AUTH-2`:** when `course_staff_assignments` is retired, **do not remove**
`course_staff.assigned` / `course_staff.unassigned` from the `AuditAction` union or
`course_staff_assignment` from `AuditTargetType`. The audit log has no foreign keys precisely so it
outlives what it describes, and `ListAuditLogQueryDto`'s `@IsIn` is built from the union — removing a
member makes every historical row of that action unfilterable with a 400. Two hardcoded
`actorRole: Role.Teacher` at `staff/staff.service.ts` were routed through `actorRoleOf` in unit 1, so
that service's attribution is already correct going in.
**Risk — the highest in the project.** `DOM-1` is **destructive and one-way**. The migration must
**raise** if any group holds two courses, never guess. It touches `GroupRepository` ×2,
`LearningModeService`, `StudentGroupsService`, the dashboard, reports and assessments.
**Tests** integration from an empty schema; tests proving the migration aborts on two-course data
**and** on a group with no course; a student in no group resolves to `[]` rather than throwing.
*(That last case replaces `LearningModeService`'s fallback-chain test — the chain is deleted, the
case it protected is not.)* **All done in 2a.**
**Security** `POST /courses/:id/enroll` is **retired**, not merely re-roled: it answers 404, and a
student cannot enrol themselves at all. **`CoursesService.enroll` kept** — `accept` calls it.
Accept/reject are audited. The status gate is in **two** places, `login` and
`JwtStrategy.validate` (ruling R-6) — **all done in 2b-i.**
**Exit** universal, plus: no code path reads `group_courses`; `DATABASE_PLAN.md` §4.1 reconciled with
what ran.
**Blocked within scope** ~~`DOM-3`/`DOM-6` partially — decisions `D-4`, `D-5`~~ — **both closed 2026-09-20; nothing remained blocked at exit.**

---

### Chat unit 3 — Mail `[x]` **COMPLETE — `APPROVED` 2026-09-21**

**Scope** `MAIL-1` … `MAIL-3`. The `MailSender` port, `mail_deliveries`, four templates.
**Depends on** unit 0.
**Migrations** own migration, `016_mail_deliveries.sql`.
**Shape** exactly `FileStorage`'s: `MAIL_DRIVER=none|log|smtp`, resolved once in `env.ts`, validated
at boot, **503 when unconfigured**. `none` is the production default. Fold `PasswordResetNotifier`
onto it.
**Security** `mail_deliveries` stores **recipient and template only — never the rendered body**
(`SECURITY.md` §5). Every send writes its row in the same transaction as the causing action.
**Exit** universal, plus: no consumer imports an SMTP SDK directly.

**Built as planned**, via a custom pipeline for this and the next two units: Claude as a single
continuous orchestrator+reviewer session, Antigravity (`agy-delegate`, `claude-opus-4-6-thinking`)
as implementer — see `docs/phases/unit-3/PHASE_PLAN.md` and `REVIEW.md`. `MailModule` mirrors
`StorageModule` (port + `null`-when-unconfigured) and `MailService.send` mirrors
`AuditService.record` (throws outside a transaction) — no new pattern invented. **Not** made
`@Global()` — the cap stays at three. `PasswordResetNotifier` is gone; `AuthService` now injects
`MailService` and `requestPasswordReset` is transaction-wrapped for the first time.
**Verified:** 536 unit / 34 files (from 517) · **112 integration on an empty schema, migration 016
applied clean, 0 skipped** (from 110) · lint clean (one pre-existing unrelated warning untouched).
**Open, disclosed rather than guessed:** the `invitation` / `sign-in-link` / `report` /
`announcement` template `data` shapes are provisional — built ahead of their real callers (units
5/9/10) per the roadmap's own scope for this unit; expect them to be refined when those callers
land. `MAIL_DRIVER=log` is not refused in production the way `STORAGE_DRIVER=local` is — judged not
to carry the same data-loss risk; revisit if that turns out wrong.

---

### Chat unit 4 — Shells `[ ]`  *(frontend; no backend dependency but `AUTH-1`)*

**Scope** `SHELL-1` … `SHELL-4`. Console shell, student shell, flat student IA, **and the deletion of
`components/app/*`, `components/site/*` and the legacy pages.**
**Depends on** `AUTH-1` for role-based nav.
**This unit is what makes the frontend typecheck again.** It currently reports ~301 errors, all in
the code this unit deletes (`CLAUDE.md` §4.1). Do not patch those errors in an earlier unit.
**Tests** `npx tsc --noEmit` and `npx eslint .` clean in `frontend/` — this is the unit where that
becomes an enforceable gate.
**Design checks** the eight questions in `IMPLEMENTATION_PLAN.md` §Verification, on every screen.
**Exit** universal, plus: frontend typecheck clean; no import of a deleted module remains; role-based
hiding is documented as courtesy, with the server-side guard named.

---

### Chat unit 5 — People and groups `[ ]`

**Scope** `PEOPLE-1` … `PEOPLE-6`, `GROUP-1` … `GROUP-4`, **plus `AUTH-4`** (assistant invitations,
re-homed from unit 1 on 2026-09-19 — it needs `AUTH-2` for `scope`/`groupIds` *and* `MAIL-1` from
unit 3, because an invitation that cannot be emailed is not an invitation; `PEOPLE-4` was already
coupled to it).
**Depends on** units 1, 2, 3, 4. `PEOPLE-3` needs `MAIL-3`.
**Inherited from unit 1:** `GET /admin/assistants` already lists the Full admin and emits `role`;
`PEOPLE-4` adds `scope`, `groupIds` and `status`. `Assistant.lastSeenAt` emits `null` always and has
no source anywhere — `PEOPLE-6`, and it is a decision, not a task. `AUTH-4` should cost
`assistant.invitation_accepted` and `assistant.invitation_resent` as audited actions up front.
**Security** the waiting queue is a new admin surface over unapproved accounts — accept and reject are
teacher/admin only and audited. **Assistants may add to a group but not remove from one.**
**Exit** universal, plus new audit actions declared in the union **and** the DTO's exhaustive
`Record`, each with a spec asserting the entry written.

---

### Chat unit 6 — Tasks and the draft library `[ ]`

**Scope** `TASK-1` … `TASK-7`. The `visibility` enum distinct from the availability window;
`task_drafts`; authoring from a draft; attachments; submission settings; marker assignment; the
global task list and the authoring screens.
**Depends on** units 1, 2, 4.
**Care** `visibility` (`published | scheduled | hidden`) is **not** the availability window. Status
stays server-derived (`CLAUDE.md` §6). Targeting **stays multi-group** — one group is the common case,
not the rule.
**Exit** universal, plus `API_SPEC.yaml` updated for every new route.

---

### Chat unit 7 — Marking and the mark book `[ ]`

**Scope** `MARK-1` … `MARK-4`, `BOOK-1` … `BOOK-3`.
**Depends on** unit 6.
**Care** each annotation is **data** — page, x%, y%, kind, text — not a flattened file. The original
submission stays **immutable**; the marked copy is a new artifact beside it. **Save** (annotations
only) is distinct from **Save and return** (`returned_at`; the student sees it). The queue must show
**non-submitters** — this is the answer to the old "no `missed` status" gap. **A missing mark is an
em-dash, never `0`.**
**Blocked within scope** `MARK-5` — decision `D-2` (flattened PDF vs rendered overlay).

---

### Chat unit 8 — Sessions and attendance `[ ]`

**Scope** `SESS-1` … `SESS-7`.
**Depends on** unit 2 (`DOM-1`).
**Migrations** re-parent sessions to the group; **`attendance.attended BOOLEAN` → `present | absent |
late`**.
**Security** the meeting link is **withheld server-side until T-30 minutes**. Not hidden by the
client — absent from the response.
**Blocked within scope** `SESS-1` partially — decision `D-6` (may an assistant create or edit a
session?).

---

### Chat unit 9 — Weekly reports `[ ]`  *(the flagship — 9 routes, none exist)*

**Scope** `RPT-1` … `RPT-9`.
**Depends on** units 2, 3, 7, 8 — it composes their figures.
**Care** generation is **pure composition** over attendance, submissions and progress. It owns no
figures of its own; that is what keeps the report and the screens it summarises from disagreeing.
**Idempotent, and never overwrites a report already `sent`.**
**Security — the highest-consequence path in the product.** It emails a child's marks to a parent and
**cannot be unsent**. Send is teacher/admin only, requires `reviewed` **and** a `parentEmail`, is
irreversible, audited, and writes a `mail_deliveries` row. **There is deliberately no
send-to-all-groups action.** An assistant may review and annotate; never send.
**Blocked within scope** `RPT-3` — decision `D-3` (scheduled, on-demand, or both).

---

### Chat unit 10 — Announcements `[ ]`

**Scope** `ANN-1` … `ANN-6`.
**Depends on** units 3, 5.
**Care** the email fan-out is **idempotent on `published_at`** — a double publish must not double-send.
Keep the `all_tas` audience: the design drops it, it costs nothing, and staff broadcast has no other
route.

---

### Chat unit 11 — Google Forms surface `[ ]`  *(frontend only — the backend is complete)*

**Scope** `WORK-1` … `WORK-4`. Seven routes already exist on `WorkAnalyticsController`.
**Depends on** unit 4.
**Care** every mirrored surface carries `SyncStatus` and says when it last checked. The understated-
figure banner is **required**, not decorative: an unmatched response means the completion figures are
understated, and the screen must say so. Student quizzes are driven by `work_type: 'google_form'` —
**no first-party quiz engine.**

---

### Chat unit 12 — Settings and account `[ ]`

**Scope** `SET-1` … `SET-6`.
**Depends on** units 1, 2, 4.
**Care** `SET-6` makes the upload route **student-reachable** for the first time — it is staff-only
today. Re-check the upload contract (`SECURITY.md` §4): server-minted filename, MIME whitelist, size
cap, no SVG.

---

### Chat unit 13 — Student surface and the public site `[ ]`

**Scope** `STU-1` … `STU-7`, `SITE-1` … `SITE-5`.
**Depends on** unit 4, and each feature's own backend unit.
**Care** the Overview is action-first and carries **no mark anywhere**. Marketing typography never
mixes with the console's 13px. `/catalog` and the student `/achievements` rail entry are `[REMOVED]`.

---

### Chat unit 14 — Google sign-in and contract hygiene `[ ]`  *(last, deliberately)*

**Scope** `GAUTH-1`, `OPS-1`.
**Depends on** everything. Sequenced last because nothing depends on it and it **replaces a working,
well-tested mechanism**.
**Security** `SECURITY.md` §2.6 — above all: **never auto-link a Google account to a password account
by email alone.**
**`OPS-1`** regenerates `lib/api.ts` and `lib/types.ts` from `API_SPEC.yaml`, or adds a CI drift
check. Make drift a compile error.

---

## 5. Dependency summary

```
unit 0 (SPEC-12) ─┬─► unit 2 (DOM-1 ─► AUTH-2) ─┬─► unit 5 ─► unit 6 ─► unit 7 ─┐
                  │                             ├─► unit 8 ─────────────────────┼─► unit 9
                  ├─► unit 1 (AUTH-1, AUTH-3) ─► unit 4 (shells) ─► 11, 12, 13 │
                  └─► unit 3 (MAIL) ──────────────────► unit 10 ◄───────────────┘
                                                                  all ─► unit 14
```

`AUTH-2` sits inside unit 2 as of 2026-09-19, which removes the loop the old graph drew — unit 2
depending on unit 1 while unit 1 depended on unit 2. Unit 1 now ships `AUTH-1` + `AUTH-3` and nothing
downstream waits on the difference: unit 5 depended on units 1 **and** 2 either way, so deferring
`AUTH-2` by one unit delays nothing.

**Critical path:** `SPEC-12 → DOM-1 → AUTH-2 → SESS-1 → RPT-2 → RPT-6`.

---

## 6. Open decisions

**All six closed 2026-09-20.** Kept here as the record of what was decided and when, because several
narrow scope and one overrides the design. Full reasoning in `docs/CHANGELOG.md`.

| ID | Blocks | Unit | Question |
|---|---|---|---|
| `D-1` | ~~`AUTH-5`~~ | 1 | **CLOSED: drop the Security tab.** No Redis; `AUTH-5` dropped from scope. |
| `D-2` | `MARK-*` | 7 | **CLOSED: rendered overlay** — freehand marker/eraser strokes stored as data, drawn over an immutable original. No PDF library. |
| `D-3` | `RPT-3` | 9 | **CLOSED: on-demand button only.** No cron. |
| `D-4` | `DOM-3`, `SESS-1` | 2, 8 | **SUPERSEDED by `D-9`:** zero mode axes, not one. |
| `D-5` | `DOM-6` | 2 | **CLOSED: regenerate** the fixtures. |
| `D-9` | `DOM-0`, `DOM-1`, `SESS-1` | 2 | **CLOSED: `learning_mode` retired entirely.** No live/recorded distinction — every group runs external-link sessions and accumulates uploaded recordings. New `DOM-0` slice, sequenced before `DOM-1`. |
| `D-6` | `SESS-1` | 8 | **REVISED: their own groups only.** Supersedes "any session" — one `StaffScopeService` check. |
