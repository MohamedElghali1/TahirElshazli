# Decision log — the redesign

Significant product and architecture decisions, newest last. This exists because the requirements
evolved *during* the design phase: several decisions here reverse something `CLAUDE.md` previously
recorded as settled, and a reader six months from now needs to know that was deliberate rather than
an oversight.

Format: decision · date · context · alternatives · reason · affected areas.

---

## 2026-09-18 — The Claude Design handoff becomes the product source of truth

**Context.** The original frontend did not meet the client's requirements. A separate design phase
produced a complete design system plus two click-through UI kits describing a product materially
different from what was built.

**Alternatives.** (a) Restyle the existing frontend with the new tokens. (b) Treat the handoff as the
new product definition and reconcile the backend to it.

**Chosen.** (b). The handoff is not a mockup — its kits contain entities the backend has never had
(weekly reports, a draft library, a registration queue, PDF annotations) and remove things it has.

**Affected.** Everything. `docs/redesign-mapping.md` records the screen-by-screen mapping; this plan
records the domain consequences.

**Note on precedence within the handoff.** Where the UI kits and the handoff's own `SCREENS.md`
disagree, **the kits win** — they carry an "Added September 2026" section that `SCREENS.md` predates
(Settings lost two tabs, People moved to Assistants, Account became its own route).

---

## 2026-09-18 — Tokens ported verbatim; components reimplemented

**Context.** The handoff's `.jsx` components use inline styles and JS hover handlers.

**Chosen.** Port `tokens/*.css` byte-for-byte; reimplement components as TSX + Tailwind v4. This is
the handoff's own instruction, twice stated.

**Reason.** The tokens are generated from Figma and must not be re-derived by eye. The components
are readable prototypes; the target stack has its own conventions.

**Verification.** All 701 token declarations diffed identical against the source zip.

**Departures, each marked in the files:** dark-mode wash values (literal black paints nothing on a
dark ground); fonts via `next/font` rather than a CDN `@import`; `--status-*-text` aliases
generalising the handoff's amber-only rule; `Noto Sans Arabic` in the fallback stack.

**Affected.** `ad238a7`, `f4ca718`.

---

## 2026-09-19 — Full admin becomes a real role

**Context.** The design shows three staff tiers and states *"Two people share this console. Dr. Tahir
and the full admin have identical access."* `CLAUDE.md` §2.1 said explicitly: don't add a third role.

**Alternatives.** (a) A second account with `role = teacher`. (b) A distinct `admin` role.

**Chosen.** (b).

**Reason.** Identical permission, **distinct identity**. The whole point is attribution — the design
continues: *"If you need to know who did what, the assistant activity log records every action by
name."* Sharing one role destroys that.

**Affected.** `Role` enum, two CHECK constraints, ~30 `@Roles` sites. `CLAUDE.md` §2.1 amended.

---

## 2026-09-19 — Assistant scoping moves from course to group

**Context.** The backend scopes assistants by course (`CourseStaffAssignment`). The design assigns
**groups** (*"They see these groups' students, submissions and reports — and nothing else"*). The
client described two kinds: one who reaches every group, one who reaches a specific group.

**Alternatives.** (a) Keep course scoping. (b) Group scoping. (c) Unscoped, per the client's earlier
2026-09-10 "TAs see everything, but it might be changed".

**Chosen.** (b), with an explicit `scope` column of `all_groups | assigned_groups`.

**Reason.** Group is the finer grain and the one the design actually assigns; course reach becomes
derived. Scope is a column rather than an inference from row count because *"no assignment rows"*
must never be ambiguous between "everything" and "not set up yet" — that ambiguity turns an
unconfigured account into a superuser.

**Preserved.** `StaffScopeService` stays the single chokepoint, and its **404-not-403 with an
identical error message** must survive the rewrite untouched. `CLAUDE.md` §5.11's warning that
retrofitting scoping is how the leak happens is exactly why the machinery is rewritten rather than
removed.

**Affected.** `AUTH-2`; eight calling services; migration 014.

---

## 2026-09-19 — Assistants cannot remove people

**Context.** The client: *"his difference from the teacher is he can't remove students."*

**Chosen.** Four withheld verbs: delete/deactivate an account, unenrol from a course, remove from a
group, reject a registration. Implemented as **one capability preset**, not scattered role branches.

**Tension resolved.** (3) narrows shipped behaviour — `DELETE /staff/groups/:id/members/:studentId`
is TA-reachable today, and `CLAUDE.md` §5.16 records the client granting assistants placement on
2026-09-10. Settled as **add stays, remove moves to teacher/admin**, which honours both instructions.

**Affected.** `AUTH-3`.

---

## 2026-09-19 — A group studies exactly one course

**Context.** The design's GroupModal has a single Course select: *"A group is one timetable, one
assistant and one set of tasks."* `CLAUDE.md` §6.1 built `group_courses` as a join and warned a
`course_id` column is *"the expensive mistake here… a one-way door that a join table is not."*

**Alternatives.** (a) Keep the join, show one in the UI. (b) Collapse to `groups.course_id`.

**Chosen.** (b), by the client, against the recommendation.

**Reason.** The client's call; §0 says the user wins. Recorded here **because it is the least
reversible decision in the plan** — the warning was made, read, and overruled knowingly.

**Mitigation.** The migration **raises** rather than guessing if any group currently holds two
courses. Silently picking one would corrupt every session, task and report hanging off that group.

**Affected.** `DOM-1`, migration 013; `learning_mode` moves to `groups` (its third home).

---

## 2026-09-19 — A task still targets one or more groups

**Context.** The design's TaskModal offers a single group. `assessment_targets` is already built
because the client asked for one-or-more on 2026-09-10.

**Chosen.** Keep the join.

**Reason.** The design's single select is a simplification, not a contradiction — one group is the
common case. The join costs nothing and reverses no instruction. (Note this is the opposite call to
the group↔course decision above, and deliberately so: there, the client chose; here, they did not.)

---

## 2026-09-19 — Registration approval replaces open self-enrolment

**Context.** §7.2's open enrolment was added so the client could see a populated dashboard, and
`CLAUDE.md` calls it *"a testing posture, not the business model"*.

**Chosen.** Students register into a waiting queue; staff accept and place them in a group.

**Preserved.** `CoursesService.enroll` is kept and called by the acceptance flow — §7.2's own
instruction ("do not delete the method to add payment") applies equally here. Only the route moves.

**Affected.** `DOM-4`; `GET /courses/catalog` and student-initiated enrolment retire.

---

## 2026-09-19 — Parents receive email; they do not log in

**Context.** `CLAUDE.md` §2 lists Parent as a full role with read-only monitoring and payments; it
has never been built. The design has no parent screens and puts a `parentEmail` on the student.

**Chosen.** `student_profiles.parent_email`. No `ParentLink`, no console. The `parent` enum value
stays reserved so a console can be added later without a migration.

**Reason.** Matches the design exactly and avoids building a fifth role's entire surface for a
feature the design does not describe.

---

## 2026-09-19 — `MailSender` port, driver behind config

**Context.** Five new features need outbound email. The backend has only a logging stand-in.

**Chosen.** A `MailSender` interface with `MAIL_DRIVER=none|log|smtp`, mirroring `FileStorage` and
the Google integration: resolved once at wiring time, validated at boot, and **degrading to an
explicit 503 rather than silently doing nothing**.

**Reason.** `CLAUDE.md` §3 requires infrastructure behind configuration so the VPS can move hosts
without code changes. Provider choice is deferred; the seam is not.

---

## 2026-09-19 — Google OAuth sign-in for everyone, sequenced last

**Context.** The design's Account screen: *"Google is the primary sign-in method. A password is a
fallback… It is optional."* The backend is password-only; migration 009's OAuth reads Forms results.

**Chosen.** Add Google sign-in for all roles — and schedule it **last**.

**Reason.** Nothing else depends on it, and it replaces a working, well-tested mechanism (bcrypt-12,
timing-safe login, denylist, password-change cutoff). Doing it early would put every other slice on
top of a freshly-rewritten auth stack for no benefit.

**Constraint.** Never auto-link a Google account to an existing password account by email alone —
that is an account-takeover primitive.

---

## 2026-09-19 — Quizzes are Google Forms; no quiz engine

**Context.** The design has a full interactive quiz surface with a question-by-question runner.
`Question`/`QuestionOption`/`QuizAttempt`/`Answer` do not exist, and `CLAUDE.md` §11 left "how rich
must the quiz engine be at launch" open.

**Chosen.** Drive the design's four featured-quiz states from the existing
`work_type: 'google_form'` + `external_results` + `SyncStatus` feature.

**Reason.** That subsystem is complete, scoped, audited and vendor-neutral, and its states
(mirrored / being marked / completed / figures understated) map onto the design's almost exactly.
§5.8 already forbids in-platform submission of form work — the same boundary the design draws.

**Cost.** The in-browser runner is not built; students answer on Google and results mirror back.

---

## 2026-09-19 — Attendance becomes a three-state enum

**Context.** `attended: boolean`. The design needs Attended / Late / Absent. `CLAUDE.md` §11 warned
to decide *before* multiple read-sides exist, "or there are three read-sides and a data migration
instead of one interface."

**Chosen.** Migrate now. There is exactly one read-side today.

---

## 2026-09-19 — Open questions deliberately left open

Recorded so they are not mistaken for oversights: shared session state for device management
(`D-1`) · marked-copy delivery format (`D-2`) · report generation trigger (`D-3`) · whether study
mode, session mode and learning mode are three genuine axes (`D-4`) · fixture regeneration (`D-5`) ·
whether an assistant may schedule a session (`D-6`, which the user-stories board's `CRS-11` grants
and the §2.2 preset withholds — open since 2026-09-07).
