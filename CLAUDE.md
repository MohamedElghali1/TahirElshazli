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
4. `context/download.pdf` — the signed development agreement (stack, scope, timeline, phases).
5. `context/tahirlmstaadmincontext.md` — TA & Admin prototype walkthrough. A peer of item 6, not its
   superior: the doc calls itself *"reference material, not an instruction to act on"* and *"what
   the prototype currently shows, not a locked spec."* Where it disagrees with a client meeting
   (items 2-3), **the meeting wins** — see §11 for the one live case.
6. `context/tahirlmsprojectknowledge.md` — background notes; **partly superseded** (see §3).
7. The original brief's full feature wish list (§9) — a menu of ideas, not a checklist.

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

Whether TAs can generate reports is **unresolved** — §5.9 grants it, the prototype doesn't. See §11.

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

Route split: **`/api/staff/*`** is shared and always TA-scoped through `CourseStaffAssignment`
(courses, roster, submission grading, attendance, quizzes + export/duplicate, announcements,
messages); **`/api/admin/*`** is admin-only and unscoped (course CRUD, unenroll, full student
directory, payments + refunds, discount codes, CMS, report generation + CSV, staff assignment,
audit log).

Proposed posture, not yet ruled on: an unassigned course should 404 rather than 403 for a TA, the
same way an unenrolled student already gets 404 — so a TA can't enumerate courses they don't hold.

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
**one has a backend.**

| Role | Backend status |
|---|---|
| **Student** | Built. 9 controllers, all `@Roles(Role.Student)`, unit + e2e covered. |
| **Visitor** | None. No public endpoints at all beyond the health check — no catalog, blog, or contact. |
| **Parent** | None. Enum entry only; no `ParentLink`, no read-only views. |
| **Teaching Assistant** | None. Enum entry only; no `CourseStaffAssignment` (§5.11). |
| **Teacher / Admin** | None. Enum entry and a seed user; no admin surface. |

**Persistence is entirely in-memory.** Eleven `InMemory*Repository` classes, zero
real implementations, no Postgres driver in `backend/`. Every repository sits
behind an interface and a `Symbol` token, so the swap is mechanical — but until
it happens, all data is lost on restart and nothing survives a second replica.

Known scaling debt to clear alongside that swap, none of it structural:
N+1 reads in `assessments.service.ts` and `courses.service.ts`; no pagination on
any list endpoint; the rate limiter and token denylist are per-process; and
`JwtStrategy` does a user lookup per request that will need caching.

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
- **Can a TA generate reports?** §5.9 — from a client meeting — says yes, explicitly. The TA
  prototype has no Reports screen and puts report generation + CSV under Admin-only. The meeting
  outranks the prototype (§0), so the default is *yes* until the client says otherwise, but this
  decides a `@Roles()` decorator and is worth one question.
- Whether the Payments **page** should also hide transaction amounts, or only the dashboard does
  (§1). The prototype shows amounts on the page; nobody has ruled on it.
- Whether TA permissions are per-TA configurable (§2 says "must be configurable") or the fixed
  preset the prototype shows (§2.2). Build the preset; keep it data-driven so this stays cheap.
- Naming collisions to settle before the first migration: `Coupon` vs `DiscountCode`, and the
  generic `Post` vs the specific `BlogPost`/`VideoAsset`/`Testimonial`/`FAQ`/`MediaAsset` (§6.1).
  Carrying both spellings into schema is the failure mode; my recommendation is the specific ones.
- Whether `Attendance` keys on `live_session_id` or a bare `session_date` (§6.1).
- **What `due_at` actually does.** Submission is gated on `available_to` only, so a
  first submission 25 days past the due date is silently accepted (`assess-1` is due 5 Sep and
  open until 30 Sep). `is_overdue` labels it but nothing penalises it. Is `due_at` advisory, a
  hard cutoff, or a late-penalty trigger?
- **No `missed` status.** §5.10's four states can't distinguish "window hasn't opened" from
  "window closed, never submitted" — both render as `Locked`. A student sees the same badge for
  work they can still do and work they have permanently lost.

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
- TA/Admin prototype: `sketch-manage-82110863.figma.site`
- Style references: gostars.online · bassthalk.com · mentoraeg.com · teachable.com
