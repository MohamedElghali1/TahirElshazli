# Database plan

Current schema: **10 applied migrations, 29 tables** (plus the runner's own `schema_migrations`
ledger). Migrations 001–008 have been applied to a real PostgreSQL 15 from an empty schema and are
covered by `test/postgres-repositories.integration-spec.ts`; **009 and 010 have not yet run against
a real database**, which is the first thing to fix.

Conventions, all inherited and all kept:

- `TEXT` primary keys (fixtures use readable ids like `course-1`), not UUID
- `TIMESTAMPTZ` in UTC; **`TIMESTAMPTZ(3)` on any column a keyset cursor pages on** — a JS `Date`
  carries milliseconds, and a microsecond value silently drops rows from the next page. This cost
  the audit log a real bug; do not regress it.
- Actor references (`assigned_by`, `posted_by`, `author_id`) are `REFERENCES users(id)` with **no
  cascade** — RESTRICT by omission, so an account that granted access cannot be deleted out from
  under the record. Subject references cascade.
- **Forward-only.** There are no down-migrations anywhere in this project, deliberately: "a `down`
  script authored months earlier is a guess about a state that no longer exists."
- Every repository interface has **both** an `InMemory*` and a `Postgres*` implementation. All 17
  pairs exist today; every new table adds two, not one.

---

## 1. Tables kept unchanged

`users`\* · `password_reset_tokens` · `courses`\* · `course_modules` · `lessons` · `materials` ·
`recordings`\* · `recording_progress` · `assessments`\* · `assessment_submissions`\* ·
`submission_revisions` · `assessment_targets` · `report_documents` · `notifications` · `audit_log` ·
`blog_posts` · `blog_post_media` · `google_oauth_credentials` · `assessment_google_forms` ·
`external_results` · `enrollments`

(\* gains columns — see §2. Nothing in this list is dropped or re-keyed.)

Worth stating explicitly: **`assessment_targets` stays.** The design's task modal offers a single
group, but the client asked for one-or-more on 2026-09-10 and the join costs nothing. Collapsing it
would be a one-way door for no benefit.

---

## 2. Columns added to existing tables

| Table | Column | Type | Why |
|---|---|---|---|
| `users` | `status` | `TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('waiting','active','rejected'))` | Registration approval queue |
| `users` | *(role CHECK)* | add `'admin'` | New Full admin role |
| `audit_log` | *(actor_role CHECK)* | add `'admin'` | Same |
| `student_profiles` | `mode` | `TEXT NOT NULL DEFAULT 'online' CHECK (mode IN ('school','online'))` | School vs online student |
| `student_profiles` | `school_name` | `TEXT` | Reports group by school |
| `student_profiles` | `parent_email` | `TEXT` | **The entire parent relationship** |
| `student_profiles` | `staff_notes` | `TEXT` | Never shown to the student |
| `courses` | — | — | unchanged |
| `recordings` | `thumbnail_url` | `TEXT` | Library is thumbnails-by-default |
| `recordings` | `is_visible` | `BOOLEAN NOT NULL DEFAULT true` | Management screen's toggle |
| `assessments` | `visibility` | `TEXT NOT NULL DEFAULT 'published' CHECK (visibility IN ('published','scheduled','hidden'))` | Distinct from the window |
| `assessments` | `marker_id` | `TEXT REFERENCES users(id)` | "Who marks this" |
| `assessments` | `allow_resubmission` | `BOOLEAN NOT NULL DEFAULT true` | Submission settings |
| `assessments` | `draft_id` | `TEXT REFERENCES task_drafts(id) ON DELETE SET NULL` | Provenance, not a live link |
| `assessment_submissions` | `returned_at` | `TIMESTAMPTZ(3)` | Save ≠ save-and-return |
| `assessment_submissions` | `include_in_report` | `BOOLEAN NOT NULL DEFAULT true` | Marking view toggle |

**On `visibility`.** It must be a separate column, not inferred. Today status derives purely from
timestamps, which cannot express "hidden", and cannot show a scheduled task as *locked with a date*
on the student's dashboard — the design requires exactly that ("nothing appears out of nowhere").

---

## 3. New tables

| Table | Key columns | Notes |
|---|---|---|
| `assistant_scopes` | `user_id PK`, `scope CHECK IN ('all_groups','assigned_groups')` | One row per assistant. **Explicit**, so "no assignment rows" is never ambiguous between "everything" and "nothing yet". |
| `assistant_group_assignments` | `id`, `user_id`, `group_id`, `assigned_by`, `assigned_at`, `UNIQUE(user_id, group_id)` | Rows exist only when scope is `assigned_groups`. Index on `user_id`. |
| `assistant_invitations` | `id`, `email`, `role`, `scope`, `group_ids TEXT[]`, `token UNIQUE`, `expires_at`, `accepted_at`, `invited_by` | Single-use; accepting creates the user and its scope in one transaction. |
| `task_drafts` | `id`, `course_id`, `type`, `work_type`, `title`, `description`, `instructions`, `attachments JSONB`, `used_count INT NOT NULL DEFAULT 0`, `created_by`, `updated_at` | The reuse library. |
| `submission_annotations` | `id`, `submission_id CASCADE`, `page INT`, `x_percent NUMERIC(5,2)`, `y_percent NUMERIC(5,2)`, `kind CHECK IN ('comment','tick','cross')`, `text`, `created_by`, `created_at` | Stored as **data**, not a flattened file — which is what makes them editable and deletable. Index `(submission_id, page)`. |
| `weekly_reports` | `id`, `student_id`, `group_id`, `course_id`, `week_number INT`, `period_start DATE`, `period_end DATE`, `generated_at`, `status CHECK IN ('new','under_review','reviewed','sent')`, `assigned_assistant_id`, `assistant_note`, `teacher_note`, `reviewed_by`, `reviewed_at`, `sent_at`, `sent_to`, `file_url`, `UNIQUE(student_id, week_number)` | The flagship new entity. Index `(group_id, week_number, status)`. |
| `notification_preferences` | `user_id PK`, four booleans | |
| `mail_deliveries` | `id`, `to_email`, `template`, `related_type`, `related_id`, `sent_at TIMESTAMPTZ(3)`, `status`, `error` | Emailing a child's marks to a parent is PII egress; it must be reconstructable. |
| `session_attachments` | `id`, `session_id CASCADE`, `url`, `name`, `position` | |

Every new table needs **two** repository implementations and an entry in
`test/postgres-repositories.integration-spec.ts`.

---

## 4. Structural changes — the risky ones

### 4.1 `group_courses` → `groups.course_id` **(destructive, one-way)**

The client chose one course per group. `CLAUDE.md` §6.1 argued the opposite and called a `course_id`
column *"the expensive mistake here… a one-way door that a join table is not."* The decision stands;
this records that it was made knowingly.

```
ALTER TABLE groups ADD COLUMN course_id TEXT REFERENCES courses(id);
ALTER TABLE groups ADD COLUMN learning_mode TEXT CHECK (learning_mode IN ('recorded','live'));

-- Refuse rather than guess if any group studies two courses.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM group_courses GROUP BY group_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'A group studies more than one course; collapse it by hand first.';
  END IF;
END $$;

UPDATE groups g SET course_id = gc.course_id, learning_mode = gc.learning_mode
  FROM group_courses gc WHERE gc.group_id = g.id;

ALTER TABLE groups ALTER COLUMN course_id SET NOT NULL;
ALTER TABLE groups ALTER COLUMN learning_mode SET NOT NULL;
DROP TABLE group_courses;
```

**The `RAISE EXCEPTION` guard is the important part.** Silently picking one of two courses would
corrupt every session, task and report hanging off that group, and nothing downstream would notice.

**Blast radius:** `GroupRepository` (both drivers), `LearningModeService`, `StudentGroupsService`,
`GroupsService`, the dashboard, reports, assessments targeting, and the seed fixtures.

### 4.2 `course_staff_assignments` → `assistant_group_assignments`

```
INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by, assigned_at)
SELECT gen_id(), csa.user_id, g.id, csa.assigned_by, csa.assigned_at
  FROM course_staff_assignments csa
  JOIN groups g ON g.course_id = csa.course_id;

INSERT INTO assistant_scopes (user_id, scope)
SELECT DISTINCT user_id, 'assigned_groups' FROM course_staff_assignments
ON CONFLICT DO NOTHING;

DROP TABLE course_staff_assignments;
```

An assistant assigned to a course inherits every group of that course — the faithful translation.
Drop the old table **only after** `StaffScopeService` is rewritten and its spec is green; the 404
behaviour and the identical error message must survive the rewrite untouched.

### 4.3 `attendance.attended BOOLEAN` → `status` enum

```
ALTER TABLE attendance ADD COLUMN status TEXT CHECK (status IN ('present','absent','late'));
UPDATE attendance SET status = CASE WHEN attended THEN 'present' ELSE 'absent' END;
ALTER TABLE attendance ALTER COLUMN status SET NOT NULL;
ALTER TABLE attendance ADD COLUMN marked_by TEXT REFERENCES users(id);
ALTER TABLE attendance DROP COLUMN attended;
```

`CLAUDE.md` §11 asked for this decision *before* multiple read-sides existed, warning that otherwise
it becomes "three read-sides and a data migration instead of one interface." There is exactly one
read-side today. This is the cheapest it will ever be.

Historical rows become `present`/`absent`; no existing row can be `late`, which is correct — nobody
ever recorded one.

### 4.4 `live_sessions` re-parents to the group

```
ALTER TABLE live_sessions ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE live_sessions ADD COLUMN ends_at TIMESTAMPTZ;
ALTER TABLE live_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'online'
  CHECK (mode IN ('on_ground','online'));
ALTER TABLE live_sessions ADD COLUMN location TEXT;       -- room OR meeting link
ALTER TABLE live_sessions ADD COLUMN assistant_id TEXT REFERENCES users(id);
ALTER TABLE live_sessions ADD COLUMN description TEXT;
ALTER TABLE live_sessions ADD COLUMN private_notes TEXT;
ALTER TABLE live_sessions ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN state TEXT NOT NULL DEFAULT 'published'
  CHECK (state IN ('planned','published'));
-- backfill group_id from the course's single group where unambiguous, else refuse
UPDATE live_sessions SET ends_at = scheduled_at + (duration_minutes || ' minutes')::interval;
```

`zoom_link` folds into `location`; `duration_minutes` folds into `ends_at`. Keep both old columns
for one migration, then drop them once the readers are switched — a two-step is cheap insurance on
the table the student timetable depends on.

**Backfill hazard:** a course with two groups has no single correct `group_id`. Refuse and let a
human assign, exactly as in 4.1.

---

## 5. Indexes

| Index | Why |
|---|---|
| `users (status) WHERE status = 'waiting'` | partial; the nav badge counts this on every console load |
| `assistant_group_assignments (user_id)` | the scope check, on every assistant request |
| `assistant_group_assignments (group_id)` | "who assists this group" |
| `weekly_reports (group_id, week_number, status)` | the Reports list's three filters |
| `weekly_reports (student_id, week_number)` UNIQUE | one report per student per week |
| `submission_annotations (submission_id, page)` | marking view opens a page at a time |
| `live_sessions (group_id, scheduled_at)` | replaces the course-keyed index |
| `attendance (session_id)` | the sheet; `(student_id)` already exists |
| `task_drafts (course_id, type)` | the picker filters on both |
| `mail_deliveries (related_type, related_id)` | "was this report actually sent?" |

At ~300 students none of this is performance-critical; these exist so the queries are index-shaped
from the start rather than retrofitted. Resist adding more — `CLAUDE.md` §7.3 is explicit that at
this scale round trips and row volume matter and query counts mostly do not.

---

## 6. Constraints worth having

- `CHECK ((mode = 'school') = (school_name IS NOT NULL))` on `student_profiles` — the design's
  conditional field, enforced rather than trusted.
- `CHECK (scheduled_at < ends_at)` on `live_sessions`.
- `CHECK (status <> 'sent' OR sent_at IS NOT NULL)` on `weekly_reports` — a sent report with no
  timestamp is a lie in an auditable record.
- `CHECK (scope <> 'all_groups' OR NOT EXISTS …)` is not expressible in a table CHECK; enforce the
  "all_groups implies no assignment rows" invariant in the service and test it.

---

## 7. Migration order

`011` **the two role CHECK widenings, and nothing else** · `012` `users.status` (registration
approval, `DOM-4`) **+** student profile fields · `013` **group collapse** (destructive) ·
`014` assistant scope tables + data move · `015` task drafts + assessment columns ·
`016` annotations + submission columns · `017` sessions rework · `018` attendance enum ·
`019` weekly reports · `020` announcements (group audience, media, draft) ·
`021` notification preferences + mail deliveries

**Corrected 2026-09-19.** This list previously read "`011` roles + user status", which attributed two
different units' work to one file: `AUTH-1` (unit 1) and `DOM-4` (unit 2). **A migration file is
immutable once applied** — the ledger records it by filename — so unit 2 could not have appended to
it. `011_full_admin_role.sql` shipped in unit 1 as two `ALTER TABLE … DROP CONSTRAINT … ADD
CONSTRAINT` statements widening `users_role_check` and `audit_log_actor_role_check` to admit
`'admin'`, and **`users.status` is not in it**. `DOM-4` takes its own number.

(The one precedent for amending a migration in place is 002, and it required proof the file had never
been applied anywhere real. 011 is in the same position *today* — it has never run — but that is an
argument for running it, not for treating it as editable.)

013 and 014 are the pair to be careful with: **013 must land and be verified before 014**, because
014's backfill joins through `groups.course_id`. That is also why `AUTH-2` moved out of unit 1 and
into unit 2 on 2026-09-19 (`CHANGELOG.md`): a `014` authored with no `013` present applies straight
after `012` and aborts every boot, because `MigrationRunner.sqlFilesIn` sorts lexicographically.

---

## 8. Data risks

| Risk | Mitigation |
|---|---|
| A group studying two courses | Migration raises rather than guessing (§4.1) |
| A course with two groups, when re-parenting sessions | Same (§4.4) |
| Seed fixtures break on 013/`users.status` | **Regenerate, don't migrate** — the precedent is `CLAUDE.md` §7.1's call on assessment targeting: fixtures exist to make a dev database useful, and preserving them would add permanent concepts to protect throwaway rows |
| Migrations 009 and 010 have never run against real Postgres | **Still open as of 2026-09-19.** The mitigation was "run the integration suite before authoring 011"; it was **not** met — `011` was authored unverified on the user's direction, because there is no reachable PostgreSQL on the development machine (Docker daemon down). `011` is the lowest-risk migration in the plan — two CHECK widenings, strictly looser, no data loss possible — which is what makes proceeding defensible where it would not be for `013`. **The exposure that remains:** `011` will be applied for the first time in the same run as 009 and 010, and the runner stops at the first failing file, so a defect in either **masks `011` entirely**. Named candidates in `docs/phases/unit-1/PHASE_PLAN.md` §9 R-2 — the likeliest is `010`'s `NUMERIC(10,2)` columns, which `pg` returns as **strings**, invisible on the memory driver where the fixture is a JS number |
| An audit action added to the union but not the DTO's exhaustive `Record` | Compile error by construction — keep that pattern for all ~17 new actions |
| In-memory and Postgres drivers drifting | Every new table gets both, and an integration test; the suite already covers all 17 existing pairs |

---

## 9. Verification

```
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
```

against an **empty schema**, so every migration runs in order. CI already fails the job if the suite
reports zero executed tests — a self-skipping suite is otherwise indistinguishable from a passing
one. After 013 and 018 specifically, assert the post-conditions directly against the database
(column dropped, constraint present, row counts preserved) rather than only through the repository
layer, which is how 008's first run was verified.
