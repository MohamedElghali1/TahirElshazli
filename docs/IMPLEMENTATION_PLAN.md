# Implementation plan

The living backlog for the redesign. **This file is the source of truth for what is done.** Update
it as part of finishing a task, not afterwards.

Status: `[ ]` not started · `[~]` in progress · `[x]` complete · `[!]` blocked

Companion docs: `PRODUCT_SPEC.md` (what) · `DOMAIN_MODEL.md` (entities) ·
`AUTHORIZATION_MODEL.md` (who) · `API_SPEC.yaml` (contract) · `DATABASE_PLAN.md` (schema) ·
`SECURITY.md` · `ARCHITECTURE.md` · `CHANGELOG.md` (decisions).

---

## Definition of done

A task is `[x]` only when **all applicable** hold:

1. Implementation complete, in the layer `ARCHITECTURE.md` §6 names.
2. Migration written, and **run against real Postgres from an empty schema**.
3. Both repository drivers implemented (`InMemory*` **and** `Postgres*`).
4. DTO validation at the API boundary.
5. Authorization enforced server-side, in the service — not only by `@Roles`.
6. Audit entry written **inside** the same transaction, with its action added to the union **and**
   the DTO's exhaustive `Record`.
7. Tests: unit for the rule, integration for the SQL, **and a refusal test for every permission** —
   authorized works, unauthorized is rejected.
8. Error cases handled: not-found, out-of-scope (404, identical body), conflict, unconfigured driver.
9. Frontend integrated against the **real** API — no mock data, no important state kept only in the
   browser.
10. `API_SPEC.yaml` matches what was built.
11. `npx tsc --noEmit` and `npx eslint` clean in `frontend/`; `npm test` + `npm run test:e2e` green
    in `backend/`.
12. Design adherence checked — the eight questions in §Verification.
13. This file and `CHANGELOG.md` updated.

**Not done because it compiles. Not done because it looks right.**

---

## Phase 0 — Specification `[~]`

| ID | Task | Status |
|---|---|---|
| `SPEC-1` | `PRODUCT_SPEC.md` | `[x]` |
| `SPEC-2` | `DOMAIN_MODEL.md` | `[x]` |
| `SPEC-3` | `AUTHORIZATION_MODEL.md` | `[x]` |
| `SPEC-4` | `API_GAP_ANALYSIS.md` | `[x]` |
| `SPEC-5` | `API_SPEC.yaml` (validated: 40 paths, 54 ops, 150 refs resolve) | `[x]` |
| `SPEC-6` | `DATABASE_PLAN.md` | `[x]` |
| `SPEC-7` | `SECURITY.md` | `[x]` |
| `SPEC-8` | `ARCHITECTURE.md` | `[x]` |
| `SPEC-9` | `IMPLEMENTATION_PLAN.md` (this file) | `[x]` |
| `SPEC-10` | `CHANGELOG.md` | `[x]` |
| `SPEC-11` | Amend `CLAUDE.md` §0, §2.1, §5.11.1, §5.16, §6.1, §7.2; mark `frontend-design-system.md` superseded | `[x]` |
| `SPEC-12` | **Run migrations 009 + 010 against real Postgres** — never yet done; every prior first run found something | `[!]` |

`SPEC-12` is blocked only on the environment: Docker 29.7.2 is installed but the daemon is not
running. To close it, start Docker Desktop and then:

```
docker compose up -d db
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
```

against an **empty** schema, so all ten migrations run in order. It is a gate rather than a
nice-to-have: 001–008 have each been verified this way and **every single first run found
something** — the audit log's microsecond-cursor bug among them. Authoring migration 011 on top of
two unverified ones would bury whatever 009 or 010 gets wrong.

**Gate:** `SPEC-12` closes before Phase 1 starts. (`SPEC-11` is done.)

---

## Phase 1 — Identity and authorization  *(backend; unblocks everything)*

| ID | Task | Deps | DB | API | Authz | Tests |
|---|---|---|---|---|---|---|
| `AUTH-1` `[ ]` | Add `Role.Admin`. Migration for both role CHECKs. Define `STAFF_ADMIN` once and use it at ~30 sites. | `SPEC-12` | 011 | ~30 routes widen | New role reaches all teacher routes | Extend the `it.each` refusal tables; one test proving admin ≡ teacher |
| `AUTH-2` `[ ]` | **Course scoping → group scoping.** `assistant_scopes` + `assistant_group_assignments`; rewrite `StaffScopeService` internals; migrate and drop `course_staff_assignments`. | `AUTH-1`, `DOM-1` | 014 | `[REPLACE]` ×3 | The chokepoint itself | **404-not-403 and the identical message must survive**; both scope values tested |
| `AUTH-3` `[ ]` | `AssistantCapabilities` preset gating the four withheld verbs. `DELETE /staff/groups/:id/members/:studentId` → teacher/admin. | `AUTH-2` | — | 1 route | The four verbs | One refusal test per verb |
| `AUTH-4` `[ ]` | Assistant invitations: table, 4 admin routes, public accept. | `AUTH-2`, `MAIL-1` | 014 | 5 new | Teacher/admin only | Token reuse, expiry, and unknown all give one message |
| `AUTH-5` `[!]` | Device/session list. **Blocked on decision 1** (Redis, or drop the tab). | — | — | 2 new | Own sessions only | — |

---

## Phase 2 — Domain reshaping  *(backend)*

| ID | Task | Deps | DB | Risk |
|---|---|---|---|---|
| `DOM-1` `[ ]` | **Collapse `group_courses` → `groups.course_id` + `learning_mode`.** Migration **raises** if any group holds two courses. | `SPEC-12` | 013 | **Highest.** Destructive, one-way. Touches GroupRepository ×2, LearningModeService, StudentGroupsService, dashboard, reports, assessments |
| `DOM-2` `[ ]` | `groups` gains `assistant_id`, `meets`, `room`. | `DOM-1` | 013 | Low |
| `DOM-3` `[ ]` | `student_profiles` gains `mode`, `school_name`, `parent_email`, `staff_notes` + the conditional CHECK. | — | 012 | Low |
| `DOM-4` `[ ]` | Registration approval: `users.status`; accept/reject routes; `POST /courses/:id/enroll` → staff-only. **Keep `CoursesService.enroll`.** | `AUTH-1` | 011 | Medium — changes the login path |
| `DOM-5` `[ ]` | Course CRUD. | `AUTH-1` | — | Low |
| `DOM-6` `[ ]` | **Regenerate seed fixtures** for the new shape. | `DOM-1`…`DOM-4` | seeds | Medium |

---

## Phase 3 — Mail  *(backend)*

| ID | Task | Deps |
|---|---|---|
| `MAIL-1` `[ ]` | `MailSender` port + `MAIL_DRIVER=none\|log\|smtp`, resolved in `env.ts` like `STORAGE_DRIVER`; 503 when unconfigured. Fold `PasswordResetNotifier` onto it. | — |
| `MAIL-2` `[ ]` | `mail_deliveries` table, written in the same transaction as the causing action. **Recipient and template only — never the rendered body** (`SECURITY.md` §5). | `MAIL-1` |
| `MAIL-3` `[ ]` | Templates: invitation, sign-in link, report, announcement. | `MAIL-2` |

---

## Phase 4 — Shells  *(frontend)*

| ID | Task | Deps |
|---|---|---|
| `SHELL-1` `[ ]` | Console shell — 244px `--surface-2` sidebar, course switcher, six nav sections, 52px crumb header, role-based hiding (courtesy only). | `AUTH-1` |
| `SHELL-2` `[ ]` | Student shell — 248px `--surface-3` sidebar, **no right border**, white-pill active item, WhatsApp FAB, 96px bottom padding. | — |
| `SHELL-3` `[ ]` | Flat student IA + course switcher; `/learn/[id]/*` collapses to top-level routes. | `SHELL-2` |
| `SHELL-4` `[ ]` | Delete `components/app/*`, `components/site/*`, legacy pages. **Frontend builds again from here.** | `SHELL-1..3` |

---

## Phases 5–14 — Vertical slices

Each slice: migration → repositories (both) → service → authz → API → tests → frontend → check.

### Phase 5 — People
`PEOPLE-1` `[ ]` Student directory + waiting queue (`DOM-4`) ·
`PEOPLE-2` `[ ]` Student detail + edit ·
`PEOPLE-3` `[ ]` Create student directly (emails a sign-in link; needs `MAIL-3`) ·
`PEOPLE-4` `[ ]` Assistants list + invite + scope editing (`AUTH-4`) ·
`PEOPLE-5` `[ ]` Assistant activity screen over the existing audit log

### Phase 6 — Groups
`GROUP-1` `[ ]` Group CRUD with course/assistant/meets/room (`DOM-2`) ·
`GROUP-2` `[ ]` Group detail + membership multi-select ·
`GROUP-3` `[ ]` Bulk move ("Move N to group") ·
`GROUP-4` `[ ]` Group report (stats + per-student table, PDF)

### Phase 7 — Tasks
`TASK-1` `[ ]` `visibility` enum, distinct from the window ·
`TASK-2` `[ ]` `task_drafts` table + 4 routes ·
`TASK-3` `[ ]` Author from a draft (copies content, increments `usedCount`) ·
`TASK-4` `[ ]` Attachments ·
`TASK-5` `[ ]` Submission settings + marker assignment ·
`TASK-6` `[ ]` Global `GET /staff/tasks` ·
`TASK-7` `[ ]` Task list + authoring screens

### Phase 8 — Marking
`MARK-1` `[ ]` `submission_annotations` + 4 routes ·
`MARK-2` `[ ]` Split save from save-and-return (`returned_at`) ·
`MARK-3` `[ ]` Submissions-for-one-task **including non-submitters** ·
`MARK-4` `[ ]` Marking view (page, toolbar, annotation list, mark, feedback) ·
`MARK-5` `[!]` Marked-copy delivery. **Blocked on decision 2** (flattened PDF vs rendered overlay)

### Phase 9 — Mark book
`BOOK-1` `[ ]` Grid endpoint · `BOOK-2` `[ ]` Screen (sticky first column, em-dash for missing) ·
`BOOK-3` `[ ]` CSV export

### Phase 10 — Sessions and attendance
`SESS-1` `[ ]` Sessions re-parent to group + mode/location/assistant/visible/state (`DOM-1`) ·
`SESS-2` `[ ]` **Attendance boolean → three-state enum** ·
`SESS-3` `[ ]` Attendance sheet read + bulk write ·
`SESS-4` `[ ]` Draft timetable + publish ·
`SESS-5` `[ ]` Console week grid ·
`SESS-6` `[ ]` Student timetable — **meeting link withheld server-side until T-30min** ·
`SESS-7` `[ ]` Student attendance screen

### Phase 11 — Weekly reports  *(the flagship; 9 routes, none exist)*
`RPT-1` `[ ]` `weekly_reports` table + repositories ·
`RPT-2` `[ ]` Generation service (pure composition over attendance/submissions/progress; **idempotent; never overwrites `sent`**) ·
`RPT-3` `[!]` Generation trigger. **Blocked on decision 3** ·
`RPT-4` `[ ]` List + detail routes ·
`RPT-5` `[ ]` Note save + review transition (requires a non-empty note) ·
`RPT-6` `[ ]` **Send to parent** — teacher/admin only, requires `reviewed` + `parentEmail`, irreversible, audited, `mail_deliveries` row ·
`RPT-7` `[ ]` PDF generation ·
`RPT-8` `[ ]` Console Reports list + ReportViewer ·
`RPT-9` `[ ]` Student Marks page (the report *is* the page)

### Phase 12 — Announcements
`ANN-1` `[ ]` `group:<id>` audience · `ANN-2` `[ ]` Media · `ANN-3` `[ ]` Draft + publish ·
`ANN-4` `[ ]` Email fan-out, idempotent on `published_at` (`MAIL-3`) ·
`ANN-5` `[ ]` Live reach preview · `ANN-6` `[ ]` Compose screen with student-view preview

### Phase 13 — Google Forms surface  *(frontend only — backend complete)*
`WORK-1` `[ ]` Task results screen (`Score`/`Meter` split, understated-figure banner) ·
`WORK-2` `[ ]` Unmatched queue + match-student ·
`WORK-3` `[ ]` `SyncStatus` on every mirrored surface ·
`WORK-4` `[ ]` Student Quizzes surface driven by `work_type: google_form` — **no quiz engine**

### Phase 14 — Settings and account
`SET-1` `[ ]` `/me/profile` for staff · `SET-2` `[ ]` Notification preferences ·
`SET-3` `[ ]` Google panel over the 5 existing routes (four states) ·
`SET-4` `[ ]` Courses tab (`DOM-5`) · `SET-5` `[ ]` Groups tab · `SET-6` `[ ]` Student Settings + avatar upload

---

## Phases 15–17 — Remaining surfaces

`STU-1` `[ ]` Overview (action-first; **no mark on this page**) ·
`STU-2` `[ ]` `recordings.thumbnail_url` + library grid/list ·
`STU-3` `[ ]` Lesson detail + next-recording ·
`STU-4` `[ ]` Homework + four attempt states ·
`STU-5` `[ ]` Materials · `STU-6` `[ ]` Classmates (already correct server-side) ·
`STU-7` `[ ]` Help/WhatsApp

`SITE-1` `[ ]` Homepage · `SITE-2` `[ ]` Course pages · `SITE-3` `[ ]` Blog ·
`SITE-4` `[ ]` Contact · `SITE-5` `[ ]` Auth screens (sign-in card shape ×4)

`GAUTH-1` `[ ]` Google OAuth sign-in. **Last.** Nothing depends on it and it replaces a working,
well-tested mechanism. Non-negotiables in `SECURITY.md` §2.6 — especially: never auto-link a Google
account to a password account by email alone.

`OPS-1` `[ ]` Regenerate `lib/api.ts` + `lib/types.ts` from `API_SPEC.yaml`, or add a CI drift check.

---

## Dependency graph

```
SPEC-12 ─┬─> DOM-1 ─┬─> DOM-2 ──> GROUP-*
         │          ├─> AUTH-2 ──> AUTH-3 ──> (all /staff/*)
         │          └─> SESS-1 ──> SESS-2..7 ──┐
         ├─> AUTH-1 ─┬─> DOM-4 ──> PEOPLE-1..3 │
         │           └─> DOM-5 ──> SET-4       ├──> RPT-2 ──> RPT-4..9
         ├─> DOM-3 ────────────────────────────┤
         └─> MAIL-1 ──> MAIL-2 ──> MAIL-3 ─────┴──> AUTH-4, ANN-4, RPT-6

AUTH-1 ──> SHELL-1 ──┐
SHELL-2 ──> SHELL-3 ─┴──> SHELL-4 ──> every frontend task
TASK-1..6 ──> MARK-1..4 ──> BOOK-1..3 ──> RPT-2
```

**Critical path:** `SPEC-12 → DOM-1 → AUTH-2 → SESS-1 → RPT-2 → RPT-6`.
`DOM-1` and `AUTH-2` gate the most work; do them carefully and first.

---

## Verification

**Per slice**
```
npm test --workspace=backend
npm run test:e2e --workspace=backend
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
cd frontend && npx tsc --noEmit && npx eslint .
docker compose up -d --build     # then click the slice through both consoles
```

**Design adherence, after every screen** (the handoff's own eight questions):
1. Any earnings or total-revenue figure? *(must be none)*
2. Any place a mark and a completion percentage share a bar, column or average?
3. Any literal hex, rgb, or px font-size that should be a token?
4. Any `text-[var(--…)]`? *(silently drops the colour — use `text-fg`, `text-fg-2`, `text-accent`)*
5. Any element that loses its focus outline?
6. Any `Panel` nested inside a `Panel`?
7. Any Title Case button label, or any emoji?
8. Does it survive `dir="rtl"` and a long Arabic name? *(`ليلى فهمي` is in the fixtures for this)*

Report findings; do not fix silently.

---

## Blocked — needs a decision

| ID | Blocks | Question |
|---|---|---|
| `D-1` | `AUTH-5` | Redis for shared session state, or drop the Security tab for launch? |
| `D-2` | `MARK-5` | Marked copy: flattened PDF (needs a server-side PDF library) or rendered overlay? |
| `D-3` | `RPT-3` | Report generation: scheduled job, on-demand button, or both? |
| `D-4` | `DOM-3`, `SESS-1` | Are `students.mode`, session `mode` and `learning_mode` really three axes? |
| `D-5` | `DOM-6` | Confirm fixtures are regenerated, not migrated. |
| `D-6` | `SESS-1` | May an assistant create or edit a session? The board's `CRS-11` says yes; the current preset says no. |

---

## Counts

| | |
|---|---|
| Phases | 18 |
| Tasks | 84 |
| Blocked | 6 |
| Complete | 10 (Phase 0) |
| Migrations | 11 (011–021), one destructive |
| New backend routes | ~48 |
| Routes modified | ~28 |
| Routes retired | 12 |
