# Domain model

The business entities, their relationships, lifecycles and invariants — derived from the product
behaviour in `PRODUCT_SPEC.md`, not from the screens. Where the UI shows a figure the domain does
not store (a group's average quiz mark, a student's performance percentage), that is a **computed
projection**, named as such, not a column.

Conventions carried forward from the existing schema and `CLAUDE.md` §6: `TEXT` primary keys (seed
fixtures use readable ids like `course-1`), UTC timestamps, `TIMESTAMPTZ(3)` on anything a keyset
cursor pages, money in minor units, soft-delete only where history matters.

---

## 1. Identity

### `User`
The account. One row per person, whatever their role.

- **Fields.** `id`, `email` (unique, case-insensitive), `passwordHash` (optional once Google
  sign-in lands), `role`, `name`, `status`, `googleEmail?`, `createdAt`
- **`role`** — `visitor | student | parent | assistant | teacher | admin`. `admin` is new; `parent`
  remains a reserved value with no linking table (decision: parents receive email, they do not log in).
- **`status`** — `waiting | active | rejected`. **New.** Only `active` may authenticate.
- **Lifecycle.** `waiting` → `active` (accepted, or created directly by staff) → optionally
  `rejected`. A rejected account is never hard-deleted; the audit trail must stay reconstructable.
- **Invariants.** Registration can only ever create `role = student, status = waiting`. Role is
  re-read from the database on every request — never trusted from the token.

### `StudentProfile`
One-to-one with a `User` of role `student`. The pastoral record, separate from the account.

- **Fields.** `userId`, `name`, `email`, `phone?`, `avatarUrl?`, **`schoolName?`**,
  **`parentEmail?`**, **`staffNotes?`**, timestamps
- **No `mode`.** `CHANGELOG.md` `D-4`, ratified as coordinator ruling **R-2** (2026-09-20): the
  school/online axis is not built. `D-9` removed the last mode axis from the product, and a
  `students.mode` with nothing reading it is a column and a CHECK constraint carrying no decision.
  **Accepted cost:** the roster cannot show one student as Online inside a School group. Additive
  and cheap if it comes back.
- **`parentEmail`** is the entire parent relationship. There is no `Parent` entity.
- **Neither `parentEmail` nor `staffNotes` is ever student-facing.** `parentEmail` is a third
  party's PII on a child's record; `staffNotes` is staff writing *about* the student.
  `StudentsService` returns a `StudentProfileView` built key by key rather than the stored row, so
  a field added to the table cannot reach `GET /students/me/profile` by accident.
- **`schoolName`** is free text, filled in by staff. It is required by nothing, now that there is
  no `mode` for it to be conditional on.

### `AssistantScope` / `AssistantGroupAssignment`
**New.** Replaces `CourseStaffAssignment` entirely.

- `AssistantScope` — `userId`, `scope: all_groups | assigned_groups`
- `AssistantGroupAssignment` — `userId`, `groupId`, `assignedBy`, `assignedAt`
- **Invariant.** Rows exist only when `scope = assigned_groups`. An assistant with `all_groups`
  holds no rows — and this is why scope is an explicit column rather than inferred from row count:
  *"no rows" must not be ambiguous between "everything" and "nothing yet".*
- **Ownership.** Only teacher/admin may write these.

### `AssistantInvitation`
**New.** `email`, `role`, `scope`, `groupIds[]`, `token`, `expiresAt`, `acceptedAt?`, `invitedBy`.
Single-use; accepting creates the `User` and its scope rows in one transaction.

---

## 2. Curriculum

### `Course`
`id`, `slug`, `isPublished`, `title`, `description`, `thumbnailUrl?`, `teacherName`,
`sequentialLockEnabled`, `defaultLearningMode`. Two of them in practice.

→ has many `CourseModule` → has many `Lesson`
→ has many `Group`, `Recording`, `Material`, `Assessment`

`defaultLearningMode` survives the group collapse as the seed value for a new group.

### `CourseModule`, `Lesson`
Unchanged. Ordering by `position`; lesson carries `durationSeconds`.

### `Recording`
Unchanged except **`thumbnailUrl?`** (new — the design's library is thumbnails-by-default) and
**`isVisible`** (new — the management screen's visible-to-students toggle).
`RecordingProgress` (per student) unchanged.

### `Material`
Unchanged. Three categories.

---

## 3. Cohort

### `Group` — the centre of the new model
"A group is one timetable, one assistant and one set of tasks."

- **Fields.** `id`, `name`, **`courseId`**, `teacherId`, **`assistantId?`**, **`meets?`**
  (recurring schedule text), **`room?`**, `createdAt`. **Built 2026-09-20, migration 013.**
- **`courseId` moves onto the group**, collapsing `GroupCourse`. This reverses `CLAUDE.md` §6.1 on
  the client's instruction, and is the least reversible change in the plan.
- **No `learningMode`.** `D-9` retired the axis before the collapse landed, so the column this
  section used to list was never created. Every course is taught the same way.
- **`assistantId` is a DISPLAY field and is never an authorization input** (binding ruling R-1,
  2026-09-20). It says who *runs* the group. What an assistant may **reach** is
  `AssistantGroupAssignment` + `AssistantScope`, decided by `StaffScopeService` and nowhere else.
  The two are allowed to disagree: an assistant named here without an assignment is refused, and an
  assistant assigned without being named here is allowed.
- **Changing a group's course is refused with 409 while it has members.** `Enrollment` is the access
  gate, so re-pointing a populated group would leave every member enrolled on the old course while
  being targeted by work set for the new one. Re-cohorting is a real operation and several
  unanswered decisions; refusing is the reversible half. *Assumption, ratified 2026-09-20.*
- → belongs to one `Course` · has many `GroupMembership` · has many `Session` · is targeted by many
  `Assessment` · receives `Announcement`
- **Invariant.** A student may belong to several groups, including two on the same course; the
  longest-standing placement (`assignedAt`) wins wherever a single answer is needed. **That sort key
  is `GroupMembership.assignedAt`** — it was `GroupCourse.enrolledAt` until the join table
  collapsed, which is a substitution of the key rather than of the rule, and arguably the better
  reading of "longest-standing *placement*". A student in no group resolves to `[]`, not an error.

### `GroupMembership`
`groupId`, `studentId`, `assignedBy`, `assignedAt`. Placement is a staff act, so `assignedBy` is
what makes it auditable.

- **Permissions.** Teacher and admin may add and remove. **An assistant may add but not remove.**

### `Enrollment`
`studentId`, `courseId`, `enrolledAt`. Still the access gate — it decides *whether* a student holds
a course; a group decides *which cohort* and *what work*.

- **Lifecycle change.** Created by staff acceptance, no longer by the student. Removing it is
  teacher/admin only.

---

## 4. Work

### `Assessment`
The task. Written once, aimed at groups.

- **Fields.** existing (`courseId`, `lessonId?`, `title`, `description`, `instructions`, `type`,
  `topics[]`, `availableFrom/To`, `dueAt`, `maxScore`, `allowedFileTypes[]`, `maxFileSizeBytes`,
  `workType`, `externalUrl?`) plus **`visibility`**, **`markerId?`**, **`allowResubmission`**,
  **`submissionModes[]`** (`D-31`), **`draftId?`** (provenance) and **`attachments[]`** (unit 6 —
  each an `Attachment` value object `{url, name, mimeType?, sizeBytes?, audience}`, `D-29`)
- **`type`** (`homework | assignment | quiz`) is *what it is for*; **`workType`**
  (`file_upload | link | google_form`) is *how it is delivered*. Two axes, deliberately — collapsing
  them would destroy the ability to ask "all quizzes".
- **`visibility`** (`published | hidden`) is **new and distinct from the window** — timestamps alone
  cannot express "hidden". **Narrowed by `D-28`:** `scheduled` is not stored; it is the derived label
  for `published ∧ now < availableFrom`, which a student already sees as locked-with-a-date. A
  `hidden` task is absent from every student read, and a task with any submission cannot be hidden
  (409).
- **Derived, never stored.** `AssessmentStatus` = `locked | available | submitted | corrected`,
  computed server-side from the window, the visibility and the submission (`CLAUDE.md` §5.10).
- **Invariants.** At least one target group. `availableFrom < availableTo`, `dueAt` inside. A
  targeted group must already study the course. Deletion refused once anything is submitted.

### `AssessmentTarget`
`assessmentId`, `groupId`, and nullable `availableFrom/availableTo/dueAt` overrides. Kept as a join
(decision 4) even though the design's modal offers one group.

### `TaskDraft` **New**
The reusable template library. `id`, `courseId`, `type`, `workType`, `title`, `description`,
`instructions`, `attachments[]`, `usedCount`, `updatedAt`, `createdBy`.

- **Lifecycle.** Authoring from a draft copies its content into a new `Assessment` and increments
  `usedCount`. The draft is never linked live — editing a draft must not change a published task.

### `AssessmentSubmission`
`assessmentId`, `studentId`, `fileUrl?`, `answerText?`, `submittedAt` (first), `lastSubmittedAt`,
`score?`, `feedback?`, `correctedAt?`, `annotatedFileUrl?`, plus **`returnedAt?`** and
**`includeInReport`**.

- **`correctedAt` vs `returnedAt`** — the design separates *Save* from *Save and return*. A marked
  paper the student cannot yet see is a real state.
- **Invariant.** The original is immutable; resubmission archives the prior content to
  `SubmissionRevision`. The annotated copy is a **new artifact beside** the original, never over it.
- **Projection.** "Not submitted" is not a row — it is the absence of one, computed against the
  targeted groups' membership. This answers `CLAUDE.md` §11's missing `missed` state.

### `SubmissionAnnotation` **New**
`submissionId`, `page`, `xPercent`, `yPercent`, `kind (comment | tick | cross)`, `text`, `createdBy`,
`createdAt`. Stored as **data, not a flattened file** — which is what makes it editable and
deletable. Whether the student receives a rendered PDF or the same overlay is open.

### `ExternalResult`, `GoogleFormBinding`
Already built (migration 010) and vendor-neutral: `provider`, opaque `externalId`, nullable
`studentId` for unmatched responses, `score`, `maxScore`, raw payload.

- **Invariant.** Identity is never guessed. An unmatched response is kept, counted and queued — never
  dropped, never name-matched — and every figure it affects is labelled understated.

---

## 5. Time

### `Session` (was `LiveSession`)
- **Fields.** `id`, **`groupId`** (was `courseId`), `title`, `scheduledAt`, **`endsAt`**,
  **`mode` (`on_ground | online`)**, **`location`** (room *or* meeting link), **`assistantId?`**,
  `description?`, **`privateNotes?`**, **`isVisible`**, **`state` (`planned | published`)**,
  `attachments[]`
- **Re-parenting to the group is the point.** Two groups on the same course meet at different times;
  that is most of why groups exist.
- **Rule.** A meeting link is revealed to students 30 minutes before the start. Join appears **only**
  when the session is live *and* online.
- **Lifecycle.** `planned` (the draft timetable, locked until its date) → `published` → past.

### `Attendance`
`sessionId`, `studentId`, **`status (present | absent | late)`**, `markedBy`, `markedAt`.

- **The boolean becomes an enum.** `CLAUDE.md` §11 asked for this decision *before* multiple
  read-sides existed; the design settles it, and the migration is cheap now and expensive later.
- **Projection.** A student's attendance percentage is `present / expected`, where expected is the
  published sessions of their groups — never stored.

---

## 6. Reporting

### `WeeklyReport` **New** — the largest new entity
- **Fields.** `id`, `studentId`, `groupId`, `courseId`, `weekNumber`, `periodStart`, `periodEnd`,
  `generatedAt`, `status`, `assignedAssistantId?`, `assistantNote?`, `teacherNote?`, `reviewedBy?`,
  `reviewedAt?`, `sentAt?`, `sentTo?`, `fileUrl?`
- **State machine.** `new → under_review → reviewed → sent`. Strictly forward.
  - `new → under_review` — an assistant saves a note
  - `under_review → reviewed` — an assistant marks it reviewed; **requires a non-empty note**
  - `reviewed → sent` — **teacher or admin only**, emails the PDF to `parentEmail`, irreversible
- **Invariants.** An assistant may never send. There is no send-to-all-groups action. The figures are
  generated; the assistant note is the only human-written part and reaches the parent verbatim.
- **Every figure is a projection** of attendance, submissions and recording progress over the period.
  Nothing in this entity duplicates a mark.

### `ReportDocument` `[EXISTING]`
The student-facing issued artifact (`period`, `fileUrl`, `overallPercentage`). Read-only today —
nothing generates it. `WeeklyReport` becomes its producer.

---

## 7. Communication

### `Announcement`
- **Audience changes** from `all_students | course | all_tas` to add **`group`**, which is likely the
  common case ("tomorrow's session moves to 7pm" is a message to one cohort).
- **Gains** `status (draft | published)`, `media[]` (image / video / youtube / file), `publishedAt?`.
- **Invariant.** The audience is resolved **at send time**, never stored as a frozen recipient list —
  a list would silently miss anyone who joined after drafting.
- **New behaviour.** Publishing also emails every recipient, once.

### `Notification`, `NotificationPreference` **New**
The in-app mailbox is unchanged. Preferences are per-user booleans: submissions, registrations,
unmatched responses, weekly summary.

### `MailDelivery` **New**
`to`, `template`, `subjectRef`, `relatedType`, `relatedId`, `sentAt`, `status`, `error?`. Emailing a
PDF of a child's marks to a parent is a PII egress — it must be reconstructable after the fact.

---

## 8. Audit

### `AuditLog` `[EXISTING]`
Append-only by interface contract (no update, no delete), no foreign keys (it must outlive what it
describes), `TIMESTAMPTZ(3)` for keyset correctness, and `AuditService.record` **throws outside a
transaction** so an action and its log entry commit together.

New actions this redesign requires — each must be added to the `AuditAction` union **and** to the
exhaustive `Record<AuditAction, true>` in the query DTO, or the admin log 400s on its own filter:

`student.accepted` · `student.rejected` · `student.unenrolled` · `assistant.invited` ·
`assistant.scope_changed` · `assistant.removed` · `attendance.marked` · `report.reviewed` ·
`report.sent` · `submission.returned` · `submission.annotated` · `task_draft.created/updated/deleted` ·
`session.planned/published` · `course.created/updated`

---

## 9. Relationship summary

```
User ──1:1── StudentProfile (parentEmail: the whole parent relationship)
 │
 ├── (assistant) ── AssistantScope ──< AssistantGroupAssignment >── Group
 │
 └──< Enrollment >── Course ──< CourseModule ──< Lesson
                        │
                        ├──< Recording ──< RecordingProgress
                        ├──< Material
                        ├──< Assessment ──< AssessmentTarget >── Group
                        │        │
                        │        ├──< AssessmentSubmission ──< SubmissionAnnotation
                        │        │              └──< SubmissionRevision
                        │        └──< ExternalResult (nullable studentId)
                        │
                        └──< Group ──< GroupMembership >── User(student)
                                 │
                                 ├──< Session ──< Attendance
                                 ├──< Announcement (audience)
                                 └──< WeeklyReport >── User(student)
```

## 10. Entities deliberately absent

`Payment`, `Refund`, `DiscountCode`, `Invoice` — deferred, no design.
`ParentLink` — parents receive email; they do not log in.
`Question`, `QuestionOption`, `QuizAttempt`, `Answer` — quizzes are Google Forms.
`Rubric`, `RubricCriterion` — grading is a score and free text.
`ReportRun` — `WeeklyReport` is the artifact; there is no separate job entity.
