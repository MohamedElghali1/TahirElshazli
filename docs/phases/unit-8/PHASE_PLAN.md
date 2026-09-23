# Unit 8 — Sessions and attendance · PHASE_PLAN

**Branch** `unit-8` (git worktree at `.claude/worktrees/unit-8`, based on `redesign` @ `6657c7a`).
**Scope** `SESS-1` … `SESS-7` (`PHASE_ROADMAP.md` §4, unit 8).
**Depends on** unit 2 (`DOM-0`, `DOM-1`, `AUTH-2`) — all `[x]`.
**Runs in parallel with** units 7, 11, 12 in other checkouts. See §7 for the collision rules.

Written by the coordinator (not `redesign-planner`) at the user's direction, 2026-09-23. The user
implements via a Sonnet executor and reviews as the coordinator.

---

## 1. What the requirements actually say, after the rulings

Three documents describe a session and they do not agree. §2.1 authority order plus the closed
decisions resolve every disagreement; the resolutions below are the ones to build.

### 1.1 `mode` and `location` are **out**. `D-9` already removed them.

`PHASE_ROADMAP.md`'s SESS-1 line ("mode/location/assistant/visible/state") and
`DOMAIN_MODEL.md` §5 (`mode (on_ground | online)`, `location` room *or* link) are **stale**.
`CHANGELOG.md` `D-9` is explicit and later:

> **Sessions, consequently:** a session carries an **external meeting link** — Zoom, Google Meet, or
> any other. Combined with `D-4`, there is no `mode` and no `room`. `PRODUCT_SPEC.md` §4.1's
> "a room **or** a meeting link" resolves to the link.

**Build:** no `mode` column, no `location` column. One `meeting_link`.
**Consequence for `PRODUCT_SPEC.md` §6** ("Join appears only where a session is live **and online**"):
every session is online, so the condition collapses to **live**. Join appears when the link has been
released (§3.4) — no mode test.
**Fix as part of this unit** (§6): `DOMAIN_MODEL.md` §5 and the SESS-1 roadmap line, both of which
currently contradict a closed decision.

### 1.2 `attachments[]` is **out of scope**, recorded not dropped

`DOMAIN_MODEL.md` §5 lists `attachments[]` on `Session`. No `SESS-*` task names it, no route in
`API_GAP_ANALYSIS.md` B6 carries it, and it would need its own `FileStorage` wiring and an upload
surface. **Do not build it.** File it in `IMPLEMENTATION_PLAN.md` as `SESS-8 [ ]` so it is visible
rather than forgotten.

### 1.3 `D-6` — an assistant may create and edit a session, **their own groups only**

Supersedes the earlier "any session". Sessions re-parent to the group, so the group *is* the scope
key and the check is `StaffScopeService.mayReachGroup`, not `assertAssigned(courseId)`.

This unit is therefore built at the **group grain from birth** — it does not inherit `AUTH-6`'s
course-grain debt (`CLAUDE.md` §7). Do not add a course-named staff route here.

### 1.4 The three current admin write routes are **replaced**, not extended

`API_GAP_ANALYSIS.md` B6 marks `POST /admin/courses/:id/live-sessions` and
`PATCH`/`DELETE /admin/live-sessions/:id` `[REPLACE]` ×3, and records that `frontend/lib/api.ts`
never had a client for them. The student reads `GET /courses/:id/live-sessions` and
`.../next` are `[REPLACE]` too.

---

## 2. Target schema — migration `019`

**Claim `019`.** Unit 7 (another agent, another checkout) also writes a migration; it takes `020`.
Do not renumber without saying so.

### 2.1 `live_sessions` → re-parent and reshape

| Column | Change |
|---|---|
| `course_id` | **dropped**, replaced by `group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE` |
| `zoom_link` | renamed `meeting_link`, becomes **`NULL`-able** (a planned session need not have one yet) |
| `duration_minutes` | replaced by `ends_at TIMESTAMPTZ NOT NULL` (`DOMAIN_MODEL.md` §5) |
| `assistant_id` | **new**, `TEXT NULL REFERENCES users (id) ON DELETE SET NULL` |
| `description` | **new**, `TEXT NULL` |
| `private_notes` | **new**, `TEXT NULL` — **staff-only, see §3.5** |
| `is_visible` | **new**, `BOOLEAN NOT NULL DEFAULT true` |
| `state` | **new**, `TEXT NOT NULL DEFAULT 'published' CHECK (state IN ('planned','published'))` |

Index: `live_sessions (group_id, scheduled_at)`, replacing the course one.

**The re-parent is destructive and one-way, so it validates first and raises** (`CLAUDE.md` §9).
A session knows its course; a course may hold several groups; **which group owns the session is not
derivable**. The rule:

```sql
-- Abort rather than guess. A course with two cohorts has no single right answer,
-- and silently picking one strands every attendance row against the wrong roster.
DO $$
DECLARE ambiguous INTEGER;
BEGIN
  SELECT count(*) INTO ambiguous
  FROM (
    SELECT s.id
    FROM live_sessions s
    JOIN groups g ON g.course_id = s.course_id
    GROUP BY s.id
    HAVING count(g.id) <> 1
  ) x;
  IF ambiguous > 0 THEN
    RAISE EXCEPTION
      'Cannot re-parent % live_sessions: their course holds zero or several groups. Assign each session a group by hand first.',
      ambiguous;
  END IF;
END $$;
```

Sessions whose course has **exactly one** group take that group. `ends_at` backfills as
`scheduled_at + duration_minutes * INTERVAL '1 minute'`. Existing rows are `state = 'published'`,
`is_visible = true` — they are live today, and a migration must not retroactively hide them.

### 2.2 `attendance` → three-state

| Column | Change |
|---|---|
| `attended BOOLEAN` | replaced by `status TEXT NOT NULL CHECK (status IN ('present','absent','late'))` |
| `attended_at` | renamed `marked_at TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `marked_by` | **new**, `TEXT NOT NULL REFERENCES users (id)` — `DOMAIN_MODEL.md` §5 |

Backfill: `true → 'present'`, `false → 'absent'`. `marked_by` has no historical answer; backfill it
from the group's owning teacher via `groups.course_id → courses` if one exists, else abort the same
way §2.1 does. **State the choice in the migration comment** — an invented `marked_by` is a false
audit trail, which §9 rates worse than none.

> If the fixtures make either backfill impossible, that is a `D-5`-style fixture regeneration, not a
> reason to loosen the constraint. Stop and record it.

### 2.3 The gate

**`019` is not done until it has run against real PostgreSQL 15 from an empty schema**, 001→019, per
`CLAUDE.md` §9 and unit 0's `SPEC-12`. `npm run test:integration` with `TEST_DATABASE_URL` set. A
migration authored on top of an unverified one buries what it gets wrong.

---

## 3. Target API

All new staff routes are on `/staff/*` and route through `StaffScopeService` (§7 of `CLAUDE.md`).

### 3.1 Staff — the week grid and writes

| Route | Task | Notes |
|---|---|---|
| `GET /staff/sessions?from=&to=&groupId=` | `SESS-5` | Week grid. `groupId` optional; without it, every in-scope group (`reachableGroupIds`). `from`/`to` required ISO dates. Returns `published` **and** `planned` — the console shows both; the student surface never sees `planned`. |
| `POST /staff/groups/:id/sessions` | `SESS-1` | `mayReachGroup` or 404 with the group's own not-found message. Audit `live_session.scheduled`. |
| `PATCH /staff/sessions/:id` | `SESS-1` | Audit `live_session.updated`, `before` a **copy** (§9). |
| `DELETE /staff/sessions/:id` | `SESS-1` | Audit `live_session.cancelled`. Cascade destroys attendance — keep the full `before` snapshot, as the current service already does. |
| `GET /staff/sessions/planned` | `SESS-4` | Draft timetable. In-scope groups only. |
| `POST /staff/sessions/:id/publish` | `SESS-4` | `planned → published`. **Idempotent**: publishing a published session is a 200 no-op, not a 409 and not a second audit row. Audit `session.published`. |
| `GET /staff/sessions/:id/attendance` | `SESS-3` | The sheet: **every group member**, with their status or `null` for unmarked. A missing mark is not `absent`. |
| `PUT /staff/sessions/:id/attendance` | `SESS-3` | Bulk write, one transaction, one audit row (`attendance.marked`) carrying the counts — not one row per student. Rejects a `studentId` that is not a member of the session's group. |

**Delete the three `/admin/*` live-session routes and `AdminManageController`'s wiring for them.**
`ManageLiveSessionsService` is rewritten in place — its `assertMayWrite(courseId)` becomes a group
check, and the file-level comment about "teacher-only at the controller, deliberately" is now wrong:
`D-6` settled it the other way. Rewrite that comment; do not leave it contradicting the code.

### 3.2 Student

| Route | Task | Notes |
|---|---|---|
| `GET /students/me/timetable?from=&to=` | `SESS-6` | Replaces `GET /courses/:id/live-sessions` and `.../next`. Sessions of every group the student is a member of (`findMembershipsForStudent`), **`state = 'published'` and `is_visible = true` only**. |
| `GET /students/me/attendance` | `SESS-7` | Their own history + the projection. |

### 3.3 The attendance projection is computed, never stored

`DOMAIN_MODEL.md` §5: percentage is `present / expected`, where *expected* is the published sessions
of the student's groups that have already ended. `late` counts as neither — say so in the response
shape (`present`, `late`, `absent`, `expected`) rather than folding it in and making the number
unexplainable on screen.

**`CLAUDE.md` §11.1.2 applies:** this is *attendance*, not progress and not performance. It gets its
own figure with its denominator. Never merge it into a progress `Meter`.

### 3.4 T-30 — the link is **absent**, not hidden `SESS-6`

> the meeting link is **withheld server-side until T-30 minutes**. Not hidden by the client — absent
> from the response. (`PHASE_ROADMAP.md` unit 8)

The student serializer omits `meetingLink` entirely unless
`now >= scheduledAt - 30 min` **and** `now <= endsAt`. Not `null`, not `''` — the key is not present.
**This needs a test in both directions** (`CLAUDE.md` §10): at T-31 the key is absent, at T-29 it is
there. A single happy-path test is not evidence of this boundary.

Staff reads always carry the link — they are the ones who set it.

### 3.5 `privateNotes` never crosses to a student

Field minimisation (`CLAUDE.md` §8). The student serializer is an **explicit allow-list of fields**,
not a spread-minus-delete: a later column added to the row must not reach a student by default.
Assert it in the e2e spec by name.

### 3.6 Audit

Add to the `AuditAction` union **and to the exhaustive `Record<AuditAction, true>`** in
`list-audit-log-query.dto.ts` (a missing entry is a compile error — that is the point, §9):

- `attendance.marked`
- `session.planned`
- `session.published`

**Keep the existing `live_session.scheduled|updated|cancelled` strings unchanged.** Renaming them to
`session.*` would orphan every audit row already written against the old string and break the log's
own filter. `DOMAIN_MODEL.md` §267 lists `session.planned/published` — those are the two new ones; it
does not require renaming the three that exist. Record this in `CHANGELOG.md`.

`targetType` gains `'attendance'`. `AuditService.record` throws outside a transaction; every write
above is already inside `runInTransaction`.

---

## 4. Slices — implement and verify in this order

Each slice ends green. Do not start the next with the previous one red.

| # | Slice | Done when |
|---|---|---|
| **S1** | Migration `019` + the two backfills | Runs 001→019 from an empty schema against real PG 15. Both abort paths exercised. |
| **S2** | `SessionRepository` + `AttendanceRepository` interfaces, **`InMemory*` and `Postgres*` for each** | Integration suite green; unit suite green. **Two implementations per interface is not optional** (§9). |
| **S3** | Staff service, scope, DTOs, routes (§3.1); delete the `/admin/*` three | Unit + e2e green, including a refusal test per permission. |
| **S4** | Student routes (§3.2), T-30, the projection | Both-directions T-30 test; `privateNotes` absence asserted. |
| **S5** | Frontend: `lib/types.ts` + `lib/api.ts` mirror first, then `/manage/live-sessions`, `/manage/live-sessions/drafts`, the attendance sheet, the student timetable week grid, the student attendance screen | `npx tsc --noEmit` = **0** in `frontend/`, lint clean. |

**S5 must send `from`/`to` as full ISO instants, not bare dates.** `GET /staff/sessions` accepts
either, but a bare `YYYY-MM-DD` `to` is widened to `T23:59:59.999Z` — **UTC**. The school runs on
Egypt time (UTC+2/+3), so a week requested as bare dates is a window shifted two or three hours off
the local week: a Monday 01:00 local session is `Sunday 22:00Z` and falls *outside* a window that
starts Monday. The session is not missing from the database, only from that grid, which is the worst
shape for a bug of this kind — it looks like a data problem.

Sending an offset-bearing instant (`2026-09-21T00:00:00+03:00`) makes it exact, and the DTO's
`@IsISO8601()` already accepts it. Not a defect in S3; a constraint S3 hands to S5, recorded here
rather than discovered on screen.
| **S6** | Docs (§6) | Every file in §6 updated. |

**S5 note — the nav already points at pages that do not exist.** `console-shell.tsx:100-106` links
`/manage/live-sessions` and `/manage/live-sessions/drafts`; neither directory exists. Unit 4 built the
rail ahead of the screens. These are dead links today and S5 is what fixes them.

**The mirror is updated in the same commit as the response shape** (`CLAUDE.md` §6). `LiveSession` in
`frontend/lib/types.ts:182` gains/loses fields in lockstep with `S3`/`S4`; leaving it stale is the
exact drift §6 calls a liability.

Existing consumers that break when the shape changes, and must be reworked rather than patched:
`frontend/app/(app)/timetable/page.tsx` (reads `session.zoomLink` unconditionally — that is the T-30
bug in UI form) and `frontend/app/(app)/attendance/page.tsx` (reads `past[].attended` boolean, and
its own comment says it renders two states because the third did not exist yet).
`backend/src/courses/courses.service.ts` and `dashboard.service.ts` also read attendance.

---

## 5. Tests required (`CLAUDE.md` §10)

Not a suggestion list — the Definition of Done.

- **Unit**, memory driver: the T-30 boundary both sides; the projection including a `late` row;
  publish idempotence; the attendance sheet listing an unmarked member as `null`, never `absent`.
- **Integration**, real PG: both new `Postgres*` repositories against the same contract as the memory
  ones; migration `019` from empty, both abort branches.

  **An empty-schema run is silent about every guard and every backfill.** 019 applied cleanly from
  nothing on 2026-09-23 (PG 15.19, alongside unit 7's 020) — and that run proves only that the SQL
  *applies*. Zero rows means the abort guards counted nothing and the backfills touched nothing. The
  two RAISE branches need **seeded fixtures**: a course holding two groups with a session (ambiguous
  → must abort), and a session whose course holds none (→ must abort).

  Two techniques adopted from unit 7, which hit both failure modes first:
  - **Read the guard's SQL out of the migration file with a regex rather than retyping it**, so the
    test cannot pass against a copy that has drifted from what shipped.
  - **A regex that fails to match must `throw`, not skip** — e.g. `'019 no longer contains the
    re-parent abort guard'`. A renamed statement that silently skips turns the test green while
    testing nothing, which is the same failure this whole section exists to prevent.
- **Never let a bare timestamp order a read.** Unit 7 found `ORDER BY created_at` alone on a
  `TIMESTAMPTZ(3)` column returning rows in non-deterministic order when several were written inside
  one millisecond — the audit-log cursor bug in new clothing. Every attendance and session read that
  sorts by time orders by `(timestamp, id)`. Note the tiebreak buys **repeatability across reads**,
  not agreement between the two drivers: ids are UUIDs in Postgres and sequential in memory, so a
  tied pair can still order differently in each.
- **e2e**: every route's happy path and its errors — not-found, out-of-scope, conflict, a
  `studentId` outside the group on the bulk write.
- **Authorization — a refusal test for every permission.** An assistant holding group A gets a
  **404 with a byte-identical message** on a session of group B, and on marking its attendance.
  Assert the string is `===` the genuine-miss string, not equal to a literal copied into the spec.
- **`privateNotes` and `meetingLink` absence** asserted by name on the student responses.

Backend baseline to hold or beat: **660 unit / 39 files, 297 e2e, 146 integration.**

---

## 6. Documentation to update before this unit is done (§12)

- `docs/IMPLEMENTATION_PLAN.md` — `SESS-1`…`SESS-7` `[x]`; file `SESS-8` `[ ]` (attachments, §1.2).
- `docs/PHASE_ROADMAP.md` — unit 8 status; **and fix the SESS-1 scope line**, which still says
  "mode/location" against `D-9` (§1.1).
- `docs/DOMAIN_MODEL.md` §5 — **remove `mode` and `location`**, replace with `meetingLink`; they
  contradict a closed decision (§1.1).
- `docs/API_SPEC.yaml` — every route in §3; delete the three `/admin/*` ones.
- `docs/API_GAP_ANALYSIS.md` — B6 rows to `[DONE]`, A5 rows resolved.
- `docs/DATABASE_PLAN.md` — migration `019`, the new indexes, the re-parent data risk.
- `docs/AUTHORIZATION_MODEL.md` — `D-6` as built: assistants write sessions for held groups only.
- `docs/CHANGELOG.md` — the `DOMAIN_MODEL` correction (§1.1), the audit-action decision (§3.6), and
  anything the migration's first run found.
- `project_log.md` — an entry.
- `docs/phases/unit-8/EXECUTION_NOTES.md` — written by the executor, read by the reviewer.

---

## 7. Parallel-agent rules (units 7, 11, 12 are running elsewhere)

1. **Migration `019` is ours. Unit 7 takes `020`.**
2. **Stay inside this worktree.** Never `cd` to `D:\Users\ghali\TahirElshazli` — another agent has
   uncommitted work there.
3. **Touch only what §4 lists.** `API_SPEC.yaml`, `IMPLEMENTATION_PLAN.md`, `CHANGELOG.md` and
   `lib/types.ts` are edited by every parallel unit; append in our own section and do not reflow,
   reorder or reformat anything else in them — a tidy-up here becomes an unmergeable conflict for
   three other agents (`CLAUDE.md` §12, no unrelated refactors).
4. **Unit 7 does not read attendance at all** — confirmed by that session, 2026-09-23, after it
   retracted the same claim made from memory and re-ran the grep: four hits, all comment prose. The
   `attended → status` conversion cannot break unit 7. **Unit 9** does depend on this unit's
   projection shape (§3.3) — get it right here rather than leaving unit 9 to reinterpret it.
5. **Two files are edited by both unit 7 and unit 8:**
   - `backend/src/manage/staff-manage.controller.ts` — unit 7 changes the grade route (line ~112)
     and the submissions list (line ~95); unit 8 **deletes** `GET courses/:courseId/live-sessions`
     (line ~141) and adds the session routes. 29 lines apart.
   - `backend/src/manage/manage.module.ts` — both append providers.

   **Convention agreed with that session, final:**
   - Append new routes as one contiguous block at the **end** of the controller class, under a
     comment naming the unit (`// Unit 8 - sessions (SESS-1 .. SESS-5)`). Append to the providers
     array rather than sorting it. **Never** reorder, reflow or tidy anything outside your own block.
   - **Territory, because appending alone does not cover in-place edits.** Lines **95-125** (the
     submissions list and the grade route) are **unit 7's** — `MARK-2` and `MARK-3` change them in
     place. Line **141** and the live-session region are **unit 8's**. Neither unit edits the other's.
   - **Delete `GET courses/:courseId/live-sessions` as its own commit, landed *before* unit 8's
     additions**, so the merge sees a removal against a clean base rather than inside a reshuffled
     file — and so it is trivially revertable if `D-6` is ever revisited.
   - **Whoever merges second runs `npm test` *and* `npm run test:e2e` on the merged tree, not just
     `tsc`.** The failure mode here is not a conflict marker: a route silently lost to an auto-merge
     typechecks perfectly, and only an e2e that calls it notices.
   - As of 2026-09-23 unit 7 has touched **neither** file — its slice 7a is repository-layer only —
     so unit 8 is working against a clean base in both.
6. Unit 7 holds migration `020` (marking) and `assessment-repository.interface.ts`; unit 8 touches
   neither. Unit 7 cannot run the migration gate — no Docker in that environment — so **this unit
   runs the combined 001→020 empty-schema run after both merge** and reports it back. `MigrationRunner`
   sorts lexicographically, so only a run with both present proves they compose.

---

## 8. Blockers — stop and ask, do not invent (§13)

- The `marked_by` backfill (§2.2) if no defensible value exists in the fixtures.
- The re-parent abort firing (§2.1) — a real course with two cohorts holding sessions is a data
  decision for the user, not a coin flip.
- Anything that would require deciding *who may do a thing* beyond `D-6`.

---

## 9. Landing the work

**`redesign` is the trunk.** `main` is the pre-redesign version and is dropped once the redesign
lands (user, 2026-09-23). This branch was cut from `redesign` @ `6657c7a`, not from `main`, and
**merges back into `redesign`** when the phase is reviewed — never into `main`, and `main` is never
the base for a rebase here.

The merge happens in the primary checkout, which is where `redesign` is checked out and where
another agent is working. Do **not** perform it from this worktree, and never reset or clean that
checkout (`CLAUDE.md` §12). The coordinator lands it once that checkout is clean.
