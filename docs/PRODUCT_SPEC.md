# Product specification — Dr. Tahir LMS, post-redesign

What the product should do once the Claude Design handoff is implemented. Written by reconciling
three sources, used differently:

- **Claude Design handoff** (project `59f824fd`) — source of truth for the intended product
  experience. Where its UI kits and its own `SCREENS.md` disagree, **the kits win**: they carry an
  "Added September 2026" section and `SCREENS.md` does not reflect it (Settings lost two tabs,
  People moved to Assistants, Account became its own route).
- **The existing codebase** — source of truth for what is actually implemented.
- **`CLAUDE.md`** — source of truth for durable engineering convention. Where a client decision in
  this document contradicts it, the decision wins and `CLAUDE.md` is amended (§0).

Classification: `[EXISTING]` unchanged · `[CHANGED]` exists but behaviour differs · `[NEW]` no
backend today · `[REMOVED]` built but no longer wanted · `[UNCERTAIN]` needs a decision.

---

## 0. Actors

| Actor | Reach | Status |
|---|---|---|
| **Visitor** | Marketing site, course catalog, blog, contact | `[EXISTING]` |
| **Student** | One or more courses; lessons, homework, quizzes, marks, timetable, attendance, classmates | `[CHANGED]` — flat navigation, course switcher |
| **Parent** | Receives the weekly report by email. **No login.** | `[CHANGED]` — was specified as a login role, never built |
| **Assistant** | Grading, attendance, announcements, group placement, report review. Scoped to all groups or to named groups. | `[CHANGED]` — scoping moves from course to group |
| **Full admin** | Everything the teacher can do, under their own identity | `[NEW]` |
| **Teacher** (Dr. Tahir) | Everything | `[EXISTING]` |

Real sizes, which constrain every design choice: ~10 groups, ~30 students each, ~300 students, one
teacher, 2–3 assistants, **two courses**. A roster is thirty rows. No virtualised tables, no faceted
search, no pagination furniture.

---

## 1. Identity and access

### 1.1 Registration and approval `[CHANGED]`
**Purpose.** A student signs up and waits to be accepted, rather than granting themselves a course.

Today any signed-in student may self-enrol on any published course (`POST /courses/:id/enroll`).
`CLAUDE.md` §7.2 calls this "a testing posture, not the business model". The design replaces it with
a queue: a new account lands as `waiting`; staff accept or reject; acceptance places them in a group,
which is what actually grants the course.

- **Workflow.** Register → `waiting` → teacher/admin accepts → assigned to a group → active.
- **Rules.** Rejection is teacher/admin only. Acceptance calls the existing `CoursesService.enroll`
  rather than replacing it. A student added directly by staff skips the queue and is emailed a
  sign-in link.
- **Screens.** Console → Students → *Waiting for acceptance*; nav badge counts the queue.
- **Backend.** `users.status`, `POST /admin/students/:id/accept|reject`, both audited.

### 1.2 Sign-in `[CHANGED]`
Password + JWT exists and is well built (bcrypt-12, timing-safe comparison, anti-enumeration reset,
per-request role re-read). The design makes **Google the primary method** with password as an
optional fallback. Sequenced last: nothing else depends on it and it replaces a working, tested
mechanism.

### 1.3 Assistant invitation and scope `[NEW]`
An assistant is invited by email, sets their own password, and is given either **all groups** or a
named set. Role is `Assistant` or `Full admin`. Status `Invited | Active`; invitations can be resent.

### 1.4 Device and session management `[UNCERTAIN]`
The design's Account → Security lists devices with a per-device sign-out. The current denylist is two
in-process `Map`s — it cannot enumerate sessions and cannot revoke across replicas. Needs shared
session state (Redis) or the tab is dropped for launch. **Decision required.**

---

## 2. Teaching

### 2.1 Tasks (homework and quizzes) `[CHANGED]`
Authoring exists (`POST /staff/courses/:id/assessments` and friends, TA-reachable, audited). What
changes:

- **Visibility becomes explicit** — `published | hidden`, distinct from the availability window.
  Today status is derived purely from timestamps, so "hidden" is inexpressible. **`D-28`
  (2026-09-22):** `scheduled` is not a stored value — it is the label for a published task whose
  window has not opened, which students already see as locked-with-a-date. A task anyone has
  submitted to cannot be hidden.
- **A draft library** `[NEW]` — reusable task templates with a reuse count; "Save as draft", and
  "start from a draft" prefills content, instructions and attachments.
- **Attachments** `[NEW]` — a passage, an audio file, a mark scheme, alongside the task.
- **Submission settings** `[NEW]` — PDF upload / Google Doc link / photo of written work (≤5), and
  "allow resubmission until due date".
- **Marker assignment** `[NEW]` — Dr. Tahir, a named assistant, or whoever opens it first.
- **Targeting stays multi-group.** The design's modal shows one group; the join table stays, because
  the client asked for one-or-more on 2026-09-10 and one group is simply the common case.
- **Work type is already built** — `file_upload | link | google_form` with vendor-neutral
  `external_results` (migration 010). This is what the design calls *Document* vs *Google Form*.

### 2.2 Submissions and marking `[CHANGED]`
Grading (score + feedback) exists and is audited. The design adds **in-platform annotation**, which
`CLAUDE.md` §5.5 has always required and which has never been built:

- Tools: comment, tick, cross (plus pen and highlight in the toolbar).
- Each annotation is **data** — page, x%, y%, kind, text — not a flattened file.
- **Save** (annotations only) is distinct from **Save and return** (the student sees it).
- "Include this mark in the weekly report" toggle.
- The original submission stays immutable; the marked copy is a new artifact beside it.
- `[UNCERTAIN]` Does the student receive a flattened **PDF**, or the same overlay rendered in the
  viewer? The former needs a server-side PDF library. **Decision required.**

The grading queue must also show **non-submitters** ("Not submitted"), which the design shows and the
current queue cannot express — this is `CLAUDE.md` §11's open "no `missed` status" question, answered.

### 2.3 Mark book `[NEW]`
Student × task grid per group, with a term total, horizontal scroll past ~6 columns, a sticky student
column, and CSV export. **A missing mark is an em-dash, never `0`** — stated once per screen.
Derivable from the existing grading queue; needs a route and a screen.

### 2.4 Weekly reports `[NEW]` — the largest new subsystem
**Purpose.** Every student gets a weekly report; an assistant reviews it and writes the note; only
the teacher sends it to the parent.

- **Workflow.** `New → Under review → Reviewed → Sent`, drawn as a Stepper on every report.
- **Content.** Attendance %, homework %, quiz %, performance %, progress % · this week's work with
  marks · a five-week performance trend · the teacher's note · **the assistant's note, which "goes to
  the parent verbatim" and is the only part a person writes**.
- **Rules.** An assistant may review and annotate but never send. There is deliberately **no
  send-to-all-groups action** — "a single button that emails 300 parents is how the wrong report
  reaches the wrong family". Per student, or per group once every report in it is reviewed.
- **Delivery.** PDF, emailed to `student.parent_email`. Cannot be unsent.
- This answers `CLAUDE.md` §11's open *"can a TA generate reports?"*: **no — a TA reviews; generation
  is automatic; sending is the teacher's.**
- `[UNCERTAIN]` Scheduled job, on-demand "Regenerate week", or both? **Decision required.**

### 2.5 Google Forms results `[EXISTING]`
Backend is complete — 7 routes on `WorkAnalyticsController`: analytics, per-student results, the
unmatched queue, manual sync, and attach-result-to-student. Unmatched responses are kept, counted and
queued, never dropped, and the figures say so ("3 responses could not be attributed — every
completion figure below is understated"). **Frontend only.**

---

## 3. People and groups

### 3.1 Groups `[CHANGED]`
"A group is one timetable, one assistant and one set of tasks."

- **A group studies exactly one course** — collapses `group_courses` into `groups.course_id`.
  Reverses `CLAUDE.md` §6.1, which warned this is "a one-way door"; the client chose it.
- Gains `assistant_id`, `meets` (a recurring schedule string), `room`.
- Membership by multi-select from the course's students.
- **Assistants may add to a group but not remove from one.**

### 3.2 Students `[CHANGED]`
Gains `school_name`, `parent_email`, staff-only `notes` — **but not `mode`** (`CHANGELOG.md`
`D-4`, ruling **R-2**, 2026-09-20: the School/Online axis is not built) — and a profile
photo. The roster shows attendance, quiz average, task average, performance and progress as
**separate columns** — never merged.

### 3.3 Assistant activity `[EXISTING]`
The audit log, read at `/admin/audit-log`, teacher-only, keyset-paged. Needs new actions for
attendance, reports and registrations. No TA equivalent, deliberately.

---

## 4. Sessions

### 4.1 Live sessions `[CHANGED]`
Today a session is `{courseId, title, zoomLink, scheduledAt, durationMinutes}`. The design needs:
`group_id` (not course), `mode` (**On-ground | Online**), `location` (a room **or** a meeting link,
"revealed to students 30 minutes before the start"), `assistant_id`, `ends_at`, `visible`,
description, private notes, attachments, and reminder/notify-on-change toggles.

### 4.2 Draft timetable `[NEW]`
A year planned ahead, each entry locked until its date; publish now or let the date release it.

### 4.3 Attendance `[CHANGED]`
`attended: boolean` becomes **`present | absent | late`**. `CLAUDE.md` §11 flagged this as needing a
decision *before* multiple read-sides exist; the design settles it. The student-facing Attendance
route is new; the console capture side is derived from the mark-book grid and is not designed.

---

## 5. Communication

### 5.1 Announcements `[CHANGED]`
Exists for `all_students | course | all_tas`. The design changes the audience set to
**All students | Course | One group**, adds media (image / video / YouTube / file), a **draft**
status, a live reach count, a student-view preview, and — significantly — **every announcement is
also emailed**. `all_tas` disappears from the design; keep it, since it costs nothing and staff
broadcast has no other route.

### 5.2 Notifications `[CHANGED]`
In-app mailbox exists. The design makes the student's a bell + `Menu` rather than a page, and adds
**teacher notification preferences** `[NEW]`: email me when a student submits / a registration needs
accepting / a form response cannot be matched / the week is summarised.

---

## 6. Student surface

| Feature | Status | Note |
|---|---|---|
| Overview | `[CHANGED]` | Action-first: continue-watching, three action cards, due-today, dismissible announcement. **No mark anywhere on this page.** |
| My lessons | `[CHANGED]` | Recording library, **thumbnails by default**, grid/list toggle, watched bar. Needs `recordings.thumbnail_url` `[NEW]`. |
| Lesson detail | `[NEW]` | Player, chapters, the work set from it, its material, and a "Next recording" card. |
| Homework | `[CHANGED]` | **Homework only** — no quiz appears here. Four attempt states. |
| Quizzes | `[NEW]` | Featured quiz in four states + a runner. **Driven by the existing Google Form work type**, not a first-party quiz engine. |
| Marks | `[CHANGED]` | The weekly report *is* the page; the marks table is secondary. |
| Timetable | `[CHANGED]` | Week grid; Join appears **only** where a session is live and online. |
| Attendance | `[NEW]` | Three states, with "records can lag". |
| Classmates | `[EXISTING]` | Names and avatars only. Already correct. |
| Settings | `[CHANGED]` | Profile photo upload (student-reachable; the upload route is staff-only today). |
| Help | `[NEW]` | WhatsApp card. Frontend + config only. |
| Catalog / Achievements | `[REMOVED]` | Not in the design. `/catalog` goes with open enrolment; the blog stays public-facing but leaves the student rail. |

---

## 7. Public site `[EXISTING]`
Homepage, course pages, blog, contact, sign-in. Backend complete (`/public/courses`, `/public/blog`).
Marketing typography (17px body, display to 68px) never mixes with the console's 13px.

---

## 8. Explicitly not built

Payments, refunds, discount codes (no design; migration 003's own header defers them) · a parent
console · a first-party quiz engine (`Question`/`QuizAttempt`/`Answer` stay absent) · `Rubric` ·
`ReportRun` as a job entity · multi-tutor.

---

## 9. Non-negotiables

Identical in the design and in `CLAUDE.md`, arrived at independently:

1. **No earnings widget anywhere.** A Payments page may show a transaction; a dashboard total may not.
2. **Progress and performance never merge.** Completion → `Meter`. Achievement → `Score`. Never the
   same bar, column or average.
3. **Status colour is not the accent.** Indigo means *the one action here*.
4. **Bilingual.** Nothing may assume Latin metrics or survive only in LTR.
5. **Hiding a control is courtesy, never security.**

Plus the copy rules: sentence case, numbers with their denominator, a missing mark is an em-dash,
mirrored data says when it last checked, amber for a queue and red only for failure, and no emoji.

---

## 10. Open decisions

| # | Question | Blocks |
|---|---|---|
| 1 | Redis for device/session management, or drop the Security tab? | `AUTH-5` |
| 2 | Marked copy: flattened PDF, or rendered overlay? | `MARK-*` |
| 3 | Report generation: scheduled, on-demand, or both? | `RPT-*` |
| 4 | Are `students.mode`, session `mode` and `learning_mode` really three axes? | `DOM-3`, `SESS-*` |
| 5 | Confirm fixtures are regenerated rather than migrated. | `DOM-1`, `DOM-4` |
