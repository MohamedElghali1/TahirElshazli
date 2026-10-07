# Design brief — Dr. Tahir Elshazli LMS

**For:** Claude Design, to produce a full UI/UX design for this product.
**Assume no access to the repository.** Everything needed to draw every screen is in this document.
**Date:** 2026-09-25.

> **How to read this.** §1–§3 are the product and its people. **§5 is the screen-by-screen
> specification** — every route, the exact data on it, every state it can be in, every action, and
> what it must do on a phone. §6–§8 are the rules, the existing visual system, and the named
> failures of the previous design pass. Designing §5 correctly is the job.

---

## 1. What this product is

A premium educational platform for **Dr. Tahir Elshazli** (brand: *Dr. Tahir / English Team*), at
**tahirelshazli.com**, teaching **IGCSE English** and **IELTS Preparation** to teenagers and young
adults, primarily in Egypt.

**Three surfaces, and they must not look alike:**

1. **The public marketing site** — editorial, generous, photographic. It sells a person and a
   method. 17px body, display to 68px.
2. **The student surface** — what a 16-year-old opens on a phone before class. Calm, action-first.
3. **The staff console** — what the teacher and 2–3 assistants run the school from. Dense, 13px,
   instrument-like.

The student surface and the console share one design system and one 13px type scale. The marketing
site shares the tokens but **never** the type scale.

### The single most important constraint

**~10 groups · ~30 students each · ~300 students total · 2 courses · 1 teacher · 2–3 assistants.**

A roster is thirty rows. A mark book is thirty rows by maybe twelve columns. This is not enterprise
software and must not be dressed as it. **No virtualised tables, no faceted search, no pagination
furniture, no filter rails, no data-density theatre.** The only paged list in the product is the
audit log. Design for legibility and the speed of a daily habit, not for scale.

### Bilingual, and phone-first

- Arabic and English content both appear. **Every screen must work in `dir="rtl"`** and survive a
  long Arabic name (`ليلى فهمي`). Fractions, meters, steppers, sticky columns, breadcrumbs, and any
  transform or directional icon must be specified in **logical** terms (start/end) — never
  left/right.
- Students are **phone-first**. The previous design pass drew **not one screen at a mobile width**.
  That is the single largest thing this pass must fix.

---

## 2. The people

| Actor | What they do | Surface |
|---|---|---|
| **Visitor** | Reads about the courses, the teacher, the blog; contacts by WhatsApp; registers | Marketing |
| **Student** | Watches recordings, does homework, takes quizzes, reads marks, checks timetable and attendance | Student |
| **Parent** | **Receives the weekly report by email. Has no login and never will.** The email and its PDF are designed surfaces | Email only |
| **Assistant** (2–3) | Marks work, takes attendance, writes the weekly-report note, posts announcements, places students in groups. Reach is **all groups** or **named groups** | Console |
| **Full admin** | Everything the teacher can do, under their own identity, so the audit log stays honest | Console |
| **Teacher** — Dr. Tahir | Everything. The only one who can **send** a report to a parent, accept/reject a registration, invite an assistant, or remove a student from a group | Console |

**Four verbs are withheld from assistants** and must never be drawn for them: removing a student
from a group, rejecting a registration, inviting an assistant, sending a report.

The teacher is the product's centre of gravity. The assistants exist to take marking and attendance
off him. The console must make *his* daily loop the first thing on screen.

---

## 3. The domain, in the product's own vocabulary

Use these words in the UI. They are the client's.

- **Course** — the syllabus. There are exactly two. Has modules → lessons. Can be draft or
  published, and can have *sequential lock* (lessons unlock in order).
- **Group** — a cohort: *"one timetable, one assistant, one set of tasks."* **A group studies
  exactly one course.** Fields: name, course, display assistant, `meets` (free text, e.g.
  "Saturday 18:00" — not a structured schedule), `room`, member count. ~30 members.
- **Student** — belongs to one or more groups (so one to three courses). Fields: name, email,
  phone, avatar, school name, parent email, **staff notes** (never student-visible), account status
  `waiting | active | rejected`.
- **Task** — homework, assignment, or quiz. Authored once, **targeted at one or more groups**, each
  target able to override the window. See §5.4.7 for the complete field list.
- **Submission** — immutable once sent. Staff mark it by drawing an **annotation overlay** on top.
  Keeps a **revision history** when resubmission is allowed.
- **Live session** — belongs to a **group**. Title, start, end, description, staff-only private
  notes, display assistant, visibility, and a **meeting link the teacher pastes** (Google Meet,
  Zoom, anything — no embed, no automation). State is `planned` (the draft timetable) or
  `published`. **There is no on-ground/online mode and no per-session room** — the room lives on
  the group. The meeting link is **withheld by the server until 30 minutes before the start.**
- **Attendance** — per session, per student: `present | absent | late`, or **unmarked** (which is
  its own state and is never shown as absent).
- **Recording** — an uploaded lesson video: title, chapter, topics, duration, lesson date,
  thumbnail, order, and the student's watched progress. Served through signed, expiring URLs.
- **Material** — a file attached to a course and optionally to a lesson. Three categories: **course
  notes · study materials · important files**.
- **Announcement** — audience is All students / one Course / one Group / all staff. Carries one
  media item (image, video, YouTube, file), has a draft state, a **reach count computed at send
  time**, and is **also emailed**.
- **Weekly report** — per student, moves `New → Under review → Reviewed → Sent`. Carries
  attendance %, homework %, quiz %, performance %, progress %, this week's marked work, a five-week
  trend, the teacher's note, and **the assistant's note, which reaches the parent verbatim and is
  the only part a human writes**. Delivered as a PDF by email. **Cannot be unsent.**
- **Audit log** — every staff mutation: actor, their role *at the time*, action, target, before,
  after, timestamp. ~55 distinct action types. Teacher-only, keyset-paged.

---

## 4. The state vocabulary

Every one of these is **computed on the server** and arrives as a value. The design must not imply
the browser decides them, and must have a visual for each.

| Set | Values | Where |
|---|---|---|
| Account status | `waiting` · `active` · `rejected` | Registration queue, student rows |
| Task visibility (staff) | `published` · `hidden` · **`scheduled`** (published, window not open) | Task list, task editor |
| Task status (staff) | `open` · `marking` · `marked` · `closed` (nothing was submitted) | Task list |
| Assessment status (student) | `locked` · `available` · `submitted` · `corrected` | Homework, quizzes |
| Submission status | `not_submitted` · `submitted` · `marked` · `returned` | Mark book, task results, marking |
| Marking state nuance | **saved-but-not-returned** — a mark exists and the student must *not* see it. Shown to the student as "your teacher is marking this" | Marking view, student homework |
| Attendance | `present` · `late` · `absent` · **unmarked (null)** | Attendance sheet, student attendance |
| Mirrored (Google Form) cell | `no_response` · `responded` · `scored` | Mark book |
| Work status (analytics) | `not_started` · `submitted` · `graded` · `not_available` | Task results |
| Session state | `planned` (draft timetable) · `published` | Live sessions |
| Blog post | `draft` · `scheduled` · `published`, plus a derived **is-live** | Blog console |
| Assistant | `invited` · `active` | Assistants |
| Work type | `file_upload` · `link` · `google_form` | Task editor, everywhere downstream |
| Submission mode | `pdf_upload` · `doc_link` · `photo_upload` (1–5 photos) | Task editor, student submit |
| Upload availability | **enabled / not configured** — in production, storage may be off, and the form must render a URL field instead of a file picker rather than offering one that fails | Every upload |

---

## 5. Screen-by-screen specification

**Legend:** ✱ = no design exists yet, anywhere. ● = built and working today. ◐ = built but the
design was never right.

### 5.1 Marketing site

#### 5.1.1 Homepage ●
**Sections, in order:** hero with Dr. Tahir (portrait photography, real, warm) · the two tracks ·
"how it works" · platform features · testimonials · FAQ · contact CTA.

- **Tracks** — two cards, each: name (*IGCSE English*, *IELTS Preparation*), audience (*Years 10 and
  11* / *Academic and General Training*), a one-sentence summary, three bullet points, a portrait
  image. Copy already exists in this voice: *"Every script returned annotated, not just scored."*
- **How it works** — three stages, **named by verbs, never "Step 1/2/3": Attend · Practise · Get
  marked.** Each has a paragraph.
- **Platform features** — six, alternating with imagery: recorded lessons kept for the course's
  length · corrections you can read · course notes and past papers · progress and performance kept
  apart · your timetable · (one more).
- **Testimonials** and **FAQ** — standard, but sentence case and no exclamation marks.
- **Contact CTA** — WhatsApp is the primary channel in this market. A floating WhatsApp button
  persists site-wide and into the student surface.

**Photography note:** all images are currently placeholders. Design for **real, portrait-oriented,
warm classroom and teacher photography.** No stock-looking gradients or 3D blobs.

#### 5.1.2 Courses index and course page ●
Two courses only. The page shows: title, description, teacher name, thumbnail, **module count,
lesson count, total duration**, and the full syllabus as modules → lessons (each lesson: title,
duration). **Lessons are named and timed but not playable.** CTA: register.

#### 5.1.3 Blog index and post ●
Categories: **achievement · article · resource**. A post carries title, excerpt, body, tags, publish
date, author byline, and a **media gallery** (images, videos, downloadable files, each with a
caption). The blog is Dr. Tahir's achievements as much as it is articles — design the achievement
post type to feel like a trophy case entry, not a blog post.

#### 5.1.4 About ● · Contact ●
About: the teacher's story. Contact: a form plus WhatsApp and an email address.

---

### 5.2 Authentication

#### 5.2.1 Sign in ◐
**Google is the primary method; password is the fallback.** One card. Google button first, a
divider, then email + password. Link to forgot-password.

#### 5.2.2 Register ◐ — **this is the interesting one**
Registering does **not** sign you in. The server returns *"you are waiting for approval"* and **no
credential at all**. So the screen must have a real, designed **"waiting for acceptance"** state —
not a toast, not a redirect. Tell them what happens next and roughly when. This is a teenager's
first impression of the product.

#### 5.2.3 Forgot password ● · Reset password ●
Anti-enumeration: the confirmation message is **identical whether or not the email exists.** Design
the copy so that is not awkward.

#### 5.2.4 Accept invitation ✱
An assistant clicks an emailed link, sees who invited them and to what, sets a password, and lands
signed in. The token can be **expired, already used, or unknown — and all three give the identical
message.** One error state, not three.

#### 5.2.5 Google callback ●
A brief transitional screen. Design a real one: it can fail.

---

### 5.3 Student surface

**Shell:** a course switcher at the top of the sidebar (a student has one to three courses; it is a
switch, not a search), then **Overview · My lessons · Quizzes · Homework · Marks · Timetable ·
Attendance**, then **Classmates · Settings · Help**. Plus a notification **bell with an unread
count** in the header, and a floating WhatsApp button.

Built today as: 248px sidebar on the tertiary surface, **no right border**, a white-pill active
item, a 52px sticky breadcrumb header, content capped at 1080px, 96px bottom padding to clear the
WhatsApp button. **Mobile behaviour is undesigned and is your job.**

#### 5.3.1 Overview ◐ — the most-opened screen in the product
Per selected course, plus one student-wide figure.

**On screen:** a greeting with the student's name · **continue-watching** (one recording: title,
chapter, thumbnail, watched meter, resume) · three action cards — **Recordings / Work / Timetable**
· what is due today or next · the next live session · a **dismissible announcement** · quick access
to materials by category with counts (course notes / study materials / important files).

**Numbers it may show:** homework pending, answers available, new recordings, course completion
(`completedLessons / totalLessons` as a **Meter**), and **attendance with its denominator**, which
lives on the Timetable card.

> **Hard rule: no mark, no grade, no score, no percentage of achievement appears anywhere on this
> page.** This was deliberate and hard-won — a Marks quick-access card was *removed*. Progress and
> attendance only.

**States:** loading · no courses yet (a real empty state — a student can be accepted but not yet
placed) · nothing due · nothing left to watch · error with retry.

**Mobile:** this is the screen to design at 375px first. Three action cards become what? Continue-
watching stays above the fold. Decide, and draw it.

#### 5.3.2 My lessons ●
The recording library. **Thumbnails by default**, with a **grid / list toggle**.

**Per card:** thumbnail, title, chapter, topics, duration, lesson date, and a **watched Meter**
(and a completed marker). **Filters:** chapter and topic — two dropdowns, no filter rail. Plus a
**Curriculum** panel (modules → lessons) that can be opened and closed.

**States:** loading · nothing to watch here (after filtering) · no recordings yet · error.

#### 5.3.3 Lesson detail ✱
Opened from a recording. **Panels:** the player · the recording's chapter and topics · **work set
from this lesson** (tasks attached to it) · **material from this lesson** (the subset of materials
tagged to it) · a **"Next recording"** card, with an explicit *"this is the last recording on the
course"* state.

The video URL is **signed and expires**. Design for a link that dies mid-session: what does the
player show, and how does the student recover?

**States:** loading · "this lesson is not available to you" · nothing set from this lesson · no
material · last recording.

#### 5.3.4 Homework ●
**Homework and assignments only — a quiz never appears here.**

Grouped into four sections, which are the four states, and the section headings are the copy:
**Open now · Submitted, waiting on marking · Marked and locked · Nothing set yet.** A **Past due**
marker. A filter by type.

**Per row:** title, description, type, topics, opens / due / closes, max score, and — once
corrected — the score with its denominator.

#### 5.3.5 Homework detail and submit ● — **design this carefully**
**Panels:** *What to do* (description, instructions, and the student-facing attachments — a passage,
an audio file; **the mark scheme is a staff attachment and never appears here**) · *Your submission*
· *Marking* · *Your earlier versions*.

**How the student hands in depends on the task, and the modes are enforced:**
- **PDF upload** — exactly one PDF.
- **Photo of written work** — one to five photos. **No HEIC.**
- **Google Doc link** — a URL field.
- A typed answer / *"a note for your teacher (optional)"* — **never valid on its own.**
- If resubmission is allowed: *"You can revise until the window closes."* A resubmission **replaces
  the whole set**, and the superseded set is archived as a revision.

**Uploads can be switched off on the server.** When they are, this screen must say so honestly and
offer the alternative (a link), not present a file picker that fails.

**When marked and returned:** the score out of its max, written feedback, and **the annotated paper
— the same overlay the teacher drew, rendered over the student's original** (see §5.4.9).

**When a mark is saved but not returned:** the student sees *"your teacher is marking this"* and
**no score**. This is a real state with real data behind it; do not collapse it into "submitted".

#### 5.3.6 Quizzes ✱
Quizzes are **mirrored Google Forms**, not a first-party engine. The student opens the form; the
platform copies the result back.

**A featured quiz in four states:** *Open now* · *Submitted, waiting on marking* · *Marked and
locked* · *Nothing set yet*, plus **Past due**.

**The honest states are the design problem here.** The mirrored data carries *when it last checked*
and *how many responses could not be matched to a student*. When something is unmatched, every
completion figure is **understated**, and the product's rule is that it says so. Required tone,
verbatim: *"3 responses could not be attributed — every completion figure below is understated."*

#### 5.3.7 Marks ●
**The report is the page. The marks table is secondary.**

**Panels:** *Progress* (course completion as a Meter, and attendance — completion and attendance
side by side, **never averaged together**) · performance figures: **Overall · Quiz average ·
Assignment average · Homework handed in**, each with its denominator and each `null`-able (an
em-dash, never `0`) · **Strong topics** and **Needs work** (per-topic percentages with a graded
count) · **Report documents** — issued weekly reports, each with a title, period, overall
percentage and a PDF link.

**States:** no reports issued yet · nothing graded yet (every average is an em-dash) · loading ·
error.

#### 5.3.8 Timetable ●
A **week grid**, with previous / next week. Each entry: title, start, end, description, group.

**The Join button appears only when the server has released the meeting link** — the link is
withheld until 30 minutes before the start. Never compute that window in the browser, and never
draw a disabled Join that implies the student is late. Design the "link appears 30 minutes before"
state explicitly.

**Mobile:** a week grid at 375px is a real design problem. Solve it.

#### 5.3.9 Attendance ✱ (built, never designed)
**Summary:** Present / Late / Absent counts, an *expected* denominator (published sessions of the
student's groups that have already ended), and a percentage.

**Late is its own figure and is folded into neither present nor absent.**

**History:** every session — title, date, and a status that can be **"not yet recorded"**, which is
distinct from absent and must look distinct. Plus the honest note that **records can lag**.

#### 5.3.10 Classmates ●
Grouped by group. **Names only — no avatar, no email, no mark, no attendance.** Client ruling: a
classmate list carrying a grade is a leaderboard, which is a different product. A student in two
groups sees **two separate rosters**, never one merged list.

#### 5.3.11 Materials ●
All materials for the course, by category: **course notes · study materials · important files**.
Each: title, description, chapter, file type, size, upload date, download.

#### 5.3.12 Settings ●
**Panels:** *Your details* (full name, email, phone) · *Profile picture* (upload, with the
storage-off state) · *Password* (current, new).

#### 5.3.13 Help ✱
A WhatsApp card, and honest guidance on what to ask about there.

#### 5.3.14 Notifications ◐
**Should be a bell with a counter and a menu, not a page.** Five types, each needing an icon and a
tone: grade posted · new recording · live session soon · assessment available · announcement.
Each: title, message, an in-app deep link, read/unread, timestamp. Plus "mark all read".

---

### 5.4 Staff console

**Shell:** course switcher · search ·
**Main:** Overview · Courses ·
**People:** Students *(count badge)* · Groups · Assistants\* · Assistant activity\* ·
**Teaching:** Tasks · Draft tasks *(indented)* · Marks · Reports *(count badge)* ·
**Sessions:** Live sessions · Draft timetable *(indented)* · Recordings ·
**Communication:** Announcements · Blog ·
**System:** Settings\* · Account.
*(\* teacher only — courtesy, not security.)*

Built today as a 244px sidebar on the secondary surface **with** a right border, 52px crumb header.

#### 5.4.1 Overview ◐ — **redesign this as a daily loop, not a dashboard**
Today it is four statistics and a list of course cards: courses, students, recordings, awaiting
grading; then per course: title, teacher, student count, recording count, awaiting-grading count.

**It should answer, in order:** *what needs me?* → *what is happening today?* → *what changed?*
Candidate content: work awaiting marking · registrations waiting for acceptance · reports waiting
to be sent · today's sessions · unmatched form responses · recent assistant activity.

It also carries a **scope label** — an assistant with named groups is seeing *their* numbers, not
the platform's, and the screen says which. **A number that silently narrows depending on who is
looking is the same class of error as merging progress and performance.**

> **No earnings widget. No revenue figure. Not on this screen, not anywhere.** There is no money
> field in the data for one to render.

#### 5.4.2 Students ●
~300 rows. **Columns:** name, email, enrolled course count, status, created.
**Controls:** search, status filter, **Create a student** (name + email only — no password; a
sign-in link is emailed).

**The registration queue lives here.** A `waiting` student can be **accepted** — which requires
**placing them in a group**, because the group is what grants the course — or **rejected** with an
optional reason (teacher/admin only). The nav item carries the queue count.

**Roster columns elsewhere show, as separate columns and never merged:** attendance · quiz average ·
task average · performance · progress.

#### 5.4.3 Student detail ●
**Panels:** *Details* — full name, phone, **school**, **parent email**, **staff notes** (a textarea;
make it unmistakably staff-only) · status · enrolled courses · work history · reports.

#### 5.4.4 Groups ●
~10 rows. **Per group:** name, course, assistant, **meets** (free text — "Saturday 18:00"), room,
member count. Create and edit in the same shape.

**Membership** is a multi-select from the course's students. **An assistant may add to a group but
never remove from one** — that verb is withheld.

**Trap to design around:** the group's `assistantId` is **display only**. What an assistant can
actually reach is decided elsewhere and the two are allowed to disagree. Never draw a permission
from that field.

#### 5.4.5 Assistants ●
**Per row:** name, email, **role** (Assistant / Full admin), **reach** (all groups / named groups,
with the group chips), **status** (invited / active), and **last acted** — which is the last audit
entry, not a last-seen. Label it honestly.

**Invite an assistant:** name, email, role, reach. Resend an invitation. Teacher-only, all of it.

#### 5.4.6 Assistant activity ● — the audit log
*"Every recorded action. Who did it, and when."* Teacher-only, **keyset-paged** — the only paged
list in the product.

**Per entry:** actor, **the actor's role at the time** (not now), action, target type and id,
course, **before** and **after** as key/value diffs, timestamp. There are ~55 action types across
tasks, submissions, recordings, sessions, announcements, groups, students, assistants, courses,
blog, drafts, Google, attendance. **Each needs a label and a tone**, and an unknown one must not
render blank — that exact bug took the page down once.

Design the before/after diff. It is the only forensic surface in the product.

#### 5.4.7 Tasks ●
**List columns:** title, type, work type, course, target groups (chips), window, **visibility state**
(`published` / `hidden` / `scheduled`), **status** (`open` / `marking` / `marked` / `closed`),
marker name. **Controls:** search, course filter, group filter, status filter.

**One state needs its own treatment:** *"No longer reaches every group"* — the named marker no
longer qualifies for the task's audience. It is **displayed and never repaired**.

**The task editor is the biggest form in the product.** Fields:
title · description · instructions · type (homework / assignment / quiz) · **work type**
(file upload / link / Google Form) · external URL when it is a link · topics · lesson it belongs to ·
**availability window** (from / to / due) · max score · **visibility** (published / hidden) ·
**marker** (Dr. Tahir / a named assistant / **whoever opens it first**) · **allow resubmission** ·
**submission modes** (PDF / Google Doc link / photo, multi-select) · allowed file types · max file
size · **attachments, each with an audience — students or staff** (a mark scheme is staff; a passage
is students) · and **targeting: one or more groups, each able to override the window**.

**Design the audience control on attachments carefully.** It has no default on purpose, and getting
it wrong publishes a mark scheme to students.

Also: **Save as draft**, and **start from a draft**, which prefills content, instructions and
attachments.

#### 5.4.8 Draft tasks ●
The reusable template library. **Per draft:** title, type, work type, description, instructions,
attachments, **a reuse count**, author, created/updated. Actions: use, edit, delete.

#### 5.4.9 Marking view ● — **the hardest screen in the product**
The teacher opens one student's hand-in and marks it **in the browser**.

**Layout today:** *The student's work* (the document) beside *Marking tools*, *Mark and feedback*,
and *Files in this hand-in*.

**The document** can be: a PDF (drawn page by page), one to five photos, a plain file, or a pasted
link. **The server says whether each is annotatable** — a link is *"Open original"* and is graded
with a mark and feedback only. Design the non-annotatable case; it is common.

**Tools:** comment · tick · cross · pen · highlight · eraser. **The eraser deletes a mark; it never
edits the page.**

**Every annotation is data** — page, x%, y%, kind, text, and for freehand a path of points — drawn
over an **immutable original**. Ink today: pen violet, highlight amber wash, tick green, cross red.
**Treat that as a real design decision**: it is the one place in the product where colour does work
on top of someone's handwriting, at arbitrary photo quality and arbitrary orientation.

**Two distinct saves, and the difference matters:**
- **Save** — annotations and the mark are stored. **The student sees nothing.**
- **Save and return** — the student now sees the mark, the feedback, and the overlay.

**Also needed:** a *stale annotation* state (the student resubmitted after marks were drawn), an
annotation count per student, *"No marks yet"*, *"No file was handed in"*, and a way to move to the
next student without leaving the tool.

**Mobile:** the teacher will try this on a tablet. Say what happens.

#### 5.4.10 Task results ●
Per task. **Summary:** expected · completed · not completed · completion rate · average score ·
average percentage.

**Per student:** name, status (`not_started` / `submitted` / `graded` / `not_available`), score,
max, submitted-at.

**For a Google Form task:** *last synced at*, a **Sync now** action, a **sync error** state, whether
the form collects email, and an **Unmatched responses** panel — responses that matched no student,
listed by respondent and score, each with **Match to student**. Unmatched responses are **kept,
counted and queued, never dropped**, and the summary above says it is understated.

#### 5.4.11 Submissions queue ●
What needs marking. **Per group:** member count, not-submitted, submitted, marked, returned —
**never summed across groups.** **Per row:** student, group, status, due, late, overdue, the
documents, typed answer, score, feedback, annotation count, stale annotation count.

**"Not submitted" is a first-class row, not an absence.** The old queue could not express it and
that was a real product failure.

#### 5.4.12 Mark book ●
Student × task grid, per **course + group** (both chosen first — design that empty state:
*"Choose a course and a group"*).

**Columns:** the student (sticky at the logical start, so it pins **right** in RTL), one per task,
and a total labelled **"Average of marked work"** — course-to-date, over work marked in the
platform, **missing work excluded rather than counted as zero.**

**Cells:** a score over its max, or **an em-dash — never `0`**. Google Form tasks are their own
mirrored columns carrying `no_response` / `responded` / `scored`, plus when the form was last
checked and how many responses were unmatched.

**Also:** omitted tasks (tasks that cannot appear in the grid) must be listed, not silently
dropped. Horizontal scroll past ~6 columns. CSV export. *"Not returned"* as a distinct cell state.

#### 5.4.13 Reports ✱ — **the largest undesigned subsystem**
Per student and per group.

**The workflow is the spine: `New → Under review → Reviewed → Sent`, drawn as a Stepper on every
report.**

- **Content:** attendance % · homework % · quiz % · performance % · progress % · this week's work
  with its marks · a five-week performance trend · the teacher's note · **the assistant's note**.
- **The assistant's note is the only sentence a human writes and it reaches the parent verbatim.**
  Design the editor so that is obvious to the person typing.
- **An assistant may review and annotate; only the teacher may send.**
- **There is deliberately no send-to-all-groups action.** *"A single button that emails 300 parents
  is how the wrong report reaches the wrong family."* Per student, or per group once every report
  in it is reviewed.
- Generation is **on demand** — a "Regenerate week" action, no scheduled job.
- **It cannot be unsent.** The confirmation before sending is a real design object.

#### 5.4.14 Report viewer and the parent's PDF ✱
The artifact a parent opens on a phone, in Arabic or English, possibly printed. It must be
understandable **without the app and without a glossary**. Design the email that carries it too —
subject, preheader, body, and what it says when a figure is missing.

#### 5.4.15 Live sessions ●
A **week grid** per group, previous / next week. **Per session:** title, start, end, description,
group, display assistant, **staff-only private notes**, visibility, and a **meeting link the teacher
pastes** (`null` until they do). **No mode, no per-session room.**

Create and edit in one shape. **State is `planned` or `published`** — see the next screen.

**Empty:** *"Nothing scheduled this week."*

#### 5.4.16 Draft timetable ✱
A year planned ahead, as `planned` sessions. Each is **locked until its date**; publish now, or let
the date release it. Design the bulk shape — planning a term is dozens of entries — without
inventing an enterprise scheduler.

#### 5.4.17 Attendance sheet ◐
Opened from a session. **Thirty rows: student name, and `present` / `absent` / `late`.** An unmarked
student is `null` — **never `absent`** — and the sheet is saved as a whole.

**This is the one console screen the teacher uses on a phone, standing at a classroom door.**
Design it for a thumb, at 375px, in both directions.

#### 5.4.18 Recordings ●
Per course. **Upload** (with the storage-off state), title, chapter, topics, duration, lesson date,
**thumbnail**, order, and attach to a lesson. Videos are served through signed, expiring URLs.

#### 5.4.19 Announcements ●
**Compose:** title, body, **audience** (All students / a Course / a Group / all staff), **one media
item** (image, video, **YouTube URL**, or file), draft or publish.

**Three things the design must carry:**
- **A live reach estimate** — *"Reaches —"* / *"Estimating reach…"* / a count, computed before
  sending and stored at send time.
- **A student-view preview** of the announcement as posted.
- ***"Audience cannot be changed after publishing."***

**Every announcement is also emailed.** Say so at the point of sending.

#### 5.4.20 Blog console ●
Authoring: title, slug, excerpt, body, **category** (achievement / article / resource), tags,
publish date, status (draft / scheduled / published), and a **media gallery** (images, videos,
files, each with a caption and an order). Plus the derived **is-live** flag — a scheduled post whose
time has passed is live while the row still says "scheduled", and the design must tell them apart.

#### 5.4.21 Settings ●
**Categories:** *Email notifications* — notify me when a student submits · a registration needs
accepting · a form response cannot be matched · the week is summarised. And *Google Workspace* —
connect / disconnect, with a **"Not configured"** state that is honest about what stops working.

#### 5.4.22 Account ●
The signed-in staff member's own profile, password, and **Google link status** — available, linked,
the linked email, when it was linked. Google can be unavailable at the server or domain level;
design that.

---

### 5.5 Cross-cutting screens and states to design once

| Thing | Requirement |
|---|---|
| **Empty states** | Every list has one, and the copy is specific: *"Nothing scheduled this week"*, *"Nobody is in this group yet"*, *"No reports issued yet"*, *"Choose a course and a group"*. Never "No data". |
| **Loading** | **No skeletons.** A loader inside the panel that is loading, with a real label (*"Loading the mark book"*). |
| **Error** | A message plus **Try again**. It must never leak a stack, a query, or an id. |
| **Not configured** | Uploads off · Google not connected · no storage in production. Each says what stops working and what to do instead. |
| **Stale mirror** | *"Last checked 12 minutes ago"* plus, where relevant, *"N responses could not be attributed — every completion figure below is understated."* |
| **Out of reach** | An assistant reaching a resource they do not hold gets **a plain not-found, identical to a genuine miss.** Never "you do not have permission", which tells them it exists. |
| **Destructive confirmation** | The primitive exists; **the words were never written.** Write them — especially for sending a report, which cannot be undone. |
| **Notification email** | Announcements, reports, invitations, sign-in links, password resets. All designed surfaces. |

---

## 6. Non-negotiables

The client and the previous design pass arrived at these **independently**, which is why they are
load-bearing. Break one and the design is wrong regardless of how it looks.

1. **No earnings widget, anywhere.** No total-revenue figure, no earnings chart, on any dashboard.
2. **Progress and performance never merge.**
   - *Progress* = completion (videos watched, lessons done, attendance) → a **Meter**.
   - *Performance* = grades → a **Score** over its denominator.
   - **Never the same bar, the same column, or the same average.** The system should make this
     structurally impossible by shipping two primitives, not by relying on discipline.
3. **Status colour is never the accent.** Indigo means *the one action here*. Green / amber / red /
   violet / blue are status. **Amber is a queue; red is failure only.**
4. **Bilingual.** Nothing may assume Latin metrics or survive only in LTR.
5. **Hiding a control is courtesy, never security.** Design may hide what a role cannot do; the
   server refuses regardless. Never design an affordance whose only protection is not being drawn.

**Copy rules:** sentence case everywhere · numbers always with their denominator · **a missing mark
is an em-dash, never `0`** · mirrored data says when it last checked · **no emoji** · no exclamation
marks · plain verbs.

---

## 7. The visual system as it stands

Implemented and working. **Keep it, evolve it, or replace it — but know what it is.**

### 7.1 Type — two scales that never mix

| | Console + student | Marketing |
|---|---|---|
| body | **13px** | **17px** |
| small | 12 / 11px | — |
| headings | 16 / 20 / 24px | 32 / 44px |
| display | — | **68px** |

Weights 400 / 500 / 600. Line height 100% tight, 1.4 body. In the console, **a heading differs from
a caption by tint, not size** — hierarchy is carried by a **five-step ink ramp**. Reach for the next
tint before the next size.

Families: Inter (self-hosted) and Geist Mono, with **Noto Sans Arabic** in the stack.

### 7.2 Colour
- **Accent: indigo `#3E63DD`.** One action per screen.
- Ink: five steps, plus inverted, accent, danger.
- Surfaces: four steps, plus accent, danger, inverted, and a 72% overlay.
- Borders: light / medium / strong / danger / accent.
- Status: green, amber, red, violet, blue — each with a wash.
- **Amber has two values and the wrong one fails contrast.** `#F5D90A` is a bright lemon, **ground
  only**; amber *ink* is `#946800`.

### 7.3 Geometry and motion
Radius 4 / 8 / pill. Control heights 24 / 32 / 40; tag 20. 4px grid — page gutter 24, panel padding
16, table cell 8. **Motion is colour and opacity only: no transforms, no springs, no bounce.** 80ms
fast, 150ms base. Icons: Tabler, stroke 1.6, ~115 glyphs.

### 7.4 Structural rules that have each already cost a real build
- **No card inside a card.** `Panel` is the application's one container.
- **One utility per property.**
- Focus is a **global outline on `:focus-visible`** — never a box-shadow ring with `outline-none`,
  because an ancestor's `overflow: hidden` clips it and the element has no focus indicator at all.
- **No skeletons.** A loader inside the panel that is loading.

### 7.5 Primitives that exist
Button (primary / secondary / tertiary × default / danger / blue × small / medium) · LightButton ·
FlowButton · DropdownButton · ButtonGroup · Link · IconButton family · **Tag** (a state) and **Chip**
(an entity — different things) · Panel · Divider · SectionTitle · PageHeader · Breadcrumb ·
StatNumber · **Meter** (completion) · **Score** (marks) · EmptyState · Callout · Banner · TextInput ·
TextArea · Select · SearchInput · Counter · Calendar · TabList · Table (sticky first column, row
click) · TableToolbar · NavItem / NavSection · Avatar · Modal / SlideOver / ConfirmDialog / Toast.

**Missing and needed:** a **Stepper** (the report workflow), an annotation toolbar, a week grid, a
diff view for the audit log, a media gallery, and whatever mobile navigation you decide on.

---

## 8. What the previous design pass got wrong — the actual brief

1. **Mobile was never drawn.** One breakpoint (768px) was declared and **not a single screen was
   designed at it.** The previous handoff called this *"the largest open risk in the spec."*
   Students are phone-first; the teacher takes attendance on a phone at a door. **Draw every student
   screen at 375px, plus the console's attendance sheet, overview, and submissions queue.**

2. **Dark mode is half-built.** Light-first, dark only behind an explicit toggle, **no
   `prefers-color-scheme` fallback** — so a device set to dark gets a light page. The primary
   button's label used an inverted-foreground token unconditionally: white on indigo in light,
   **dark on indigo in dark**. Every measurement in the old spec is light-mode. **Commission a real
   dark pass, or decide explicitly to ship light only.**

3. **RTL was reasoned about, not looked at.** Two shipped bugs prove it: both sidebars vanished on
   RTL desktop when a breakpoint override lost to an RTL transform, and a score rendered its
   fraction **backwards** in Arabic. **Draw the sticky mark-book column, the stepper, the meters,
   the breadcrumbs and every fraction in RTL.**

4. **Whole subsystems have no design at all:** weekly reports and the parent PDF/email, the draft
   timetable, the quizzes runner, lesson detail, accept-invitation, student attendance, help.

5. **The console overview was designed as a dashboard, not as a daily loop.**

6. **Degraded states are underspecified**, and this product genuinely has them: storage off, Google
   disconnected, a stale form sync, unattributable responses, lagging attendance, an expired video
   URL. The product's rule is that **it never silently pretends.**

7. **Destructive confirmation copy was never written.**

---

## 9. Technical constraints on the design

- Target: **Next.js App Router, React, TypeScript, Tailwind CSS v4** over CSS custom properties.
  Deliver **tokens as CSS custom properties**, and components as reference prototypes with exact
  structure, states and measurements — they are reimplemented as TSX, not imported.
- **No animation library.** Motion is colour and opacity.
- Video is behind **signed, expiring URLs**; a player must tolerate one expiring mid-session and
  must never expose a directly linkable source.
- **Uploads may be unavailable in production.** Design the honest failure, not a spinner.
- **No SVG or HTML uploads anywhere** — avatars and attachments are raster or document formats only.
- Everything renders against a real API. There is no mock data and no client-only state of
  consequence. **Server-computed values arrive as values** — the design must not imply the browser
  decides a task's status, a report's stage, or whether a session is live.

---

## 10. Explicitly out of scope

Payments, refunds, discount codes · a parent console or login · a first-party quiz engine (quizzes
are Google Forms) · rubrics · multi-tutor or multi-tenant · achievements · a public course catalog
with open self-enrolment (registration is an approval queue) · device and session management (there
is no "your devices" screen) · a leaderboard of any kind.

---

## 11. What "good" looks like here

- The teacher opens the console and knows within two seconds what needs him today.
- A student on a phone, on the bus, sees what is due and starts a recording in two taps.
- A parent opens a PDF on a phone and understands their child's week without a glossary.
- Nothing on any screen makes a claim it cannot support: every number carries its denominator,
  every stale mirror says when it last checked, every missing mark is an em-dash, and an unmarked
  student is never shown as absent.
- The marketing site feels like a person. The console feels like an instrument. Neither borrows the
  other's type scale.
