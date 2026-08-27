# Project Knowledge — Tahir Elshazli LMS

Use this as the knowledge/instructions for a Claude Project covering this build. It gives any conversation in the project full context without re-explaining the product each time.

> **Read this framing first, every time**: everything under "Full feature wish list" below is an *initial* list of ideas from an early brief, not a locked spec. Nothing in it is mandatory, features can be dropped, merged, simplified, or replaced, and the actual build (see "Current state") is already simpler than the wish list in places — that's expected and fine. Treat the wish list as a menu of possibilities to draw from, not a checklist to complete.

---

## 1. What this is

A learning platform for **Dr. Tahir Elshazli** (brand: "Dr. Tahir" / "English Team"), domain `tahirelshazli.com`. It's a tutoring/course platform for students (initial demo is IGCSE-style Chemistry; the brand more broadly targets IGCSE/IELTS), with three eventual audiences: students (a learning dashboard), the tutor/admin (course and grading management), and the public (a marketing site + course catalog).

**Right now, the only thing being actively built is the student-facing side.** Admin, payments, and the public marketing site are documented here for context and future phases, not for immediate implementation.

---

## 2. Current state — a working frontend already exists

There is a live, deployed frontend (Next.js, on Vercel) with a real student UI already built as a visual prototype. It shows one student ("Ali Esam") in one course ("AS Chemistry") under tutor "Dr. Tahir". Screens that exist today:

- **Home** — greeting, course progress bar, four stat tiles (homework pending, answers available, new recordings, overall report %), a live-session banner with a "Join Zoom" button, and a "Quick access" list.
- **Answer** — a tabbed feed (All items / Quizzes / Assignments) of homework, assignments, and quizzes, each with a status: Locked, Available, Corrected (with score), or Submitted (awaiting feedback). Opening an assignment shows instructions and a drag-and-drop PDF uploader (10MB cap).
- **Recordings** — a grid of lesson videos with duration, title, and filter chips by chapter (Chapter 1–3) and topic (Moles, Atomic Structure, Organic Chemistry, Physical Chemistry).
- **Reports** — an overall progress %, a performance snapshot (quiz average, assignment average, homework completion), strong/weak topic breakdowns, and a list of downloadable report documents (Term, Midterm, Progress reports).
- **Course Notes / Study Materials / Important Files** — present as sidebar links and Home quick-access cards, but currently **not wired to anything** (dead links). This is the clearest gap to fill.
- **Settings / Log out** — present in the sidebar, not yet wired.

None of this is connected to a real backend yet — it's UI only. The immediate job is to build the backend and wire this exact UI to it, not to redesign the UI (colors/branding may change later, separately).

---

## 3. Full feature wish list (initial brief — not all required)

This was an early brainstorm brief for the eventual full platform, referencing GoStars, Bassthalk, Mentora, and Teachable as style references. Keep it as a menu, revisit and prune it as the build progresses.

**Public site**: homepage, about, courses catalog, individual course pages, contact + WhatsApp button, book-a-consultation, blog/articles, short educational videos, testimonials, FAQ, success stories, newsletter signup. Black/white/dark-grey/gold visual identity.

**Student system**: registration/login, profile, dashboard, enrolled courses, lessons, downloadable materials, video lessons, homework/assignments/quizzes, timetable, Zoom links, WhatsApp contact, notifications, progress tracker, attendance (if feasible), grades, certificates (future).

**Assignment system**: student side — view, submit (file upload and/or typed answers), edit before deadline. Tutor side — view submissions, correct on-platform, highlight mistakes, comment, grade with optional rubrics, return corrected work, full submission/correction history.

**Quiz system** (Google-Forms-like): many question types (MCQ single/multi, short answer, paragraph, dropdown, linear scale, matching, true/false), required/optional questions, sections, autosave, optional timer, autograding + manual grading where needed, instant feedback, randomization, question bank, analytics, multiple attempts if enabled, availability windows.

**Admin/tutor dashboard**: manage courses/students/enrollments, upload lessons/files/videos, schedule Zoom meetings, create assignments/quizzes/blog posts, view reports and submissions, grade and return work, manage announcements/testimonials/FAQs/site content.

**Reports**: student progress, assignment/quiz reports, attendance, course completion, activity, downloadable exports, per-student performance summaries.

**CMS**: blog posts, articles, short videos, announcements, news — with title/description/image/category/tags/SEO/scheduling, no-code editing.

**Payments**: online payments (cards, wallets, local Egyptian methods + international), auto-enrollment on payment, invoices, confirmation emails, payment history, coupons/discounts, installments, manual approval option, refunds, failed-payment handling.

**Security**: SSL, hashed passwords, 2FA, RBAC, protection against SQLi/XSS/CSRF, rate limiting, brute-force protection, CAPTCHA, secure/scanned file uploads, encrypted sensitive data, audit logs, backups, session/device management, GDPR-readiness.

**Technical**: responsive, fast, SEO-friendly, scalable, integrations with WhatsApp/Zoom/Google Forms/email/SMS/payments, high-traffic-ready, cloud deployment.

---

## 4. Recommended architecture (subject to change)

- **Frontend**: existing Next.js app on Vercel — kept as-is structurally.
- **Backend**: Next.js API routes / Route Handlers in the same project (no separate service needed at this scale).
- **Database**: PostgreSQL via Supabase or Neon, accessed through Prisma.
- **Auth**: Supabase Auth or Auth.js, roles = `student` / `tutor` / `admin`.
- **File storage**: Supabase Storage or S3, signed URLs for private files.
- **Video**: a stored URL per recording is enough to start; dedicated video infra (Mux/Bunny) is a later optimization, not a Phase 1 requirement.
- **Live classes**: manual Zoom link + time for now; real Zoom API automation is a later phase.
- **Payments**: Paymob/Fawry (Egyptian methods) plus Stripe if international cards matter — Phase 3, not now.
- **Notifications**: email (Resend/SendGrid), WhatsApp Business API, in-app notifications table.

## 5. Core data model (student-relevant subset)

`User` (role: student/tutor/admin) · `StudentProfile` · `TutorProfile` · `Course` · `CourseModule` (chapters) · `Lesson` · `Enrollment` · `Recording` + `RecordingProgress` · `Assessment` (type: homework/assignment/quiz, with `available_from/to`, `due_at`, status computed server-side) · `AssessmentSubmission` + `SubmissionAttachment` + `SubmissionRevision` · `Material` (category: course_notes/study_materials/important_files) · `ReportDocument` (generated PDFs, separate from the live-computed snapshot) · `LiveSession` + `Attendance` · `Notification`.

Key rule: a submission's displayed status (Locked/Available/Corrected/Submitted) is always computed server-side from timestamps and submission state — never trusted from the client.

## 6. Phase roadmap

1. **Phase 1 (current focus)** — student backend + wiring the existing frontend to it: auth, one or more courses, assessments with file-upload submissions, recordings with watch progress, materials (fixing the three dead quick-access links), a computed reports snapshot, notifications, live session with a manual Zoom link.
2. **Phase 2** — tutor/admin portal: grading with comments and rubrics, the full quiz builder, gradebook, content upload, student management, announcements.
3. **Phase 3** — public marketing site, CMS, payments (Paymob/Fawry + Stripe), coupons/installments, WhatsApp, Zoom API automation.
4. **Phase 4** — hardening and scale: 2FA everywhere, file scanning, quiz analytics/export, certificates, attendance reports, possible multi-tutor marketplace, disaster recovery, SMS.

## 7. Open decisions (revisit as needed, don't block on them)

- Single Chemistry course vs. the fuller IGCSE/IELTS/English catalog — the schema supports either.
- One tutor brand vs. a future multi-tutor marketplace.
- Zoom manual link vs. API automation timing.
- Which payment processor(s) for Egypt.
- How rich the quiz-taking experience needs to be in Phase 1 (a simple submission is enough to start; the full Google-Forms-style engine can wait for Phase 2).
