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
| `student_profiles` | ~~`mode`~~ | **NOT BUILT** — `CHANGELOG.md` `D-4`, ruling **R-2** (2026-09-20). `D-9` removed the last mode axis; a column nothing reads is a constraint carrying no decision. Migration `014` adds the three columns below and no `mode`. | — |
| `student_profiles` | `school_name` | `TEXT` | Reports group by school |
| `student_profiles` | `parent_email` | `TEXT` | **The entire parent relationship** |
| `student_profiles` | `staff_notes` | `TEXT` | Never shown to the student |
| `courses` | — | — | unchanged |
| `recordings` | `thumbnail_url` | `TEXT` | Library is thumbnails-by-default |
| `recordings` | `is_visible` | `BOOLEAN NOT NULL DEFAULT true` | Management screen's toggle |
| `assessments` | `visibility` | `TEXT NOT NULL DEFAULT 'published' CHECK (visibility IN ('published','hidden'))` — **narrowed by `D-28`**: `scheduled` is derived, not stored. Migration `018`. | Distinct from the window |
| `assessments` | `marker_id` | `TEXT REFERENCES users(id)` — `018` | "Who marks this" (`D-32`) |
| `assessments` | `allow_resubmission` | `BOOLEAN NOT NULL DEFAULT true` — `018` | Submission settings |
| `assessments` | `submission_modes` | `TEXT[] NOT NULL DEFAULT '{}' CHECK (submission_modes <@ ARRAY['pdf_upload','doc_link','photo_upload'])` — `018`, **added by `D-31`** | Submission settings; multi-file is unit 7's |
| `assessments` | `draft_id` | `TEXT REFERENCES task_drafts(id) ON DELETE SET NULL` — `018` | Provenance, not a live link |
| `assessments` | `attachments` | `JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array')` — `018`, **added by unit 6** (it was missing here; `API_GAP_ANALYSIS.md` A4/B3 require attachments on the task itself). Each element carries `audience` (`D-29`). | Copied from a draft, a handful per task, so JSONB rather than a child table |
| `assessment_submissions` | `returned_at` | `TIMESTAMPTZ(3)` | Save ≠ save-and-return. **Applied in `019`** (unit 7): backfilled `:= corrected_at`; `CHECK (returned_at IS NULL OR corrected_at IS NOT NULL)` |
| `assessment_submissions` | `include_in_report` | `BOOLEAN NOT NULL DEFAULT true` | Marking view toggle. **Deferred to the weekly-reports migration** (unit 7 assumption A-5): nothing reads it before then |

**On `visibility`.** It must be a separate column, not inferred: status derived purely from
timestamps cannot express "hidden". **`D-28` (2026-09-22) narrowed it to `published | hidden`.** The
second half of the original reasoning was false against the code: a `published` task with a future
`available_from` already reads to a student as `locked` with its opening date. So `scheduled` is the
derived *label* for `published ∧ now < available_from`, computed on the staff read and never stored,
and there is no `publish_at`. A `hidden` task is absent from every student read, and hiding one that
has a submission is refused (409).

---

## 3. New tables

| Table | Key columns | Notes |
|---|---|---|
| `assistant_scopes` | `user_id PK`, `scope CHECK IN ('all_groups','assigned_groups')` | One row per assistant. **Explicit**, so "no assignment rows" is never ambiguous between "everything" and "nothing yet". |
| `assistant_group_assignments` | `id`, `user_id`, `group_id`, `assigned_by`, `assigned_at`, `UNIQUE(user_id, group_id)` | Rows exist only when scope is `assigned_groups`. Index on `user_id`. |
| `assistant_invitations` | `id`, `email`, `role`, `scope`, `group_ids TEXT[]`, `token UNIQUE`, `expires_at`, `accepted_at`, `invited_by` | Single-use; accepting creates the user and its scope in one transaction. |
| `task_drafts` | `id`, `course_id`, `type`, `work_type`, `title`, `description`, `instructions`, `attachments JSONB`, `used_count INT NOT NULL DEFAULT 0`, `created_by`, `created_at`, `updated_at` (both `TIMESTAMPTZ(3)`) | The reuse library. Migration `018`. `created_at` added by unit 6 (the §9 convention; this list was shorthand). |
| `submission_annotations` | **As applied in `019` (unit 7), per `D-2`:** `id`, `submission_id CASCADE`, `file_url` (which file the mark is on; survives a resubmission), `page INT 1–500`, `kind CHECK IN ('comment','tick','cross','pen','highlight')`, `x_percent`/`y_percent NUMERIC(5,2) 0–100`, `text ≤ 2000` (non-blank for a comment), `path JSONB` (a stroke's `[[x%,y%],…]`, 2–2000 points, present exactly for `pen`/`highlight`), `created_by RESTRICT`, `created_at`, `updated_at` (`TIMESTAMPTZ(3)`) | Stored as **data**, not a flattened file — which is what makes them editable and deletable. Index `(submission_id, page)`. `NUMERIC` arrives as a string; the repository parses it. |
| `weekly_reports` | `id`, `student_id`, `group_id`, `course_id`, `week_number INT`, `period_start DATE`, `period_end DATE`, `generated_at`, `status CHECK IN ('new','under_review','reviewed','sent')`, `assigned_assistant_id`, `assistant_note`, `teacher_note`, `reviewed_by`, `reviewed_at`, `sent_at`, `sent_to`, `file_url`, `UNIQUE(student_id, week_number)` | The flagship new entity. Index `(group_id, week_number, status)`. |
| `notification_preferences` | `user_id PK`, four booleans | |
| `mail_deliveries` | `id`, `to_email`, `template`, `related_type`, `related_id`, `sent_at TIMESTAMPTZ(3)`, `status`, `error` | Emailing a child's marks to a parent is PII egress; it must be reconstructable. |
| `session_attachments` | `id`, `session_id CASCADE`, `url`, `name`, `position` | |

Every new table needs **two** repository implementations and an entry in
`test/postgres-repositories.integration-spec.ts`.

---

## 4. Structural changes — the risky ones

### 4.1 `group_courses` → `groups.course_id` **(destructive, one-way)** — **SHIPPED as `013`**

The client chose one course per group. `CLAUDE.md` §6.1 argued the opposite and called a `course_id`
column *"the expensive mistake here… a one-way door that a join table is not."* The decision stands;
this records that it was made knowingly.

**Reconciled 2026-09-20 with what actually ran** (unit 2 slice 2a,
`backend/src/database/migrations/013_group_holds_one_course.sql`). Three differences from the DDL
this section previously held, each deliberate:

1. **No `learning_mode`.** `D-9` retired the axis; migration `012` drops the column a day before
   `013` would have carried it.
2. **A second `RAISE EXCEPTION`, for a group with ZERO courses.** This section did not name that
   path, and it is reachable — `GroupRepository.create` made a group with no course at all, which is
   exactly the shape migration 006 was built to allow. Without the guard, `SET NOT NULL` fails with
   a bare constraint violation naming a column rather than a group.
3. **Both messages name the offending group**, via `string_agg(g.name, ', ')`. An operator who has
   to fix this by hand needs to know which group, and the exception is the only place they will
   look.

`DOM-2`'s three columns ride along in the same file — same table, same `ALTER`, same unit.

```sql
ALTER TABLE groups ADD COLUMN course_id    TEXT REFERENCES courses (id);
ALTER TABLE groups ADD COLUMN assistant_id TEXT REFERENCES users (id);  -- DISPLAY ONLY
ALTER TABLE groups ADD COLUMN meets        TEXT;
ALTER TABLE groups ADD COLUMN room         TEXT;                        -- kept, ruling R-3

DO $$
DECLARE offending TEXT;
BEGIN
  SELECT string_agg(g.name, ', ') INTO offending FROM groups g
   WHERE (SELECT count(*) FROM group_courses gc WHERE gc.group_id = g.id) > 1;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'A group studies more than one course; collapse it by hand first: %', offending;
  END IF;

  SELECT string_agg(g.name, ', ') INTO offending FROM groups g
   WHERE NOT EXISTS (SELECT 1 FROM group_courses gc WHERE gc.group_id = g.id);
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'A group studies no course; assign one by hand first: %', offending;
  END IF;
END $$;

UPDATE groups g SET course_id = gc.course_id FROM group_courses gc WHERE gc.group_id = g.id;
ALTER TABLE groups ALTER COLUMN course_id SET NOT NULL;
DROP TABLE group_courses;

CREATE INDEX groups_course_id_idx    ON groups (course_id);
CREATE INDEX groups_assistant_id_idx ON groups (assistant_id);
```

**The `RAISE EXCEPTION` guards are the important part.** Silently picking one of two courses would
corrupt every session, task and report hanging off that group, and nothing downstream would notice.
**Both abort paths have a named integration test, written before the happy path was validated**
(`postgres-repositories.integration-spec.ts`, `describe('migration 013 refuses rather than
guessing')`). Each runs in its own Postgres schema, applies 001–012 by hand, offers `013` the bad
data, and asserts it throws **and** that `group_courses` survives and `groups.course_id` is absent —
the transaction rolling back whole, with no ledger row.

**`groups.assistant_id` is a display field and never an authorization input.** Binding ruling R-1,
2026-09-20. What an assistant may reach is `assistant_group_assignments` + `assistant_scopes`
(§4.2), through `StaffScopeService` and nowhere else. The rule is stated on the column, on the
`Group` interface, and in the frontend mirror, because the two facts look interchangeable and are
not: the moment a query reads `assistant_id` to decide access there are two disagreeing answers to
"may this person see this group".

`groups_course_id_idx` is required, not optional — it is the join the rewritten `assertAssigned`
will run on every assistant request (§4.2).

**Blast radius, as it landed:** `GroupRepository` (both drivers), `StudentGroupsService`,
`GroupsService`, `ClassmatesService`, `AssessmentAuthoringService`, `AdminGroupsController`, the
`group.dto.ts` DTOs, `seeds/003`, the frontend mirror, and five e2e/integration blocks.
`LearningModeService` was already deleted by `012`.

### 4.2 `course_staff_assignments` → `assistant_group_assignments` — **DONE, `015`, 2026-09-20**

```
INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by, assigned_at)
SELECT csa.id || ':' || g.id, csa.user_id, g.id, csa.assigned_by, csa.assigned_at
  FROM course_staff_assignments csa
  JOIN groups g ON g.course_id = csa.course_id;

INSERT INTO assistant_scopes (user_id, scope)
SELECT id, 'assigned_groups' FROM users WHERE role = 'assistant'
ON CONFLICT (user_id) DO NOTHING;

DROP TABLE course_staff_assignments;
```

An assistant assigned to a course inherits every group of that course — the faithful translation.

**Two departures from the sketch above, both deliberate.** The derived id is
`<assignment>:<group>` rather than `gen_id()`/`gen_random_uuid()`: `pgcrypto`'s availability in the
target image is assumed and not verified, and a deterministic id makes the file re-runnable in
review. It cannot collide with `UNIQUE (user_id, group_id)` because a group holds one course
(`013`). And the scope backfill reads **`users`, not `course_staff_assignments`** — `SELECT DISTINCT
user_id FROM course_staff_assignments` would leave an assistant who held no course with **no row at
all**, which is exactly the ambiguity between "everything" and "not set up yet" the explicit column
exists to prevent.

The old table was dropped **after** `StaffScopeService` was rewritten and its spec green, in the
same commit as its last caller. The 404 behaviour and the identical error message survived the
rewrite untouched, and the seven contract cases in `staff-scope.service.spec.ts` pass unmodified.

**Real run, dev database (`tahirelshazli`), after a `pg_dump`:** `course_staff_assignments` 1 row
before → `assistant_group_assignments` 1 row after (the one course had one group);
`assistant_scopes` 2 rows against `SELECT count(*) FROM users WHERE role='assistant'` = 2.

**Nothing creates an assistant account in the product**, so nothing writes a scope row after the
migration. `StaffScopeService` fails closed on a missing row — an assistant without one reaches
nothing — but **unit 5's `PEOPLE-4` must write the row** when it gains the ability to create one.

### 4.3 `attendance.attended BOOLEAN` → `status` enum — **SHIPPED as `026`, unit 8 slice S1**

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

**`marked_by` has no historical answer** — the boolean carried no actor. As shipped, it backfills
from the owning session's group's `teacher_id` (`groups.teacher_id`, NOT NULL since migration 006),
via `live_sessions.group_id` — populated by §4.4's re-parent earlier in the same file, so the join is
total by construction and this backfill has no abort path reachable from valid data. `marked_at`
(renamed from `attended_at`) had a real nullable row in the shipped fixtures
(`('sess-6','student-1', false, NULL)`); it backfills to `now()` — the migration's own run time,
stated as a placeholder rather than a fabricated moment, the same honesty the `marked_by` backfill
states for itself.

### 4.4 `live_sessions` re-parents to the group — **SHIPPED as `026`, unit 8 slice S1**

No `mode`, no `location` — `D-9` (`CHANGELOG.md`) had already struck both in favour of one
`meeting_link` before this migration was authored; the SQL below is what actually shipped, not the
`mode`/`location` shape this section described before unit 8.

```
ALTER TABLE live_sessions ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
-- abort if any session's course holds zero or several groups (LEFT JOIN, not
-- plain JOIN — a plain JOIN misses the zero case; see the migration's comment)
UPDATE live_sessions s SET group_id = g.id FROM groups g WHERE g.course_id = s.course_id;
ALTER TABLE live_sessions ALTER COLUMN group_id SET NOT NULL;

ALTER TABLE live_sessions RENAME COLUMN zoom_link TO meeting_link;
ALTER TABLE live_sessions ALTER COLUMN meeting_link DROP NOT NULL;

ALTER TABLE live_sessions ADD COLUMN ends_at TIMESTAMPTZ;
UPDATE live_sessions SET ends_at = scheduled_at + (duration_minutes * INTERVAL '1 minute');
ALTER TABLE live_sessions ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE live_sessions DROP COLUMN duration_minutes;

ALTER TABLE live_sessions ADD COLUMN assistant_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE live_sessions ADD COLUMN description TEXT;
ALTER TABLE live_sessions ADD COLUMN private_notes TEXT;     -- staff-only, never serialized to a student
ALTER TABLE live_sessions ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN state TEXT NOT NULL DEFAULT 'published'
  CHECK (state IN ('planned','published'));

ALTER TABLE live_sessions DROP COLUMN course_id;
```

One migration, not a two-step: `course_id`/`duration_minutes`/`zoom_link` are dropped or renamed in
the same file as the backfill, because every reader of this table (`LiveSessionRepository` and its
two implementations) moved in the same slice (`S2`). A two-step would leave the repository unable to
compile against a schema in between.

**Backfill hazard, as shipped:** a course with two groups — or zero — has no single correct
`group_id`. Both abort, naming the count of affected sessions (not the course, since a session's own
id is what an operator needs to hand-fix). Exercised against real Postgres in
`postgres-repositories.integration-spec.ts`'s `migration 019 refuses rather than guessing` block, the
same pattern §4.1's guard uses.

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

- ~~`CHECK ((mode = 'school') = (school_name IS NOT NULL))` on `student_profiles`~~ — **not
  built**, and cannot be: ruling **R-2** struck `students.mode`, so there is no column for this
  constraint to be conditional on. `school_name` is plain nullable `TEXT`. The design's
  conditional field, enforced rather than trusted.
- `CHECK (scheduled_at < ends_at)` on `live_sessions`.
- `CHECK (status <> 'sent' OR sent_at IS NOT NULL)` on `weekly_reports` — a sent report with no
  timestamp is a lie in an auditable record.
- `CHECK (scope <> 'all_groups' OR NOT EXISTS …)` is not expressible in a table CHECK; enforce the
  "all_groups implies no assignment rows" invariant in the service and test it.

---

## 7. Migration order

`011` **the two role CHECK widenings, and nothing else** · `012` **retire `learning_mode`**
(destructive, `DOM-0`) · `013` **group collapse + group columns** (destructive, one-way,
`DOM-1`/`DOM-2`) · `014` `users.status` (registration approval, `DOM-4`) **+** student profile fields
(`DOM-3`) · `015` **assistant scope tables + data move** (`AUTH-2`, destructive, **applied and verified**) ·
`016` mail deliveries (**applied**, unit 3) · `017` assistant invitations (**applied**, unit 5) ·
`018` **task drafts + assessment columns** (**applied and verified**, unit 6) · `019` annotations +
submission columns (**applied and verified**, unit 7) · `020` **submission file sets** (`files JSONB` ≤ 5 on
submissions and revisions, `D-48`; **applied and verified**, unit 7 slice 7i) · `021` announcements
(group audience, media, draft; **applied and verified**, unit 10) · `022` notification preferences
(**applied and verified**, unit 12) · `023` Google sign-in identities (`user_google_identities`,
`GAUTH-1`; **applied and verified**, unit 14) · `024` recording thumbnails (**applied and
verified**, unit 13) · `025` `materials.lesson_id` (`STU-3`; **applied and verified**, unit 13) ·
`026` **sessions and attendance** (`SESS-1`/`SESS-3`, destructive, two abort paths, §4.3/§4.4;
**applied and verified**, unit 8 slice S1) · `027` weekly reports (unit 9, unbuilt)

**Renumbered a fifth time 2026-09-24, unit 8 landing.** Unit 8 authored its migration as `019`
in a parallel checkout; by the time it merged, `019`-`025` were taken. It becomes `026` - one
file, both reshapes, as planned. The move is behaviour-neutral: grepping the migrations for
`live_sessions` or `attendance` returns only `001`, `005`, `012` and this file, so nothing
between `019` and `025` reads or writes either table. Weekly reports shift to `027`.

**Renumbered a fourth time 2026-09-23, unit 14.** Taken out of order, it claimed `023`; the three
unbuilt entries shift by one.

**Renumbered a third time 2026-09-23, the units 10–12 reconciliation.** Units 10 and 12 were built on
a parallel line of `redesign` and shipped announcements as `021` and notification preferences as
`022`. Ported onto the unit 7 line they keep those numbers; the three unbuilt entries follow them.
001–022 ran in order from an empty schema on PostgreSQL 15.19 (integration 179 passed, 0 skipped).

**Renumbered again 2026-09-23, unit 7.** `MARK-6`'s file set took `020`, so every later entry shifts by one.

**Renumbered 2026-09-22, unit 6.** The list had assigned `016` to task drafts, but `016` shipped as
`mail_deliveries` and `017` as `assistant_invitations`, so every planned entry shifts: task drafts
take `018` and the rest follow in their old order. The trailing "mail deliveries" half of the old
`022` was already built as `016`, so `024` is notification preferences alone.

**`018` ran 2026-09-22 against real PostgreSQL 15.19 (`postgres:15-alpine`) from an empty schema**,
before any repository code was written, and again at the unit's close: 001–018 applied in order,
integration suite 145 passed, 0 skipped. It is purely additive. Two user rulings were folded in
before its first run rather than given a `019`: `D-28` narrowed the `visibility` CHECK to
`('published','hidden')` with no `publish_at`, and `D-31` added `submission_modes TEXT[]`. Its
post-conditions are asserted against the catalog (`describe('migration 018')`): the columns and
their precision, the `(course_id, type)` index, and the CHECKs refusing `'hiden'`, `'scheduled'`, an
attachments object, a negative `used_count`, a blank title and an unknown submission mode.

**`014` ran 2026-09-20 (unit 2 slice 2b-i), against real PostgreSQL 15 from an empty schema**, 14
migrations applied in order and the integration suite green at 103 tests, 0 skipped. It is purely
additive — one defaulted column, one partial index, three nullable columns — so there was nothing to
validate before writing and no abort path to author. Its post-conditions are asserted against
`information_schema` and `pg_indexes` rather than inferred from a repository read: the CHECK refuses
`'pendng'`, `users_waiting_idx` is partial on `status = 'waiting'`, the three profile columns exist
and are nullable, and **no `mode` column exists** (ruling R-2, asserted rather than assumed because
five documents described it when the slice started).

**The `DEFAULT 'active'` on `users.status` is right for the rows that existed and wrong for every
row written after it.** `AuthService.register` sets `'waiting'` explicitly and a unit spec asserts
the value passed to `UserRepository.create` rather than the row read back — if the service ever
leans on the default, the waiting queue is silently always empty, which is an authorization hole
that fails in both directions without anything going red.

**Renumbered 2026-09-20, unit 2 slice 2a.** The list above previously started `012` `users.status`.
It was written before `D-9` created `DOM-0`, which must be **first** so the destructive collapse
lands on a simplified model rather than beside a half-removed mode axis. `011` is immutable, so
`DOM-0` takes `012` and every entry below shifts one. The renumber was done **before any migration
file was written**: a `014` authored with no `013` present applies straight after `012` and aborts
every boot, because `MigrationRunner.sqlFilesIn` sorts lexicographically.

**Corrected 2026-09-19.** This list previously read "`011` roles + user status", which attributed two
different units' work to one file: `AUTH-1` (unit 1) and `DOM-4` (unit 2). **A migration file is
immutable once applied** — the ledger records it by filename — so unit 2 could not have appended to
it. `011_full_admin_role.sql` shipped in unit 1 as two `ALTER TABLE … DROP CONSTRAINT … ADD
CONSTRAINT` statements widening `users_role_check` and `audit_log_actor_role_check` to admit
`'admin'`, and **`users.status` is not in it**. `DOM-4` takes its own number.

(The one precedent for amending a migration in place is 002, and it required proof the file had never
been applied anywhere real. 011 is in the same position *today* — it has never run — but that is an
argument for running it, not for treating it as editable.)

013 and 015 are the pair to be careful with: **013 must land and be verified before 015**, because
015's backfill joins through `groups.course_id`. That is also why `AUTH-2` moved out of unit 1 and
into unit 2 on 2026-09-19 (`CHANGELOG.md`), and why unit 2 was split into 2a (`012`/`013`) and 2b
(`014`/`015`) on 2026-09-20: a unit boundary is the strongest available form of "verified first".

---

## 8. Data risks

| Risk | Mitigation |
|---|---|
| A group studying two courses | Migration raises rather than guessing (§4.1) |
| A course with two groups, when re-parenting sessions | Same (§4.4) |
| Seed fixtures break on 012/013/`users.status` | **Regenerate, don't migrate** — the precedent is `CLAUDE.md` §7.1's call on assessment targeting: fixtures exist to make a dev database useful, and preserving them would add permanent concepts to protect throwaway rows |
| Migrations 009 and 010 have never run against real Postgres | **CLOSED 2026-09-20.** All of 001–013 now run from an empty schema against PostgreSQL 15 on every integration run, and 009/010 applied cleanly on their first real run — the `NUMERIC(10,2)`-as-string candidate below did not materialise, because nothing reads those columns through a repository yet. The historical note follows. ~~**Still open as of 2026-09-19.** The mitigation was "run the integration suite before authoring 011"; it was **not** met — `011` was authored unverified on the user's direction, because there is no reachable PostgreSQL on the development machine (Docker daemon down). `011` is the lowest-risk migration in the plan — two CHECK widenings, strictly looser, no data loss possible — which is what makes proceeding defensible where it would not be for `013`. **The exposure that remains:** `011` will be applied for the first time in the same run as 009 and 010, and the runner stops at the first failing file, so a defect in either **masks `011` entirely**. Named candidates in `docs/phases/unit-1/PHASE_PLAN.md` §9 R-2 — the likeliest is `010`'s `NUMERIC(10,2)` columns, which `pg` returns as **strings**, invisible on the memory driver where the fixture is a JS number~~ |
| An audit action added to the union but not the DTO's exhaustive `Record` | Compile error by construction — keep that pattern for all ~17 new actions |
| In-memory and Postgres drivers drifting | Every new table gets both, and an integration test; the suite already covers all 17 existing pairs |

---

## 9. Verification

```
TEST_DATABASE_URL=postgres://… npm run test:integration --workspace=backend
```

against an **empty schema**, so every migration runs in order. CI already fails the job if the suite
reports zero executed tests — a self-skipping suite is otherwise indistinguishable from a passing
one. After 013 and 019 specifically, assert the post-conditions directly against the database
(column dropped, constraint present, row counts preserved) rather than only through the repository
layer, which is how 008's first run was verified.

**Done for 013** (2026-09-20): `describe('migration 013 refuses rather than guessing')` asserts, in
its own schema, that both abort paths throw with the group named, that a refusal leaves
`group_courses` intact and `groups.course_id` absent, and that a sound collapse preserves the group
row count exactly, leaves `course_id` `NOT NULL`, drops the join table and creates both indexes.
`describe('groups')` additionally asserts that a group with no `course_id` is refused by the
database rather than by the repository — which is what makes "a group studies exactly one course" a
schema fact rather than a convention.
