# CLAUDE.md — Tahirelshazli.com Educational Platform

Guidance for Claude Code when working in this repository.

---

## 0. Read this framing first, every time

**The requirements are changeable.** Everything below is the current best understanding of a brief
that has already shifted twice across client meetings and will shift again. Features can be dropped,
merged, simplified, deferred, or replaced. Nothing here is a locked contract with the code.

When a new instruction from the user conflicts with this file, **the user wins** — then update this
file so it stops being wrong. Do not argue from "the spec says". Do not build speculative features
because they appear in a wish list.

**Source-of-truth order** (highest first):

1. What the user says in the current conversation.
2. `context/Report 2 - Mr Tahir Elshazli LMS.pdf` — latest client meeting (6 Aug 2026).
3. `context/report 1.pdf` — earlier client meeting (30 Jul 2026).
4. **The user-stories board** (FigJam, `R17sOASEJqQ7iQC2LeyFFK`, last updated 30 Jul 2026) — 129
   role-scoped stickies plus nine sequence diagrams; §12 has the link. It is the *artifact* of the
   item-3 meeting, so it ranks beside it, not above it. Where it disagrees with item 2 the later
   meeting wins; where it disagrees with the prototype doc (item 6), the two are peers and the
   disagreement is an open question, not a resolution — see §11.
5. `context/download.pdf` — the signed development agreement (stack, scope, timeline, phases).
6. `context/tahirlmstaadmincontext.md` — TA & Admin prototype walkthrough. A peer of item 7, not its
   superior: the doc calls itself *"reference material, not an instruction to act on"* and *"what
   the prototype currently shows, not a locked spec."* Where it disagrees with a client meeting
   (items 2-4), **the meeting wins** — see §11 for the live cases.
7. `context/tahirlmsprojectknowledge.md` — background notes; **partly superseded** (see §3).
8. The original brief's full feature wish list (§9) — a menu of ideas, not a checklist.

---

## 1. What this is

A premium educational platform for **Dr. Tahir Elshazli** (brand: *Dr. Tahir / English Team*) at
**tahirelshazli.com**, targeting **IGCSE and IELTS** students.

It is *not* a landing page. It is a public marketing website **plus** a full Learning Management
System, positioned against GoStars, Bassthalk, Mentora, and Teachable. Must scale to thousands of
students.

Two things that are easy to get wrong and matter a lot:

- **Never build an "Earnings" / revenue widget into the dashboard.** The client explicitly removed it.
  This bans a total-revenue figure or earnings chart on any dashboard. It does **not** ban the
  Payments *page* showing transaction amounts — operating refunds requires seeing them — nor an
  operational count like "3 failed payments need review". See §11 for the part still undecided.
- **Progress ≠ performance.** See §5.1 — this was a direct client correction.

---

## 2. Roles (5)

| Role | Access |
|---|---|
| **Visitor** | Public site only, no login. Marketing pages, course catalog, blog, contact. |
| **Student** | Courses, lessons, recordings, assignments, quizzes, grades, progress, timetable, certificates. |
| **Parent** | Read-only monitoring of a linked student: progress, grades, attendance — plus manages payments. |
| **Teaching Assistant** | Grading, attendance, quizzes, materials, announcements — **scoped to assigned courses** (§2.2). **Fully audited**. |
| **Teacher (Dr. Tahir) — main account** | Full admin: courses, users, content, reports, settings, and visibility into every TA action. |

Access control is **role-based (RBAC) and enforced server-side on every request**. Never gate on the
client alone. TA permissions are a subset of the teacher's and must be configurable.

### 2.1 Naming — the same two actors under three sets of names

`context/tahirlmstaadmincontext.md` calls them `ta` and `admin`; this file calls them Teaching
Assistant and Teacher; the code's `Role` enum uses `assistant` and `teacher`. **These are the same
two roles.** The enum is the implementation's spelling and is what you write in code:

| This file | Prototype doc | `Role` enum |
|---|---|---|
| Teaching Assistant | `ta` | `Role.Assistant` = `'assistant'` |
| Teacher (Dr. Tahir) | `admin` | `Role.Teacher` = `'teacher'` |

Don't add a third role for "admin" — Dr. Tahir's main account *is* the admin. The prototype doc's
"three roles" framing simply omits Visitor and Parent, which it does not cover.

### 2.2 The TA permission preset

§2 says TA permissions "must be configurable", and that still stands. What follows is the **default
preset the prototype shows** — the shape to ship, not a ceiling welded shut. Build it as data an
admin can change (§11), not as `if (role === 'assistant')` branches scattered through services.

The prototype states the scope on the TA dashboard itself — *"Grade work, post announcements, mark
attendance — cannot manage accounts"* — and that line is load-bearing.

**In the preset, a TA can**, but only for courses they are explicitly assigned to: grade submissions
and return feedback, mark attendance, build/edit/duplicate/export quizzes, upload materials, view a
course roster **read-only** (no edit, no unenroll), post course announcements, and DM a student.

**In the preset, a TA cannot**: create/edit/delete courses, create or delete any user account,
enroll or unenroll a student, touch payments, touch the CMS, or see platform-wide data. Their
dashboard counts are scoped to their own courses — never the full roster.

**Admin is a strict superset**, unscoped and platform-wide: course and curriculum CRUD, the full
student directory including unenroll, payments/refunds/discount codes, CMS, cross-course reports,
TA-to-course assignment, and audit-log access.

**Two powers the user-stories board grants a TA that this preset does not.** `ASG-10` reads
*"Create and publish assignments independently"* and `CRS-11` reads *"Schedule/share Zoom links for
my sessions"* — both sit in the board's TA column, and neither appears above. The board is a peer of
the prototype (§0 items 4 and 6), so this is a **disagreement between two reference artifacts, not a
correction of one by the other**. Ship the preset as written — the narrower reading — and treat both
as §11 questions. Neither is expensive to reverse if the answer is yes: they are two rows in the
permission data, not a schema change, provided the preset is data (§11) rather than branches.

Whether TAs can generate reports is **unresolved** — §5.9 grants it, the prototype and the board
both withhold it. See §11.

See §5.11 — scoping is a query filter, never a hidden UI element.

---

## 3. Technology stack (per the signed agreement)

| Layer | Technology |
|---|---|
| Frontend | **Next.js (React) + TypeScript** |
| Backend | **NestJS (Node.js) + TypeScript** — separate service, not Next.js route handlers |
| Database | **PostgreSQL** |
| Video | **Bunny Stream** — adaptive streaming, **signed URLs only** |
| File storage | **Cloudflare R2** — PDFs, images, submissions, certificates |
| Hosting | **Hostinger VPS**, containerized, CI/CD included in deliverables |
| Edge / security | **Cloudflare** — SSL, DNS, CDN, DDoS, WAF, caching |

> **Known divergence:** `context/tahirlmsprojectknowledge.md` proposes Next.js API routes +
> Supabase/Neon + Prisma, and describes a deployed Vercel prototype. The agreement supersedes it —
> **NestJS + PostgreSQL on Hostinger is the decided stack.** If the user wants to revert to the
> simpler Supabase path, that is their call; ask before assuming.

Scalability rule: the VPS must be migratable to AWS/DigitalOcean **without code changes**. Keep
infrastructure behind configuration and interfaces (storage, video, mail, payments), never hardcoded.

Third-party subscriptions (VPS, Bunny, R2, domain) are the client's responsibility — never assume
paid tiers are provisioned; make the code degrade sensibly when a service is not configured.

---

## 4. Design & brand

- Palette: **black, white, dark grey, gold accents**. Gold is an accent, not a background.
- Premium, modern, uncluttered. Fully responsive: mobile, tablet, desktop.
- Fast loading, SEO-friendly public pages.
- Arabic/English content may appear; do not hardcode assumptions that break on RTL text.

---

## 5. Domain rules that came from the client (do not silently change these)

### 5.1 Progress vs. performance — keep them separate

- **Progress = course completion.** Recorded videos watched, checkpoints completed, lessons done.
- **Performance = grades and achievement.** Quiz/assignment marks, averages.

Never merge them into one percentage. `My Courses` shows completion checkpoints separately from
performance.

### 5.2 Two student learning modes

- **Recorded mode** — completion progress + checkpoints drive the UI.
- **Live / scheduled mode** — an **attendance timeline** drives the UI, alongside grades.

A student's course enrollment carries its mode; the dashboard renders accordingly.

### 5.3 Sequential lesson lock — configurable

A student must complete a lesson before the next unlocks — but this is an **admin on/off toggle**,
switchable at any time. Build it as a course-level (or platform-level) setting, never as hardcoded
logic.

### 5.4 Assistant activity visibility

The teacher and admin must see **which assistant did what** — assignment edits, quiz changes,
content uploads, grading, any recorded action. This means a real **audit log** with actor, action,
target, before/after, and timestamp — written for every mutating action by TAs and admins.

Two tiers, and neither replaces the other: **every** TA mutation is logged (that is the client's
actual ask), and on the admin side anything touching **money, enrollment, or accounts** — refunds,
unenrollment, account changes, course deletion — is logged without exception.

**Built:** `audit_log` (migration 002) and `AuditService`, append-and-read only — the repository
interface has no update and no delete, which is where that is enforced. `AuditAction` and
`AuditTargetType` are string *unions*, so adding a mutating endpoint cannot log until someone adds
its action to the list; that compile error is the mechanism keeping "every TA mutation is logged"
true as surfaces land. Two actions exist so far, both admin: `course_staff.assigned` and
`course_staff.unassigned`. §7.1 records the one gap — the entry is written after the action commits,
not inside its transaction.

### 5.5 In-platform PDF assignment correction

When a student submits a PDF, the teacher corrects it **inside the platform**: mark incorrect words
or sections, add annotations and edits, **without downloading**. On save, the corrected PDF is
**automatically attached to the student's submission** for review. Keep the original submission
immutable; the annotated version is a new artifact linked to it.

### 5.6 Averages everywhere

- Per student: average assignment mark, average quiz mark.
- Per assignment/quiz: **overall average across all students** (so the teacher can see whether a
  task was hard or easy, and spot trends).
- Aggregated averages across all students combined.

### 5.7 Certificates

Issued at course end. The **teacher controls when a certificate becomes available** to a student —
a release action, not automatic on completion.

### 5.8 Flexible file uploads

Students submit whatever file type the task needs. Teachers upload PDFs, text files, links, images,
and other formats for lessons, quizzes, and assignments. Allowed types are **configurable per
assignment**, not a global hardcoded whitelist — but always validated server-side (§8).

### 5.9 Report generation

Both the **teacher and the teaching assistant** can generate student grade reports. Reports are
downloadable.

**The TA half of that sentence is contested** — the prototype and the user-stories board both put
report generation under Admin only. Don't write a `@Roles()` decorator off this line alone; §11 has
the full case and the one thing to check first. The teacher half is not in question.

### 5.10 Status is computed server-side

An assessment's displayed status — **Locked / Available / Submitted / Corrected** — is always derived
on the server from timestamps and submission state. Never trust a client-supplied status.

### 5.11 TA scoping is a query filter, never a UI filter

Every TA-facing endpoint joins through `CourseStaffAssignment` and answers *"is this TA assigned to
**this** course?"* before it returns or mutates anything. A role check alone — "is this user a TA?"
— is **not sufficient** and is the single easiest way to leak the whole platform through the API.

There is no "the TA fetches everything and the client hides some of it" shortcut. Get this wrong and
a TA can read or grade another TA's students.

Admin queries never join through this table; that asymmetry is the whole design.

Route split: **`/staff/*`** is shared and always TA-scoped through `CourseStaffAssignment`
(courses, roster, submission grading, attendance, quizzes + export/duplicate, announcements,
messages); **`/admin/*`** is admin-only and unscoped (course CRUD, unenroll, full student
directory, payments + refunds, discount codes, CMS, report generation + CSV, staff assignment,
audit log).

> The route inventory this came from writes these as `/api/staff/*` and `/api/admin/*`. **This
> application has no global `/api` prefix** — the student surface is `/courses`, `/notifications`,
> `/students/me/profile` — so the built routes drop it, and the paths above are what exists. If a
> prefix is wanted later it belongs in `main.ts` as `setGlobalPrefix`, applied to every route at
> once, not written into some controllers and not others.

**Settled, and implemented:** an unassigned course 404s rather than 403s for a TA, the same way an
unenrolled student already gets 404 — so a TA can't enumerate courses they don't hold.
`StaffScopeService.assertAssigned` is the single place that decides it, and
`staff-scope.service.spec.ts` asserts a held-but-wrong course and a nonexistent one come back
identical.

**Caching the assignment check.** Default is **no cache** — compute on read until measurement says
otherwise, the same rule §6.1 sets for `QuizAnalyticsSnapshot`. When that day comes, the
`CourseStaffAssignment` lookup may be cached only under *all* of:

1. TTL ≤ 60s.
2. Eviction on the unassign/reassign write is the **primary** mechanism; the TTL is a backstop for a
   missed eviction, not the design.
3. Mutating endpoints — grading, attendance marking, quiz edits, announcements — always re-check
   uncached. A stale ALLOW that lets someone *look* is a different animal from one that lets them
   *grade*.
4. A DENY is never cached longer than an ALLOW, or a freshly-assigned TA is locked out and someone
   "fixes" it by shortening the wrong TTL.
5. A shared store, never per-process — eviction on replica A must not leave replica B still
   granting. That is strictly worse than no cache, and it is the same defect the per-process token
   denylist and rate limiter already have. One Redis introduction fixes all three; don't add a
   fourth per-process security structure before it lands.

The trade-off in one sentence: we accept up to 60 seconds of stale read access for a just-unassigned
TA in exchange for removing a database round trip from every staff read, and we buy that risk back
by evicting on the write itself — so the TTL only ever covers a *missed* eviction, never a normal one.

### 5.12 Payments — transitions and refunds

The known transitions are `pending → paid`, `pending → failed`, `paid → refunded`. That list is not
closed — a failed payment sits in a "needs review" queue, so some route out of `failed` (retry,
manual resolve) will be needed; decide it when the queue is built.

A refund **creates a `Refund` row and an `AuditLog` entry** rather than silently flipping
`Payment.status` on its own. The refund record is the history, and it is what makes the money trail
reconstructable after the fact.

Gateway integration itself (Paymob/Stripe/Fawry) is **not** in this phase — build the data model
and the admin surface only.

### 5.13 Scheduled publishing

A `scheduled` CMS post becomes `published` via a background job comparing `publish_at` to now —
the same pattern as an assessment's availability window opening on the student side. Publication
is a server-side clock decision, never something the reader's browser computes.

### 5.14 Announcement audiences are computed at send time

Audience is one of `all_students`, `course:<id>`, or `all_tas`. **`all_tas` resolves from
`role = 'assistant'` at the moment of sending** — never stored as a frozen list of user ids, which
would silently miss TAs hired after the announcement was drafted.

### 5.15 One attendance table, two aggregations

The TA's per-session roster and the admin's Attendance Report read the **same `Attendance` rows**,
aggregated two different ways — by session for the TA, by course-average for the report. Don't
build a second summary table for the report; it will drift.

---

## 6. Data model (starting point)

`User` (role: visitor/student/parent/assistant/teacher) · `StudentProfile` · `ParentLink` ·
`TeacherProfile` · `AssistantProfile` · `Course` · `CourseModule` (chapters) · `Lesson` ·
`Enrollment` (carries **learning mode** + progress) · `Checkpoint` / `LessonProgress` ·
`Recording` + `RecordingProgress` · `Material` (course_notes / study_materials / important_files) ·
`Assessment` (type: homework/assignment/quiz; `available_from`, `available_to`, `due_at`) ·
`AssessmentSubmission` + `SubmissionAttachment` + `SubmissionRevision` + `SubmissionAnnotation` ·
`Quiz` + `Question` + `QuestionOption` + `QuizAttempt` + `Answer` + `QuestionBank` ·
`Grade` · `Rubric` + `RubricCriterion` · `LiveSession` + `Attendance` · `Certificate` (with
`released_at`) · `ReportDocument` · `Notification` · `Payment` + `Invoice` + `Coupon` +
`Installment` · `AuditLog` · `Post` (CMS: blog / article / short video / announcement).

Conventions: UUID primary keys, `created_at` / `updated_at` on everything, soft-delete where history
matters (submissions, grades, payments), money in **minor units as integers**, timestamps stored in
**UTC** and rendered in the user's timezone.

### 6.1 TA & Admin additions

These **extend** the entities above rather than duplicating them — same `User`, `Course`,
`Enrollment`, `Assessment`.

- **`CourseStaffAssignment`** — `id, user_id (role=assistant), course_id, assigned_at, assigned_by`.
  The core RBAC table; §5.11 filters every TA query through it, and it is the piece most worth
  getting right first — retrofitting scoping is how the leak happens.
- **`Attendance`** — `id, student_id, course_id, session_date, status (present|absent|late),
  marked_by, marked_at`. `marked_by` is what ties it to §5.4. **Open:** §6 pairs `Attendance` with
  `LiveSession`, but this shape keys on a bare `session_date` with no `live_session_id`. For live
  mode (§5.2) the FK is the better design — reconcile before writing the migration.
- **`Payment`** — `id, student_id, course_id, amount, currency, gateway (stripe|paymob|fawry|...),
  status (paid|failed|refunded|pending), transaction_ref, paid_at`. The concrete shape of the
  `Payment` named above; §5.12 operates on it. Amount in minor units, per the §6 convention.
- **`QuizAnalyticsSnapshot`** — `quiz_id, avg_score, attempts_count, most_missed_question_id,
  computed_at`. Computed from submission/answer data on read for now; cache only if volume demands
  it. Never hardcoded.
- **`Course`** gains a **monthly price** — the admin course list shows one per course, which implies
  subscription pricing rather than one-off purchase. Minor units, per the §6 convention. The
  subscription billing model itself is unbuilt (§9 lists it as future).
- **`DiscountCode`** — `id, code, percent_off | amount_off, max_uses, uses_count, expires_at,
  applicable_course_ids[]`. Supersedes the `Coupon` placeholder named in §6 (§11).
- **`Refund`** — `id, payment_id, amount, reason, status (pending|processed|denied), processed_by,
  processed_at`. Required by §5.12.
- **`Announcement`** — `id, audience (all_students|course:<id>|all_tas), title, body, posted_by,
  posted_at`. See §5.14.
- **`DirectMessage`** — `id, sender_id, recipient_id (student or parent), body, sent_at,
  channel (in_app|whatsapp)`.
- **`ReportRun`** — `id, type (course_completion|attendance|assignment|student_activity),
  filters_json, file_url, generated_by, generated_at`. The generated artifact;
  `ReportDocument` in §6 is what the student reads. `generated_by` is what would record a TA as the
  author if §11 resolves that way.
- **CMS** — `BlogPost` (`title, slug, body, featured_image_url, category, tags[],
  status (draft|scheduled|published), publish_at, author_id, view_count`) · `VideoAsset` ·
  `Testimonial` · `FAQ` · `MediaAsset`. These supersede the generic `Post` placeholder in §6 (§11).

---

## 7. Phases

Per the agreement (40 calendar days, two phases). Treat phase membership as guidance, not a fence.

**Phase 1 — UI/UX & core platform** (interactive testing build)
Homepage & marketing pages · about / courses / contact · student authentication · student dashboard
& course pages · administrator dashboard · database architecture · fully responsive design.

**Phase 2 — LMS completion & launch** (production-ready)
Assignment & submission system · quiz & assessment engine · reports & analytics · CMS ·
notification system · security hardening & testing · deployment & optimization.

**Phase 2, TA & Admin backend** — builds on the Phase 1 student backend, extending the same schema
rather than duplicating it. The centerpiece is getting `CourseStaffAssignment` scoping (§5.11)
right; grading, attendance, quizzes, CMS, and the payments management surface are comparatively
mechanical CRUD once that filter is applied consistently.

Out of scope here, deliberately: real payment-gateway wiring (Paymob/Stripe/Fawry) and the public
marketing site actually rendering CMS content. This phase builds the admin-side data model and
management surface for those areas — not the external integrations or the public consumption.

**Later / on request** (raised by the client, not yet scheduled)
Payment gateway rollout (Paymob/Fawry for Egypt + Stripe international) · Zoom API automation ·
WhatsApp Business API · SMS · quiz analytics export · multi-tutor expansion.

---

## 7.1 Build status — what actually exists

Honest inventory, so nobody assumes a surface is there. Of the five roles in §2,
**one has a full backend; two now have a foundation and nothing more.**

| Role | Backend status |
|---|---|
| **Student** | Built. 9 feature controllers, every route `@Roles(Role.Student)`, unit + e2e covered. `JwtAuthGuard` + `RolesGuard` are **global**, so a new controller is protected by default; `@Public()` (health, register, login, password reset) and `@AnyRole()` (logout) are the only exits. |
| **Visitor** | None. `GET /health` is the only public endpoint — no catalog, blog, or contact. |
| **Parent** | None. Enum entry only; no `ParentLink`, no read-only views. |
| **Teaching Assistant** | **Foundation only.** `CourseStaffAssignment` exists and `StaffScopeService` enforces it (§5.11); `GET /staff/courses` is the one route, and it exists to prove the scoping rather than to be useful. No grading, attendance, quizzes, materials, announcements or messages. The scoping itself is the tested part: 31 unit specs across `staff-scope.service.spec.ts` and `staff.controller.spec.ts`, plus 14 in `test/staff.e2e-spec.ts`. |
| **Teacher / Admin** | **Foundation only.** TA-to-course assignment (`/admin/courses/:id/staff`, all three verbs) and the audit-log reader (`/admin/audit-log`). No course CRUD, student directory, payments, CMS or reports. |

**Frontend:** built for the Visitor-facing marketing site and the Student LMS —
`app/(site)`, `app/(app)`, `app/(auth)`, 20 pages, typed against the backend's
response shapes in `lib/types.ts`. The marketing pages read from
`lib/site-content.ts` rather than an API, because there is no public API to read
(the Visitor row above). **No Parent, TA or Admin screens** — the staff and
admin routes above have no UI at all and are reachable only over HTTP.

**Persistence is driver-selected, and both drivers are real.** Every one of the
twelve repository interfaces has an `InMemory*Repository` and a
`Postgres*Repository`; `database/repository.provider.ts` binds the `Symbol`
token from `PERSISTENCE_DRIVER`, read once at wiring time. `memory` is the
default in development and test and is **refused in production** — an unset
value there resolves to `postgres` and fails on the missing `DATABASE_URL`
rather than serving traffic from a process-local array. Schema lives in
`backend/src/database/migrations/`: `001_student_platform.sql` (17 tables, the
student surface) and `002_staff_and_audit.sql` (`course_staff_assignments`,
`audit_log`), applied by `MigrationRunner` via `npm run db:migrate` or
`DB_AUTO_MIGRATE=1` on a single-container deploy.
`test/postgres-repositories.integration-spec.ts` covers all twelve and skips
itself when no `TEST_DATABASE_URL` is set. As of 2026-09-07 it **has now run
against a real PostgreSQL 15** — 33 tests green, both migrations applied from an
empty schema — and CI runs it on every push against a Postgres service
container, with a guard step that fails the job if the suite reports no executed
tests (a suite that self-skips is otherwise indistinguishable from one that
passes).

That first run immediately earned its keep: it caught the admin audit log
**silently ending after page one**. `audit_log.created_at` was microsecond
`TIMESTAMPTZ`, but the keyset cursor `(created_at, id)` is rebuilt in JavaScript
where a `Date` carries only milliseconds, so the next page compared against a
strictly smaller timestamp and matched nothing in that millisecond. The column is
now `TIMESTAMPTZ(3)`, which also makes the Postgres and in-memory drivers page
identically as `audit-cursor.ts` already claimed. Migration 002 was amended in
place rather than superseded, because it had provably never been applied outside
a throwaway test database. **The lesson generalises: any future keyset cursor
over a timestamp column must store the precision the reader can represent.**

Note that the scaffold-era `database/schema.sql` and `database/seed.sql` at the
repo root are *not* applied and disagree with the migration on column shapes.
They are the §6 design outline; their headers say so.

Scaling debt still open, none of it structural: `CourseRepository` and
`AssessmentRepository` have batch reads (`findByIds`,
`findSubmissionsForStudent`) and the three N+1 loops are gone;
`CourseRepository.findAll(limit, offset)` and `AuditLogRepository.find` are the
first two **paginated** reads in the codebase, and `UserRepository.findByIds`
the third batch read. `StudentRepository` still exposes no list method; there is
no count-only method except `NotificationRepository.countUnread`, so badge
integers still fetch full rows; no student-facing list endpoint is paginated,
and notifications are append-only with no ceiling; the rate limiter
(`InMemoryRateLimitStore`) and the token denylist are per-process, so they break
under a second replica; and `JwtStrategy` does a user lookup per request that
will need caching. Those last three want the *same* Redis — introduce it once,
not three times (§5.11 makes the same argument for a fourth).

The interface-shape items here — list and count methods — were cheapest to fix
before a second implementation existed. That window closed some time ago:
`findAll` and `findByIds` above each cost two implementors and an integration
suite to add, which is the going rate now. Still worth doing, still not free.

**Audit coverage is two actions, not "every mutation".** The `AuditModule` is
`@Global()` and `AuditService` is exported precisely so every future TA and
admin surface can reach it, but today it is injected in exactly one place —
`StaffService` — and records exactly `course_staff.assigned` and
`course_staff.unassigned`. §5.4 requires *every* TA mutation to be logged; that
requirement is currently satisfied by there being almost no TA mutations. Each
new staff or admin write must add its own `audit.record` call, and the moment
one forgets, the requirement is quietly broken with nothing failing. Grading,
attendance and payments are where this stops being theoretical.

**One known gap in the audit trail, recorded rather than discovered later.**
`AuditService.record` writes on its own connection *after* the action it
describes has committed, so a crash in between leaves an action done and
unlogged. Closing it needs the mutation and its audit row in one transaction,
which the repository-per-connection design cannot express today. It should land
before the payments surface (§5.12), where the gap is a money-trail hole rather
than a missing line.

---

## 8. Security requirements (treat as non-negotiable)

The client named security a top priority. Every feature is built with these in place, not bolted on:

- HTTPS/SSL everywhere; Cloudflare WAF + DDoS in front.
- Password hashing (argon2/bcrypt), strong password policy, **2FA** for teacher/admin accounts.
- **RBAC enforced server-side** on every endpoint; never trust client-side role checks.
- Parameterized queries / ORM only — no string-built SQL. Output escaping for XSS. CSRF protection.
- Rate limiting + brute-force lockout on auth. CAPTCHA on public forms and repeated login attempts.
- **Secure file uploads:** validate MIME and extension server-side, cap size, store in R2 outside the
  web root, serve **only via signed, expiring URLs**, never execute uploaded content, virus scan
  where feasible.
- Video served only through Bunny Stream signed URLs — course content must not be directly linkable.
- Encrypted sensitive data at rest; secrets in env vars, **never committed**.
- **Audit logs** (§5.4) plus general activity logs; secure session management, login notifications,
  device/session management.
- Automated backups and a documented restore path. GDPR-ready data handling.

Never log credentials, tokens, full payment details, or student PII in plaintext.

---

## 9. Full feature wish list — a menu, not a checklist

From the original brief. Draw from it; prune it as the build progresses. Do not implement anything
here just because it is listed.

**Public site** — homepage, about Dr. Tahir, courses catalog, individual course pages, contact,
WhatsApp button, book-a-consultation, blog/articles, short educational videos, testimonials, FAQ,
success stories, newsletter signup.

**Student** — registration/login, profile, dashboard, enrolled courses, lessons, downloadable
materials, video lessons, homework/assignments/quizzes, timetable, Zoom links, WhatsApp contact,
notifications, progress tracker, attendance, grades, certificates.

**Assignments** — view, submit (files and/or typed answers), edit before deadline; teacher side:
correction on-platform with highlighting, comments, overall feedback, marks, optional rubrics, return
corrected work, full submission and correction history.

**Quizzes (Google-Forms-like)** — MCQ single/multi, short answer, paragraph, dropdown, linear scale,
checkboxes, matching, true/false; required/optional questions, sections, progress indicator, autosave,
optional timer, auto and manual marking, instant feedback, answer review, pass/fail settings, question
and answer randomization, duplication, question bank, analytics, export, attempt history, multiple
attempts, deadlines and availability windows. Optional Google Forms integration.

**Admin** — CRUD courses/students/enrollments, upload lessons/files/videos, Zoom meetings, create
assignments/quizzes/blog posts, view reports and submissions, grade and return work, announcements,
notifications, testimonials, FAQs, site content. **No earnings widget.**

**Reports** — student progress, assignment, quiz, attendance, course completion, activity;
downloadable; per-student performance summaries.

**CMS** — posts with title, description, featured image, categories, tags, SEO settings, publish
scheduling. No coding required to manage content.

**Payments** — cards, digital wallets, local Egyptian methods, international; auto-enrollment on
success, invoices, confirmation emails, payment history, discount codes / coupons / vouchers,
installments, manual approval, refunds, failed-payment handling, status tracking, secure transaction
logs, future subscriptions. Designed so **additional gateways drop in later**.

**Integrations** — WhatsApp, Zoom, Google Forms (optional), email, SMS (future), payment gateways.

---

## 10. Working conventions

- **TypeScript everywhere**, strict mode. No `any` as a shortcut.
- Validate all input at the API boundary (DTOs + a schema validator); never trust the client.
- Keep integrations behind interfaces — storage, video, mail, payments — so providers can be swapped.
- Match the surrounding code's style, naming, and comment density. Read before you edit.
- Don't add docs, changelogs, or formatting passes that weren't asked for.
- Secrets live in `.env`, which is gitignored. Commit an `.env.example` instead.
- When a requirement in this file is contradicted by a newer instruction, **update this file**.
- US spelling throughout (`enrollment`, not `enrolment`) — it matches the entity names in §6.
- The TA/Admin prototype annotates screens with requirement codes (`ACC-`, `CRS-`, `ASG-`, `QUZ-`,
  `PRG-`, `PAY-`, `CMS-`, `REP-`, `COM-`, `TA-R`). Cite the relevant code in commit messages and in
  comments on non-obvious business rules — it's a ready-made traceability map back to the screens.

---

## 11. Open decisions — don't block on them, ask when they matter

- Which payment processor(s) for Egypt (Paymob vs. Fawry), and whether Stripe is needed at launch.
- Zoom: manual link + time (current assumption) vs. API automation.
- Single Chemistry/IGCSE course vs. the fuller IGCSE/IELTS/English catalog — the schema supports both.
- How rich the quiz engine must be at launch (a simple submission may be enough to start).
- Whether the existing Vercel/Next.js prototype UI is reused or rebuilt under the agreed stack.
- Parent role depth: read-only monitoring only, or also communication and payment management.
- One tutor brand vs. a future multi-tutor marketplace.
- **Can a TA generate reports?** §5.9 — from a client meeting — says yes, explicitly. Two
  artifacts say no. The TA prototype has no Reports screen and puts report generation + CSV under
  Admin-only; the user-stories board puts all five `REP-*` stickies in the Owner column and gives
  the TA **none**, while still granting `QUZ-12` (quiz analytics for assigned courses) and `PRG-05`
  (progress/grade summaries for assigned students). That split is coherent on its own terms — the TA
  *reads* their own courses' numbers but does not *generate the artifact* — and it is the reading to
  assume if nobody answers.

  The board is the 30 Jul meeting's own artifact (§0 item 4), so "the meeting outranks the
  prototype" no longer settles this: the 30 Jul meeting and the prototype now agree with each other
  against §5.9. If §5.9 traces to Report 2 (6 Aug) it still wins on recency; if it traces to Report
  1, it is contradicted by the board drawn at that same meeting. **Check which PDF §5.9 came from
  before writing the `@Roles()` decorator** — and either way this is worth one question to the
  client, because `ReportRun.generated_by` (§6.1) exists precisely to record a TA as the author.

- **Can a TA create assignments?** The board's `ASG-10` says yes, "independently"; §2.2's preset
  omits it, granting only grading of work that already exists. Note the asymmetry the preset already
  carries — a TA may build and publish *quizzes* (`QUZ-11`) but, on the preset's reading, not
  assignments. If the client cannot articulate why those differ, the answer is probably yes to both.

- **Can a TA schedule sessions and post Zoom links?** The board's `CRS-11` says yes; §2.2's preset
  omits it. This is entangled with the open Zoom question above — manual link + time vs. API
  automation. Under the manual assumption it is a `LiveSession` write, which is cheap to grant;
  under API automation it means the TA's action provisions a meeting on Dr. Tahir's Zoom account —
  a different question, and one the client should answer deliberately. Note that the board's own
  Zoom diagram draws `TeacherTA` as a single lifeline and does not distinguish the two.

- **Two board stories have no entity anywhere in §6 or §6.1.** `COM-08` — a student can comment on
  or ask a question against a lesson, "to get help without leaving the platform" — and `CMS-13` — a
  visitor can read course reviews and ratings from past students. §9's wish list has neither
  (its "testimonials" are curated marketing copy, not per-course ratings), so these were never
  costed. Both are real features with their own moderation surface, not fields on an existing table:
  lesson comments need a threading model and a TA/admin moderation view, ratings need
  enrollment-gated authorship and an aggregate the public catalog can read. **Confirm whether either
  is in scope before Phase 2 closes** — adding them afterwards means a public write path on a
  codebase that currently has none.

- Whether the Payments **page** should also hide transaction amounts, or only the dashboard does
  (§1). The prototype shows amounts on the page; nobody has ruled on it.
- Whether TA permissions are per-TA configurable (§2 says "must be configurable") or the fixed
  preset the prototype shows (§2.2). Build the preset; keep it data-driven so this stays cheap.
- Naming collisions to settle before the first migration: `Coupon` vs `DiscountCode`, and the
  generic `Post` vs the specific `BlogPost`/`VideoAsset`/`Testimonial`/`FAQ`/`MediaAsset` (§6.1).
  Carrying both spellings into schema is the failure mode; my recommendation is the specific ones.
- `Attendance` keying is **settled in the student build**: `AttendanceRecord` keys on `sessionId`
  (`live-sessions/interfaces/live-session-repository.interface.ts:10-15`), matching §6.1's own
  recommendation. Still open: the shipped record stores `attended: boolean`, which cannot encode
  §6.1's `late`. Confirm whether `late` is a status Dr. Tahir will actually mark **before** the TA
  roster and the admin Attendance Report (§5.15) are built on the boolean — after that there are
  three read-sides and a data migration instead of one interface.
- **What `due_at` actually does.** Submission is gated on `available_to` only, so a
  first submission 25 days past the due date is silently accepted (`assess-1` is due 5 Sep and
  open until 30 Sep). `is_overdue` labels it but nothing penalises it. Is `due_at` advisory, a
  hard cutoff, or a late-penalty trigger?
- **No `missed` status.** §5.10's four states can't distinguish "window hasn't opened" from
  "window closed, never submitted" — both return `locked` (`assessments.service.ts:114`). A student
  sees the same badge for work they can still do and work they have permanently lost. This is no
  longer only a badge: a closed-unsubmitted homework drops out of `dashboard.homeworkPending` and
  silently lowers `reports.performance.homeworkSubmissionRate`, with no "N missed" surfaced
  anywhere. Two numbers a student or parent reads as authoritative now depend on this being decided.

---

## 12. Reference material

- `context/download.pdf` — signed development agreement: stack, scope, phases, 40-day timeline, IP,
  warranty (30 days post-launch), maintenance terms.
- `context/report 1.pdf` — Phase One meeting, 30 Jul 2026: user stories review.
- `context/Report 2 - Mr Tahir Elshazli LMS.pdf` — Phase Two meeting, 6 Aug 2026: prototype review.
- `context/tahirlmstaadmincontext.md` — TA & Admin actors walked screen by screen from the clickable
  prototype, with the requirement codes (`ACC-`, `CRS-`, `ASG-`, `QUZ-`, `PRG-`, `PAY-`, `CMS-`,
  `REP-`, `COM-`, `TA-R`) that trace back to those screens. Source for §2.1, §2.2, §5.11–5.15, §6.1.
  **Note:** a fuller version of this document exists (adding a concrete `/api/staff` + `/api/admin`
  route inventory and per-screen ticket codes) that was supplied in conversation but is not in the
  file. §5.11's route split comes from it. Worth saving to `context/` so the file matches.
- `context/tahirlmsprojectknowledge.md` — background notes (stack section superseded, see §3).
- User stories board (Figma): `figma.com/board/R17sOASEJqQ7iQC2LeyFFK/Tahirelshazli.com---User-Stories`
  — 129 stickies in five role columns (Owner 51, TA 16, Student 35, Parent 12, Visitor 15) carrying
  the same `ACC-`/`CRS-`/`ASG-`/`QUZ-`/`PRG-`/`PAY-`/`CMS-`/`COM-`/`REP-`/`PUB-` codes used above,
  plus nine sequence diagrams (four system flows, five API-integration flows). §0 item 4 ranks it;
  §2.2 and §11 record where it disagrees with the prototype doc. **A full transcription of the board
  was supplied in conversation but is not in `context/`** — the same gap the
  `tahirlmstaadmincontext.md` note above describes, and worth closing the same way.
- TA/Admin prototype: `sketch-manage-82110863.figma.site`
- Style references: gostars.online · bassthalk.com · mentoraeg.com · teachable.com

---

## 13. The project log

`project_log.md` is the running narrative of what this project is and how it got here — prose and
Mermaid diagrams, not a changelog. Both `project_log.md` and `CLAUDE.md` are referenced by name in
several entries; keep the two consistent.

**Update it as part of finishing a piece of work, not afterwards as a chore.** Every material
change gets an entry; a typo fix does not.

Shape of an entry, newest at the bottom:

- `## YYYY-MM-DD — Title (commit \`hash\`)` — the hash where there is one.
- **What changed** — in prose. What a reader needs to know to navigate the code, not a file list.
- **Why** — cite the `CLAUDE.md` section or the prototype requirement code (§10) that motivated it.
  An entry that cannot name one is a candidate for scope creep.
- A Mermaid diagram when the shape of something changed — data flow, module wiring, a decision
  boundary. Not one per entry for its own sake.
- **Follow-ups / debt** — what was knowingly left undone, so the next session inherits it instead
  of rediscovering it.

The **Current state** block at the top is overwritten each update rather than appended to. It is
the answer to "what exists right now"; §7.1 here is the same answer in inventory form, so when one
changes, check the other.

Be honest in it. "Written but never run against a real database" is worth more than a green
checkmark, and an entry that overstates what works is worse than no entry.
