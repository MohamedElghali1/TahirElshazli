# Context — Teaching Assistant & Admin Backend (Phase 2)

This extends the project knowledge already established for the Tahir Elshazli LMS. It covers the two actors reviewed from the clickable prototype at `sketch-manage-82110863.figma.site`: **Teaching Assistant** and **Admin / Dr. Tahir**. Add this alongside the existing project knowledge file (or into the same Project's Knowledge) — it's reference material, not an instruction to act on.

> Same framing as the rest of the project knowledge: everything described here is what the prototype currently shows, not a locked spec. Details can be simplified, merged, or dropped as the build progresses.

---

## 1. What the prototype shows

The prototype is annotated with requirement-style codes on almost every element (`ACC-12`, `CRS-01–13`, `ASG-01–11`, `QUZ-01–12`, `PRG-01/04`, `PAY-01–06`, `CMS-01–08`, `REP-01–05`, `COM-01–05`, `TA-R1/TA-R2`). They're kept below as a traceability map between this document and the source screens.

### Teaching Assistant

| Screen | What's shown | Codes |
|---|---|---|
| **Dashboard** | A permissions banner stating scope explicitly: *"Grade work, post announcements, mark attendance — cannot manage accounts."* Stat tiles: Courses (2), To Grade (5), Today's Sessions (2), Students (89). A personal timetable (course, time, Zoom link) and a "To Grade" shortlist. | `ACC-12`, `TA-R1`, `TA-R2` |
| **My Courses** | Only the TA's *assigned* courses (not all courses) — each shows student count, the lead teacher's name, "Upload Materials" and "View Roster" (view-only, no edit/unenroll). | `CRS-10`, `CRS-11`, `CRS-13` |
| **Grade Work** | One card per submission: student name, assignment title, filename, "View", a Mark /100 field, a Feedback text field, "Return to Student". | `ASG-05`, `ASG-06`, `ASG-07`, `ASG-11` |
| **Attendance** | Per-session (course + date) roster with Present/Absent/Late per student, "Save Attendance". | `PRG-04` |
| **Quizzes** | Quiz builder/list scoped to the TA's courses: title, subject, Published/Draft, avg score, attempts, "most missed question", Export, Duplicate, Create Quiz. | `QUZ-07`, `QUZ-08`, `QUZ-09`, `QUZ-11`, `QUZ-12` |
| **Announcements** | Post to a specific assigned course, or message one specific student directly. | `COM-04`, `COM-05` |

The permissions banner is the single most load-bearing line in the prototype: a TA is explicitly **scoped to their assigned courses** and **barred from account management** — no create/delete/unenroll user, no payments, no CMS, no cross-course visibility.

### Admin / Dr. Tahir

| Screen | What's shown | Codes |
|---|---|---|
| **Dashboard** | Explicitly states *"No revenue widgets displayed"* — matches the earlier instruction to drop earnings/revenue widgets. Stat tiles: Total Students (214, across all courses), Active Courses (6), Pending Grades (18), Failed Payments (3, "needs review" — an operational count, not a revenue figure). A recent-activity feed and Quick Actions (Create Course, New Assignment, New Quiz, Post Announcement, View Reports, Manage CMS). | `CMS-08` |
| **Courses** | Full CRUD across *all* courses, multiple curricula (IGCSE Math/Physics/Chemistry, IELTS Academic/General, A-Level Math), each with student count and monthly price, Active status, Edit, Students (roster). | `CRS-01–08` |
| **Assignments** | All assignments platform-wide, an avg-mark tile per assignment, due date, submission counts, open/closed status, View, Edit. | `ASG-01–09` |
| **Quizzes** | All quizzes platform-wide, plus a "Randomised" flag and a "Sections" count per quiz. | `QUZ-01–09` |
| **Students** | Full platform roster: courses enrolled, avg grade, attendance %, a full Profile link, and an **Unenrol** action (the thing TAs explicitly cannot do). | `PRG-01`, `CRS-08` |
| **Payments** | Payment Gateways config (cards, Apple Pay, Stripe, local methods), Discount Codes, a Failed Payments queue, and a Transaction History table with per-transaction Refund/Resolve actions. | `PAY-01–06` |
| **CMS** | Blog posts (published/draft/scheduled + Edit), a Videos library with view counts, Testimonials & FAQs management, a Media Library, and a "Schedule a Post" form (category + publish date). | `CMS-01–08` |
| **Reports** | Course Completion, Attendance, Assignment, and Student Activity reports, each with Generate + CSV export; an inline Attendance preview table. | `REP-01–05` |
| **Comms** | Platform-wide announcements (audience = all students / one course / all TAs) and direct messages to a student or parent, plus a "WhatsApp Parent" shortcut. | `COM-01–03` |

Two nuances worth keeping in mind:

1. The "no revenue widgets" instruction was honored on the *dashboard*, but the Payments *page* itself still shows transaction amounts and a failed-payments queue — expected, since operating payments requires seeing amounts even if the dashboard summary doesn't. Whether the Payments page should also hide amounts is an open call, not yet decided.
2. TA scope is enforced by data, not by hiding UI — "My Courses", "Grade Work", "Quizzes", and "Announcements" all only show the TA's *assigned* courses. That has to be a real server-side filter, not a client-side list.

---

## 2. Role model (RBAC)

Three roles: `student` (Phase 1), `ta`, `admin`. Admin is a full superset of TA.

A **TA** can grade submissions and return feedback, mark attendance, build/edit quizzes, upload materials, and post announcements/DMs — but only for courses they're explicitly assigned to, never courses outside that list.

A TA **cannot**: create/edit/delete courses, create/delete any user account, enroll or unenroll a student, touch payments, touch the CMS, or see platform-wide data (their dashboard counts are scoped to their own courses, not all 214 students).

An **Admin** can do everything, platform-wide, unscoped — course/curriculum management, full student roster + unenroll, payments/refunds/discount codes, CMS, cross-course reports, and platform-wide announcements including "All TAs" as an audience.

Every TA-facing endpoint needs a server-side check of the form "is this TA assigned to this course?" before returning or mutating anything — a role check alone ("is this user a TA?") is not sufficient.

---

## 3. Data model additions (on top of the Phase-1 student schema)

Entities already defined for the student backend (`User`, `Course`, `Enrollment`, `Assessment`, `AssessmentSubmission`, `Recording`, `Material`, `Notification`, etc.) carry over unchanged. New entities for this phase:

**CourseStaffAssignment** (the core RBAC table)
`id, user_id (role=ta), course_id, assigned_at, assigned_by` — every TA-scoped query filters through this table; admin queries never do.

**Attendance**
`id, student_id, course_id, session_date, status (present|absent|late), marked_by, marked_at`

**QuizAnalyticsSnapshot** (or computed on read)
`quiz_id, avg_score, attempts_count, most_missed_question_id, computed_at`

**Payment**
`id, student_id, course_id, amount, currency, gateway (stripe|paymob|fawry|...), status (paid|failed|refunded|pending), transaction_ref, paid_at`

**DiscountCode**
`id, code, percent_off or amount_off, max_uses, uses_count, expires_at, applicable_course_ids[]`

**Refund**
`id, payment_id, amount, reason, status (pending|processed|denied), processed_by, processed_at`

**BlogPost**
`id, title, slug, body, featured_image_url, category, tags[], status (draft|scheduled|published), publish_at, author_id, view_count`

**VideoAsset**
`id, title, video_url, thumbnail_url, view_count, uploaded_at`

**Testimonial**
`id, student_name, course_id, quote, rating, is_published`

**FAQ**
`id, question, answer, category, order`

**MediaAsset**
`id, file_url, file_type, uploaded_by, uploaded_at`

**Announcement**
`id, audience (all_students|course:<id>|all_tas), title, body, posted_by, posted_at`

**DirectMessage**
`id, sender_id, recipient_id (student or parent), body, sent_at, channel (in_app|whatsapp)`

**AuditLog**
`id, actor_id, action, entity_type, entity_id, metadata_json, created_at` — written for anything that mutates money, enrollment, or accounts (refunds, unenrollment, account changes, course deletion).

**ReportRun**
`id, type (course_completion|attendance|assignment|student_activity), filters_json, file_url, generated_by, generated_at`

---

## 4. API surface (grouped by who can call it)

**Shared** (TA and Admin, TA always scoped by `CourseStaffAssignment`): course list (TA: assigned only; Admin: all), course roster, submission grading (mark + feedback + return), attendance get/save, quiz list/create/export/duplicate, announcements, direct messages.

**Admin-only**: course create/edit/delete, student unenroll, full student directory, payments + refunds, discount codes, CMS (posts/videos/testimonials/FAQs/media), report generation + CSV export, TA-to-course assignment management, audit log access.

Every admin-only route that mutates money, enrollment, or accounts writes an `AuditLog` row.

---

## 5. Business logic notes

TA scoping is a query filter, not a UI filter — every TA endpoint joins through `CourseStaffAssignment`; there is no "TA sees everything, UI just hides some of it" shortcut, since that would leak data through the API directly.

Quiz analytics (avg score, attempts, most-missed question) are computed from submission/answer data — on read for now, cached later if volume makes that slow.

Attendance rollups feed both the TA's per-session view and the Admin's Attendance Report from the same underlying rows, aggregated two different ways (by session vs. by course-average).

Payment status transitions follow `pending → paid`, `pending → failed`, `paid → refunded`; a refund creates a `Refund` row and an `AuditLog` entry rather than silently flipping `Payment.status`.

CMS publish scheduling: a `scheduled` post becomes `published` via a background job comparing `publish_at` to now — the same pattern as quiz auto-unlocking on the student side.

"All TAs" as an announcement audience is computed from `role = ta` at send time, not stored as a static list.

---

## 6. Current build scope

This phase (TA + Admin backend) builds directly on the Phase 1 student backend — same `User`, `Course`, `Enrollment`, `Assessment` model, extended with the entities in Section 3 rather than duplicated. The centerpiece of this phase is getting `CourseStaffAssignment`-based scoping right for the TA role; everything else (grading, attendance, quizzes, CMS, payments UI) is comparatively mechanical CRUD once that filter is in place consistently.

Payment-gateway integration itself (real Paymob/Stripe/Fawry wiring) and the public-facing CMS output (the marketing site actually rendering blog posts) remain later-phase concerns — this phase covers the admin-side data model and management UI for those areas, not the external integrations or public consumption of them.

The dashboard should carry no earnings/revenue summary widget, consistent with earlier guidance — an operational count like "failed payments needing review" is fine; a total-revenue figure or earnings chart is not, unless that guidance changes.
