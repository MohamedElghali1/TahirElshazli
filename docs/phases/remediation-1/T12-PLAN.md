# T12 — Weekly reports (Unit 9, `REM-031`) — plan

Written 2026-10-02 by the lead. Decided by `D-63` (shape) and `D-66` (week, marks, assistants).
Supersedes the parent-email / PDF / notes parts of `PRODUCT_SPEC.md` §2.4 and `RPT-5…7`.

## What it is
Every student in every group gets one report per **Saturday–Friday week (Africa/Cairo)**: that week's
attendance, homework completion and marks. Drafts are generated automatically after the week ends.
The teacher or an admin reviews a group's drafts and **publishes** them; the student then sees them
in the app. Nothing is emailed. Assistants have no access (`D-66`).

## What a report contains (a snapshot, frozen at publish)
- **Attendance** — the group's published sessions that **started** in the week and have ended:
  `present / expected`, with `late` and `absent` counted separately and never as present (the
  `SESS-7` rule, reused from `StudentSessionsService.collect`, filtered to the group and the week).
  Unmarked sessions are shown as unmarked, not absent.
- **Homework completion** — the tasks **due** in the week that the student was set (targeted to a
  group they hold, visible — the `getPerformanceEntries` rules): `submitted / due`.
- **Marks** — the same tasks, one row each: title, type, due date, status, and the mark over its
  denominator — a returned submission's score, or for a `google_form` task the imported result's
  score (`D-60`). No mark → em-dash. **No average and no merged figure** (`CLAUDE.md` §11.1:
  completion is a count, marks are per task).

## Data — migration `028_weekly_reports.sql`
`weekly_reports(id uuid pk, group_id → groups, student_id → users, course_id → courses,
week_start date /* the Saturday, Cairo calendar date */, status text check in ('draft','published'),
content jsonb not null, generated_at timestamptz(3), published_at timestamptz(3) null,
published_by → users null, created_at, updated_at, unique (group_id, student_id, week_start))`,
indexes `(student_id, status, week_start desc)` and `(group_id, week_start)`. Two repositories
(`InMemory*`, `Postgres*`) behind `WEEKLY_REPORT_REPOSITORY`. The key write is
`upsertDraft`: `INSERT … ON CONFLICT (group_id, student_id, week_start) DO UPDATE SET content, generated_at
WHERE weekly_reports.status = 'draft'` — **a published row can never be rewritten**, enforced in SQL,
mirrored in memory, and pinned by a test on both drivers.

## Generation — pure composition, idempotent, in-process timer
- `WeeklyReportsService.generateWeek(weekStart)`: for each group, for each current member, compose
  from existing services and `upsertDraft`. Re-running is a no-op for published rows and a refresh for
  drafts.
- Week maths in one small helper: `weekStartFor(instant)` and `weekWindow(weekStart)` → `[Sat 00:00,
  next Sat 00:00)` in Africa/Cairo **via `Intl`** (Cairo observes DST again since 2023; a fixed +2/+3
  would be wrong for half the year). Unit-tested across both DST transitions.
- `WeeklyReportsScheduler`: on application bootstrap and then hourly (`setInterval(…).unref()`),
  generate the **last completed** week. No job framework, no queue (`CLAUDE.md` §5); one replica makes
  this safe, and the SQL guard makes a double tick harmless. Off when `NODE_ENV=test` (so the e2e
  suites' booted apps do not race their fixtures). Drafts of the last completed week therefore refresh
  hourly until published; older unpublished weeks stay as last generated.
- `ponytail:` hourly timer on one replica; with a second replica both tick, which the upsert guard
  tolerates — revisit only with the Redis trigger in `CLAUDE.md` §5.

## Routes
Teacher/admin only (`/admin/*`, `STAFF_ADMIN`), so no scope filter is needed and an assistant gets
the ordinary 403:
- `GET /admin/weekly-reports/weeks` — group-weeks with counts `{ groupId, groupName, courseTitle,
  weekStart, drafts, published }`, newest first.
- `GET /admin/weekly-reports?groupId=&weekStart=` — that group-week's reports (student name, status,
  attendance and completion counts, content).
- `POST /admin/weekly-reports/publish` `{ groupId, weekStart }` — publishes every **draft** in that
  group-week in one transaction: status, `published_at`, `published_by`; one audit entry
  `weekly_report.published` with the group, week and report ids; an in-app notification per student
  ("Your weekly report is ready", link `/marks`). Already-published rows are untouched; publishing an
  empty set is a 409. There is deliberately no publish-all-groups action.
Student (`@Roles(Student)`):
- `GET /reports/weekly` — the caller's **published** reports for courses they are still enrolled in,
  newest first. No id route, so there is no other-student id to guess.
`API_SPEC.yaml` gains all four; the mirror gains the types with `Check_` lines.

## Frontend
- Console `/manage/reports` (nav item re-enabled for admins only): group-weeks list → a group-week
  page with one row per student (attendance x of y, homework x of y, marks), expandable to the full
  report, and **Publish N reports** with a confirmation naming the group and week.
- Student `/marks`: a "Weekly reports" section above the marks table (`RPT-9`: the report is the
  page), newest first; each report shows attendance, homework completion and the marks rows.
- Both themes, RTL, a long Arabic name; marketing-free console type scale.

## Tests
Unit: week maths (DST weeks, Friday 23:59 vs Saturday 00:00 Cairo); composition (late ≠ present,
unmarked ≠ absent, untargeted/hidden tasks excluded, google_form score used, em-dash when none);
idempotence; a published report survives regeneration byte-for-byte; publish audit entry; student
sees published only and only their own. Authorization: assistant → 403 on every `/admin/weekly-*`
route; a student → 403 on them; a student's list never contains another student's report.
Integration: both repository methods on PostgreSQL incl. the SQL guard. Migration 028 from an empty
schema, and on a seeded database. e2e: cases go into the existing `app.e2e-spec.ts` (no sixth file).

## Slices (one commit each, lead-gated)
- **12a** migration 028 + both repositories + integration cases.
- **12b** week maths + composition + `generateWeek` + scheduler + unit tests.
- **12c** routes, audit action, notifications, DTOs, `API_SPEC.yaml`, mirror types, e2e cases.
- **12d** console screens + student section + nav item; live browser check.

## Status
Plan written and committed 2026-10-02. **All four slices committed** (12a table, 12b composition + hourly generation, 12c routes + audit + notifications + migration 029, 12d screens). `REM-031` done 2026-10-02.
