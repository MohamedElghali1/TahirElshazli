# API gap analysis

Part A inventories the **95 routes that exist today** and says what happens to each.
Part B derives the routes the **new product needs** and says whether they exist.

No global prefix is set (`setGlobalPrefix` is never called), so every path below is literal.

**Legend — Part A:** `[KEEP]` unchanged · `[MODIFY]` same route, different contract or guard ·
`[DEPRECATE]` remove · `[REPLACE]` superseded by a differently-shaped route.
**Legend — Part B:** `[EXISTS]` · `[EXISTS_BUT_INSUFFICIENT]` · `[MISSING]` · `[NO_LONGER_NEEDED]`.

A recurring `[MODIFY]` reason appears throughout: **`@Roles(Role.Teacher)` becomes
`@Roles(...STAFF_ADMIN)`** so the new Full admin role reaches it. That alone touches ~30 routes and
is otherwise a no-op; it is listed once per controller rather than once per route.

---

# Part A — the existing surface

## A1. Auth — `src/auth/` (5 routes)

| Route | Verdict | Note |
|---|---|---|
| `POST /auth/register` | `[MODIFY]` | Must create `status = waiting`, not an immediately usable account. Response should say "awaiting approval" rather than returning a session. |
| `POST /auth/login` | `[MODIFY]` | Refuse `waiting` / `rejected` accounts with a distinct, non-enumerating message. Later gains a Google path. |
| `POST /auth/logout` | `[KEEP]` | |
| `POST /auth/password-reset/request` | `[KEEP]` | Anti-enumeration behaviour is correct; keep byte-identical responses. |
| `POST /auth/password-reset/confirm` | `[KEEP]` | |

## A2. Courses — `src/courses/` (4)

| Route | Verdict | Note |
|---|---|---|
| `GET /courses` | `[KEEP]` | Enrolled courses. |
| `GET /courses/catalog` | `[DEPRECATE]` | Existed only to feed self-enrolment. |
| `POST /courses/:id/enroll` | `[REPLACE]` | Becomes staff-only, invoked by the acceptance flow. **Keep `CoursesService.enroll`** — §7.2's own instruction; only the route moves. |
| `GET /courses/:id` | `[KEEP]` | |

## A3. Dashboard — `src/dashboard/` (2)

| Route | Verdict | Note |
|---|---|---|
| `GET /dashboard` | `[MODIFY]` | The new Overview is action-first: continue-watching, three action cards, due-today, one announcement. **No mark may appear** (rule 02). Shape changes substantially. |
| `GET /courses/:id/dashboard` | `[MODIFY]` | Survives as the per-course read behind the course switcher. |

## A4. Assessments (student) — `src/assessments/` (3)

| Route | Verdict | Note |
|---|---|---|
| `GET /courses/:id/assessments` | `[MODIFY]` | Must filter by `visibility` as well as the window, and split homework from quizzes — the design forbids them mixing on one page. |
| `GET /assessments/:id` | `[MODIFY]` | Adds attachments, submission settings, annotations on the returned copy. **Unit 7 built:** `submission.returnedAt` and `submission.annotations` (empty until returned, no author); score, feedback and annotated URL null until returned. |
| `POST /assessments/:id/submissions` | `[MODIFY]` | Honour `allowResubmission`; keep the refusal of non-`file_upload` work types. |

## A5. Materials, Recordings, Live sessions, Reports (student) (8)

| Route | Verdict | Note |
|---|---|---|
| `GET /courses/:id/materials` | `[KEEP]` | |
| `GET /courses/:id/recordings` | `[MODIFY]` | Add `thumbnailUrl`, honour `isVisible`. |
| `POST /recordings/:id/progress` | `[KEEP]` | |
| `GET /courses/:id/live-sessions` | `[REPLACE]` | Sessions re-parent to the group and gain mode/location/state. See B6. |
| `GET /courses/:id/live-sessions/next` | `[REPLACE]` | Same. |
| `GET /courses/:id/reports/summary` | `[MODIFY]` | Feeds the student Marks page; needs attendance breakdown and the teacher note. |
| `GET /courses/:id/reports/documents` | `[MODIFY]` | Becomes the weekly-report period selector. |
| `GET /reports/documents/:documentId` | `[KEEP]` | |

## A6. Notifications, Students, Classmates, Student announcements (7)

| Route | Verdict | Note |
|---|---|---|
| `GET /notifications` · `POST /notifications/read-all` · `POST /notifications/:id/read` | `[KEEP]` ×3 | Correctly `jwt.sub`-scoped in the repository predicate. |
| `GET /students/me/profile` | `[MODIFY]` | Add `mode`, `schoolName`, `parentEmail` (read-only to the student), group code. |
| `PATCH /students/me/profile` | `[MODIFY]` | Student may change name/phone/avatar only — **not** `parentEmail` or `school`. |
| `POST /students/me/password` | `[KEEP]` | |
| `GET /courses/:courseId/classmates` | `[KEEP]` | Already exactly right: names only. |
| `GET /courses/:courseId/announcements` | `[MODIFY]` | Add group-audience rows and media. |

## A7. Staff — scoping and overview (10)

| Route | Verdict | Note |
|---|---|---|
| `GET /staff/courses` | `[MODIFY]` | Scope source changes from course assignment to group assignment. |
| `GET /staff/overview` | `[MODIFY]` | Design wants Tasks set / Submissions to mark / Active students; current shape is courses/students/recordings/awaitingGrading. |
| `GET /staff/courses/:id/roster` | `[MODIFY]` | Add group, status, attendance %, quiz avg, task avg — **separate columns, never merged**. |
| `GET /staff/courses/:id/outline` | `[KEEP]` | |
| `GET /staff/courses/:id/submissions` | `[MODIFY]` | **Unit 7 built:** `returnedAt` on each item; items at the group grain (`D-44`), averages course-wide. **Non-submitters live on the per-task route** (`GET /staff/assessments/:id/submissions`), not here — this route stays a submissions queue (unit-7 conflict 5). |
| `POST /staff/submissions/:id/grade` | `[MODIFY]` | **Unit 7 built:** saving is not returning (`/return` is its own route); group grain (`D-44`); the first saved mark claims an unclaimed task (`D-43`). `includeInReport` deferred to the weekly-reports unit (A-5). |
| `GET /staff/courses/:id/recordings` | `[KEEP]` | |
| `GET /staff/courses/:id/live-sessions` | `[REPLACE]` | See B6. |
| `GET/POST /staff/courses/:id/assessments`, `PATCH/DELETE /staff/assessments/:id`, `POST /staff/assessments/:id/targets` | `[MODIFY]` ×5 | Add visibility, marker, attachments, submission settings, draft provenance. |

## A8. Work analytics — `src/manage/work-analytics.controller.ts` (7)

| Route | Verdict |
|---|---|
| `GET /staff/assessments/:id/analytics` · `/results` · `/unmatched` · `POST /staff/assessments/:id/sync` · `GET /staff/courses/:cid/students/:sid/work` · `GET /staff/results/:id` · `POST /staff/results/:id/attach` | **`[KEEP]` ×7** |

**The single largest piece of good news in this analysis.** This subsystem is complete, scoped,
audited and provider-neutral, and it is what will drive the design's Quizzes surface and its
Task-results screen. It needs a frontend and nothing else.

## A9. Groups — `src/groups/` (12)

| Route | Verdict | Note |
|---|---|---|
| `GET /admin/groups` · `GET /admin/groups/:id` | `[MODIFY]` | Add course, assistant, meets, room. |
| `POST /admin/groups` | `[MODIFY]` | Now requires `courseId` and `learningMode`. |
| `PATCH /admin/groups/:id` | `[MODIFY]` | Rename → general update. |
| `POST /admin/groups/:id/courses` · `DELETE /admin/groups/:id/courses/:courseId` | `[DEPRECATE]` ×2 | A group has one course; it is set on the group. |
| `GET /staff/courses/:id/groups` · `GET /staff/groups/:id` · `GET /staff/groups/:id/members` | `[MODIFY]` ×3 | Group-scoped. |
| `POST /staff/groups/:id/members` | `[KEEP]` | Assistants keep the add. |
| `DELETE /staff/groups/:id/members/:studentId` | `[MODIFY]` | **Moves to teacher/admin.** |
| `GET /courses/:courseId/classmates` | (counted in A6) | |

## A10. Admin — directory, content, staff, audit (16)

| Route | Verdict | Note |
|---|---|---|
| `GET /admin/students` | `[MODIFY]` | Add status filter for the waiting queue, group, metrics. |
| `GET /admin/assistants` | `[MODIFY]` | Add role tier, scope, groups, status, last-seen. |
| `POST /admin/courses/:id/recordings` · `PATCH`/`DELETE /admin/recordings/:id` | `[MODIFY]` ×3 | Add `thumbnailUrl`, `isVisible`. |
| `POST /admin/courses/:id/live-sessions` · `PATCH`/`DELETE /admin/live-sessions/:id` | `[REPLACE]` ×3 | See B6. |
| `GET`/`POST`/`DELETE /admin/courses/:courseId/staff` | `[REPLACE]` ×3 | Course assignment → group assignment. See B1. |
| `GET`/`POST /admin/announcements` | `[MODIFY]` ×2 | Group audience, media, draft, email. |
| `GET /admin/audit-log` | `[MODIFY]` | New actions must reach the `@IsIn` array **and** the exhaustive `Record<AuditAction, true>`, or the log 400s on its own filter. |
| `GET`/`POST`/`DELETE /admin/integrations/google*`, `POST .../inspect` | `[KEEP]` ×5 | Four connection states already modelled. |

## A11. Blog, uploads, public, health (17)

| Route | Verdict | Note |
|---|---|---|
| `GET`/`POST /staff/blog`, `GET`/`PATCH`/`DELETE /staff/blog/:id`, `POST /staff/blog/:id/media` | `[KEEP]` ×6 | |
| `GET /staff/uploads/config` · `POST /staff/uploads` | `[MODIFY]` ×2 | Must become student-reachable for the profile photo, with its own tighter limits. |
| `GET /public/courses` · `/:slug` · `GET /public/blog` · `/:slug` | `[KEEP]` ×4 | |
| `GET /health` | `[KEEP]` | |

### Part A totals
**~57 KEEP · ~28 MODIFY · 3 DEPRECATE · 9 REPLACE**

---

# Part B — what the new product needs

## B1. Identity and staff administration

| Need | Route | Status |
|---|---|---|
| Accept a registration | `POST /admin/students/:id/accept` | `[MISSING]` |
| Reject a registration | `POST /admin/students/:id/reject` | `[MISSING]` |
| Waiting-list count for the nav badge | `GET /admin/students?status=waiting` | `[EXISTS_BUT_INSUFFICIENT]` |
| Create a student directly | `POST /admin/students` | `[MISSING]` |
| Student detail record | `GET /admin/students/:id` | `[MISSING]` |
| Update a student (mode, school, parent email, notes, group) | `PATCH /admin/students/:id` | `[MISSING]` |
| Unenrol a student | `DELETE /admin/students/:id/enrollments/:courseId` | `[MISSING]` |
| Invite an assistant | `POST /admin/assistants` | `[MISSING]` |
| Update role / scope / groups | `PATCH /admin/assistants/:id` | `[MISSING]` |
| Resend an invitation | `POST /admin/assistants/:id/resend` | `[MISSING]` |
| Remove an assistant | `DELETE /admin/assistants/:id` | `[MISSING]` |
| Accept an invitation (public) | `POST /auth/invitations/:token/accept` | `[MISSING]` |
| List / revoke devices | `GET`/`DELETE /auth/sessions` | `[MISSING]` — needs shared session state |

## B2. Groups

| Need | Route | Status |
|---|---|---|
| Group detail with roster and metrics | `GET /admin/groups/:id` | `[EXISTS_BUT_INSUFFICIENT]` |
| Delete a group | `DELETE /admin/groups/:id` | `[MISSING]` |
| Bulk move students between groups (the roster's "Move N to group") | `POST /admin/groups/:id/members/bulk` | `[BUILT]` unit 5 slice 5d |
| Group report (stats + per-student table, PDF) | `GET /staff/groups/:id/report` | `[BUILT]` unit 5 slice 5d — no PDF route: the frontend's own print-to-PDF renders the file, no server-side PDF library |

## B3. Tasks and the draft library

| Need | Route | Status |
|---|---|---|
| Global task list across groups | `GET /staff/tasks` | `[MISSING]` — today only per course |
| Visibility transition | `PATCH /staff/assessments/:id` (+`visibility`) | `[EXISTS_BUT_INSUFFICIENT]` |
| Draft list / create / update / delete | `GET`/`POST /staff/task-drafts`, `PATCH`/`DELETE /staff/task-drafts/:id` | `[MISSING]` ×4 |
| Create a task from a draft | `POST /staff/courses/:id/assessments` (+`draftId`) | `[EXISTS_BUT_INSUFFICIENT]` |
| Task attachments | part of create/update | `[MISSING]` |

## B4. Marking

| Need | Route | Status |
|---|---|---|
| Submissions for one task, incl. non-submitters | `GET /staff/assessments/:id/submissions` | `[BUILT]` unit 7 (group grain, per-group counts, no cross-group total) |
| Read annotations | `GET /staff/submissions/:id/annotations` | `[BUILT]` unit 7 |
| Create / update / delete an annotation | `POST`/`PATCH`/`DELETE .../annotations[/:aid]` | `[BUILT]` ×3, unit 7 |
| Save marks without returning | `POST /staff/submissions/:id/grade` — two operations, **not** a `return:false` flag | `[BUILT]` unit 7 |
| Return to student | `POST /staff/submissions/:id/return` | `[BUILT]` unit 7 |

## B5. Mark book

| Need | Route | Status |
|---|---|---|
| Student × task grid for a group | `GET /staff/groups/:id/markbook` | `[BUILT]` unit 7 |
| CSV export | `GET /staff/groups/:id/markbook.csv` | `[BUILT]` unit 7 |

## B6. Sessions and attendance

| Need | Route | Status |
|---|---|---|
| Week grid for a group / all in-scope groups | `GET /staff/sessions?from=&to=` | `[MISSING]` |
| Create / update / cancel a session | `POST /staff/groups/:id/sessions`, `PATCH`/`DELETE /staff/sessions/:id` | `[REPLACE]` of the three admin live-session routes |
| Draft timetable list + publish | `GET /staff/sessions/planned`, `POST /staff/sessions/:id/publish` | `[MISSING]` |
| Attendance sheet for a session | `GET /staff/sessions/:id/attendance` | `[MISSING]` |
| Mark attendance (bulk) | `PUT /staff/sessions/:id/attendance` | `[MISSING]` |
| Student's own attendance history | `GET /students/me/attendance` | `[MISSING]` |
| Student timetable | `GET /students/me/timetable` | `[REPLACE]` of the two course-scoped reads |

**Note:** the admin live-session write routes exist but are absent from `frontend/lib/api.ts`
entirely — the client was never written. They are being replaced anyway.

## B7. Weekly reports — wholly missing

| Need | Route | Status |
|---|---|---|
| List (filter by group, status, week) | `GET /staff/reports` | `[MISSING]` |
| One report | `GET /staff/reports/:id` | `[MISSING]` |
| Save the assistant note (`new → under_review`) | `PATCH /staff/reports/:id` | `[MISSING]` |
| Mark reviewed | `POST /staff/reports/:id/review` | `[MISSING]` |
| **Send to parent** (teacher/admin only) | `POST /staff/reports/:id/send` | `[MISSING]` |
| Regenerate a week | `POST /admin/reports/generate` | `[MISSING]` |
| Download PDF | `GET /staff/reports/:id.pdf` | `[MISSING]` |
| Student's own report by period | `GET /students/me/reports?period=` | `[EXISTS_BUT_INSUFFICIENT]` |

Nine routes, none of which exist. This is the largest single gap.

## B8. Announcements and notifications

| Need | Route | Status |
|---|---|---|
| Group audience | `POST /admin/announcements` (+`group:<id>`) | `[EXISTS_BUT_INSUFFICIENT]` |
| Media attachment | same | `[MISSING]` |
| Save as draft, publish later | `PATCH /admin/announcements/:id`, `POST .../publish` | `[MISSING]` |
| Live reach preview | `GET /admin/announcements/reach?audience=` | `[MISSING]` |
| Read / write notification preferences | `GET`/`PUT /me/notification-preferences` | `[MISSING]` |

## B9. Settings and account

| Need | Route | Status |
|---|---|---|
| Course CRUD | `POST /admin/courses`, `PATCH /admin/courses/:id` | `[MISSING]` |
| Staff profile read/update | `GET`/`PATCH /me/profile` | `[MISSING]` — `/students/me/profile` is student-only |
| Google connection status and actions | `/admin/integrations/google*` | `[EXISTS]` ×5 |

## B10. Student surface

| Need | Route | Status |
|---|---|---|
| Lesson detail | `GET /students/me/lessons/:recordingId` | `[MISSING]` |
| Homework list (homework only) | `GET /students/me/homework` | `[EXISTS_BUT_INSUFFICIENT]` |
| Quizzes list and state | `GET /students/me/quizzes` | `[EXISTS_BUT_INSUFFICIENT]` — derivable from work analytics |
| Profile photo upload | `POST /students/me/avatar` | `[MISSING]` — upload is staff-only |
| Help / WhatsApp link | — | config only, no route |

## B11. No longer needed

`GET /courses/catalog` · `POST /courses/:id/enroll` as a student action ·
`POST`/`DELETE /admin/groups/:id/courses` · `GET`/`POST`/`DELETE /admin/courses/:id/staff`

---

## Summary

| | Count |
|---|---|
| Existing routes | **95** |
| → keep unchanged | ~57 |
| → modify | ~28 |
| → deprecate | 3 |
| → replace | 9 |
| **New routes required** | **~48** |
| → of which weekly reports | 9 |
| → sessions & attendance | 8 |
| → people & invitations | 13 |
| → marking & annotations | 6 |
| → tasks & drafts | 6 |
| → the rest | 6 |

**Two shapes recur and should be settled once, in `API_SPEC.yaml`, before any of it is written:**

1. **Scope is expressed in the path, not a query parameter.** `/staff/groups/:id/...` makes the
   authorization object obvious at the route level; `?groupId=` invites a handler that forgets to
   check it.
2. **Error envelope stays Nest's default** `{statusCode, message, error}`. Tests already compare
   `body.message` byte-for-byte to prove a 404 for a real-but-out-of-scope id is indistinguishable
   from one for an imaginary id. Introducing a custom envelope would break that oracle for no gain.
