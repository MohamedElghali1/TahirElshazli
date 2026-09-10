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
System, positioned against GoStars, Bassthalk, Mentora, and Teachable. The brief says it must scale
to thousands of students; the client has since given the numbers it actually runs at, which are two
orders of magnitude smaller — **§7.3 has them, and they are the ones to design against.**

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
| **Student** | Courses, lessons, recordings, assignments, quizzes, grades, progress, timetable, certificates, and the classmates in their own group (§5.17). |
| **Parent** | Read-only monitoring of a linked student: progress, grades, attendance — plus manages payments. |
| **Teaching Assistant** | Grading, attendance, quizzes, materials, announcements, placing students in groups — **scoped to assigned courses** (§2.2). **Fully audited**. |
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

**Placing a student in a group is a TA power** — the client said so directly on 2026-09-10 (§5.16):
a student is assigned to a group "by the assistant or the teacher". Note that this sits right next
to something the preset withholds: a TA still **cannot enroll or unenroll**. The two are different
acts and the distinction is worth keeping sharp — enrollment decides *whether* a student has the
course at all (and, once payment lands, what they paid for); placement decides *which cohort* they
sit in among students who already hold it. A TA moves students between groups; only the teacher puts
one into, or takes one out of, the course.

**Visibility is wider than this preset assumes, as of 2026-09-10.** The client's current posture
is that a TA reaches **every course and every group**, not only assigned ones — §5.11 has it, and
why it is written as a reversible posture rather than a deletion. Everything in the two lists
above still holds; what changed is the clause *"only for courses they are explicitly assigned
to"*, not the verbs. A TA still cannot enroll, unenroll, touch payments, touch the CMS or reach
`/admin/*` — they can now do the things they could always do, everywhere. **Visibility widened;
capability did not.**

**Admin is a strict superset**, unscoped and platform-wide: course and curriculum CRUD, the full
student directory including unenroll, payments/refunds/discount codes, CMS, cross-course reports,
TA-to-course assignment, and audit-log access.

**Two powers the user-stories board grants a TA that this preset did not.** `ASG-10` reads
*"Create and publish assignments independently"* and `CRS-11` reads *"Schedule/share Zoom links for
my sessions"* — both sit in the board's TA column, and neither appeared above.

**`ASG-10` was answered on 2026-09-10, in the board's favour: a TA may author both assignments
and quizzes.** So authoring lives on `StaffManageController` with one role rule and no branch on
the task's `type` — which matters, because the preset's literal reading (quizzes yes, assignments
no) would have made a role check depend on a body field, exactly the shape this section warns
against. `CRS-11` is still open and still shipped teacher-only (§11).

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

**The mode belongs to the group, as of 2026-09-10.** It used to sit on the `Enrollment`; the
client's answer moved it, and the move is more honest — a group is *taught* one way, and two
students in the same room cannot be in different modes. It lands on `GroupCourse` (§6.1) rather
than on `Group`, because a group that takes two courses could take one live and one from
recordings; mode describes how a course is **delivered to** a group.

Which leaves the student who is enrolled but not yet placed (§7.2) with no group to read a mode
from. `courses.default_learning_mode` — already shipped, migration 003 — is the fallback, and
that is now its second job: it seeds a self-enrollment today and answers for an unplaced student
tomorrow. **The dashboard must never have no mode to render.**

**Built 2026-09-10.** `LearningModeService` (in `groups/`, exported globally by
`GroupDataModule`) is the single answer to *how is this student taught this course*: the group's
mode, else the course default, else `'recorded'` — the safe end of the fork, since it renders
checkpoints against an empty list rather than an attendance timeline against sessions that do not
exist. Migration `007` **dropped `enrollments.learning_mode`** rather than leaving it as a cache,
because the copy would go stale the instant a student is moved between groups, which is the
operation groups exist to support.

A student legally sits in two groups studying one course. Both the single read and the roster
batch take the **longest-standing placement** (`enrolled_at` order), so the two never disagree —
two reads of one value that differ is worse than either answer, and a spec pins it.

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
true as surfaces land. **Twenty actions exist so far**, across staff assignment, grading, the
recording library, live-session scheduling, announcements, groups and authoring:

`course_staff.assigned` · `course_staff.unassigned` · `submission.graded` · `recording.created` ·
`recording.updated` · `recording.deleted` · `live_session.scheduled` · `live_session.updated` ·
`live_session.cancelled` · `announcement.posted` · `group.created` · `group.renamed` ·
`group.course_added` · `group.course_removed` · `group.student_assigned` · `group.student_removed` ·
`assessment.created` · `assessment.updated` · `assessment.targeted` · `assessment.deleted`

Of those, `submission.graded`, `announcement.posted`, the two `group.student_*` and all four
`assessment.*` are reachable by an assistant; the rest are teacher-only today. `actorRole` is derived from the acting user rather than assumed, so if a
teacher-only write is later widened to TAs the log does not silently attribute an assistant's action
to Dr. Tahir. That now holds in **every** audited service, `ManageRecordingsService` included — it
derived nothing and hardcoded `Role.Teacher` until 2026-09-08. `StaffService` is the one remaining
literal, and correctly so: staff assignment has no TA route to widen.

§7.1 records the one gap — the entry is written after the action commits, not inside its
transaction. Ten more write paths now depend on it, which makes closing it more urgent, not less.

**One half of that compile-error mechanism was missing until 2026-09-10.** The union does force a
new action to be *declared*, but `ListAuditLogQueryDto` repeats both unions as runtime arrays for
`@IsIn`, and those were plain literals - so the six `group.*` actions logged correctly and were
then **rejected by the admin log's own filter** with a 400. The spec test that claimed to guard
this iterates the array, so it can only prove that what is listed works and never that anything is
missing; an e2e request found it instead. Both arrays are now derived from an exhaustive
`Record<AuditAction, true>`, which does not compile with a union member absent. **Any future
list-shaped mirror of a union in this codebase should be written the same way** - the pattern is
cheap and it is the difference between a guard and a comment claiming there is one.

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

**Groups (§5.16) do not complicate this, because of how the client answered the authoring
question.** A task is written **once** and *targeted* at one or more groups — not copied per
group — so there is still exactly one `Assessment` row per task, and "the average for this
assignment" stays one average over every submission against it. Per-group breakdowns are a
`GROUP BY` on the target, and the cross-group figure the client actually asked for (*was this
task hard?*) is the default rather than something to reconstruct.

> An earlier draft of this section proposed a nullable `origin_assessment_id` to stitch per-group
> copies back together. **That column is not needed and should not be added** — it solved a
> duplication problem the 2026-09-10 answer removed.

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

### 5.11.1 The current posture: TAs see everything — and why this section stays

**Answered by the client on 2026-09-10.** Asked whether TAs should be scoped per group once
groups exist (§5.16), the answer was *"TAs are allowed to access all groups"*; asked whether that
also drops the per-course scoping, *"for now keep it as TAs see everything, but it might be
changed."* So the intended behaviour today is an **unscoped TA** — every course, every group.

**Do not delete this section to implement that.** *"It might be changed"* is the operative half of
the instruction, and everything above is a warning that retrofitting scoping is how the leak
happens — a codebase that has forgotten how to scope cannot be re-scoped cheaply. So:

- `CourseStaffAssignment` stays, and staff-to-course assignment stays an admin action.
- `StaffScopeService` stays the **single** place that decides, and every `/staff/*` route keeps
  routing through it. The posture is **one answer inside `assertAssigned`**, not a hundred
  deleted joins — which makes reversing it one method and its tests rather than a re-audit.
- Make it **configuration, not a code edit**: the same rule §2.2 sets for the permission preset.
  A `TA_SCOPE=all|assigned` switch read once at wiring time is honest about being a posture.
- The 404-not-403 rule above still applies whenever the switch is `assigned`.

What does **not** widen: `/admin/*` stays `@Roles(Role.Teacher)`. "A TA sees every course" is not
"a TA may unenroll a student or issue a refund" — §2.2's *capability* split is untouched by a
*visibility* decision, and conflating the two is the way this answer turns into a real hole.

**Today's code still scopes** — an unassigned course 404s for a TA right now, so the shipped
behaviour and the decided posture currently disagree. That is recorded rather than hidden
(§7.1); the flip belongs with the group work.

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

Audience is one of `all_students`, `course:<id>`, or `all_tas` — plus `group:<id>` once groups
exist (§5.16), which is likely to be the *common* case, since "tomorrow's session moves to 7pm"
is a message to one cohort and not to everyone taking the course. **`all_tas` resolves from
`role = 'assistant'` at the moment of sending** — never stored as a frozen list of user ids, which
would silently miss TAs hired after the announcement was drafted.

### 5.15 One attendance table, two aggregations

The TA's per-session roster and the admin's Attendance Report read the **same `Attendance` rows**,
aggregated two different ways — by session for the TA, by course-average for the report. Don't
build a second summary table for the report; it will drift.

Once §5.16's groups land, a session belongs to a **group studying a course** rather than to the
course, so the TA's aggregation is already per group and the report's "course average" needs a
decision: per group, per course, or both. Averaging two cohorts that meet on different days into
one figure hides the very thing the report is read for.

### 5.16 Groups — a class of students, enrolled into a course

**Given by the client on 2026-09-10, and it is a new entity, not a rename.** Dr. Tahir teaches in
**groups**, and **more than one group can be enrolled in the same course**. A group is a cohort of
students; a course is the curriculum, and a group is *enrolled* in it. The schema currently has
only the second of those, and several comments in the code use "group" loosely to mean "course" —
that reading is now wrong (§7.3 has the numbers this changes).

- **A student is placed into a group by a teacher or a teaching assistant** — never by the student.
  There is no self-service placement, so §7.2's open self-enrollment produces a student who holds a
  course and has **no group yet**. That is a state the code must represent, not an error to throw.
- **A group is a standalone class of students, not a subdivision of a course.** Answered
  2026-09-10: *"no, I mean group of students."* A group has a name and members and exists before
  any course is attached to it; a course is then **enrolled** — the client's own verb — and more
  than one group can be enrolled in the same course. Nothing rules out the same group being
  enrolled in two courses, so the group↔course link is **its own row** (§6.1), never a `course_id`
  column on the group. Getting this backwards is the expensive mistake here: a `course_id` column
  is a one-way door that a join table is not.
- **Enrollment first, placement second.** Answered 2026-09-10: *"yes, enrolled then grouped by
  TA."* `Enrollment` stays the single source of truth for *does this student have this course*;
  group membership is a second, later fact about *which cohort they sit in*. That ordering is
  exactly what keeps §7.2's self-enrollment intact — a student enrolls themselves and is simply
  ungrouped until a TA places them. It also means placing a group into a course does **not** by
  itself enroll its members (§11 asks whether it should, as a convenience).
- **The live schedule belongs to the group, not the course.** Two groups on the same course meet at
  different times, which is most of why groups exist at all. A session is therefore a *group
  studying a course* — "Group A's Chemistry lesson" — not a property of either alone.
  `LiveSession` keys on `courseId` today
  (`live-sessions/interfaces/live-session-repository.interface.ts:1-8`); attendance keys on the
  session, so attendance follows for free once the session moves. This is the largest structural
  consequence of the whole instruction.
- **Announcements gain a `group:<id>` audience** — §5.14.
- **TA scoping is settled, for now, in the widest direction** — §5.11.1. TAs access all groups and,
  for the moment, all courses. It is explicitly a posture the client may reverse, so the scoping
  machinery stays in place and answers differently rather than being removed.
- **Assessments are written once and targeted at one or more groups.** Answered 2026-09-10:
  *"he could make a task then to submit for one or more groups with his own selection."* So
  "per group" means the **audience** is chosen per group, not that the task is duplicated per
  group. One `Assessment` row, a set of target groups picked at authoring time, and a student
  sees it when they are in one of them.

  That distinction decides the schema. `Assessment.courseId` **stays** — a task is course
  material — and gains a join, `AssessmentTarget` (§6.1), one row per targeted group. The
  per-group availability window and due date live on the *join row* as nullable overrides of the
  assessment's own, so a teacher who wants one deadline for everyone sets it once and a teacher
  running two cohorts a week apart overrides the later one. Marks were never shared: a submission
  already belongs to a student.
- **The learning mode moves to the group too** — §5.2. Onto `GroupCourse`, not `Group`.

- **Adding a group to a course does not enroll its students.** Answered 2026-09-10: *"not
  necessary — maybe the assistants and teachers can add to specific group."* No cascade, no bulk
  enroll; staff add students to a group one at a time, and `Enrollment` stays untouched by it.
  This keeps the §5.12 money question out of the group work entirely, which is the main reason
  it is a good answer: nothing about placement can ever hand out a course somebody has not paid
  for. What it costs is a real **"add students to this group"** staff surface — with 30 students
  a group, adding them one by one from a page that only handles one at a time is the sort of
  thing Dr. Tahir does once and never again, so multi-select from the course roster is the
  minimum bar even though the write underneath is per student.

**Read those last four together, because they compound.** An enrolled-but-unplaced student
(§7.2) now has no group, therefore no assessments and no mode — a state that was benign when a
group only decided *who you sit with* and is not benign once it decides *what work you are set*.
Placement stops being an administrative nicety and becomes the thing that makes a course usable.
Two consequences follow and neither is optional: the fallback in §5.2 so the dashboard always has
a mode to render, and a staff **"enrolled, not yet placed"** queue prominent enough that nobody
sits in it unnoticed. An empty course is exactly what a student reports as "the site is broken".

### 5.17 A student can see their classmates

From the same instruction. A student may see the other students **in their own group**. This is the
first time in this build that one student learns another exists — every student-facing read so far
is strictly self-scoped — so treat it as a **new PII surface**, not as one more list endpoint.

- Scope is the **group**, never the course and never the platform. Two groups sharing a course must
  not see each other. A student in two groups sees both rosters, as two lists rather than one
  merged set — they are two different classes, and the merge would quietly invent a relationship
  between people who have never met.
- This is the one place where §5.11.1's "TAs see everything" posture must **not** leak downward.
  Widening what staff may see says nothing about what a student may see, and a classmate list is
  the student surface most likely to be widened by accident while copying a staff roster query.
- Keep the field set minimal and decide it deliberately: display name, and an avatar if there is
  one. **Never email, phone, grades, progress or attendance.** A classmate list that leaks a mark
  is a different feature from the one that was asked for.
- Gated server-side on the caller's own membership of that group, the same way `assertEnrolled`
  gates everything else. A student not yet placed in a group gets an empty list — not a 403, and
  never another group's roster.

### 5.18 Staff authoring has to reach the student end

Also from the same instruction: **quizzes, assignments and announcements uploaded by the teacher or
the assistant must appear on the student side.** Read it as one end-to-end requirement rather than
as three CRUD screens — the acceptance test is a student opening their dashboard and finding the
thing that was just posted.

Where that stands today (§7.1 is the fuller inventory):

**Built 2026-09-10**, except the quiz engine. Where each piece stands:

| Piece | Staff can author it | Student sees it |
|---|---|---|
| **Announcement** | Yes — `POST /admin/announcements` and `POST /staff/courses/:id/announcements`. | Yes — the mailbox fan-out **and** `GET /courses/:id/announcements`, enrollment-gated. Course rows only: a platform-wide announcement already reached the mailbox, and filing it under a course heading would misdescribe it. |
| **Assignment / homework** | Yes — `POST /staff/courses/:id/assessments`, `PATCH`/`DELETE /staff/assessments/:id`, `POST /staff/assessments/:id/targets`. TA-reachable. | Yes, and **only if it was set for one of their groups** (§5.16). |
| **Quiz** | Yes, as a type — the same routes, `type: 'quiz'`. | As a submission with a mark. **The engine is still unbuilt**: `Question`, `QuestionOption`, `QuizAttempt` and `Answer` (§6) do not exist, and §11 still has "how rich must the quiz engine be at launch" open. Accepting the type now means the data is labelled correctly when it lands. |

Three rules the authoring surface enforces, each because getting it wrong is silent:

- **At least one target group.** A task set for nobody is invisible to every student, and a
  teacher should discover that on the form rather than on the due date.
- **The window must be coherent** — `availableFrom < availableTo`, and `dueAt` inside it.
  §5.10 derives every status from these, so an inverted window is a task that is permanently
  `locked` with nothing anywhere to explain why. The check is deliberately compatible with all
  three readings §11 leaves open for what `due_at` *does*.
- **A targeted group must already study the course**, or the task appears for a cohort that does
  not take the subject.

**Deleting is refused once anything has been submitted.** A submission is a student's work and §6
keeps history where history matters, so the honest correction to a live task is to re-aim it or
close its window — not to erase the record. The FK would cascade happily; the service does not.

Publication stays a **server-side clock decision** (§5.10, §5.13): an assessment appears when its
`available_from` passes — or its group's override does — never when a client decides it should.


---

## 6. Data model (starting point)

`User` (role: visitor/student/parent/assistant/teacher) · `StudentProfile` · `ParentLink` ·
`TeacherProfile` · `AssistantProfile` · `Course` · `CourseModule` (chapters) · `Lesson` ·
`Enrollment` (progress; **learning mode moved to `GroupCourse`** — §5.2) · `Group` ·
`GroupCourse` · `GroupMembership` · `Checkpoint` / `LessonProgress` ·
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

- **`Group`** — `id, name, teacher_id, created_at`. §5.16's standalone class of students, and the
  thing a live schedule and a classmate list actually belong to. **No `course_id`** — that was
  the shape assumed before the client answered on 2026-09-10, and it is wrong: a group exists
  before a course is attached and may be enrolled in more than one.
- **`GroupCourse`** — `id, group_id, course_id, learning_mode, enrolled_at, enrolled_by`. The
  client's verb: a group is *enrolled* in a course. Many groups per course, and in principle many
  courses per group. The **live sessions** and the **learning mode** (§5.2) hang off it, because
  both are properties of *this group studying this course* rather than of either alone, and it is
  what a `group:<id>` announcement resolves through. Assessments do **not** — they target the group
  directly (`AssessmentTarget`, below), since a task is written once for a set of groups rather
  than owned by one pairing.

  It does **not** create student enrollments, and as of 2026-09-10 it deliberately never will:
  adding a group to a course enrolls nobody (§5.16). `Enrollment` stays the access gate, which is
  what keeps §5.12's payment question out of the group work entirely.
- **`AssessmentTarget`** — `id, assessment_id, group_id, available_from?, available_to?, due_at?`.
  §5.16's answer in one table: a task is authored once and targeted at the groups the teacher
  selects. The three timestamps are **nullable overrides** of the assessment's own window, so the
  common case writes none of them. `Assessment.courseId` is unchanged — an earlier draft had it
  re-keying onto `GroupCourse`, which the authoring answer makes wrong and unnecessary.

  The read it has to serve: *the assessments of this course targeted at a group this student is
  in.* That is `AssessmentRepository.findByCourse` plus a join, not a new access path — and §5.10
  still derives status server-side, now from the override window where one exists.
- **`GroupMembership`** — `id, group_id, student_id, assigned_by, assigned_at`. Placement is a
  staff action (§5.16), so `assigned_by` is not decoration — it is what makes the placement an
  auditable event under §5.4, and a new `group.student_assigned` action belongs in `AuditAction`
  the day this is built. Its own table, not a `group_id` column on `Enrollment`: the column was
  only ever coherent while a group belonged to one course, and it cannot express a student
  being moved between groups without losing the history of it.
- **`CourseStaffAssignment`** — `id, user_id (role=assistant), course_id, assigned_at, assigned_by`.
  The core RBAC table; §5.11 filters every TA query through it, and it is the piece most worth
  getting right first — retrofitting scoping is how the leak happens. **May become
  group-scoped** — see §5.11 and §5.16; that is a security decision, not a schema preference.
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
| **Student** | Built. 10 feature controllers, every route `@Roles(Role.Student)`, unit + e2e covered. `JwtAuthGuard` + `RolesGuard` are **global**, so a new controller is protected by default; `@Public()` (health, register, login, password reset) and `@AnyRole()` (logout) are the only exits. Includes the catalog and self-enrollment added 2026-09-07 ({S}7.2), and the aggregated **`GET /dashboard`** added 2026-09-09 - the whole Home screen in one request, composed from the same per-course services so its numbers cannot drift from the screens it links to ({S}7.3). The per-course `GET /courses/:id/dashboard` remains and still serves `/learn/[id]`. Plus `GET /courses/:id/classmates` (2026-09-10, {S}5.17) — the first read where one student learns another exists, group-scoped, name only — and `GET /courses/:id/announcements` ({S}5.18), so a posted announcement has a page rather than only a mailbox line. The assessment list and detail are now **targeting-filtered**: a student sees only what was set for one of their groups. |
| **Visitor** | **Partly built.** A `public` module serves `GET /public/courses` and `GET /public/courses/:slug` unauthenticated, gated on the `is_published` flag from migration `004_public_catalog.sql` so Dr. Tahir can draft a course without it appearing. The detail response carries the **full outline** — modules and lesson titles with durations — not just counts. Rate-limited separately from auth (browsing is the point, but every call is an unauthenticated database read). Still absent: blog, contact. |
| **Parent** | None. Enum entry only; no `ParentLink`, no read-only views. |
| **Teaching Assistant** | **Working console.** `CourseStaffAssignment` + `StaffScopeService` (§5.11) now carry a real surface: `/staff/overview`, `/staff/courses`, and per-course `roster`, `outline`, `submissions`, `recordings`, `live-sessions` and `announcements`, plus `POST /staff/submissions/:id/grade` and `POST /staff/courses/:id/announcements`. Every one is scoped, and an unassigned course 404s. Plus the group surface added 2026-09-10: `GET /staff/courses/:id/groups` (scoped), `GET /staff/groups/:id` and `/members`, and **placement** — `POST /staff/groups/:id/members` and `DELETE .../members/:studentId` — which {S}2.2 grants a TA explicitly. Plus **assessment authoring** ({S}5.18, 2026-09-10): `GET`/`POST /staff/courses/:id/assessments`, `PATCH`/`DELETE /staff/assessments/:id` and `POST /staff/assessments/:id/targets`. Still absent: attendance, the quiz engine, materials upload, messages. |
| **Teacher / Admin** | **Working console — a strict superset of the TA's.** The same `/staff/*` routes unscoped, plus admin-only `/admin/students`, `/admin/assistants`, TA-to-course assignment (`/admin/courses/:id/staff`), the recording library (`POST /admin/courses/:id/recordings`, `PATCH`/`DELETE /admin/recordings/:id`), live-session scheduling (`POST /admin/courses/:id/live-sessions`, `PATCH`/`DELETE /admin/live-sessions/:id`), platform-wide announcements (`GET`/`POST /admin/announcements`), the audit-log reader (`/admin/audit-log`) and, from 2026-09-10, **group CRUD** — `GET`/`POST /admin/groups`, `PATCH /admin/groups/:id`, and `POST`/`DELETE` on `/admin/groups/:id/courses`. Still absent: course CRUD, payments, CMS, reports. |

The TA/admin work surface lives in `backend/src/manage/` — `ManageService` (overview, roster,
outline), `GradingService`, `ManageRecordingsService`, `DirectoryService`, behind two controllers
that carry the whole role boundary at class level: `StaffManageController` is
`@Roles(Assistant, Teacher)` and every method routes through `StaffScopeService` first;
`AdminManageController` is `@Roles(Teacher)` and joins through nothing. The module provides **no
repositories of its own** — re-providing a token would build a second in-memory instance, so a grade
written through `manage` would be invisible to the student reading it through `assessments`. That is
why `EnrollmentsModule`, `AssessmentsModule` and `RecordingsModule` now export their tokens.

**Two modules are `@Global()`, and both for the same reason.** `AuditModule`,
because §5.4 makes an audit entry part of what a mutating action *is*; and
`GroupDataModule` (`GROUP_REPOSITORY` + `LearningModeService`), because once
the learning mode moved onto `GroupCourse` every service that renders a
student's course needs group data, while `GroupsModule` itself depends on
`CoursesModule` — so `CoursesModule` importing it back would be a cycle, and
`forwardRef` would only hide one. Only the data and the one derived question
are global; `GroupsService`, which writes, stays behind `GroupsModule`. **A
third global module needs a better reason than convenience** — global providers
are invisible in a module's import list, which is exactly what makes them worth
rationing.

**Groups exist as of 2026-09-10, and this is exactly how much of them.** Migration `006_groups.sql`
creates four tables — `groups`, `group_courses`, `group_memberships`, `assessment_targets` — and
`backend/src/groups/` is the module on top: a `GroupRepository` with both drivers, `GroupsService`
(create, rename, attach/detach a course, place/remove a student, all six audited),
`ClassmatesService`, and three controllers carrying the role boundary at class level exactly as
`manage/` does. Verified: **all six migrations applied to a real PostgreSQL 15 from an empty
schema**, 59 integration tests green.

**What is built and what is only a table:**

| Piece | State |
|---|---|
| `groups`, `group_courses`, `group_memberships` | Built and read end to end — staff CRUD, placement, classmate list. |
| `assessment_targets` | **Built and read end to end** (2026-09-10). `AssessmentAuthoringService` writes it, `findByCourseForGroups` / `findByIdForGroups` read it with the per-group window COALESCEd in SQL, and the seed targets all eight fixture assessments at `group-1` — without which a seeded database renders an empty assessment list that looks like a bug. |
| `learning_mode` on `group_courses` | **Built and read end to end** (2026-09-10). `LearningModeService` resolves group → course default, every student-facing and staff-facing reader goes through it, and migration `007` dropped `enrollments.learning_mode` so there is no second copy to drift. |

Code comments that say "group" and mean *course* — `EnrollmentRepository.countDistinctStudents`
says "a student in two of the teacher's groups" — predate §5.16 and are now actively misleading.
Fix them as the remaining group work touches each file rather than in a sweep.

**And TA scoping still diverges from the decided posture, deliberately.** §5.11.1 records the
client's 2026-09-10 answer — TAs see every course and every group — but the shipped code still
scopes: `StaffScopeService.assertAssigned` 404s an unassigned course, and the unit and e2e suites
assert that it does. The group surface is built to match that split already: the routes that name
a *course* go through `assertAssigned`, and the routes that name a *group* do not, because a group
spans courses and there is nothing to scope by — which is also the client's answer. The remaining
flip is the course half, and it belongs behind a config switch inside `assertAssigned` because the
client's own words were *"it might be changed"*.

**Assessment authoring exists as of 2026-09-10** (§5.18) — create, edit, re-target and a guarded
delete, on `StaffManageController` and reachable by a TA, all four audited. What is still missing
is the **quiz engine**: `Question`, `QuestionOption`, `QuizAttempt` and `Answer` do not exist, so
`type: 'quiz'` is an assignment with a different label. That is deliberate rather than skipped —
§11 still has "how rich must the quiz engine be at launch" open, and building a question model
before that is answered is the definition of speculative (§9).

**Enrollment alone no longer decides what a student may read here.** Work is set per group, so
`AssessmentsService.loadForStudent` checks enrollment *and* targeting: without the second check an
assessment id would be enough to read - and submit against - another cohort's task. Same class of
hole §5.11 guards on the staff side, arrived at from the student side.

**The learning-mode move is done** (migration `007`, §5.2). What remains is assessment targeting:
`StoredAssessment.courseId` **stays put** — the 2026-09-10 authoring answer (write once, target
groups) means assessments gain a join rather than a new parent. What changes there is the *read*:
`AssessmentRepository.findByCourse` filters by the caller's group membership, reaching both
dashboard services, `ReportsService` and the staff submissions list. Not a re-parenting; a
predicate, in the places that already assert enrollment.

The existing assessments are **seed data with no group**, and the call here is to regenerate the
seed alongside the targeting work rather than invent a default group to migrate them into. They
exist to make a dev database useful; preserving them would add a permanent concept to the schema
to protect throwaway rows.

**Recording writes are teacher-only.** §2.2's preset gives a TA materials and never recordings, and
the client's instruction on 2026-09-07 was specifically that *the teacher* uploads them. If that
widens, the three routes move from `AdminManageController` to `StaffManageController` and
`ManageRecordingsService` is untouched — which is why it takes a `StaffActor` rather than assuming
admin.

**Frontend:** built for the Visitor-facing marketing site, the Student LMS and
the TA/Admin console — `app/(site)`, `app/(app)`, `app/(auth)`, 29 pages, typed
against the backend's response shapes in `lib/types.ts`. The marketing pages
read from `lib/site-content.ts` rather than an API, because there is no public
API to read (the Visitor row above). **No Parent screens.**

**One shell, two consoles.** `AppShell` is shared by every signed-in role and
picks its rail from `lib/roles.ts`: students get `/dashboard`, `/catalog`,
`/notifications`, `/profile`; a TA gets `/manage` and `/manage/courses`; the
teacher gets those plus `/manage/students`, `/manage/recordings` and
`/manage/activity`. `app/(app)/layout.tsx` redirects each role into its own
console, which is what fixed the old symptom where signing in as
`teacher@example.com` landed on the student dashboard and collected a 403 from
`GET /courses` — that screen is `@Roles(Role.Student)` end to end, so a teacher
saw a broken page rather than a restricted one.

Hiding a nav entry or a tab is **courtesy, never access control**. `/admin/*` is
`@Roles(Role.Teacher)` server-side and a TA who types the URL is refused by the
guard regardless of what the rail renders ({S}8). The client-side redirect
decides *where to send* someone, never *what they may read*.

**Persistence is driver-selected, and both drivers are real.** Every one of the
fourteen repository interfaces has an `InMemory*Repository` and a
`Postgres*Repository`; `database/repository.provider.ts` binds the `Symbol`
token from `PERSISTENCE_DRIVER`, read once at wiring time. `memory` is the
default in development and test and is **refused in production** — an unset
value there resolves to `postgres` and fails on the missing `DATABASE_URL`
rather than serving traffic from a process-local array. Schema lives in
`backend/src/database/migrations/`: `001_student_platform.sql` (17 tables, the
student surface), `002_staff_and_audit.sql` (`course_staff_assignments`,
`audit_log`), `003_course_catalog.sql` (`default_learning_mode`),
`004_public_catalog.sql` (`slug`, `is_published`), `005_announcements.sql`,
`006_groups.sql` (`groups`, `group_courses`, `group_memberships`,
`assessment_targets`) and `007_learning_mode_moves_to_the_group.sql` (drops
`enrollments.learning_mode` — the only destructive migration so far, and the
file says why the dropped value is derivable), applied by `MigrationRunner` via
`npm run db:migrate` or `DB_AUTO_MIGRATE=1` on a single-container deploy.
`test/postgres-repositories.integration-spec.ts` covers all fourteen and skips
itself when no `TEST_DATABASE_URL` is set. As of **2026-09-10 all seven
migrations have run against a real PostgreSQL 15** from an empty schema, with
the suite's **59 tests green** — so the announcements DDL, both of its CHECK
constraints, the `notifications_type_check` swap, the 004 slug backfill, 003's
learning-mode UPDATE and 006's four tables with their UNIQUE constraints and
cascades are all exercised rather than merely written. CI runs
the same suite on every push against a Postgres service container, with a guard
step that fails the job if the suite reports no executed tests (a suite that
self-skips is otherwise indistinguishable from one that passes).

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

Scaling debt still open, none of it structural — and **read §7.3 before acting
on any of it**, because the client's real numbers (10 groups × ~30 students)
retire about half this list rather than scheduling it. `CourseRepository` and
`AssessmentRepository` have batch reads (`findByIds`,
`findSubmissionsForStudent`) and the three N+1 loops are gone;
`CourseRepository.findAll(limit, offset)` and `AuditLogRepository.find` are the
first two **paginated** reads in the codebase, and `UserRepository.findByIds`
the third batch read.

**Count-only reads are now four**, not one: `NotificationRepository.countUnread`
was joined on 2026-09-09 by `EnrollmentRepository.countDistinctStudents`,
`RecordingRepository.countByCourses` and
`AssessmentRepository.countUngradedSubmissionsByCourses`, which between them
took `ManageService.overview` off a `4N + 2` fan-out that materialized every
enrollment, assessment, submission and recording row across all courses to
produce six integers. The student Home screen's `2N + 2` **request** fan-out
went the same day, behind a single `GET /dashboard`. Both are described in the
project log.

Still open: `StudentRepository` exposes no list method; no student-facing list
endpoint is paginated, and notifications are append-only with no ceiling. The
rate limiter (`InMemoryRateLimitStore`) and the token denylist are per-process
and `JwtStrategy` does a user lookup per request — §7.1 used to call these three
debt wanting one shared Redis, and §5.11 a fourth. **On one replica they are not
debt**; §7.3 records the decision and names the trigger (a second replica, not a
student count).

The interface-shape items here — list and count methods — were cheapest to fix
before a second implementation existed. That window closed some time ago:
`findAll` and `findByIds` above each cost two implementors and an integration
suite to add, which is the going rate now. Still worth doing, still not free.

**Audit coverage is twenty actions, and every mutating staff route is covered
today.** The `@Global()` `AuditModule` is now injected in seven services —
`StaffService`, `GradingService`, `ManageRecordingsService`,
`ManageLiveSessionsService`, `AnnouncementsService`, `GroupsService` and
`AssessmentAuthoringService` — wiring the twenty actions §5.4 lists, one
`audit.record` call per action. Verified by enumeration on 2026-09-10: every
`@Post`/`@Patch`/`@Delete` on `StaffManageController`, `AdminManageController`,
both announcement controllers and both group controllers reaches one. That is a property of today's tree, not
a mechanism: each new staff or admin write must add its own call, and the moment
one forgets, §5.4 is quietly broken with nothing failing. Attendance and
payments are where this stops being theoretical.

**The audit entry's `before` must not alias its `after`.** Twice now an
in-memory repository has handed back the stored object by reference while
`update` mutated that same object, so `before` and `after` read identical and
the entry recorded a change that appeared never to have happened — evidence-
shaped and empty, which is worse than no entry. It was found in grading, fixed,
and then found again in recordings on 2026-09-08. **Every in-memory repository
read that feeds a `before` snapshot returns a copy**, and
`manage.controller.spec.ts` carries a "before/after pair that actually differs"
test for grading, live sessions and recordings alike, and
`groups.controller.spec.ts` carries the same for a group rename and a
placement removal. A new audited mutation needs both.

**One known gap in the audit trail, recorded rather than discovered later.**
`AuditService.record` writes on its own connection *after* the action it
describes has committed, so a crash in between leaves an action done and
unlogged. Closing it needs the mutation and its audit row in one transaction,
which the repository-per-connection design cannot express today. It should land
before the payments surface (§5.12), where the gap is a money-trail hole rather
than a missing line.

---

## 7.2 Open enrollment — a deliberate, temporary posture

Added 2026-09-07 at the client's direct instruction, after they signed in and
found an empty dashboard with no way to fill it: *"for now, let me access every
course and appears in my student dashboard."*

**Any signed-in student can enroll themselves on any published course, free.**
`GET /courses/catalog` lists every course flagged with whether the caller holds
it; `POST /courses/:id/enroll` enrolls the caller and nobody else — the student
id comes from the verified JWT, and the route has no parameter or body that
could name a different one.

This is a **testing posture, not the business model.** The client's own next
sentence was *"maybe we could add the payment gateway if you want to buy a
course"* ({S}7, "Later / on request"). When payment lands it becomes a
precondition **in front of** `CoursesService.enroll`; the enrollment write
itself does not move. Do not delete the method to add payment.

Three things it deliberately does **not** do, so a later reader does not
mistake restraint for oversight:

- **It does not weaken the enrollment gate.** The signed-in catalog
  (`GET /courses/catalog`) returns titles, descriptions and outline *counts*.
  Lessons, materials, recordings, assessments and reports all still go through
  `assertEnrolled`, and an unenrolled student still gets 404 on
  `GET /courses/:id`. Counting lessons is not reading them.

  **Superseded in part by the public catalog (migration 004).**
  `GET /public/courses/:slug` deliberately goes further and returns the **full
  outline** — every module and lesson *title* with its duration — to an
  unauthenticated visitor. That is not a leak, it is the point: a course detail
  page that will not show the syllabus does not convert, and a lesson title is
  what the marketing site advertises. The line is unchanged and is what matters:
  titles and durations are public, **content is not**. Video URLs, materials,
  assessments and recordings remain behind `assertEnrolled`.
- **It does not let the client choose the learning mode.** The mode comes from
  the `courses.default_learning_mode` column, because a student has no way to
  know whether a course is taught live or from recordings, and letting the
  request decide would let it pick its own dashboard ({S}5.2).

  **Superseded in part on 2026-09-10.** This bullet used to end "the
  *enrollment* still owns the mode per student". It does not: the mode moved to
  `GroupCourse` and migration `007` dropped the column. The course default is
  now what an *unplaced* student resolves to rather than what their enrollment
  stores, which is the same answer computed instead of copied. Moving one
  student to the live cohort is still possible and is now the obvious thing it
  always should have been — you move them to a live group.
- **It is not audited.** A student enrolling themselves is not a TA or admin
  mutation, so {S}5.4 does not reach it. That changes the moment money does:
  a paid enrollment is a money event and {S}5.12's trail applies.

**Half-answered by migration `004_public_catalog.sql`.** Courses now carry
`is_published`, defaulting to `true` so the migration hid nothing that was
already visible, and the **public** catalog reads published rows only — so Dr.
Tahir can draft a course without it appearing on the marketing site. The
enrollment half was **answered on 2026-09-08, in the safe direction**:
`is_published` now gates the signed-in catalog and `CoursesService.enroll` as
well, and an unpublished course answers a would-be enroller exactly as a
nonexistent one does. It had to. Until then `getCatalog` read `findAll`, so any
signed-in student could see a draft, self-enroll on it in one POST, and past
that `assertEnrolled` opened its recordings, materials and assessments — the
open half reached *content*, not titles, which is not what §7.2 intended to
leave open.

What remains open is only whether this should be **one flag or two**
(`open_for_enrollment` separate from `is_published`, so a course can be
advertised before it opens, or run without being advertised). One flag is
shipped; splitting it is a one-line change in the same two places, and the
question becomes real the moment payment lands in front of
`CoursesService.enroll`.

**Groups (§5.16) add a second thing self-enrollment cannot do**, and the client
confirmed the ordering on 2026-09-10: *"enrolled then grouped by TA."* Placement
in a group is a teacher's or assistant's action, so a student who enrolls
themselves lands **enrolled but ungrouped** — and that must read as a normal, temporary
state, not an error: they keep the recorded content their enrollment already
opens, their classmate list (§5.17) is empty, and they appear in a staff
"needs placing" view rather than vanishing from one. **That state got heavier
on 2026-09-10** — with assessments authored per group (§5.16) and the learning
mode on the group (§5.2), an unplaced student sees a course with no work in it
and no mode to render. The lessons and recordings still open, so this is not a
lockout; it is worse in one specific way, because it looks like a working
course that is simply empty. The §5.2 fallback and a prominent "enrolled, not
yet placed" staff queue are what keep it honest. The alternative — making a
group mandatory at enrollment — would either block self-enrollment outright or
force the student to pick their own cohort, and §5.16 says they do not get to.

---

## 7.3 The numbers this actually runs at

Given by the client on 2026-09-09, and they are **approximate but authoritative**: Dr. Tahir runs
about **10 groups of about 30 students each — roughly 300 students**, one teacher, a handful of TAs,
on a single containerized VPS with one replica. A student holds one or two courses, rarely three.

**Re-read those numbers in light of §5.16: ten *groups* is not ten courses.** Several groups share
one course, so the course count is plausibly low single digits while the group count is ten and
the thing that grows is groups, not courses. Nothing in the conclusions below changes — 300
students is 300 students — but anything sized "per course" (the staff overview's fan-out, the
`findByIds` batches, `coursesInScope`) is really sized per *group* once schedules, rosters and
announcements hang off groups. Size the new work against ten groups, not against three courses.

This does not contradict §1's "thousands of students" so much as date it: thousands is the ambition
the brief was written around, 300 is what the software serves. **Design against 300 and keep the
migration path open** (§3's rule that the VPS must move to AWS/DigitalOcean without code changes is
unchanged and is what buys the ambition back later).

Why this is written down rather than left implicit: at 300 students a good half of the "scaling
debt" §7.1 catalogues is not debt, and building it anyway costs real complexity for no user.
The distinction that survives the rescale is **the cost that grows with data versus the cost that
is merely large-but-constant**:

- **Still worth fixing at 300** — anything `O(N)` in courses or students on a screen someone opens
  daily, and anything that materializes whole rows to produce an integer. Both were real and both
  were fixed on 2026-09-09 (see the log entry): the student Home screen's `2N + 2` request fan-out,
  and `ManageService.overview` pulling every enrollment, assessment, submission and recording row
  across all courses to count them.
- **Not worth building at 300, and deliberately not built** — the shared **Redis** §7.1 wants for
  the rate limiter, the token denylist and the `JwtStrategy` lookup. All three are per-process, and
  a per-process structure is *correct* on one replica. The trigger to revisit is **a second replica
  being configured**, not a student count; until then Redis is a component to operate, back up and
  fail over for no benefit. §5.11's five-condition `CourseStaffAssignment` cache is the same call —
  it guards a primary-key lookup against ten courses.
- **Also not built**: pagination on student-facing lists (a student has 1–3 courses and ~20
  assessments) and `QuizAnalyticsSnapshot` caching (§6.1 already says compute on read until
  measurement says otherwise).

The honest summary: **round trips and row volume matter here; query counts mostly do not.** A
primary-key lookup against Postgres on the same host is a fraction of a millisecond, so twenty of
them inside one request is invisible, while twenty *HTTP* requests from a student's phone on Egyptian
mobile data is a visibly slow screen. Optimise the ones the student waits on.

**A rescale is not a licence to skip the ones that are cheap.** Where a batched or count-only read
costs two implementations and an integration test — the going rate §7.1 names — and removes an
`O(N)`, take it. The three added on 2026-09-09
(`EnrollmentRepository.countDistinctStudents`, `RecordingRepository.countByCourses`,
`AssessmentRepository.countUngradedSubmissionsByCourses`) are that trade, and they are the shape to
copy for attendance and payments.

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

- **Groups are fully specified as of 2026-09-10** — seven questions asked, seven answered, and
  none of them left open. In order: a group is a standalone class of students (§5.16); TAs see
  everything for now (§5.11.1, the one that is explicitly temporary); the learning mode moves to
  `GroupCourse` (§5.2); a task is written once and targeted at selected groups (§5.16, §6.1's
  `AssessmentTarget`); adding a group to a course does **not** bulk-enroll anyone (§5.16); and
  seed assessments are regenerated rather than migrated (§7.1, my call, reversible).

  What is left is **implementation, not specification** — `006_groups.sql` and the surfaces on
  top of it. The two design notes worth carrying into that work: an unplaced student sees an
  empty course (§5.16, §7.2), and "add students to a group" needs multi-select even though the
  write underneath is one student at a time.
- **§5.11.1's "TAs see everything" is explicitly temporary** — the client said so in the same
  breath. It is listed here so nobody later reads it as a settled design and deletes the scoping
  machinery it deliberately leaves standing.
- **What exactly may a classmate see (§5.17)?** Name and avatar is the safe default and what will
  ship absent an answer. Ask whether Dr. Tahir wants anything more — and note that the moment it
  includes a grade or a rank it stops being a classmate list and becomes a leaderboard, which is
  a different product decision with a different answer for a parent.
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

- ~~**Can a TA create assignments?**~~ **Answered 2026-09-10: yes, both assignments and quizzes.**
  The board's `ASG-10` and `QUZ-11` win over §2.2's narrower preset. Shipped as one role rule on
  `StaffManageController` rather than a check that branches on the task's `type` — the asymmetry
  the preset carried would have made a role decision depend on a body field. Kept here struck
  through rather than deleted, because the reasoning is what makes the next permission question
  cheaper to answer.

- **Can a TA schedule sessions and post Zoom links?** The board's `CRS-11` says yes; §2.2's preset
  omits it. This is entangled with the open Zoom question above — manual link + time vs. API
  automation. Under the manual assumption it is a `LiveSession` write, which is cheap to grant;
  under API automation it means the TA's action provisions a meeting on Dr. Tahir's Zoom account —
  a different question, and one the client should answer deliberately. Note that the board's own
  Zoom diagram draws `TeacherTA` as a single lifeline and does not distinguish the two.

  **Shipped teacher-only, 2026-09-07, and still open.** The client's instruction that day was that
  *"he"* — the teacher — schedules sessions and announces them, so the narrow reading shipped:
  `POST /admin/courses/:id/live-sessions` is `@Roles(Role.Teacher)` and a TA gets 403. Reversing it
  is moving three routes from `AdminManageController` to `StaffManageController`;
  `ManageLiveSessionsService` already takes a `StaffActor` and derives `actorRole` from it rather
  than assuming the teacher, so the audit trail stays correct on the day it widens. **Announcements
  went the other way** and a TA *can* post them, to assigned courses only, because §2.2's preset
  grants that explicitly. Both remain the client's call, not a decided matter.

- **Does a `Course` need a level / exam-board field?** There is none today — no `level`,
  `examBoard`, or `price` anywhere in `StoredCourse`. The public course page wants to show
  "AS Level · IGCSE" next to the title the way every course marketplace does, and currently renders
  nothing there rather than inventing a badge. Adding it is one column and one migration, but it is
  entangled with the catalog-shape question above (single Chemistry course vs. the fuller
  IGCSE/IELTS catalog), so it was deliberately **not** added to satisfy a layout.

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
