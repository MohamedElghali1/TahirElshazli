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
5. `context/tahirlmsprojectknowledge.md` — background notes; **partly superseded** (see §3).
6. The original brief's full feature wish list (§9) — a menu of ideas, not a checklist.

---

## 1. What this is

A premium educational platform for **Dr. Tahir Elshazli** (brand: *Dr. Tahir / English Team*) at
**tahirelshazli.com**, targeting **IGCSE and IELTS** students.

It is *not* a landing page. It is a public marketing website **plus** a full Learning Management
System, positioned against GoStars, Bassthalk, Mentora, and Teachable. Must scale to thousands of
students.

Two things that are easy to get wrong and matter a lot:

- **Never build an "Earnings" / revenue widget into the dashboard.** The client explicitly removed it.
- **Progress ≠ performance.** See §5.1 — this was a direct client correction.

---

## 2. Roles (5)

| Role | Access |
|---|---|
| **Visitor** | Public site only, no login. Marketing pages, course catalog, blog, contact. |
| **Student** | Courses, lessons, recordings, assignments, quizzes, grades, progress, timetable, certificates. |
| **Parent** | Read-only monitoring of a linked student: progress, grades, attendance — plus manages payments. |
| **Teaching Assistant** | Course support, grades assignments, views student progress, generates reports. Scoped permissions, **fully audited**. |
| **Teacher (Dr. Tahir) — main account** | Full admin: courses, users, content, reports, settings, and visibility into every TA action. |

Access control is **role-based (RBAC) and enforced server-side on every request**. Never gate on the
client alone. TA permissions are a subset of the teacher's and must be configurable.

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

---

## 7. Phases

Per the agreement (40 calendar days, two phases). Treat phase membership as guidance, not a fence.

**Phase 1 — UI/UX & core platform** (interactive testing build)
Homepage & marketing pages · about / courses / contact · student authentication · student dashboard
& course pages · administrator dashboard · database architecture · fully responsive design.

**Phase 2 — LMS completion & launch** (production-ready)
Assignment & submission system · quiz & assessment engine · reports & analytics · CMS ·
notification system · security hardening & testing · deployment & optimization.

**Later / on request** (raised by the client, not yet scheduled)
Payment gateway rollout (Paymob/Fawry for Egypt + Stripe international) · Zoom API automation ·
WhatsApp Business API · SMS · quiz analytics export · multi-tutor expansion.

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

---

## 11. Open decisions — don't block on them, ask when they matter

- Which payment processor(s) for Egypt (Paymob vs. Fawry), and whether Stripe is needed at launch.
- Zoom: manual link + time (current assumption) vs. API automation.
- Single Chemistry/IGCSE course vs. the fuller IGCSE/IELTS/English catalog — the schema supports both.
- How rich the quiz engine must be at launch (a simple submission may be enough to start).
- Whether the existing Vercel/Next.js prototype UI is reused or rebuilt under the agreed stack.
- Parent role depth: read-only monitoring only, or also communication and payment management.
- One tutor brand vs. a future multi-tutor marketplace.

---

## 12. Reference material

- `context/download.pdf` — signed development agreement: stack, scope, phases, 40-day timeline, IP,
  warranty (30 days post-launch), maintenance terms.
- `context/report 1.pdf` — Phase One meeting, 30 Jul 2026: user stories review.
- `context/Report 2 - Mr Tahir Elshazli LMS.pdf` — Phase Two meeting, 6 Aug 2026: prototype review.
- `context/tahirlmsprojectknowledge.md` — background notes (stack section superseded, see §3).
- User stories board (Figma): `figma.com/board/R17sOASEJqQ7iQC2LeyFFK/Tahirelshazli.com---User-Stories`
- Style references: gostars.online · bassthalk.com · mentoraeg.com · teachable.com
