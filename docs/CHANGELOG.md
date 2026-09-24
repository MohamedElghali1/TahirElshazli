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

**Affected.** `Role` enum, two CHECK constraints, **14 `@Roles` decorator sites covering 63 routes**
and **fourteen** `actorRole` derivations. `CLAUDE.md` §2.1 amended.

**Correction, 2026-09-19 (unit 1, on building it).** This entry originally said "~30 `@Roles` sites".
The real figure is **14 decorator sites / 63 routes** — `@Roles` is applied at class level throughout,
so a count of *sites* and a count of *routes* differ by more than a factor of four, and an executor
planning for "~30" stops around half the boundary. Counted: 6 `/admin/*` controllers (25 routes) →
`STAFF_ADMIN`, 7 `/staff/*` controllers (35 routes) → `STAFF_ALL`, `NotificationsController`
(3 routes) → `Role.Student, ...STAFF_ALL`. The 11 student-only sites and the 4 public controllers are
untouched. The same wrong figure was in `AUTHORIZATION_MODEL.md` §1 and `SECURITY.md`; both corrected.

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

**Affected.** `AUTH-2`; **nine** calling services; migration 014.

**Correction, 2026-09-19 (unit 1).** "Eight" was wrong — `StaffScopeService` is injected by **nine**
services (`announcements`, `groups`, `manage/assessment-authoring`, `manage/grading`,
`manage/manage-live-sessions`, `manage/manage-recordings`, `manage/manage`,
`manage/work-analytics-gate`, `staff/staff`), across 22 `assertAssigned`/`scopeFor` call sites. Not
load-bearing for unit 1, which changed one line of the service and no caller — but it is the number
`AUTH-2` is planned against, and planning a chokepoint rewrite against eight of nine callers leaves
one un-migrated. `AUTHORIZATION_MODEL.md` §6 and `ARCHITECTURE.md` §2.4 corrected.

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

---

## 2026-09-19 — `CLAUDE.md` rewritten as a durable engineering contract

**Context.** `CLAUDE.md` had grown to 1,687 lines / 118 KB — roughly 85% dynamic product planning
that the `docs/` set now owns, layered with supersession notes annotating still-present obsolete
text. It had also drifted factually: it claimed fifteen repository interfaces (there are **17**) and
a token file at `app/tokens.css` (now
`app/tokens/fig-tokens.css` + `semantic.css`), and a stack described only as "Next.js / NestJS +
TypeScript" with no versions, no vitest, no oxlint, no Tailwind v4 and no mention of npm workspaces.
§4.1 still instructed a rebuild against the retired Twenty system and deferred to
`frontend-design-system.md`, which `redesign-mapping.md` supersedes.

**Alternatives.** (a) Keep appending supersession notes. (b) Rewrite it as a durable engineering
contract and let `docs/` own everything dynamic.

**Chosen.** (b). A file that must be read every session cannot be the feature backlog as well. The
new file is 16 sections covering identity, source-of-truth rules, the exact stack, repository
structure, architecture, API, authorization, security, database, testing, design system, change
management, AI working rules, the phase workflow, the agent workflow and reference material — and
explicitly excludes the product spec, the API contract, the backlog, the phase history and the
changelog.

**What was deliberately kept**, because each is durable and each was learned the hard way: the
`TIMESTAMPTZ(3)` keyset-cursor rule · the `before`-must-not-alias-`after` rule · the exhaustive
`Record<Union, true>` mirror pattern · browser-consumed and server-consumed API URLs being two
settings · the `text-[var(--x)]` trap (478 shipped unnoticed) · one-utility-per-property · no `Panel`
in a `Panel` · unsafe drivers being refused rather than warned about in production ·
404-not-403-with-an-identical-message · the five product non-negotiables.

**What moved out.** The feature wish list, the build-status inventory (`API_GAP_ANALYSIS.md` Part A
is the inventory now), the open product decisions (`PHASE_ROADMAP.md` §6), the phase narrative
(`project_log.md`), and every per-feature domain rule (`PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`).

**Affected.** The prior version is recoverable from git history. One known consequence: the twelve
read-only `lms-*` review agents in `.claude/agents/tahir/` cite the old § numbers and some now-stale
rules; they are flagged in `CLAUDE.md` §15 and in `.claude/agents/redesign/README.md` rather than
rewritten.

---

## 2026-09-19 — A sequential three-agent pipeline governs every phase

**Context.** The redesign is executed phase by phase across separate conversations, and the risk it
carries is not bad code — it is an implementer building against its own reading of a spec that
changed. The existing `lms-*` swarm reviews *after* the fact and runs its analysts in parallel.

**Chosen.** `redesign-planner` → `redesign-executor` → `redesign-reviewer`, strictly sequential, one
phase per conversation, driven by `/redesign-phase`. The planner is read-only and reconciles before
anything is built; the executor is the only writer; the reviewer is independent and its `APPROVED` is
one of nine conditions for phase completion (`PHASE_ROADMAP.md` §2).

State passes through committed artifacts in `docs/phases/<unit-id>/` — `PHASE_PLAN.md`,
`EXECUTION_NOTES.md`, `REVIEW.md` — with `SendMessage` carrying only the signal. Unstructured
conversation context is not a handoff mechanism.

**The reviewer's question is fixed as "did we move toward the NEW product?"** rather than "does the
old application still work?", because the second question is answerable with a clean diff that
implements the previous product.

**Named `redesign-*`, not `planner`/`executor`/`reviewer`**, because `.claude/agents/core/planner.md`
already declares `name: planner` and duplicate names make `subagent_type` ambiguous. It also matches
the existing `lms-*` convention.

**Affected.** `.claude/agents/redesign/`, `.claude/commands/redesign-phase.md`,
`docs/PHASE_ROADMAP.md` (new), `CLAUDE.md` §14–15.

---

## 2026-09-19 — `docs/PHASE_ROADMAP.md` separates phase control from task tracking

**Context.** `IMPLEMENTATION_PLAN.md` carried both the task checklist and the de-facto phase order.
Those answer different questions — *is this task done* versus *may this work start, and is the phase
closable* — and a single file could not hold entry criteria, exit criteria and conversation
boundaries without becoming the thing `CLAUDE.md` had just stopped being.

**Chosen.** `PHASE_ROADMAP.md` owns fifteen chat units with per-unit entry criteria, scope,
dependencies, tests, security checks and exit criteria, plus the nine-condition completion protocol
and the handoff-artifact contract. `IMPLEMENTATION_PLAN.md` keeps the task checklist and the
thirteen-point Definition of Done. The open decisions are mirrored in both, deliberately, because a
unit must not guess past one.

**Affected.** The critical path is unchanged: `SPEC-12 → DOM-1 → AUTH-2 → SESS-1 → RPT-2 → RPT-6`.
`SPEC-12` — migrations 009 and 010 never run against a real database — is recorded as a hard gate on
every later unit that writes a migration.

---

## 2026-09-19 — `AUTH-2` moves to unit 2; `AUTH-4` moves to unit 5

**Context.** `PHASE_ROADMAP.md` §4 scoped chat unit 1 as `AUTH-1` … `AUTH-4`, then conceded in the
next line that `AUTH-2` depends on `DOM-1`, which is unit 2. That is a document-internal conflict, and
four of five same-level sources already sequenced it the other way: `IMPLEMENTATION_PLAN.md` lists
`AUTH-2`'s deps as `AUTH-1, DOM-1`, its dependency graph draws `DOM-1 → AUTH-2`, the roadmap's own
graph draws `unit 2 → unit 1 (AUTH-2)`, and the critical path in both files reads
`SPEC-12 → DOM-1 → AUTH-2`. Only the unit-1 scope line disagreed.

**Alternatives.** (a) Defer `AUTH-2` to unit 2. (b) Pull `DOM-1` into unit 1. (c) Build `AUTH-2`
against the current `group_courses` shape and re-touch it after `DOM-1`.

**Chosen.** (a).

**Reason — three, and the third is the one that would survive alone.**

1. **The migration cannot run.** `DATABASE_PLAN.md` §4.2's DDL is
   `JOIN groups g ON g.course_id = csa.course_id`. `groups.course_id` arrives in `013` (`DOM-1`), and
   `MigrationRunner.sqlFilesIn` sorts filenames lexicographically — so a `014_*.sql` authored with no
   `013_*.sql` present applies straight after `012` and raises. Each migration is wrapped in its own
   transaction and the ledger is written only on success, so nothing is half-applied; but **every boot
   and every integration run aborts** until `013` exists. Under (c) that is survivable only by
   renumbering `014` → `012`, which means amending the documented numbering and shifting `DOM-3`.
2. **The resolution is not "whichever is cheaper."** The dependency graph is derived from the data;
   the scope line is not. Honestly stated against our own case: (c) would *not* have meant writing
   `StaffScopeService` twice — its public interface, its admin bypass and its 404-with-identical-
   message are indifferent to which table the reach query joins. (c) costs one repository method ×
   two drivers × two rewrites. Bounded, not fatal.
3. **`groups.assistant_id` (`DOM-2`) and `assistant_group_assignments` (`AUTH-2`) record the same
   fact twice**, and one of them is authorization-bearing. Designing them in different units is how
   they end up disagreeing about which assistant holds a group. This is why (a) beats (c) rather than
   merely tying it.

**(b) rejected.** `DOM-1` is the highest-risk task in the project — destructive and one-way — and
`CLAUDE.md` §6.1 argued against the target shape and was knowingly overruled. Pulling it into unit 1
would make unit 1 the largest and riskiest unit in the plan and drag `DOM-2` and `DOM-6` with it.

**`AUTH-4` follows, to unit 5.** It is doubly blocked: on `AUTH-2` for `scope`/`groupIds`
(`AssistantWrite` requires `scope`, which has no column until `assistant_scopes` exists) **and** on
`MAIL-1`, which is unit 3. An invitation that cannot be emailed is not an invitation. Unit 5 is its
natural home beside `PEOPLE-4`, which `IMPLEMENTATION_PLAN.md` already couples to it.

**What this cost.** Nothing downstream. Unit 5 depended on units 1 **and** 2 either way, so deferring
`AUTH-2` by one unit delays no task. Unit 1 shipped smaller and unit 2 grew.

**Affected.** `PHASE_ROADMAP.md` §4 (units 1, 2, 5) and §5's graph — which no longer draws a loop
between units 1 and 2 — and `IMPLEMENTATION_PLAN.md`'s Phase 1 table. `AUTH-3`'s recorded dependency
was `AUTH-2`; corrected to `AUTH-1`, since the capability preset is a pure module and the one routed
verb needs no scope table, which is what let it ship in unit 1 regardless.

---

## 2026-09-19 — An `all_tas` announcement reaches the Full admin

**Context.** `AnnouncementsService.resolveRecipients` resolved the `all_tas` audience as
`findIdsByRole(Role.Assistant)`, live at send time. The moment `Role.Admin` exists, that **silently
misses** the Full admin — a person with the teacher's access who would simply never receive a staff
broadcast.

**Alternatives.** (a) `all_tas` means literally assistants. (b) It is the staff broadcast channel, and
an admin is staff.

**Chosen.** (b) — `findIdsByRole([Role.Assistant, Role.Admin])`.

**Reason.** `PHASE_ROADMAP.md` keeps `all_tas` precisely because *staff broadcast has no other route*,
so under (a) there is no way at all to reach the admin. And the two failure modes are not symmetric:
**a missed recipient is silent, a redundant one is visible.** Someone who receives an announcement
they did not need can say so; someone who never receives one cannot.

Recorded as a decision rather than a refactor because **it changes who receives mail**, and this
platform's mail cannot be unsent.

**Note on what was *not* widened.** The teacher is excluded deliberately: they are the person sending,
not an audience member. So this is `[Assistant, Admin]`, not `STAFF_ALL`.

**Affected.** `announcements.service.ts`; `UserRepository.findIdsByRole` and `findByRole` widened from
one `Role` to a required non-empty `readonly Role[]` in both drivers, **which both refuse an empty
array** — read as "no filter" it would return every account on the platform, and for `findIdsByRole`
that means mailing the whole platform. Two existing tests changed their expected recipient count from
2 to 3 and from 3 to 4.

---

## 2026-09-20 — Migrations 009, 010 and 011 verified; the first-run streak ends clean

**Context.** 001–008 had each been run against real PostgreSQL from an empty schema, and **every
single first run found something** — the audit log's microsecond-vs-millisecond keyset cursor among
them. 009 and 010 had never been run, and unit 1 authored `011` on top of them, which
`PHASE_ROADMAP.md` recorded as a hard gate rather than a nicety.

**What was done.** Docker Desktop started; the suite run against a **fresh, empty** database created
beside the dev one (`CREATE DATABASE lms_migtest`) rather than dropping
`tahirelshazli_postgres_data`, which held 27 tables of existing data. All eleven migrations applied
in order, all four seed files, **81/81 integration tests passed**.

**Result: nothing found.** Recorded explicitly because the opposite was expected and the record
should not quietly imply a lucky guess.

- **The review's one specific prediction was real and already defended.** `010:172-177` declares
  `score`/`max_score` as `NUMERIC(10,2)`, and `pg` returns `NUMERIC` as a **string** — probed
  directly: `85.00::numeric(10,2)` comes back as `"85.00"`, `typeof 'string'`. The same class of
  defect as the cursor bug. But `postgres-work.repository.ts:37-38` already declares the row type as
  `string | null` and maps both columns through `numOrNull` (`:77-78`), as it does the `AVG`
  aggregates (`:321-322`). The author knew.
- **`011` verified behaviourally, not merely applied.** `admin` inserts; `'admln'` is rejected by
  `users_role_check` — so review risk R-5 (Postgres having named the inline CHECK something other
  than `<table>_<column>_check`, which would have aborted the migration) **did not materialise**, and
  the deliberate omission of `IF EXISTS` was never exercised. `audit_log_actor_role_check` now admits
  `admin`, in the same migration as `users`', as required.

**Affected.** `SPEC-12` `[x]`; `AUTH-1` `[x]`; chat unit 1 **COMPLETE**. Unit 2's `DOM-1` — the
destructive, one-way `group_courses` collapse — can now be authored on a verified base, which is the
whole reason the gate existed.

**Unit 0 stays `[~]`**, on `SPEC-16` and `SPEC-17` only: two `API_SPEC.yaml` reconciliations that unit
1's DoD point 10 check surfaced, both awaiting a decision (`D-7`, `D-8`) rather than work.

---

## 2026-09-20 — All eight open decisions closed

Closed by the user in one pass. Recorded together because three of them **narrow the product** and two
**override the design handoff** — §0 says the user wins, and this is the record that it was deliberate.

### `D-1` — Drop the Account → Security tab. No Redis.
Device listing and per-device sign-out are **dropped from scope**, not deferred. `AUTH-5` is dead.
`CLAUDE.md` §5's named trigger for Redis is a second replica, and it has not fired; introducing a
component to run, back up and fail over on a one-replica VPS to power one screen is the wrong trade at
~300 students. **Consequence accepted:** `SECURITY.md` §3.1's main known weakness — the per-process
rate limiter and token denylist — **stays open**, and is now permanent rather than pending. It is
correct on one replica and breaks the moment there are two. That trigger is now the *only* thing that
reopens this.

### `D-2` — Rendered overlay, and the annotation model is wider than the plan assumed.
No server-side PDF library. The important correction came with the answer: the teacher marks up using
**in-app marker and eraser tools that draw over the PDF and never edit it**, then submits the overlaid
result. So annotations are **not** only `{page, x%, y%, kind, text}` pins — they include **freehand
stroke paths**, and the eraser removes *the teacher's own strokes*, never page content. The original
submission stays immutable and the marked copy is a new artifact beside it, as before.
`PRODUCT_SPEC.md` §2.2 already listed "pen and highlight in the toolbar", so this is the design's
intent made explicit rather than a new requirement. A downloadable flattened PDF stays **additive** —
the stroke data is the same either way, so export is a later feature, not a rewrite.

### `D-3` — Report generation is an on-demand button. No cron.
Nothing runs unattended over 300 students' data. Generation stays **idempotent** and **must never
overwrite a report already `sent`** — unchanged, and now the only safety property that matters, since
a human triggers every run. **Consequence accepted:** if nobody presses it, no reports exist that
week. A crontab line can be added later without touching the endpoint.

### `D-4` — One axis: the group's `learning_mode`. **This overrides the design.**
`students.mode` (School | Online) and session `mode` (On-ground | Online) are **not built**; both
derive from the group. A group is already "one timetable, one assistant, one set of tasks", so one
delivery style follows — and three overlapping fields that can contradict each other on one screen is
a real cost at this scale.

**What this accepts, stated plainly:** `PRODUCT_SPEC.md` §3.2 has the student roster showing a `mode`
column and §4.1 has sessions carrying On-ground/Online with a room **or** a meeting link. Under one
axis those render from the group, so **a live group cannot hold a single online session**, and the
roster cannot show one student as Online within a School group. If either turns out to be needed, the
column comes back — `students.mode` is additive and cheap; session `mode` is additive too. `DOM-3`
shrinks accordingly and `SESS-1`'s `mode` field is struck.

### `D-5` — Regenerate the fixtures.
Seeds are rewritten for the post-`DOM-1` shape, not migrated. They are development data carrying a
published password hash, and `resolveAutoSeed` refuses production, so nothing real depends on them.

### `D-6` — Assistants may create and edit **any** session. **This overrides the shipped preset.**
Session routes widen to `STAFF_ALL`, honouring the user-stories board's `CRS-11` over the capability
preset that withheld it.

**What this accepts:** an assistant can edit a session for a group they do not hold. A session carries
a meeting link students are told to click, so this is a genuine widening of blast radius — and it sits
oddly beside `AUTH-3`, where the same role may add a student to a group but not remove one. It is
audited (`live_session.updated` already exists), so it is attributable even where it is not prevented.
**If this should instead be "their groups only", that is one scope check in `SESS-1`** and the cheapest
moment to change it is before `SESS-1` is planned, not after.

### `D-7` / `D-8` — Fix `API_SPEC.yaml` to match the **redesign**, not current code.
- `SPEC-17`: `/admin/*` is teacher and admin, unscoped. `assistant` is stripped from
  `API_SPEC.yaml:460` and `:1124`. `CLAUDE.md` §6 stands; the spec was wrong.
- `SPEC-16`: `/notifications` gains path entries shaped by `PRODUCT_SPEC.md` §5.2 — the student
  surface becomes a bell + `Menu`, and **teacher notification preferences** are added — rather than
  transcribed from the three currently-implemented routes.

### `D-d` — Audit both invitation **accept** and **resend**.
`assistant.invitation_accepted` (actor = the invitee) and `assistant.invitation_resent`. An account
coming into existence is an account event; resending mails a fresh credential. Each costs three
things in `AUTH-4`: the union entry, the query DTO's exhaustive `Record` entry, and a spec asserting
the entry written.

### `Assistant.lastSeenAt` — derived from the audit log, not a new column.
The instruction was to match the redesign, "where the teacher can see the assistant activity". The
redesign's assistant activity **is** the audit log (`PRODUCT_SPEC.md` §3.3), and the audit log already
timestamps every staff action — so `lastSeenAt` is `MAX(created_at)` for that actor. **No column, no
hot-path write on every authenticated request.**

**One honest caveat:** this is *last acted*, not *last seen*. An assistant who signs in and only reads
will show nothing. That is the right figure for the screen the redesign actually draws — "which
assistant did what, and when" — but the field should be named or labelled so nobody reads it as a
login timestamp. `PEOPLE-5` owns the screen; `PEOPLE-4` emits the field.

### `CLAUDE.md` §7's added rule sentence — kept.
"**`STAFF_ADMIN` must never contain `Role.Assistant`**" stays. It restates the §6 boundary, loosens
nothing, and names the one silent failure mode of Phase 1: an over-widened `STAFF_ADMIN` is invisible
until someone reaches `/admin/*` who should not.

---

## 2026-09-20 — `learning_mode` retired; assistant session editing scoped to their groups; `D-1` settled

Three corrections from the user, same day, revising decisions recorded hours earlier. Recorded as
revisions rather than edited over, because one of them reverses a decision this file already carries.

### `D-6` REVISED — an assistant edits sessions **for their own groups only**

Supersedes this morning's "yes, any session". The earlier reading gave every assistant the whole
timetable, which the user has now narrowed: **per group.**

Implementation is one scope check, not a new mechanism — `StaffScopeService` already answers "may this
staff member reach this?", and `SESS-1` re-parents sessions to the group, so the session's group *is*
the scope key. `CRS-11` is still honoured; the blast radius is not. This also removes the oddity the
previous entry flagged, where an assistant could edit any group's meeting link but could not remove a
student from their own group.

### `D-9` NEW — **there is no live/recorded distinction. `learning_mode` is retired entirely.**

The user: *"there's no difference between live and recorded — either way when the live is working it'll
be an external link for Zoom or Google Meet or any type of meeting, then the teacher will download the
meeting from his end and then upload it, or maybe he'll tell the assistant to upload it."*

So **every group works one way**: sessions happen on an external meeting link, and the recording is
uploaded afterwards. A group is never recorded-*only* or live-*only*; it is always both, in sequence.

This goes further than `D-4`, which kept one axis. **There are now zero.**

**What it costs, measured rather than estimated.** 46 files reference `learning_mode` /
`LearningModeService`, and it is not a carried-around flag — it changes a **response shape**.
`courses.service.ts:24,39` declares a discriminated union, and `:120` branches on it:
`{ type: 'recorded', … }` or `{ type: 'live', … }`. Retiring it collapses that union into one shape
carrying **both** completion and attendance, for everyone.

That is consistent with what the design already draws: `PRODUCT_SPEC.md` §6 gives every student both
*My lessons* (a recording library with a watched bar) **and** *Attendance* as separate pages. The two
were never alternatives on the student surface; only the backend treated them as such.

**Consequences, all of them:**
- `DOM-1` no longer adds `learning_mode` to `groups`. It collapses `group_courses` →
  `groups.course_id` and nothing else, which makes the riskiest migration in the plan smaller.
- `LearningModeService` is retired, and `GroupDataModule` loses half its reason to be `@Global()`.
  Re-examine whether it still earns the third global module.
- Migration 007 (`learning_mode_moves_to_the_group`) becomes history: the column it moved is dropped.
  `courses.default_learning_mode` and `enrollments.learning_mode` go with it.
- The progress union collapses. `frontend/lib/types.ts` mirrors it, so this is a **frontend-visible
  contract change** — the one in this batch that is.
- **Deletion, not addition.** Roughly 46 files get simpler. This is the cheapest kind of change to get
  right and the easiest to get wrong halfway, so it wants its own slice inside unit 2, sequenced
  **before** `DOM-1` rather than tangled with it.

**Sessions, consequently:** a session carries an **external meeting link** — Zoom, Google Meet, or
any other. Combined with `D-4`, there is no `mode` and no `room`. `PRODUCT_SPEC.md` §4.1's
"a room **or** a meeting link" resolves to the link. The T-30-minute server-side withholding of that
link (`SESS-6`) is unaffected and still required.

**Recordings stay teacher-only.** *Corrected the same day.* This entry originally recorded recordings
widening to assistants for their own groups, inferred from *"or maybe he'll tell the assistant to
upload it."* The user confirmed: **teacher and admin only.** `AUTHORIZATION_MODEL.md` §2.2's "a TA gets
materials, not recordings" **stands unchanged**, and `audit-log-repository.interface.ts:21`'s comment
stating that rule is correct and must stay.

The inference was the wrong call to bank: "maybe" was permission to *consider*, not a decision, and a
permission widening is exactly the class of change `CLAUDE.md` §13 says to stop and ask about rather
than read into a sentence. Who may write to a resource is business behaviour, not a judgement call.
Recorded here rather than quietly deleted, because the reasoning is the useful part.

**Unchanged by the correction:** who *uploads* the recording has no bearing on `D-9` itself. The
live/recorded distinction is still retired — the teacher uploads it, and every group still runs
external-link sessions and accumulates recordings afterwards.

### `D-1` SETTLED — drop the Account → Security tab. No Redis.

Asked to pick the best option rather than the lazy one; the answer is the same, and on the merits.

Device listing and per-device sign-out require **shared, enumerable session state**. The current
denylist is an in-process `Map` — it cannot list sessions and cannot revoke across replicas. Redis
would fix both and would also close `SECURITY.md` §3.1, the main known weakness.

**It is still the wrong trade here, for three reasons that are about this product and not about
Redis:**
1. `CLAUDE.md` §5 names exactly one trigger for Redis — **a second replica** — and it has not fired.
   One VPS, one replica, ~300 students.
2. The weakness Redis would close is not currently *exploitable* in the way it reads: on one replica
   the rate limiter and denylist are **correct**. They break on the second replica — which is the same
   trigger, so the mitigation and the need arrive together rather than the need arriving first.
3. A component to run, back up, monitor and fail over, introduced to power **one settings tab** that
   `PRODUCT_SPEC.md` §1.4 already marks `[UNCERTAIN]`, is infrastructure with no user benefit. It also
   adds a new way for sign-in to fail at 9pm before an exam.

**So: `AUTH-5` is dropped, and the per-process limitation is accepted as permanent** until a second
replica is configured — at which point it must be fixed *and* the tab becomes buildable for free. The
honest cost of dropping it: **a stolen token cannot be revoked before it expires**, and nobody can see
their active devices. Token lifetime is therefore the only control, and that makes it worth keeping
short.

---

## 2026-09-20 — `Assistant` schema reconciled; recordings confirmed teacher-only

Two closing corrections to Phase 1.

### Recordings stay teacher-only
See the correction inside the `D-9` entry above. The widening was an inference from the word "maybe"
and the user has confirmed the opposite. `AUTHORIZATION_MODEL.md` §2.2 stands; the capability matrix
row is restored to teacher/admin.

**The lesson, since it cost a revision:** "maybe he'll tell the assistant to upload it" is permission
to *consider*, not a decision to *record*. Who may write to a resource is business behaviour, and
`CLAUDE.md` §13 says to ask rather than infer. The pipeline's own planner is instructed to do exactly
that and would have flagged it; the coordinator read it into a sentence instead.

### `GET /admin/assistants` — the last open Definition-of-Done point in Phase 1

The unit-1 review's lower finding 4 was a genuine DoD point 10 failure ("`API_SPEC.yaml` matches what
was built"), drifting in **both** directions:

- the schema marked `scope` and `status` **required**, and neither has a data source until `AUTH-2`
  creates `assistant_scopes` and `AUTH-4` creates `assistant_invitations`;
- the route returns `createdAt`, which the schema did not declare at all.

**Fixed by making the contract describe what exists.** `Assistant.required` is now
`[id, name, email, role, createdAt]`; `scope`, `groupIds` and `status` stay declared but optional, each
annotated with the task that populates it and an instruction to move it into `required` in that same
change. `lastSeenAt` carries the `D-9`/`PEOPLE-6` note that it is derived from the audit log and means
*last acted*, not *last seen*.

**A contract that requires a field nothing emits is drift, not ambition** — it makes every conformance
check fail for a reason nobody intends to fix this quarter, which is how a spec stops being consulted.

Verified field-by-field: `directory.service.ts:92-97`, `API_SPEC.yaml`'s `Assistant`, and
`frontend/lib/types.ts`'s `DirectoryEntry`/`StaffDirectoryEntry` now carry the same five fields.

**Phase 1's thirteen-point DoD now holds in full.** Points not applicable to this unit are recorded as
such rather than ticked: no new tables (3), no new request bodies (4), no new audit actions (6), no
screens (9, 12). Point 11's `npx tsc --noEmit` remains at **301 pre-existing errors** in the legacy
`app/` and `components/{app,site}` that `SHELL-4` deletes — documented in `CLAUDE.md` §4.1, zero in
`lib/`, and not a Phase 1 regression.

---

## 2026-09-20 — Unit 2 is split into 2a and 2b, at a verified migration gate

**Context.** The unit-2 phase plan measured its own scope rather than estimating it: four
migrations, three of them destructive and one **one-way**; 46 source files carrying `learning_mode`
logic; two new tables meaning four new repository implementations; five frontend-visible response
shapes; 22 `StaffScopeService` call sites. Roughly units 1, 3 and 5 combined, containing the single
highest-risk change in the project.

**Alternatives.** (a) One pass — the plan's seven steps are already the commit sequence and each is
independently green; the only cost is one very large review. (b) Split at
`2a = DOM-0/1/2`, `2b = DOM-3/4/5/AUTH-2/6`. (c) Split at `2a = DOM-0/1/2 + AUTH-2`.

**Chosen.** (b). The boundary **is** a verified migration gate rather than a convenience: `015`'s
backfill joins `groups.course_id`, and `DATABASE_PLAN.md` requires `013` landed and verified before
it — a unit boundary is the strongest available form of "verified first". It also puts the two
irreversible `DROP TABLE`s (`group_courses`, `course_staff_assignments`) in different reviews, and
they share no code.

(c) was declined. The argument for co-locating `AUTH-2` with `DOM-2` was that `groups.assistant_id`
and `assistant_group_assignments` record the same fact twice and would end up disagreeing if
designed apart. That is answered by the binding condition below rather than by the boundary.

**Binding on 2a, and permanently.** `groups.assistant_id` is the **display** field — who runs this
group. `assistant_group_assignments` + `assistant_scopes` are the **authorization** field.
**Nothing may read `groups.assistant_id` for an access decision, ever.** An assistant named on a
group without an assignment row is refused; an assistant assigned without being named is allowed.
The rule is written on the column in migration 013, on the `Group` interface, in
`frontend/lib/types.ts`, in `API_SPEC.yaml`, and asserted by an e2e test that names an assistant on
a group and then proves they still get a 404 on that group's course.

**Affected.** `PHASE_ROADMAP.md` unit 2 (now 2a `[x]`, 2b `[ ]`), `IMPLEMENTATION_PLAN.md` Phase 2.
2b begins in a new conversation (`CLAUDE.md` §14).

---

## 2026-09-20 — The migration numbering shifts one, because `D-9` created a migration the plan predates

**Context.** `DATABASE_PLAN.md` §7's migration-order list was written before `D-9` created `DOM-0`,
and assigned `012` to `users.status`. `DOM-0` has to be **first**, so the destructive collapse lands
on a simplified model rather than beside a half-removed mode axis, and `011` is immutable.

**Chosen.** `012` = retire `learning_mode` (`DOM-0`) · `013` = group collapse + group columns
(`DOM-1`/`DOM-2`) · `014` = `users.status` + student profile (`DOM-3`/`DOM-4`) · `015` = assistant
scope (`AUTH-2`), and everything below shifts one to `022`.

**Reason this is recorded rather than done quietly.** `MigrationRunner.sqlFilesIn` sorts
lexicographically, so a `014` authored while no `013` exists applies **straight after `012` and
aborts every boot and every integration run**. The renumber was therefore done as step 1 of the
unit, **before any migration file was written**, and `014`/`015` were deliberately not created in
2a — not even as empty files.

**Affected.** `DATABASE_PLAN.md` §7, `PHASE_ROADMAP.md` unit 2, `IMPLEMENTATION_PLAN.md`'s `DB`
column for `DOM-0`…`DOM-6`.

---

## 2026-09-20 — `013` gains a second abort path: a group with no course

**Context.** `DATABASE_PLAN.md` §4.1 named one refusal — a group studying two courses. Writing the
migration surfaced a second, which the plan did not name and which is **reachable**:
`GroupRepository.create` made a group with no course at all, because that is exactly the shape
migration 006 was built to allow. Without an explicit guard, `ALTER COLUMN course_id SET NOT NULL`
fails with a bare constraint violation that names a column and leaves the operator to find the
group.

**Chosen.** Two `RAISE EXCEPTION` guards, both before any write, both naming the offending group by
name via `string_agg`. The whole file is one transaction, so a refusal leaves `group_courses`
intact, `groups.course_id` absent, and no ledger row.

**Both are tested, and the tests were written before the happy path was validated** — `013` cannot
be tested by running it twice, so the thing worth proving is the refusal. Each test runs in its own
Postgres schema, applies 001–012 by hand, offers `013` bad data, and asserts the throw **and** the
rollback.

**Affected.** `DATABASE_PLAN.md` §4.1 (reconciled with what ran), `013_group_holds_one_course.sql`,
`postgres-repositories.integration-spec.ts`.

---

## 2026-09-20 — Re-pointing a populated group at another course is refused with 409

**Context.** `DOM-2` widens `PATCH /admin/groups/:id` from a rename to the whole `GroupWrite`, which
makes changing a group's course a one-field edit. Nothing in `docs/` said what should happen when
that group already has students in it.

**Alternatives.** (a) Allow it. (b) Refuse with 409 while the group has members. (c) Allow it and
re-enrol every member on the new course.

**Chosen.** (b) — **an assumption, ratified by the coordinator on 2026-09-20, not a derived
requirement**, and labelled as such in `groups.service.ts` where it is implemented.

**Reason.** `DOMAIN_MODEL.md:98-100` makes `Enrollment` the access gate. Silently re-pointing a
populated group would leave every member enrolled on the **old** course while being targeted by work
set for the **new** one — visible to a student as tasks they cannot open, and to nobody else at all.
(c) is a real operation but it is several unanswered decisions (who re-enrols, what happens to
existing submissions, whether the old enrolment is revoked), and inventing them is exactly what a
blocker is for. Refusing is the reversible half: allowing it later is a one-line change, and the
409 is what makes the question surface at the moment someone needs the answer.

**Affected.** `groups.service.ts`, `DOMAIN_MODEL.md` §3, `API_SPEC.yaml`'s
`PATCH /admin/groups/{groupId}`, one unit test and one e2e test.

---

## 2026-09-20 — `StudentGroupsService`'s tie-break keeps its rule and changes its sort key

**Context.** "Longest-standing placement wins" is load-bearing: a student may legally sit in two
groups on one course, and the assessment window and the classmate list both resolve through a group.
If the two picked differently the same student would see one cohort's classmates and another
cohort's due dates. The order came from `group_courses.enrolled_at`, and migration 013 dropped that
table.

**Chosen.** The sort key becomes `group_memberships.assigned_at`, in both drivers, with the
membership id breaking a shared millisecond so the order is total. **A substitution of the key, not
of the rule** — and arguably the better reading of "longest-standing *placement*", which is what the
rule always said: `enrolled_at` recorded when the *group* joined the course, not when the *student*
joined the group.

**Affected.** `student-groups.service.ts` (`pairingsFor` → `groupsFor`, returning `Group[]`), both
`GroupRepository` drivers, `classmates.service.ts`. Covered by an integration test that places one
student in two groups on one course and asserts the order, and by a named test proving an enrolled
but unplaced student resolves to `[]` rather than throwing — the replacement for the deleted
`LearningModeService` fallback-chain test.

---

## 2026-09-20 — `GroupDataModule` stays `@Global()`, and the reason it existed is recorded as expired

**Context.** `CLAUDE.md` §5 rations `@Global()` modules to three, because a global provider is
invisible in an import list. `GroupDataModule` is one of them, and it exists to break a real cycle:
`CoursesService` had to read group data to resolve a learning mode, while `GroupsModule` already
imported `CoursesModule`. `D-9` deleted `LearningModeService`, so `CoursesService` no longer touches
group data and `GroupDataModule`'s own `CoursesModule` import went with it. **The cycle is gone.**

**Chosen.** Keep it global for the narrower reason that four feature modules read `GROUP_REPOSITORY`
or `StudentGroupsService`, and **write on the module that its original reason has expired**, so a
future reader does not cite it as precedent for a fourth global module. De-globalising it is an
import-graph change with no behavioural payoff and belongs in its own task, not inside a destructive
migration's slice.

**Affected.** `group-data.module.ts`, `groups.module.ts`, `app.module.ts` — comments only. Recorded
so `R-6` (a global module kept for a reason nobody re-checked) cannot recur silently.


---

## 2026-09-20 — `D-10`: an assistant's group reads are scoped

### `D-10` NEW — **`assigned_groups` means a 404 on a group outside the scope, reads included.**

**Raised by** `redesign-reviewer` on unit 2 slice 2a (`docs/phases/unit-2/REVIEW.md`, finding F-3).
**CLOSED the same day by the user: scope the reads.**

Migration `013` is what forced the question. `staff-groups.controller.ts:30-37` left the staff group
reads unscoped on an explicit argument — *"a group is not a course — it spans them — so there is no
course to scope by"* — and pointed at `addCourse` as the proof. `DOM-1` deleted `addCourse` and gave
every group exactly one course. **The premise is now false, so the conclusion cannot be inherited.**

**The decision.** An assistant whose scope is `assigned_groups` gets a **404 with the byte-identical
message** on `GET /staff/groups/:groupId` for a group they do not hold. Scope governs what an
assistant may **read**, not only what they may act on — `AUTHORIZATION_MODEL.md:105` already listed
assistant group views as in scope and `:207` already specified the 404; this closes the gap between
that model and the code rather than extending it.

**What it changes, stated plainly.** Today an assistant can read **any** group's roster, with every
member's name and email. That was equally true before this slice, so it is **not a regression
introduced by `DOM-1`** — but `AUTH-2` is the moment it is either closed or deliberately kept, and
it is closed. The earlier *"TAs are allowed to access all groups"* instruction is **superseded**:
`AUTH-3` already withheld four verbs from assistants, and a scope that governs writing but not
reading leaks the roster of every cohort in the school to a part-time assistant.

**Where it lands.** `AUTH-2`, unit 2 slice 2b — the same rewrite of `StaffScopeService`'s internals,
so it costs a refusal test rather than a design. **Not** in 2a: 2a fixes only the comment that
argues from the dead premise (`F2A-3`), and leaves behaviour untouched.

**The refusal test it requires.** *"an `assigned_groups` assistant gets 404 with the message
identical to a genuine miss on `GET /staff/groups/:groupId` for a group on a course they do not
hold"* — plus the positive case, per `CLAUDE.md` §10: a boundary needs both directions.

---

## 2026-09-20 — `D-11`: `@IsOptional()` is the wrong decorator over a `NOT NULL` column

### `D-11` NEW — **`null` on a non-nullable field is a 400, and a named decorator is what makes it one.**

**Raised by** `redesign-reviewer` on unit 2 slice 2a (finding F-2 / `F2A-2`), closed the same day in
the remediation pass.

`@IsOptional()` skips every other validator when the value is `null` **or** `undefined`. On a field
whose column is `NOT NULL` that is wrong, and the two drivers disagreed about the consequence:
`PATCH /admin/groups/:id {"name": null}` validated, then Postgres `COALESCE`d it to a 200 no-op
while the memory driver wrote `name = null`.

**The decision.** `backend/src/common/validators/is-optional-not-null.ts` adds
`@IsOptionalNotNull()` — `ValidateIf((_, v) => v !== undefined)`. The rule is now a naming
convention that greps: **`@IsOptional()` where the column is nullable** (there `null` genuinely
means "clear it"), **`@IsOptionalNotNull()` where it is not.** Chosen over a per-field
`@IsNotEmpty()`, which has to be remembered once per field and was already missing on 38 of them.

**Scope of the sweep.** Every `@IsOptional()` field in `backend/src/**/dto/**` was checked against
its column. **38 fields across seven DTO files** changed — groups (2), blog (10), assessments (12),
recordings (9), live sessions (4), student profile (1). Query DTOs were deliberately left alone: a
query-string value is a string or absent, never `null`. Nullable columns keep `@IsOptional()`.

### `D-12` NEW — **every group response carries `memberCount`, the two writes included.**

`API_SPEC.yaml`'s `Group` requires `memberCount` and `POST`/`PATCH /admin/groups` returned a bare
group without it (`F2A-4`). Reconciled **toward the spec** rather than away from it: `create` answers
`memberCount: 0` (no query — a new group has no members) and `update` counts once. The alternative —
a second response schema without the field — buys one saved count per edit at the price of two
shapes for one resource, and `CLAUDE.md` §6 wants the mirror generated from this contract.
`frontend/lib/types.ts`'s `GroupWrite` — which named the *PATCH* body while the spec's `GroupWrite`
is the *POST* body — is now `GroupPatch`, with `GroupWrite` re-added as the create shape (`F2A-5`).

---

## Unit 2, slice 2b-i — people and courses (2026-09-20)

`DOM-3`, `DOM-4`, `DOM-5`, migration `014`, seeds `001`/`002`. Coordinator rulings **R-5** (2b
splits again), **R-6** (register returns no token; the gate goes in `JwtStrategy`) and **R-2**
(`students.mode` is not built) are implemented here.

### `D-13` — **`students.mode` is struck from the five documents that still required it.**

`D-4` decided it, `D-9` removed the last mode axis, and ruling **R-2** ratified it — but
`IMPLEMENTATION_PLAN.md`, `DOMAIN_MODEL.md`, `DATABASE_PLAN.md` §2 and §6, `PRODUCT_SPEC.md` and
`API_SPEC.yaml` all still described a `mode` column, and `API_SPEC.yaml` made it **required** on
`StudentSummary` and `StudentWrite`. A contract that requires a field nothing emits is drift, not
ambition — the same finding unit 1 closed for `Assistant`. All five are amended; `StudyMode` is
removed from the spec and the conditional
`CHECK ((mode = 'school') = (school_name IS NOT NULL))` is struck as unbuildable, since there is no
column for it to be conditional on. **Accepted cost, restated:** the roster cannot show one student
as Online inside a School group. Additive and cheap if it comes back.

### `D-14` — **`POST /auth/register` returns `{ status: 'waiting' }`, and the status gate lives in `JwtStrategy`.**

Ruling **R-6**, Reading A. `DOMAIN_MODEL.md:23` says only `active` may authenticate, so returning a
credential in the same response that records the account as unable to authenticate contradicts the
model in the API's own body — and it is the kind of contradiction someone later resolves by deleting
the gate rather than the token.

**The security half does not depend on that, and is the part that closes the hole.**
`JwtStrategy.validate` already re-reads the user from the database on every request, for existence
and role, on the stated principle that *"a deleted or demoted user keeps their old access until the
token expires"*. `status` has exactly that property, so it is one clause on a read that already
happens, at the chokepoint every route passes through. A gate at `login` alone leaves every token
minted **before** a rejection working until it expires — precisely the window an account gets
rejected in. Both gates are built, and both are named tests.

The login refusal is a **third clause on the existing condition**, after the single
`DUMMY_PASSWORD_HASH` verify, with the unchanged `'Invalid credentials'` message: a distinct
"pending approval" message turns login into a registration oracle, and an early return before the
verify re-opens the timing side channel. A spec asserts exactly one `hasher.verify` on all four
paths — unknown email, wrong password, waiting, rejected.

### `D-15` — **`POST /courses/:id/enroll` is retired outright, not re-roled.**

`PHASE_ROADMAP.md` said the route "becomes staff-only". It does not: it is deleted and answers 404.
Staff enrol a student by accepting their registration, which is the only enrolment path there is.
`CoursesService.enroll` is untouched and is what `accept` calls, so the three properties that
mattered — idempotent, 404 on an unknown course, refuses an unpublished one — keep their tests,
retargeted from the controller to the service.

**Consequence, recorded because it changed four e2e tests:** a signed-in student with **zero
enrollments** is no longer reachable through the API, because acceptance always enrols. The cases
that needed "holds none of the fixtures" now use an account accepted into a group studying
`course-2`, where no assessment, recording or report fixture lives.

### `D-16` — **`accept` returns a directory row, not `StudentDetail`.**

`API_SPEC.yaml` specified `StudentDetail`, which required `mode` (struck by R-2) and carries four
percentage fields with no source until the reports and analytics units. The spec is amended to a new
`StudentDirectoryEntry` schema — the shape the server actually emits — with `PEOPLE-1` (unit 5)
named as the task that widens it back to `StudentSummary`. Emitting a shape the server cannot fill
is the drift `CLAUDE.md` §6 names.

### `D-17` — **the three staff fields are on the stored profile and on no student-facing response.**

`student_profiles` gains `school_name`, `parent_email`, `staff_notes` (migration `014`).
`parentEmail` is a third party's PII on a child's record and `staffNotes` is staff writing *about*
the student, so `StudentsService` returns a `StudentProfileView` built **key by key** rather than
spreading the stored row — a spread would carry the next staff column added to the table straight
onto `GET /students/me/profile`. An exact-key-set test asserts it, on `student-1`, whose fixture
carries all three values so the leak is actually possible on that row.

**`StudentProfileUpdate` deliberately does not carry them.** Nothing writes them in this slice —
`PEOPLE-1` owns `PATCH /admin/students/:id` — and a writable member with no writer, on the one
update path a *student* drives, is an open door waiting for someone to widen the DTO.

---

## Unit 2, slice 2b-ii — scope (2026-09-20)

`AUTH-2` + `D-10` + migration `015` + the final `DOM-6` seed pass. The destructive half of unit 2b,
reviewed on its own because `DROP TABLE course_staff_assignments` cannot be undone and because
`StaffScopeService` is the one authorization contract in the unit.

### `D-18` — **`scopeFor`'s return shape did not change, and `CourseStaffAssignment` became a derived value.**

The original plan said `assignments: CourseStaffAssignment[]` was "the one member of the interface
that does change". It did not. The member stayed and is populated with a **derived per-course
reach** — one row per course a held group studies, `assignedAt = MIN(assigned_at)` over those groups
(ruling R-4). The type was renamed `StaffCourseReach` and moved into `staff-scope.service.ts`
because it is no longer a stored row; **its member names are unchanged**, minus `id`, which no
caller read.

That single decision is why **all seven contract cases in `staff-scope.service.spec.ts` pass
unmodified**, and why `StaffService.listCourses` and `ManageService.coursesInScope` — the two
consumers — came out of the slice with their executable bodies byte-identical.

### `D-19` — **the four `assign`/`unassign` spec cases were deleted, and that deletion alone.**

Coordinator ruling **R-8**. They exercised `StaffScopeService.assign`/`unassign`, deleted with
`/admin/courses/:courseId/staff` and `course_staff_assignments`. Their two behavioural properties
are restated rather than lost: *idempotent grant* moved to the `AssistantScopeRepository` contract
and is asserted in **both** drivers, and *grant-then-reach / revoke-then-refuse* is restated at the
group grain. The only other edit to that file is the `beforeEach` provider, which is a fixture.

### `D-20` — **an assistant created after `015` gets no scope row from anything, and that is safe but must be closed.**

Found by the integration suite: a `role='assistant'` account created at runtime has no
`assistant_scopes` row, because `015` backfills the accounts that exist and **nothing in the product
creates an assistant**. `StaffScopeService` treats a missing row as a refusal — the assistant
reaches nothing — so this is the safe direction, not a hole. **Unit 5's `PEOPLE-4` must write the
row when it gains the ability to create an assistant**, and `AUTHORIZATION_MODEL.md` §2 now says so.

### `D-21` — **`WorkAnalyticsService` reads the group repository, not `GroupsService.members`.**

`D-10` made `members` caller-scoped. The completion-rate denominator is the union of the *targeted
groups'* members — a fact about the task, not about who is looking at it — so a scoped read there
would have produced a **quietly wrong number** for an assistant rather than a refusal, which is the
worse of the two failures. It now reads `GROUP_REPOSITORY` from the global `GroupDataModule`, and
`AssessmentsModule`'s `GroupsModule` import edge went with the change.

**What this deliberately does not decide:** whether an assistant may see analytics for a task
targeted at a group they do not hold. `AUTHORIZATION_MODEL.md:207` argues yes-it-should-be-scoped;
the route's gate is the *course*, and a task can target several groups, so "refuse entirely" and
"count only the held groups" are both defensible and neither is written down. **The gate is
unchanged pending that decision** — recorded as `B-4` in `docs/phases/unit-2/EXECUTION_NOTES_2B_II.md`.

### `D-22` — **the seed grant lives in `003`, not `002`, and that is FK ordering.**

`assistant_group_assignments` references `groups`, which `003_group_fixtures.sql` seeds.
`002_staff_fixtures.sql` keeps the two `assistant_scopes` rows (no FK on groups) and `003` carries
the one group grant. Splitting the staff fixture across two files is the foreign key, not a change
of intent, and both files say so.

**Consequence for 2a's fixture comment.** `003` said *"`assistant-1` has no group assignment,
deliberately"*, so that naming an assistant on a group could be proved to grant nothing.
`assistant-1` now **does** hold group-1 — the contract cases require them to reach course-1, and
group-1 is the only group on it. The display/authorization disagreement is proved by `assistant-2`
instead: named on no group, holding no group, and named on one by the specs to show it still grants
nothing. The proof moved; it was not dropped.

---

## 2026-09-21 — slice 2b-ii reviewed; `D-23` rules on the door `D-10` left open

**Verdict `APPROVED WITH FOLLOW-UP`** — `docs/phases/unit-2/REVIEW_2B_II.md`. The reviewer re-ran
every suite on its own tree (517 unit / 32 files · 228 e2e · 110 integration, 0 skipped) and applied
all fifteen migrations into a database it created empty seconds before. It found **no finding
attributable to the change itself**: the seven contract cases genuinely survived unmodified, the
404-not-403 property is asserted `===` against the genuine-miss path at four sites, `015`'s backfill
is proved on a multi-group course, and ruling R-1 holds by grep and by two behavioural tests.

Two things held the clean `APPROVED`, and both are closed here: one documentation line that claimed
more than the code does (F2), and one question that was the user's to answer (F1/F3/F4). `AUTH-2` is
now `[x]`.

### `D-23` NEW — **the course-named staff routes narrow to the held groups.**

`D-10` moved assistant scope to the group grain and enforced it on every route that **names a
group**. The routes that name a **course** were left course-grained, and after `015` that is no
longer the same thing: an assistant holding one cohort of a course reads *every* cohort on it —
`GET /staff/courses/:id/roster` (names, emails, averages), `GET /staff/courses/:id/submissions` (the
work itself), `GET /staff/courses/:id/groups`, the work-analytics pair, and
`assessment-authoring.service.ts:170` lets them **target** new work at a cohort they cannot read.
Roughly 150 students where the grant was thirty.

**Ruled: narrow everything to held groups.** The alternative — keep course-grained reads and narrow
only writes — would have kept every analytic a single fact about the task, which is a real
advantage. It loses because `AUTHORIZATION_MODEL.md:207` already states that *any* assistant-facing
read or write is group-scoped: a model the code contradicts is worse than either rule adopted
honestly, and it was the roster leak that raised `D-10` in the first place.

**Accepted cost, stated rather than discovered:** each affected screen now needs an explicit ruling
on whether its numbers may depend on who is looking. That is exactly the trap `B-4` avoided by
preserving behaviour instead of silently narrowing a denominator — two staff members seeing
different completion rates for one task, with nothing failing, is a worse outcome than a door that
is open and written down.

**Filed as task `AUTH-6`, not folded into phase 2.** It is unplanned scope and genuine design work
per screen, not a patch, and the leak is older than the slice that exposed it. `D-11`'s number was
already taken (2026-09-20, `@IsOptional()` over a `NOT NULL` column); this decision is `D-23`.

### `B-4` — resolved by `D-23`

The blocker the executor recorded rather than guessed at. Its read half (analytics and
`.../students/:studentId/work` for a task targeted at a group the caller does not hold) is `AUTH-6`
scope. `D-21` stands unchanged: `WorkAnalyticsService` reads `GROUP_REPOSITORY` directly, so the
denominator stays caller-independent whatever `AUTH-6` does to the gate.

---

## 2026-09-21 — `D-24` — units 3-5 run a custom pipeline; two small mail-driver calls recorded

**Context.** For chat units 3 (Mail), 4 (Shells), 5 (People and groups) the user asked for a
different process than `CLAUDE.md` §15's standing `redesign-planner → redesign-executor →
redesign-reviewer` three-subagent sequence: Claude runs as one continuous session playing both
orchestrator and reviewer, and Antigravity (`agy-delegate`, model `claude-opus-4-6-thinking`) is
the implementer in place of `redesign-executor`, with a Sonnet Claude subagent as the implementer
of record when an Antigravity dispatch cannot finish (first exercised on unit 3, see below).

**Chosen.** Per `CLAUDE.md` §0 — an explicit user instruction outranks the standing process. The
pipeline's *safeguards* are unchanged: a written phase plan precedes implementation, the diff is
independently re-verified (tests re-run, migration re-applied from empty schema, scope grepped)
rather than the self-report trusted, and `PHASE_ROADMAP.md`'s nine-point completion protocol still
gates every unit. Only who authors the diff, and how many separate agent invocations that takes,
changed.

**First real exercise, unit 3.** A first smoke-test dispatch (no write permission flag) silently
no-op'd — Antigravity's headless permission system soft-denied its first tool call against a
permission allowlist left over from an unrelated prior project, and the relay's own status came
back `"completed"` despite zero files touched. The user explicitly approved
`--dangerously-skip-permissions` for this project's dispatches after seeing that finding. On the
real unit-3 dispatch, Antigravity's own account quota was exhausted mid-run (built the module,
migration, and service correctly; never reached lint, the integration attempt, or its final
report). Rather than wait out the ~4.5-hour quota reset, the orchestrator (Claude) finished the
remainder directly per the user's standing instruction to keep working autonomously and use a
Sonnet subagent as replacement implementer when an Antigravity session ends.

**Two implementation judgment calls, disclosed rather than silently assumed** (full detail in
`docs/phases/unit-3/PHASE_PLAN.md` §6, carried into `PHASE_ROADMAP.md`'s unit-3 entry):
- The four non-password-reset mail templates (`invitation`/`sign-in-link`/`report`/`announcement`)
  were built with provisional `data` shapes, since their real callers (units 5/9/10) don't exist
  yet — expect refinement when those units land.
- `MAIL_DRIVER=log` is **not** refused in production the way `STORAGE_DRIVER=local` is; judged not
  to carry the same data-loss risk (a swallowed email vs. an orphaned upload). Revisit if wrong.

**Affected.** Process only for units 3-5; no product behaviour reversed. `PHASE_ROADMAP.md`'s
unit-3 entry and `docs/phases/unit-3/PHASE_PLAN.md`/`REVIEW.md` carry the full record.

---

## 2026-09-21 — `D-25` — `SHELL-4` deletes the dead 3/4 of `components/app/*`, not `components/site/*`

**Context.** `IMPLEMENTATION_PLAN.md` and `PHASE_ROADMAP.md` both wrote `SHELL-4`'s scope as
"Delete `components/app/*`, `components/site/*`" before any of unit 4's four slices existed. By the
time the deletion slice (4d) actually ran, that instruction no longer matched the tree: slice 4b-i
ported `components/site/{catalog-states,contact-form,course-filters,course-card,site-header}.tsx`
onto the current `components/ui` API *in place*, and slice 4c finished the remaining `(site)`/
`(auth)` port — so every one of `components/site/*`'s 8 files had a real, live consumer by the time
`SHELL-4` was reached, confirmed by grepping each file's consumer count rather than assumed.
`components/app/*`, by contrast, genuinely was left with three dead files (`page-parts.tsx`,
`table.tsx`, `app-shell.tsx` — zero consumers each) and one live one (`page-chrome.tsx`, the shared
chrome contract 25 files import).

**Chosen.** Delete only what is actually dead. `components/app/*`'s three dead files are deleted;
`page-chrome.tsx` is relocated to `components/shell/page-chrome.tsx` (its real home, next to the
shells that depend on it) with its 25 import sites updated. `components/site/*` is left in place in
full — nothing in it is legacy anymore, and deleting live, correct code because an earlier plan
said to would be following an instruction past the point it stopped describing reality.

**Reasoning.** `CLAUDE.md` §12's change-management rules ask uncommitted destructive actions to be
checked against current state, not executed on the strength of a plan written before the state that
plan describes existed. A grep-verified live/dead split costs one command per file; a wrong
deletion here would have taken down the marketing site and the auth screens the same slice had just
finished making work.

**Affected.** `docs/IMPLEMENTATION_PLAN.md`'s `SHELL-4` row and `PHASE_ROADMAP.md`'s unit-4 entry
both now carry this correction rather than the original wording alone. `CLAUDE.md` §4.1 rewritten to
match current reality (22 disclosed `AUTH-2` errors, not the historical ~326). Full verification in
`docs/phases/unit-4/REVIEW_4D.md`.

### A genuine bug, found only because this unit did the live check it kept deferring

`components/app/page-chrome.tsx` — pre-existing, untouched by slices 4a/4b-i/4b-ii, never
suspected — had a real infinite render loop: `PageTitle`/`PageActions` depended on the entire
chrome-context value object in their effects, and that object is rebuilt every time their own
`setChrome`/`setActions` calls fire, so every state update re-triggered the effect that caused it.
`PageActions` specifically receives a fresh JSX `children` element on every render of its three real
callers (`ManageLayout`, `dashboard/page.tsx`, `notifications/page.tsx`), which React never
memoizes automatically. It produced hundreds of "Maximum update depth exceeded" console errors the
instant `/manage` first rendered with real data — confirmed live, not inferred. It could not have
been caught earlier: no route in the whole app had ever rendered successfully in a browser before
slice 4c cleared the last whole-app Turbopack compile blocker, three slices into this unit. Fixed by
depending on the individual `useCallback`-stabilized setter functions instead of the whole context
value — a one-file fix, verified by reloading the live session and confirming zero console errors
across `/manage`, `/manage/students`, `/dashboard`, `/lessons`, `/marks`. Full trace:
`docs/phases/unit-4/REVIEW_4C.md`.

---

## 2026-09-21 — `D-26` — unit 5 slice 5c: `remove` is invitation-only; `PEOPLE-5` needed no new route

**Context.** Two real decisions surfaced while building `AdminAssistantsService` (`PEOPLE-4`/`5`/`6`,
`AUTH-4`) that no document had settled.

**Decision 1 — `DELETE /admin/assistants/{userId}` removes a pending invitation, never a real
account.** `API_SPEC.yaml`'s route documents only a `204`, with no stated behaviour for a `userId`
that already names an active account. This codebase has no precedent for hard-deleting or
deactivating an existing account anywhere — the money/soft-delete conventions in `CLAUDE.md` §9 all
point toward keeping history, not erasing an account outright — and building one was not asked for
by any document in `docs/`. **Chosen**: `remove` resolves only a still-pending `assistant_invitations`
row; a `userId` that names a real user 404s exactly like an unknown id. Verified live against the
real dev server: `DELETE /admin/assistants/assistant-1` (a real, active seed account) answers 404,
and the account still lists afterward. The frontend never offers a remove control on an active row
at all, which is what keeps this from reading as a broken button rather than an unsupported action.
If an account-removal or -deactivation feature is wanted later, it should arrive as its own named,
itself-audited operation — not a silent extension of this one.

**Decision 2 — `PEOPLE-5` needed no new backend route.** The phase plan's slice-5c description
assumed a dedicated endpoint ("a read over `AuditService.find` scoped to one actor"). Reading
`admin-audit.controller.ts` before writing anything found `GET /admin/audit-log` already accepts
`?actorId=`, unused by any frontend caller. **Chosen**: extend the existing `manage/activity/page.tsx`
(built in unit 4 slice 4d, ahead of this unit, as the general feed) to read an optional `?actorId=`
query param, rather than building a second, narrower activity screen and a second route that would
duplicate it. The assistants list links into it.

**Reasoning.** Both follow `CLAUDE.md` §0/§13: check the actual current code before building, and
do not invent business behaviour a document doesn't authorize. Recorded here rather than left buried
in a review because both are the kind of quiet default someone six months from now could reasonably
read differently.

**Affected.** `docs/IMPLEMENTATION_PLAN.md`'s `PEOPLE-4`/`PEOPLE-5` rows and `PHASE_ROADMAP.md`'s
unit-5 entry now reflect both. Full detail: `docs/phases/unit-5/REVIEW_5C.md`.

---

## 2026-09-21 — `D-27` — `GROUP-4`'s "PDF" is the browser's print-to-PDF; `D-2` doesn't apply here

**Context.** `PHASE_PLAN.md`'s open item `B-9` flagged that whether `GROUP-4`'s PDF report needed
anything beyond marking's rendered-overlay pattern (`D-2`) was unconfirmed until the slice actually
built it. It has now been built, and the answer is that `D-2` is the wrong pattern entirely — it was
never actually about PDF generation.

**What `D-2` actually settled.** Re-read in full before this slice started: it is about *annotating
an existing submitted PDF* — the teacher draws marker/eraser strokes over a file that already
exists, and the strokes are stored as overlay data beside the original, which stays immutable. That
answers "how does marking work", not "how do we produce a PDF".

**A group report has no source PDF to overlay.** It is generated from a live query - stats and a
per-student table - with nothing existing beforehand to draw on top of. `CLAUDE.md` §3/§5 name no
server-side PDF library in this stack, and adding one for a single report screen at this scale (§1:
~10 groups) would be exactly the kind of dependency the ladder in `.claude/agents/*` and the
project's own YAGNI discipline exist to catch.

**Chosen.** No PDF route. `GET /staff/groups/{groupId}/report` returns the data;
`manage/groups/{id}/report/page.tsx` renders it as an ordinary page with a "Print / save as PDF"
button that calls `window.print()`. The browser produces the file. The one piece of real
infrastructure this needed: the console shell's nav rail and header (`console-shell.tsx`) gained
`print:hidden`, so the printed/saved output is the report alone and not the whole app chrome around
it - a two-class change, not a new dependency.

**Reasoning.** Print-to-PDF is a platform feature every modern browser already has; reaching for a
server-side library to reproduce it would be paying a real dependency cost (bundle size, a new
failure mode, `CLAUDE.md` §5's "no speculative architecture") for something the user's own browser
already does. If a future requirement needs a PDF the *server* can produce unattended (e.g. emailed
as an attachment, the way the weekly-report unit will), that is a different, real requirement and
gets its own decision then - this one is scoped to what `GROUP-4` actually asked for: a report a
teacher can look at and print.

**Affected.** `docs/API_GAP_ANALYSIS.md`'s "Group report ... PDF" row and
`docs/IMPLEMENTATION_PLAN.md`'s `GROUP-4` row both now say so explicitly, rather than reading as an
unfinished PDF feature. Full detail: `docs/phases/unit-5/REVIEW_5D.md`.

---

## 2026-09-22 — The handoff's `a` rules move into `@layer base` (a narrowing of "ported verbatim")

**Context.** The unit-5 browser pass found every `<a>` in the app computing to `--fg-accent`
regardless of its own class. `semantic.css`, ported byte-for-byte from the handoff, declares
`a { color: var(--fg-accent) }` and `a:hover { … }` **unlayered**. Tailwind v4 emits utilities in
`@layer utilities`, and an unlayered rule outranks every layered rule whatever the specificity. So
`text-fg-2` on a nav link and `text-fg-invert` on a link-button both lost. The sidebar was
all-indigo, and the header's primary link-button rendered indigo text on an indigo fill.

**Alternatives.** (a) Add `!important` or a stronger selector at every affected call site. (b) Move
the two `a` rules into `@layer base`. (c) Layer the whole of `semantic.css`'s element block.

**Chosen.** (b). The rules stay the default for an `<a>` with no colour class, because they come after
Tailwind's preflight in the same layer, and a utility on the element now wins.

**Why not (c).** `:focus-visible` is deliberately left unlayered. CLAUDE.md §11 relies on the global
outline always winning. `components/site/course-filters.tsx` pairs `outline-none` with a box-shadow
ring, and today only the unlayered outline keeps that control's focus visible. Layering it would
silently remove a focus indicator.

**This narrows the 2026-09-18 "tokens ported verbatim" decision.** The tokens themselves are
untouched. What changed is the cascade layer of two element rules in the same file. Marked in place,
beside the file's one earlier departure (the dark-theme washes).

**Affected.** `frontend/app/tokens/semantic.css`. Recorded in
`docs/phases/unit-5/FOLLOW_UP_CLOSURE.md`, confirmed independently in `REVIEW_CLOSURE.md`.

---

## 2026-09-22 — An admin's `Assistant.scope` reads `all_groups`

**Context.** `GET /admin/assistants` read a missing `assistant_scopes` row as "never configured"
for every account, which is correct and fail-closed for an assistant. Admins are unscoped by role
(`STAFF_ADMIN` never reaches `StaffScopeService`) and have no row, so the list told the teacher
their admin reached "0 groups". Unit-5 closure review, finding C-1.

**Chosen.** `scope: 'all_groups'` for `role = admin`, on both halves of the merged list:
- **Active admin accounts** have no scope row; `fromUser` reads them as `all_groups`.
- **Pending admin invitations** carry whatever `scope` the body sent. The invite panel hides Reach for
  an admin but still sends its last value, so a pending admin could store `assigned_groups` and list as
  "0 groups" (re-check finding R-1). `invite` and `update` now store `all_groups` for an admin,
  whatever the body sent.

An unconfigured assistant is unchanged: it still reads as reaching nothing.

**This path does touch authorization state, and its first version got that wrong** (re-check 2,
R-2). The first fix keyed the stored scope off the **body's** `role`. `update` never changes an
account's role, so `PATCH` of a real assistant with `role: admin, scope: assigned_groups` stored
`all_groups`: the assistant was widened to every group and failed open. The caller had to be a
teacher or admin, who could grant that anyway, and the widening was audited. It was still wrong.

**Resolution:**
- The helper takes the role that will actually be stored. An account uses its own role; an
  invitation uses the body's role, which is what it stores.
- A mismatched body is **not** refused with a 400. That would be new API behaviour nobody decided
  on. The same body now stores `assigned_groups` and, as before this change, clears the assistant's
  group list. That errs toward less access (fail-closed), and the audit entry records it.

`StaffScopeService` never reads an admin's scope, so the admin half is a response correction only.
`API_SPEC.yaml`'s `Assistant.scope` states the rule. Specs cover the active-admin, pending-admin,
edit, unconfigured-assistant and mismatched-role cases.

---

## 2026-09-22 — Unit 6: the user rules on the planner's six blockers (`D-28` … `D-33`)

**Context.** `docs/phases/unit-6/PHASE_PLAN.md` §8 scoped six questions out of unit 6 (`B-1` …
`B-6`), each with a recommended reading marked as an *assumption*. On 2026-09-22 the coordinator and
the user approved slices 6a–6e and ruled on all six, each as the planner's recommendation. The rulings
below are therefore **decisions**, not assumptions, and slices 6f–6k are built on them. Because `B-1`
and `B-4` add or narrow columns, both were folded into migration `018` before it first ran — no `019`.

### `D-28` — `B-1`: `visibility` stores `published | hidden`; `scheduled` is derived, not stored (reading C + iii)

- **Stored:** `published | hidden` only (migration `018`'s CHECK). No `publish_at`.
- **`scheduled`** is the derived *label* for `published ∧ now < availableFrom`. A published task with
  a future window already reads to a student as `locked` with its opening date
  (`assessments.service.ts` `computeStatus`), so storing `scheduled` would add a second source for a
  fact the window already holds (planner finding 1).
- **`hidden`:** no row in the student list, and a 404 on the student detail and submit routes whose
  body is identical to a genuine miss.
- **Hiding a task that has any submission is refused with 409** (reading iii), mirroring
  delete-refused-once-submitted. It loses no student-visible history and is relaxable later.
- **Narrows** `PRODUCT_SPEC.md` §2.1, `DOMAIN_MODEL.md` §4 and `DATABASE_PLAN.md` §2, which each
  described a three-value stored enum. All three are amended.
- **Rejected:** A (published tasks vanish until they open — a behaviour change for every existing
  future task); B (a `publish_at` column and a second timestamp nobody asked for).

### `D-29` — `B-2`: a per-attachment `audience`; audio joins the staff upload whitelist (reading B)

- Every attachment carries `audience: 'students' | 'staff'`. The student `GET /assessments/:id`
  returns only `students` attachments. A mark scheme is `staff`.
- `audio/mpeg` and `audio/mp4` join the staff upload whitelist. Both are non-executable.
  `UploadType.kind` is decoupled from `BlogMediaKind` so the whitelist no longer speaks the blog's
  vocabulary.
- **Security note kept, not solved:** `/uploads/*` is served without authentication (`SECURITY.md`
  §4), so a `staff` attachment uploaded to local storage is reachable by anyone holding its UUID URL.
  `audience` governs what the API *returns*; it is not access control on the file itself. That lands
  with signed URLs on R2. Production is `STORAGE_DRIVER=none` meanwhile, so attachments there are
  pasted URLs.

### `D-30` — `B-3`: the staff task status is derived from the window; no per-row counts (reading a)

- `open` = `now ≤ dueAt`; `marking` = past due with any ungraded submission; `marked` = all graded.
- No per-row submission counts in unit 6. They are unit 7's queue (`MARK-3`).
- **Edges nobody ruled on are recorded, not invented** — see `docs/phases/unit-6/EXECUTION_NOTES.md`
  §Rulings after execution. ~~A task in an unruled state carries `status: null` and matches no
  `status` filter.~~ **Superseded on nullability by `D-34` (`closed`) and `D-35` (the latest due date
  drives it): the status is total and never null.**

### `D-31` — `B-4`: a `submission_modes TEXT[]` column; multi-file is unit 7's (reading B)

- `assessments.submission_modes` stores any of `pdf_upload | doc_link | photo_upload`. Empty is "not
  stated", which is every row that predates it.
- The multi-file (≤ 5 photos) submission model is deferred to unit 7.
- `allowResubmission = true` keeps today's cut-off: the window end (`availableTo`), not `dueAt`.

### `D-32` — `B-5`: only the teacher and admins name a marker (as recommended)

- Only the teacher and an admin may set or change `markerId`. An assistant sending a non-null
  `markerId` gets **403** — the task is on their screen, so the anti-enumeration 404 does not apply.
- A named marker must be the teacher, an admin, or an **active** assistant who reaches **every**
  targeted group. Anyone else is a **400**.
- Later drift (targets or the assistant's scope change) is **displayed**, never silently cleared.
- `markerId: null` means "whoever opens it first". The claim-on-open is unit 7's.

### `D-33` — `B-6`: unit 6 closes the targeting-write half of `AUTH-6` (reading A+)

- An assistant may not **add** an unheld group on `create` or `setTargets`. Each id goes through
  `StaffScopeService.mayReachGroup`, and the refusal is a **404 whose message is byte-identical** to
  `Group <id> is not enrolled in this course` for the same input.
- `setTargets` by a scoped caller on a task whose current audience includes a group they cannot
  reach is a **403**: it refuses rather than silently dropping targets the caller cannot see, and the
  task is on their screen.
- `GET /staff/courses/:id/groups` narrows to the groups the caller holds, so the authoring picker is
  honest.
- **Narrows `AUTH-6`** (`IMPLEMENTATION_PLAN.md`) to its remainder: the roster,
  `GET /staff/courses/:id/submissions`, the analytics pair, the per-course assessment list, and
  `PATCH`/`DELETE` of a task shared with an unheld group.

**Affected.** Migration `018`; `assessment-authoring.service.ts`, `assessments.service.ts`,
`groups.service.ts`, `upload-types.ts`; `API_SPEC.yaml`, `DATABASE_PLAN.md`, `DOMAIN_MODEL.md`,
`PRODUCT_SPEC.md`, `AUTHORIZATION_MODEL.md`, `IMPLEMENTATION_PLAN.md`. Slice detail:
`docs/phases/unit-6/EXECUTION_NOTES.md`.

---

## 2026-09-22 — Unit 6: assumptions taken without a blocker, and one oracle closed

**Context.** Beyond the six rulings above, `PHASE_PLAN.md` §8 took four assumptions the reviewer may
overrule, and one finding changed existing behaviour. Recorded as decisions so they are not mistaken
for accidents.

- **A-1: a draft's `courseId` is fixed after creation.** `PATCH /staff/task-drafts/:id` does not
  accept it (the DTO omits it and the whitelist strips it). Moving a draft between courses would need
  a two-course scope check for no product reason.
- **A-2: authoring from a draft copies content in the form; the body is authoritative.** `draftId` is
  provenance and bumps `usedCount` in the same transaction. The server merges nothing from the draft,
  so "copied, never linked live" (`DOMAIN_MODEL.md` §4) holds by construction.
- **A-3: at most 10 attachments** per task or draft. A storage bound, not a product rule.
- **A-4: filters narrow, they do not address.** An unreachable or unknown `courseId`/`groupId`
  *filter* on `GET /staff/task-drafts` or `GET /staff/tasks` answers `200 []`, identically.
- **Existence oracle closed (plan finding 2).** Before unit 6, a real task on an unreachable course
  answered `PATCH`/`DELETE /staff/assessments/:id` and `POST …/targets` with
  `Course not found or not assigned to you`, and a nonexistent id with `Assessment not found`: both
  404, different bodies. Both now say `Assessment not found` (`ASSESSMENT_NOT_FOUND`, asserted `===`).
- **No own-only rule on drafts.** `AUTHORIZATION_MODEL.md` §3 grants the assistant "Manage the draft
  library" without the blog's "own only" qualifier, so any staff member in scope edits any draft in
  scope. Stated so nobody adds a creator check by analogy with the blog.

**Affected.** `task-drafts.service.ts`, `assessment-authoring.service.ts`, the DTOs, `API_SPEC.yaml`.

---

## 2026-09-22 — `D-34`, `D-35`: the two `D-30` edges, ruled after execution; two follow-ups placed

**Context.** Unit 6's executor stopped on two cases `D-30` did not reach and returned `status: null`
for them rather than guess (`docs/phases/unit-6/EXECUTION_NOTES.md`). The user ruled on 2026-09-22.

### `D-34` — a fourth staff status, `closed`: past due with nothing to mark
- A task past its (latest, `D-35`) due date with **zero submissions** is `closed`. That includes link
  and Google Form work, which has no submission rows of its own.
- Rejected: `marked` (a task nobody handed in would read as done).
- Enum, DTO filter, `API_SPEC.yaml` `StaffTaskStatus`, `lib/types.ts` and the task list all carry it.

### `D-35` — the latest due date drives the status
- A task stays `open` until **every** targeted group is past its own due date (override, or the
  task's). After that it is `marking`, `marked` or `closed` as normal.
- Rejected: the earliest due date; a per-group status.
- **Consequence:** with `D-34` and `D-35` the status is total — never null.

### Placed, not built
- **Submission-mode enforcement** (what `D-31`'s modes admit at submit time) moves to unit 7 as
  `MARK-6`, beside the multi-file model.
- **An admin naming the teacher as marker** is accepted as a limitation for now (`TASK-F1`): the
  teacher picks themselves, and an existing teacher marker is preserved.

**Affected.** `assessment-authoring.service.ts` (`staffTaskStatusOf`), `staff-tasks-query.dto.ts`,
`API_SPEC.yaml`, `frontend/lib/types.ts`, `manage/tasks/page.tsx`, `IMPLEMENTATION_PLAN.md`.

---

## 2026-09-22 — Unit 6 review round 1: `D-36`, `D-37`, and two executor interpretations recorded

**Context.** `redesign-reviewer` returned `APPROVED WITH FOLLOW-UP` (`docs/phases/unit-6/REVIEW.md`).
The user ruled on the two open questions it surfaced; the remediation is in the commit after
`82b5d78`.

### `D-36` — synced external results count like submissions: hide **and** delete are refused (review `F-3`, "refuse both")
- A task with any synced external result (a Google Form response, matched to a student or not) can
  no longer be **hidden** (409) or **deleted** (409). Counted with `WorkRepository.tallyResults`.
- **Supersedes** the executor's deviation 8 (the hide guard counted only `assessment_submissions`,
  mirroring the delete guard) **and the pre-existing delete behaviour**, which let a task with synced
  results be deleted and cascaded its `external_results` away (`010`'s `ON DELETE CASCADE`).
- **Inconsistency kept, not silently "fixed":** a delete refused for `assessment_submissions` is still
  a **400** (pre-existing, e2e-asserted); the new external-result refusal is a **409**, the code
  `CLAUDE.md` §6 names for a state conflict. Aligning the older one is a separate call.

### `D-37` — the staff `scheduled` label follows the **earliest** group opening (executor deviation 3)
- `scheduled` = `published ∧ now <` the earliest effective `availableFrom` across the targeted groups
  (each group's override, or the task's own). The label reads *Published* as soon as any group can
  see the task. Judged over the whole audience, so every viewer gets the same label.
- Before: the task's own `availableFrom` only, ignoring overrides.

### Executor interpretations, recorded as the reviewer asked (`F-6`)
- **Deviation 2 (endorsed by review):** a hidden task (`D-28`) is dropped from **every** student read
  — list, detail, submit — **and** from `getPerformanceEntries` (what a report averages) and the staff
  `studentWork` read, which is documented to agree with the student's own screen. One predicate,
  `isVisibleToStudents`, serves all five.
- **Deviation 8 (superseded by `D-36`):** the hide guard mirrored the delete guard and ignored external
  results. No longer true for either.

### Also from the review
- **`F-5`:** the memory driver now matches `018`'s `draft_id ON DELETE SET NULL`: `TaskDraftsService.
  remove` clears provenance through `AssessmentRepository.clearDraftProvenance` in the same
  transaction, so both drivers leave the same state (a service-level join; no repository calls
  another).
- **`F-1`:** an unchanged `markerId` is not re-validated, so a drifted marker no longer blocks editing
  the task — `D-32`'s "displayed, never cleared" holds on the edit screen.

**Affected.** `assessment-authoring.service.ts`, `task-drafts.service.ts`, both assessment drivers,
`task-form.tsx`, `drafts/page.tsx`, `API_SPEC.yaml`, `DOMAIN_MODEL.md`, `IMPLEMENTATION_PLAN.md`.

---

## 2026-09-22 — `D-32` clarified: an unchanged marker is a no-op for everyone (re-check 1, `R1-1`)

**Context.** Review round 1's `F-1` made `update` skip the marker check when `markerId` equals the
stored value. The reviewer's re-check noted that this also covers an **assistant** re-sending the
task's *current, non-null* marker: before `F-1` that was a 403 under `D-32`'s "an assistant sending a
non-null `markerId` gets 403"; now it is a 200 that changes nothing.

**Decision (coordinator, 2026-09-22): keep the no-op.** It matches the no-op `D-32` already allowed an
assistant — sending `null` on an unmarked task. `D-32`'s rule is read as **"an assistant may not
*change* the marker"**: setting a different one, or clearing one someone chose, is still **403**. A
value identical to what is stored changes nothing, so there is nothing to refuse.

**Pinned by** a unit test and an e2e test (`R1-1`): the same marker → 200 with the marker kept; a
different marker → 403; clearing a set marker → 403 (unit).

**Also filed:** `TASK-F3` (align the submissions-delete refusal to 409) and `TASK-F4` (Postgres
work/credential integration coverage, `tallyResults` first).

---

## 2026-09-23 — Unit 7 (marking and the mark book): rulings `D-40`…`D-46`, `D-38`/`D-39` withdrawn

The unit-7 plan (`docs/phases/unit-7/PHASE_PLAN.md` §8) escalated nine blockers. The user accepted all
nine recommendations, then — the same day, before anything of `MARK-6` shipped — **withdrew `B-1` and
`B-2`** with the instruction to escalate the `MARK-6` design question rather than decide it.

### `D-38`, `D-39` — `B-1`, `B-2` (`MARK-6`): **accepted, then withdrawn**
Recorded so the ids are not reused and so the history of migration `019` is readable. Both remain
**open blockers**, escalated to the user:
- `B-1`: what each submission mode (`pdf_upload | doc_link | photo_upload`) admits at submit time, and
  whether a typed answer survives on a task that states modes.
- `B-2`: whether students may upload files directly, what happens while file storage is off in
  production, and whether a resubmission replaces the whole photo set.
A stopped executor had folded a `files JSONB` column into `019` under them; it was **removed** before
`019` ran anywhere but disposable test databases, so `019` was edited in place. Whatever is decided
becomes `020`.

### `D-40` — `B-3`: the web app may use `pdfjs-dist` (reading A)
Pinned exact at **6.3.289** (past 4.2.67, the CVE-2024-4367 floor), lazy-loaded on the marking routes
only, worker bundled from the app's own origin. From v5 pdf.js has no `isEvalSupported` path, so the
flag the plan named no longer exists. **Contradicts** `redesign-mapping.md`'s "none go in"; that line is
narrowed, not the ruling. `@napi-rs/canvas` arrives as pdf.js's Node-only optional dependency; the
browser never loads it.

### `D-41` — `B-4`: only platform-stored files are annotatable (reading A)
A pasted URL is graded with a mark and feedback and shown as "Open original": fetching it would be an
SSRF-shaped proxy, auto-loading it would leak staff IPs. **Consequence, stated plainly:** with `B-2`
open no student route can store a file, so no real submission is annotatable yet in any environment;
in production it also needs an R2 driver (`MARK-F1`, not built).

### `D-42` — `B-5`: annotation authorship and lifecycle
(a) Only a mark's author may change or erase it — a 403, since the mark is on the caller's screen.
(b) **Marking up a returned paper is allowed and audited**, like a re-grade; the student sees it at
once. (c) Resubmission rules unchanged; marks on a replaced file are kept and counted as stale.

### `D-43` — `B-6`: the marker is advisory; the first mark claims (reading A)
The first saved mark **or** first annotation on a task with no marker names the actor, when they
qualify under `D-32`'s rule (teacher, admin, or an active assistant reaching every targeted group).
Atomic, audited as `assessment.updated`. Never on a read (`GET` never mutates). An assistant reaching
only some targeted groups saves the mark and the task stays unclaimed — the claim writes nothing
`D-32` would refuse to name directly. The tasks list reads "First to mark", not "First to open".

### `D-44` — `B-7`: `/grade` and the course queue move to the group grain (reading A)
`POST /staff/submissions/:id/grade` was course-grained and **missing from `AUTH-6`'s remainder list**;
it now uses the same gate as `/return` and the annotation routes. `GET /staff/courses/:id/submissions`
narrows its **items** to held groups in the query. Its per-task **averages stay course-wide** for every
viewer — the recorded residue, as `D-35`'s was — because narrowing them makes a number change with who
is looking (`D-23`). The course tab gains Return and Save and return.

### `D-45` — `B-8`: the mark book's total is "Average of marked work" (reading (a))
The mean of a student's per-task shares over work **marked in the platform** (saved or returned), with
no term (none exists in the model) and never labelled "term". **Interaction with `D-46`, recorded:**
`D-45` says "`GROUP-4`'s arithmetic", which counts only platform submissions, so mirrored Google Form
scores are shown as columns but **not** averaged; the mark book and the group report agree. If the
teacher expects quizzes inside the average, that is a new ruling, not a fix.

### `D-46` — `B-9`: Google Form scores appear in the mark book (reading (b))
Labelled mirrored, with the form's last sync time and its unmatched-response count. Each cell is the
student's **latest** matched response, chosen in the query (`findLatestScoresForStudents`, both drivers)
— which surfaced `MARK-F2`: the older per-student analytics read picks the *oldest* on Postgres.

### Assumptions taken without a blocker (plan §8, A-1…A-14), kept
A-1 the backfill `returned_at := corrected_at`; A-2 the resubmission freeze stays on `corrected_at`;
A-3 return needs a mark (409), a re-return is a no-op with no second audit entry; A-4 a re-grade after
return is visible at once; A-5 `includeInReport` deferred to unit 9 (removed from the `/return` body);
A-6 the per-task queue is 409 for link and form work; A-7 one row per student at their earliest
reachable placement, lateness by their own resolving group; A-8 staff see saved-not-returned marks in
the mark book, hidden tasks excluded; A-9 CSV names only, not audited; A-10 kinds
`comment | tick | cross | pen | highlight`, the eraser is a DELETE; A-11 storage bounds (page ≤ 500,
text ≤ 2000, 2–2000 points, ≤ 500 marks per paper); A-12 one `submission.annotated` action; A-13 the
annotation repository in `assessments/`, the service in `manage/`; A-14 no one-submission GET.

### Closed
`TASK-F3`: deleting a task with submissions is now **409**, agreeing with `D-36`'s own refusal.

### Document conflicts found while planning (plan, "Conflicts between documents")
1. `PHASE_ROADMAP.md` unit 7 said `MARK-5` was blocked by `D-2`, which closed 2026-09-20 — fixed.
2. `PRODUCT_SPEC.md` §2.2/§10 and `DOMAIN_MODEL.md` §4 still called the overlay question open — fixed.
3. `DATABASE_PLAN.md` §3, `DOMAIN_MODEL.md` §4 and `API_SPEC.yaml` allowed only comment/tick/cross, no
   stroke path; `D-2` includes freehand strokes — amended to `D-2`.
4. `includeInReport` sat on `/return` in `API_SPEC` and on `/grade` in `API_GAP_ANALYSIS` A7, which also
   modelled save-without-return as a flag — two operations kept, `includeInReport` deferred (A-5).
5. Non-submitters: `API_GAP_ANALYSIS` A7 put them on the course queue, B4 and `API_SPEC` on the per-task
   route — the per-task route only.
6. `markbook.csv` was in `API_GAP_ANALYSIS` B5 but not `API_SPEC` — added.
7. `MARK-1` "4 routes" vs `API_GAP_ANALYSIS`'s 6 — both right about different sets; no change.
8. `AUTHORIZATION_MODEL.md` §4 and `CLAUDE.md` §7 left `/grade` off `AUTH-6`'s list — closed by `D-44`.
9. Tool names: `PRODUCT_SPEC` "pen and highlight" vs `D-2` "marker and eraser" — both kept (A-10).
10. `redesign-mapping.md` "none go in" vs `D-40` — narrowed.
11. `PRODUCT_SPEC.md` §2.1 promises PDF and photo upload; no student upload exists — open as `B-2`.
12. `ARCHITECTURE.md` §6 places annotations in `manage/` — refined by A-13.

---

## 2026-09-23 — `MARK-6` ruled: `D-47`, `D-48` (unit 7, slice 7i)

The user: *"Go with what you recommend for MARK-6."* `B-1` and `B-2` close on the plan's §8
recommendations. They take **new ids** because `D-38`/`D-39` stay on record as accepted then withdrawn.

### `D-47` — `B-1` (reading A): submission modes are the rule
A task stating no modes keeps the old rule (a public link and/or a typed answer). A task stating modes
takes exactly one mode per submission: `pdf_upload` = one uploaded PDF; `photo_upload` = 1–5 uploaded
JPEG/PNG/WebP photos; `doc_link` = one public link. A typed answer goes with any of them as a note, never
alone. `allowedFileTypes` is **derived** from the modes whenever modes are stated.

### `D-48` — `B-2`: students upload directly; file sets
(a) A student upload route, `POST /assessments/:id/files`, with its own contract (types from the modes,
`min(task cap, 20 MB)`, its own rate limit). (b) Authoring refuses an upload mode while the server stores
no files — never a quiet link in place of a promised file. (c) A resubmission replaces and archives the
whole set. (d) No HEIC. Storage reading A: a `files JSONB` list (≤ 5) on submissions and revisions,
migration **`020`**. `DATABASE_PLAN.md` §7 renumbered again: sessions rework is now `021`.

### Assumption A-15, recorded for the reviewer
The submit route accepts a file only if it is platform-stored and of the right type, but it does not
prove the student uploaded it (`MARK-F5`). Equivalent to handing in someone else's file; no data exposed.

### The browser pass for 7h
Reported **complete by the user** on 2026-09-23. It was performed by the user, not observed by the
coordinator. The 7i screens (the student upload form, the multi-file marking view, the authoring gate)
came after it.

---

## 2026-09-23 — Unit 11 (Google Forms surface): frontend mirror drift fixed, no `Modal` built, `WORK-4` blocked on implementer capacity

**Frontend mirror drift, found and fixed.** `frontend/lib/types.ts`'s `AssessmentListItem` was
missing `workType`, and `AssessmentDetail` had no `work: WorkExpectation` field at all — both
already returned by the backend (`backend/src/assessments/assessments.service.ts`) on routes this
unit's own screens call. This is exactly the class of bug §6 already warns about (the `AuditAction`
union carrying 6 of 27 members). Fixed as a mirror correction in the same change that consumes the
fields — not a backend change, not scope creep.

**No `Modal`/`SlideOver` primitive built.** `docs/redesign-mapping.md` decision 4 proposed promoting
one into `components/feedback/`, but it was never executed and no such component exists anywhere in
`frontend/components/`. Building one is a cross-cutting decision other units will also want, not
this unit's job. The "view raw response" and "match to student" interactions on the new task results
screen use inline expansion / inline form controls instead — the same pattern
`manage/students/[id]/page.tsx` already uses for its editor. If a shared `Modal` lands later, these
can move to it without any data-layer rework.

**`WORK-4` (student Quizzes surface) is blocked on implementer capacity, not a requirements
question.** Every `agy` model available to this pipeline —`claude-sonnet-4-6`,
`gemini-3.1-pro-high`, `claude-opus-4-6-thinking`, `gemini-3.8-flash-high` — returned
`RESOURCE_EXHAUSTED (429)` on what turned out to be one shared account-wide quota, the same day.
Recorded rather than worked around: a precise, self-contained build checklist is in
`docs/phases/unit-11/REVIEW.md` §"Slice C checklist" so the next implementer (any model, once
capacity returns, or a human) can act without re-deriving anything. Unit 11 stays `[~]` until it
lands.

**Blocker recorded, not built around:** `GET /staff/courses/:courseId/students/:studentId/work`
(`StudentWorkResult[]`) has no consuming screen named in `WORK-1`..`WORK-4` or in
`docs/redesign-mapping.md`'s screen lists. Not built this unit — left for whichever later unit
(13/14, student or staff profile work) decides it wants a per-student cross-task work table.

---

## 2026-09-23 — Unit 10 (announcements, slice 10a): `D-ANN-1`, `D-ANN-2`, `B-ANN-1`, `B-ANN-2`

On `origin/redesign` these entries sat inside that branch's own unit 7 entry, which this line does
not carry (see the 2026-09-23 reconciliation entry). Moved here verbatim.

### `D-ANN-1` — unit 10 (Announcements): `/admin/announcements/reach` moves to `/staff/announcements/reach`
Two documents disagreed. `API_SPEC.yaml` stubbed `GET /admin/announcements/reach` with
`x-roles: [assistant, teacher, admin]`; `CLAUDE.md` §6's route-split rule is explicit that `/admin/*`
is teacher-and-admin-only, unscoped — an `/admin/*` route cannot legitimately name `assistant`. That
is a finding, not a typo to quietly correct: the two documents said different things about who may
see reach. **Resolution:** the route's *placement* was wrong, not its permissions — `assistant`
belongs in the roles list, so the route moves to `/staff/announcements/reach` (all three roles,
`StaffScopeService`-checked like every other `/staff/*` route). `API_SPEC.yaml` corrected in the same
change (unit 10, slice 10a). Nothing implemented this route before the correction, so there is no
back-compat cost.

### `D-ANN-2` — unit 10: a published announcement IS editable (reverses the planner's initial assumption)
The unit-10 phase plan originally assumed a published announcement is immutable — no `PATCH` once
`published_at` is set — reasoning from the pre-existing `PostgresAnnouncementRepository`'s own
docstring ("insert-and-read only... a retraction is a second announcement"). **The user ruled
otherwise, via the coordinator: a typo in a published announcement must be correctable.** `PATCH`
now works on a published row, editing title/body/media. The **audience** stays refused (`409`) once
published — widening it after send would mean recipients who never received the original mail, and
building a delta fan-out for that is a feature nobody asked for; refusing it is both the lazy and
the honest answer. `DELETE` was not part of this ruling and stays refused on a published row,
flagged as its own open follow-up rather than assumed either way. The `published_at` column, already
the guard behind idempotent publish, now also guarantees an edit can never re-trigger the send: only
`publish()`'s own guarded `UPDATE` ever sets it, and `updateDraft()` never touches it.

### `B-ANN-1` — unit 10: TAs cannot publish announcements
Fixed a bug introduced earlier in unit 10 where a TA assigned to a course or group could publish an announcement targeted at it through `/staff/.../publish` routes, bypassing teacher/admin review. The staff publish routes were removed, and the `publish()` service method now unconditionally enforces the `teacher` or `admin` role for all announcements, closing the loophole.

### `B-ANN-2` — unit 10: TAs cannot retarget announcements to platform-wide audiences
Fixed an authorization hole introduced by round 1's fix where `PatchAnnouncementDraftDto` gained an `audience` field for admin retargeting, but remained shared with the staff patch routes. Because `updateDraft()` only scoped course and group audiences, assistants could retarget their drafts to `all_students` or `all_tas`. Split the DTO into `PatchAnnouncementDraftDto` (staff, no audience) and `PatchAdminAnnouncementDraftDto` (admin only, carries audience), and added a belt-and-braces role check in `AnnouncementsService.updateDraft()`.

## 2026-09-23 — `D-SET-1`: `GET /admin/courses/:courseId` added; the course edit form read a student-only route

Unit 12's course edit form fetched detail through `api.courses.get` → `GET /courses/:id`, which is
`@Roles(Role.Student)`. **Every teacher, admin and assistant who opened "Edit" got a 403** — the
feature worked for nobody who could reach it. The unit had compensated by adding `slug` to
`toListItem`, which builds `CourseListItem`, the *student* enrolled-courses response; that addition
existed only to feed the wrong endpoint and has been reverted.

Three options were weighed. Serving the form from the row data the list already holds was preferred
and is not available: `ManageCourseCard` carries none of `slug`, `description`, `thumbnailUrl`,
`sequentialLockEnabled` or `isPublished`. Widening the staff overview response to carry them would
push admin-only edit fields into a payload an assistant also receives. So:

**Ruled (user, 2026-09-23): add `GET /admin/courses/:courseId`.** It mirrors the `PATCH` that
already lives on that path exactly — same controller, same class-level `@Roles(...STAFF_ADMIN)`
(which never contains `Role.Assistant`), same `Course` response, reusing `courseRepo.findById` and
the existing `COURSE_NOT_FOUND`. It is a read, so no `x-audit`. Both directions are proven over
HTTP: teacher and admin 200, assistant 403, unknown id 404.

Recorded as a decision because **adding a route is a scope change**, not a detail — the alternative
readings above are what make it one.

## 2026-09-23 — `B-ANN-3`: a spec rewrite silently deleted 19 tests, including three named invariants

Unit 10's round-1 commit **replaced** `announcements.controller.spec.ts` instead of extending it.
Its 14 new tests correctly cover the new draft/publish/reach lifecycle, but all 19 pre-existing
tests went with the old file — and about fifteen behaviours were left with no test anywhere in the
repository. Among them: *"takes the audience from the URL, so a TA cannot widen it from the body"*
(the structural invariant `B-ANN-2` is about), *"does not store a recipient list, only how many
there were"* (§5.14's PII rule), and *"records the teacher as teacher, not as an assistant"* (the
`actorRoleOf` attribution rule that fourteen hand-written ternaries once got wrong).

**Three independent reviewers passed over this unit and none caught it**, because each was given
the round-2 diff to review and the deletion happened in round 1. It surfaced only at merge, when the
backend unit count fell from 698 to 693 — a merge that removes tests is the signal.

The coverage was restored against the current module rather than pasted back from the old file, the
module having changed underneath it (`posted_at` → `published_at`, publish split out as its own
step, the staff publish routes deleted).

**The durable lesson, worth more than the fix:** a green suite says nothing about what a rewrite
took away with it. Compare test counts across a merge, and treat a shrinking spec file as a finding.

## 2026-09-23 — Unit 10 complete: slice 10b, and what the UI is allowed to decide

Slice 10b (the announcements compose and drafts surface) landed, completing unit 10. One rule
governed every gating choice on the screen and is worth stating once, because it recurs on every
console surface: **the UI offers nothing the server refuses, and the server refuses regardless of
what the UI offers.** Publish is rendered only for an admin on a draft; delete only while
unpublished; a published announcement shows its audience read-only with the reason. Each of those
mirrors a server rule that is independently enforced and independently tested. Hiding a control is
courtesy (§11.1.5) — the screen is easier to trust when it never dangles an action that will 403.

Media handling took the same line. A YouTube URL is not interpolated into an `iframe src`; the video
id is extracted behind a hostname allowlist and a `youtube-nocookie` URL is reconstructed from it, so
author-supplied text never becomes markup. Announcement bodies render as paragraphs — no
`dangerouslySetInnerHTML` anywhere on the surface.

Removed before commit: an unrequested debounced search box over the announcement list. §1's scale
numbers are the test — a list this size does not get search furniture.

---

## 2026-09-23 — Reconciliation: units 10–12 ported onto the unit 7 line; the remote's parallel unit 7 dropped

`redesign` had split at `6657c7a` into two lines: local carried a reviewed, `APPROVED` unit 7;
`origin/redesign` carried units 10–12 and a separate, partial unit 7 (7a–7c). The two unit 7s were
incompatible — both numbered a migration `020`, and `D-39`…`D-45` named different rulings on each
line. **The user ruled:** keep the local unit 7, port units 10–12, drop the remote's 7a–7c.

- **Not carried:** the remote's `020_marking.sql` and its `D-38`…`D-45` entries. On this line those
  codes mean only what the unit 7 entries above say.
- **Migrations keep their numbers:** `021` announcements, `022` notification preferences — neither
  depends on `020_marking`. `DATABASE_PLAN.md` §7 renumbered: sessions `023`, attendance `024`,
  weekly reports `025`.
- **Found and fixed while porting:** the remote backend did not typecheck (29 errors; `nest build`
  failed), and `PostgresAnnouncementRepository.remove` called a `db.execute` that does not exist, so
  deleting a draft threw on Postgres. Test added, verified failing first.
- Follow-ups `RC-F1`…`RC-F4`. Full record: `docs/phases/RECONCILE_UNITS_10_12.md`.

---

## 2026-09-23 — Unit 14 (Google sign-in and contract hygiene): rulings `D-49`…`D-52`, finding F-1

Taken out of order by the user (units 8, 9 and 13 not built). The documents did not answer four
questions; they were put to the user before planning and ruled on the recommendations.

### `D-49` — a Google email that matches an unlinked account: refused, link from the account
Sign-in resolves a Google identity only through a link (`user_google_identities`, keyed by the OIDC
`sub`). A matching verified email is refused with "sign in with your password, then connect Google
from your account settings", and **nothing is linked**. Linking happens only inside a signed-in
session, whose `sub` must equal the one in the signed `state`. This is `SECURITY.md` §2.6's "never
auto-link by email" as a mechanism, not a habit.

### `D-50` — no account is created through Google
An unknown Google account is refused. Sign-up stays on the register form and the waiting queue. **This
narrows the design** ("Google is the primary sign-in method… a password is optional"): every account
keeps its password in this unit, so password-less accounts, removing a password, and Google on the
register and invitation screens are deferred.

### `D-51` — the staff domain pin is an env allow-list; empty means off
`STAFF_GOOGLE_DOMAINS`, checked against the verified `id_token`'s `hd` at link time **and at every
sign-in**, for teacher, admin and assistant. Empty (the default) turns staff Google sign-in off; staff
keep passwords. Students are not pinned. Malformed entries stop the boot.

### `D-52` — `OPS-1` is a backend↔mirror type check, not generation from `API_SPEC.yaml`
**Document conflict, recorded per `CLAUDE.md` §2.3.** `CLAUDE.md` §6 and `IMPLEMENTATION_PLAN.md` said
to generate the mirror from `API_SPEC.yaml` or add a drift check. The spec's own header excludes the
~57 `[KEEP]` routes ("duplicating them would create a second source of truth"), and about 65 of the
~110 paths the frontend calls are not in it. So generating from the spec would drop half the API, and
a spec-based check would fail on day one. **Ruled:** check `frontend/lib/types.ts` against the
backend's own exported types, both directions, in CI (`npm run typecheck:drift`). Units 8 and 9 are
therefore held to the backend, not blocked on the spec. On its first run it found four drifts, all
fixed. One was the `AuditAction` mirror missing four actions, so the activity log again rendered
unlabelled entries: the exact defect §6 cites.

### F-1 — an OAuth `state` token was a working session (security, fixed)
`JwtStrategy` never read a `purpose` claim. The Google Forms connect `state`, signed with the session
secret and carrying `sub` = the teacher, was accepted as a bearer token. It travels in a URL, so
anyone who saw one had **ten minutes of the teacher's access**. This was present since the Forms
integration landed; an e2e got 200 on `/admin/students` with it. The strategy now refuses any token
carrying `purpose`. It was found because §2.6 said to reuse this pattern: a link state names any user,
so reusing it unfixed would have widened the hole to every account.

### `RC-F4` closed — the flaky integration test was the fixture, not the query
Two announcement inserts in the same millisecond of `TIMESTAMPTZ(3)` tie, and `id DESC` over random
UUIDs broke the tie either way. The query's order is stable and complete; the test assumed insertion
order. It reproduced once during the unit 14 review; the fixture now makes the older row older.


## 2026-09-23 — `MARK-2`: a mark existing and a student seeing it become two things

Slice 7d separates **Save** from **Save and return**. `correctedAt` says a mark exists; `returnedAt`
says the student may see it. Until now they were the same instant, so a marker could not put a paper
down half-marked without the student reading it.

`POST /staff/submissions/:submissionId/return` is the release, beside `.../grade`. It shares
`grade`'s authorization shape through an extracted `resolveScoped` — the course comes from the
submission's own assessment, never a URL parameter (§5.11) — and refuses a submission with no mark
with **409**, a state conflict rather than a bad request: the id is fine, the state is not.

**The risky half was the visibility flip, and the distinction that mattered is that not every
`correctedAt` read is a visibility decision.** Two of them guard *mutation*, not sight —
`canSubmit` and `submitAssessment`'s own refusal both stop a student overwriting work the marker is
mid-way through, which must hold whether or not the mark has been handed back. Those keep
`correctedAt`; the rest move to `returnedAt`, and both now carry a comment saying which they are so
the next reader does not "fix" one into the other.

**Gated beyond the brief, correctly.** The brief enumerated the score sites. The implementer also
gated `feedback`, `annotatedFileUrl` and the exposed `correctedAt` itself, on the grounds that
hiding the number while showing the marker's written feedback and the annotated copy leaks the
substance of the mark and leaves `MARK-2` half-done. Adopted — a marked-but-unreturned submission
must read to a student exactly as it did before it was marked, and a visible "corrected on"
timestamp for a mark they cannot see is its own tell.

**`getPerformanceEntries` was the one with teeth.** It feeds the weekly report, which under `RPT-*`
emails a child's marks to a parent and cannot be unsent (§8). Had it kept reading `correctedAt`, a
half-finished marking pass could have reached a parent's inbox. It reads `returnedAt`.

**`submission.returned` is a new `AuditAction`** — union, the query DTO's exhaustive `Record`, and a
spec asserting the entry. It earns its own action rather than riding on `submission.graded` because
releasing is a separate decision with a student-visible consequence. This does **not** reopen
`D-44`: annotations are still audited per save, not per mutation.

**A correction to the brief, found by the implementer:** it claimed the in-memory fixtures already
contained a marked-but-unreturned submission. They do not — all six have `returnedAt === correctedAt`
or both null. The tests build that state themselves. Recorded because the wrong version of that
claim would have produced tests that pass while asserting nothing about the case the slice exists
for.

### Unrelated, found while reviewing 7d: the backend typecheck is broken on `redesign`

`npx tsc --noEmit` reports **29 errors** on HEAD (`635f62b`), none from unit 7 — measured both with
and without 7d's diff by stashing, 29 either way. They sit in `settings/`, `announcements/` and
`students/`, and they are signature drift: `id` no longer exists on the user/course/group creation
types and `StaffActor` gained a required `id`, without the three calling modules being updated.

`CLAUDE.md` §4.1 makes zero the thing to gate on, so this is a regression in the shared branch
rather than a cosmetic issue. Recorded here, not fixed: it is outside unit 7's scope (§12 — record
what you find and move on), and the modules belong to units that landed while unit 7 was in
progress.

## 2026-09-24 — `D-46` and `MARK-3`: the roster, not the rows

Slice 7e adds `GET /staff/assessments/:assessmentId/submissions`. The only staff view of submissions
was a whole course's queue built from rows that **exist**, so a student who handed in nothing
produced no row and was invisible. That is the wrong shape for marking one task: a marker needs the
cohort, with the non-submitters visible *as* non-submitters.

This is the answer to the old "no `missed` status" gap — you do not need a status on a row that is
not there, you need the roster. `AssessmentRosterItem` is deliberately **not** `GradingQueueItem`
with optional fields bolted on: a non-submitter has no `submissionId`, and every submission-only
field is `null` rather than absent, so a caller cannot mistake "field omitted" for "field checked
and empty". `score` is `null`, never `0` — §11.1's em-dash rule, in its API half.

**`D-46`: the route is on the group grain.** §7 requires saying which grain a new staff route sits
on, and this one names an *assessment*, so the answer was not automatic. An assistant sees only
students in groups they hold, even when the task targets groups they do not — a three-group task
shows one group's students to an assistant holding one. It follows `D-33`, which already narrowed
assistants to held groups when *targeting* a task, and `AUTH-2`, which exists precisely because the
course grain handed back every cohort on a course. A submissions view ignoring held groups would
have reopened that leak behind a new route.

The narrowing happens **at read time** via `StaffScopeService.reachableGroupIds`, not by filtering a
wider result afterwards — and the file fetch is restricted to in-scope submissions, so another
cohort's attachments are never even loaded. A task with no reachable target returns an empty list
rather than an error: a filter matching nothing is not a failure.

**Fan-out, checked because §1 says it is still worth checking:** batched throughout — one
`findByIds`, one `findSubmissionsForAssessments`, one `findFilesForSubmissions` — with the only
per-group read being `findMembers`, bounded by ~10 groups. A three-group task issues three of those,
not one per student. A student in two targeted groups appears once.

**The security test proves both directions**, which is the part most easily faked here: it asserts
exact set equality for the assistant *and* that an admin does see the excluded student. Without the
second half the test would pass merely because that student was never created.

Slice 7a's `[~]` was stale and is now `[x]`: all eight methods verified present in
`postgres-assessment.repository.ts`, not merely in the interface.

---

## 2026-09-24 — `F13-1`: the public site was still running on a deleted token vocabulary

**Context.** Unit 13 opened expecting `SITE-1`…`SITE-5` to be a styling pass over pages `CLAUDE.md`
§4.1 describes as already ported. A scan of every `var(--…)` written in `frontend/app` and
`frontend/components` against every custom property actually defined in `app/tokens/*.css` and
`app/globals.css` found **38 distinct undefined properties in 491 references across 24 files** —
`--sp-*`, `--fs-h1/h2/h3/lead/body/display`, `--bg-*`, `--fg-primary`, `--r-*`, `--maxw-*`,
`--h-sm/md`, `--lh-loose`, `--accent-line/press/edge`.

These are the retired Twenty-derived vocabulary, deleted in `ad238a7` along with
`frontend/app/tokens.css`. A CSS declaration whose `var()` names an undefined property with no
fallback is invalid at computed-value time and is dropped, so **every padding, gap, font size,
radius, max-width and line height they named was not applied at all** on the public site.

**Why nobody caught it.** `tsc`, `eslint` and `next build` all pass on a dead token — Tailwind's
arbitrary-value syntax accepts any string, so `p-[var(--nope)]` compiles to `padding: var(--nope)`
and simply renders as nothing. Three independent reviewers have read this code since the tokens
were deleted. §4.1's claim that `components/site/*` "was ported onto the current `components/ui` API
in place" is true of the **component imports** and false of the **token vocabulary**; the two were
conflated.

**This is the third recurrence of one failure class.** §11 rule 1 records 478 colour instances;
`F5-1` records 113 size instances; this is 491. Same root cause every time.

**Chosen.** Repair all 491, and **verify against the compiled stylesheet rather than the source** —
the only check that can see this class. Spacing mapped 1:1 (`var(--sp-N)` was `N × 4px`, Tailwind's
numeric utility N is also `N × 4px`). Colour became named utilities. Marketing type became
`text-m-*`. Responsive headings keep their `clamp()` and hold the token *inside* it rather than a
literal pixel value, so the scale stays one source of truth.

**Two sub-decisions worth recording.**
- **`--r-lg` (16px) collapses to `rounded-md` (8px).** The live system names no 16 step, and
  `docs/frontend-design-system.md` §4 records that the old implementation "ran one step large
  throughout — 16px buttons reading as pills — and correcting that is the single most visible change
  in this rebuild." Restoring 16px would have re-introduced the error the rebuild existed to fix.
- **Marketing small print is body size at a lower tint, not a smaller size.** 46 references named a
  *console* size token (`--fs-base` 13px, `--fs-xs` 12px) on a `[data-surface="site"]` page — the
  scale mixing §11 forbids. The marketing scale has no step below 17px, so the replacement is
  `text-m-body` + `text-fg-3`, mirroring the console's own "a caption differs from a heading by
  tint, not size". One deliberate exception: the wordmark's "English Team" tagline takes a literal
  `text-[12px]`, because 17px under a 20px wordmark collapses the lockup's hierarchy and a lockup is
  not body copy.

**Affected.** 24 files across `app/(site)`, `app/(auth)`, `components/site`, `components/blog`, plus
four console files the same rot had reached. New task `OPS-2` in `docs/IMPLEMENTATION_PLAN.md`:
fail the build on a `var(--x)` naming an undefined property. **A reviewer is the wrong instrument
for this; a resolver is the right one.**

---

## 2026-09-24 — `F13-2`: two same-rank documents disagree about classmate avatars

**Context.** `CLAUDE.md` §2.3 requires that a conflict between two sources at the same authority
level be recorded and raised, not silently resolved.

- `docs/PRODUCT_SPEC.md` §6 — Classmates `[EXISTING]`: **"Names and avatars only. Already correct."**
- `docs/redesign-mapping.md` §Coverage lists classmates under *Maps cleanly* as
  **"classmates (names only — an exact match)"**.

The implementation agrees with the second. `backend/src/groups/classmates.service.ts` returns
**"Name and id, and nothing else"**, and says so deliberately: never email, phone, grades, progress
or attendance, because a classmate list carrying a grade is a leaderboard and that is a different
product.

`PRODUCT_SPEC` calls the current state "already correct" while naming a field it does not return, so
at least one of those two sentences is wrong.

**Not resolved here, deliberately.** Adding avatars would publish **a photograph of a child to other
children**. That is a field-minimisation and privacy decision (`CLAUDE.md` §8, "output filtering and
field minimisation") and therefore business behaviour — §13: never invent it. It is also not a
frontend change: it is a payload change plus a ruling.

**Decision needed from the client:** do classmate avatars ship? `STU-6` stays `[~]` until then,
verified against the narrower reading.

**Affected.** `STU-6`; `docs/PRODUCT_SPEC.md` §6 and `docs/redesign-mapping.md` — one of them needs
correcting once the ruling lands.

---

## 2026-09-24 — `F13-4`: every Google Form task was rendering on two student pages at once

**Context.** `STU-4` was expected to be the four attempt states. Those turned out to be complete
already — `assessments.service.ts:computeStatus` derives
`locked | available | submitted | corrected` from stored timestamps and the submission row on every
read, and the homework page groups them without recomputing. `MARK-2`'s `returnedAt` (unit 7,
landed on `redesign` this morning) is what unblocked the slice.

The real gap was the split. `docs/PRODUCT_SPEC.md` §6 defines two student work surfaces — Homework
is *"**Homework only** — no quiz appears here"*, and Quizzes is *"driven by the existing Google Form
work type"*. **One list endpoint serves both screens.** `/quizzes` filtered to
`workType === 'google_form'`; `/homework` filtered on nothing at all. So every Google Form task
appeared on **both pages**, and read differently on each: a form is submitted on Google and never
reaches `corrected` here, so the same task showed as permanently awaiting marking on Homework while
Quizzes showed it correctly. A student would have been invited to do it again from the wrong page.

**Chosen.** One exhaustive `Record<WorkType, 'homework' | 'quizzes'>` in `frontend/lib/format.ts`,
with both pages reading `isQuizWork` from it.

**Why a `Record` and not a filter on each page.** Two hand-written filters are what produced the
bug, and a third work type would have landed on **neither** page with nothing to catch it. The
exhaustive record makes adding a `WorkType` a **compile error at the one place that has to decide**.
This is the mechanism `CLAUDE.md` §10 already prescribes for the `AuditAction` mirror, adopted here
for the same stated reason: *an array can only prove that what is listed works, never that nothing
is missing.*

**Two axes that are easy to conflate, recorded because the fix depends on telling them apart.**
`workType` (`file_upload | link | google_form`) is **how a task is delivered**; `type`
(`homework | assignment | quiz`) is **what it is called**. §6's Quizzes page is defined by the
*delivery* axis, so that is what Homework excludes. The Homework page keeps all three `type` filter
tabs, because a task labelled "quiz" that is handed in as a file upload is delivered there and has
nowhere else to go. Narrowing on the label axis instead would have hidden working tasks.

**Affected.** `frontend/lib/format.ts`, `app/(app)/homework/page.tsx`, `app/(app)/quizzes/page.tsx`.
Frontend only — no backend, API or schema change. The server already computes and enforces
everything this touches.

---

## 2026-09-24 — `F13-5`: the dead-token class recurred within days, so it stopped being a review item

**Context.** Unit 13 removed 491 references to a retired token vocabulary (`F13-1`) and filed
`OPS-2` — fail the build on a `var(--x)` naming an undefined custom property — as a follow-up.
Before that follow-up was built, **unit 14 reintroduced the same bug**: `--sp-3`, `--sp-6` and
`--sp-8` in the Google sign-in and callback screens, so their spacing rendered as nothing on the
remote. A parallel session caught and fixed the two live instances.

That is the fourth shipment of one defect: 478 colour instances, 113 size instances (`F5-1`), 491
references across the public site (`F13-1`), then 3 more days later. Every one passed `tsc`,
`eslint` and `next build`, because Tailwind's arbitrary-value syntax accepts any string —
`p-[var(--nope)]` compiles to `padding: var(--nope)` and is dropped at computed-value time.
Independent reviewers read the code between each recurrence.

**Chosen.** Stop treating it as something reviewers should catch. `OPS-2` was built the same day
(`frontend/scripts/check-tokens.mjs`, wired into `npm run lint`), and **verified by reintroducing the
exact regression** rather than merely running clean against a tree that was already fixed.

**Why a script and not a lint rule or a PostCSS plugin.** A custom ESLint rule cannot see the CSS
that defines the tokens, and a PostCSS plugin runs too late to name the `.tsx` line that wrote it.
The check needs both halves — every `--x:` in three CSS files, every `var(--x)` in the source — and
that is a 110-line dependency-free script. An abstraction with one implementation and no second in
sight would be the speculative architecture `CLAUDE.md` §13 forbids.

**Affected.** `frontend/scripts/check-tokens.mjs`, `frontend/package.json`. `OPS-2` `[x]`.

---

## 2026-09-24 — `F13-6`: the e2e suite could exit without any reading at all

**Context.** Each e2e file boots the whole `AppModule`. `vitest.config.e2e.ts` already records two
rounds of this failing: file parallelism was disabled when a third concurrent boot killed a worker,
then the pool moved from forked processes to threads when a fourth file brought it back. Unit 14
added a fifth (`google-sign-in.e2e-spec.ts`) and the combined run began dying with `0xC0000409`
**having printed no summary at all** — reproduced directly, not taken on report.

**Why this is worse than a loud failure.** The config's own comment states it: *"A worker that dies
silently is the worst shape a flake can take here, because a reader sees '0 failed' and the total
quietly drops."* It is the same hazard `CLAUDE.md` §10 names for the integration suite — **a suite
that skips itself is indistinguishable from one that passes** — and the reason CI has a guard step
that fails when the integration suite reports zero executed tests. The e2e suite had no such guard.

**Chosen.** `backend/scripts/run-e2e.mjs` behind `npm run test:e2e`; the raw invocation stays
available as `test:e2e:combined`. One file per process, so five booted apps never share one V8 — the
same trajectory the config was already on, continued rather than reversed. And, the part that
matters: it **parses the summary out of every file and fails when one is missing**, so a file that
prints no `Tests N passed` line is an error rather than a silent zero, even on exit 0.

**Alternatives rejected.** Raising timeouts or reducing workers addresses the crash and leaves the
reporting hazard. Splitting the fifth file's cases into an existing one treats the symptom and the
config's comment already warned the next file would hit this. Neither makes a missing summary
impossible to mistake for success, which is the actual defect.

**Affected.** `backend/scripts/run-e2e.mjs`, `backend/package.json`. New task `OPS-3` `[x]`.
Reading restored: **388 passed across 5 files**, where the combined run gave nothing.

---

## 2026-09-24 — `F13-2` CLOSED: classmates carry no avatar

**Context.** Unit 13 raised `F13-2` because two documents at the same authority level disagreed and
`CLAUDE.md` §2.3 forbids resolving that silently. `PRODUCT_SPEC.md` §6 said Classmates was "Names
**and avatars** only. Already correct."; `redesign-mapping.md` said "classmates (**names only** — an
exact match)". The implementation agreed with the second: `classmates.service.ts` returns *"Name and
id, and nothing else"* — never email, phone, grades, progress or attendance.

The conflict was not resolvable in engineering, because adding avatars would publish **a photograph
of a child to other children**. That is a field-minimisation and privacy decision (`CLAUDE.md` §8),
i.e. business behaviour, which §13 says is never invented.

**Chosen — client ruling, 2026-09-24: no avatars.** Classmates stays names-only.

**Consequences.** No code change: the service, the DTO and the screen were already correct, so this
closes as *verified*, not *built* — the same posture unit 12 took with `SET-3`/`SET-5`.
`PRODUCT_SPEC.md` §6 was the document in error and has been corrected at source rather than
annotated, so the next reader does not re-derive the same conflict. `redesign-mapping.md` needed no
change. `STU-6` moves `[~]` → `[x]`.

**Worth keeping.** The finding cost nothing to raise and would have cost a privacy incident to guess
wrong. A spec sentence asserting a field the API does not return is the cheap, visible symptom of a
decision nobody actually made.

**Addendum, same day — what the runner then measured.** Building the check immediately produced
evidence the combined run had been hiding. `staff.e2e-spec.ts` dies with `0xC0000409` about one run
in three **in its own process**, under both the `threads` and the `forks` pool — so it is the weight
of that one file (244 cases, a booted `AppModule`, real bcrypt), not cross-file concurrency. The
config's two earlier rounds had been narrowing toward that without reaching it, because a run that
prints nothing tells you nothing.

The runner allows three attempts per file, **only** when a run produces no summary at all, with a 5s
pause between them (the crashes cluster: three back-to-back attempts all died where spaced ones did
not). This provably cannot mask a real failure — a genuine failure prints `N failed` and is counted
on the first attempt, never retried. Five consecutive full runs then came back 388/388, with retries
fired and reported in three of them.

Recorded rather than smoothed over: **the suite is green; the machine is not.** Whoever adds a sixth
e2e file, or moves CI to a different runner, should read this first.

---

## 2026-09-24 — `STU-3`'s material relation: follow the design

**Context.** Unit 13 built lesson detail but left one quarter of `PRODUCT_SPEC.md` §6's row unbuilt
— *"Player, chapters, the work set from it, **its material**, and a 'Next recording' card"*.
`materials` carried `course_id` and `category` and **nothing naming a lesson**, so there was no join
to derive it from. The two available wrong answers were inventing a relation, or quietly rendering
the whole course's materials as though they were this lesson's. Both were refused under §13 and the
gap was recorded instead.

**Chosen — client ruling 2026-09-24: follow the design.** Migration `025` adds
`materials.lesson_id`.

**Three shape decisions, each with a reason rather than a default.**
- **Nullable, and null is the *normal* case.** Most materials belong to the course as a whole — a
  syllabus, a formula sheet, a past-paper pack — and only some are the handout from lesson 4. A
  `NOT NULL` column would have forced every existing row to claim a lesson it does not have.
- **`ON DELETE SET NULL`**, matching `assessments.lesson_id` exactly. Deleting a lesson must not
  delete the course's files; the material outlives the outline entry that referenced it and stays
  reachable on the course's own Materials page.
- **Partial index** on `(course_id, lesson_id) WHERE lesson_id IS NOT NULL`, beside the existing
  category index rather than replacing it. Every read is already course-scoped before it filters by
  lesson, and the rows that matter to this index are the minority.

**No new route.** `GET /courses/:courseId/materials` already returns the course's materials and now
carries the field, so the page filters what it already fetches — the same posture the work set took.
At ~20 recordings and a handful of materials per course (§1) that is correct, not an N+1.
`API_GAP_ANALYSIS.md` moves the route `[KEEP]` → `[MODIFY]`, because its response shape changed, and
it is now specified in `API_SPEC.yaml`.

**Deliberately not built: a staff control to set the lesson.** Materials have **no authoring surface
at all** — the module exposes one `GET` and every material arrives by seed. Adding the column does
not change that, and building material CRUD to fill the gap would be a feature of its own that
nothing in §6 asks for. The absence is recorded here so it is not later mistaken for an oversight.

**Tests.** Both drivers, in the shape that catches the actual failure mode: a mapper that drops a
column yields `undefined`, which filters to an empty list and **looks exactly like "nothing attached
to this lesson"**. So both the memory and the Postgres case assert the attached rows by id *and*
that course-wide rows are `null` rather than `undefined`. Migration `025` and the updated seed ran
from an **empty** schema against real PostgreSQL before this was called done.
## 2026-09-24 — Unit 8: sessions and attendance (`SESS-1`…`SESS-7`)

**Context.** `SESS-1`…`SESS-7` build the group-grained session and attendance model. Recorded here:
one document correction, one deliberate audit-naming inconsistency, one place the plan was wrong and
the code right, one deliberately dropped test technique, two closed student-facing field leaks, one
pre-existing test found to be asserting nothing, one hidden ceiling named, and one UTC edge handed
forward.

### `DOMAIN_MODEL.md` §5 contradicted `D-9` and is corrected
`DOMAIN_MODEL.md` §5 still listed session `mode` (`on_ground | online`) and `location` (room *or*
meeting link) — both retired by `D-9` (closed, earlier). Two documents at the same authority level
disagreeing is a finding, not a puzzle to solve silently (`CLAUDE.md` §2.3). Corrected to `meetingLink`
(nullable) only; see `DOMAIN_MODEL.md` §5 for the full text.

### Audit actions: three added, three deliberately not renamed
Added `attendance.marked`, `session.planned`, `session.published` to the `AuditAction` union and the
exhaustive `Record<AuditAction, true>` filter. The three existing `live_session.scheduled|updated|
cancelled` strings are **deliberately not renamed** to `session.*`, even though `DOMAIN_MODEL.md`
names the new `session.planned`/`session.published` pair — renaming the existing three would orphan
every audit row already written against the old strings and break the log's own filter.

### The plan was wrong, the code is right: `LEFT JOIN`, not `JOIN`, in the re-parent abort guard
`PHASE_PLAN.md` §2.1's original abort guard used a plain `JOIN` between `live_sessions` and `groups`
on `course_id`, which only catches "a course with several groups". A course with **zero** groups
produces no row in that join at all and would have slipped the guard, surfacing three statements
later as a bare NOT NULL violation naming a column rather than the session it belonged to. The
implementation widened it to `LEFT JOIN`; `PHASE_PLAN.md` was amended to match.

### A regex drift-guard from the plan was deliberately dropped
`PHASE_PLAN.md` §5 specified reading the abort guard's SQL out of the migration file with a regex, by
analogy to unit 7 — whose test extracts and runs one `UPDATE` statement, where a drifted file means
testing SQL that never shipped. Unit 8's integration tests execute the **whole** migration file and
assert it raises, so a guard removed or renamed already fails them by construction. Adding the regex
would have been ceremony over a boundary the whole-file test already covers.

### Two student-facing field leaks, both closed — the first introduced and missed in this unit's own S1/S2
Migration `026` widened `LiveSession` with `privateNotes`, `isVisible` and `state`. The student routes
serialised sessions by **spreading the row** — and there is no `ClassSerializerInterceptor` anywhere
in the app — so those staff-only columns reached students, alongside an unwithheld `meetingLink` and
the unpublished draft timetable. **The leak was introduced in this unit's own S1/S2 and missed in the
S1/S2 review.** Closing only the two named student routes (`SESS-6`, `SESS-7`) left the same leak
alive in a sibling caller: `LiveSessionsService.getNextSession` still returned the raw row, and both
dashboards (`GET /courses/:id/dashboard`, `GET /dashboard`) hand it to students as `nextLiveSession`.
The fix is a shared allow-list, `backend/src/live-sessions/student-session-view.ts`, that every
student-answering service now reaches, so "a student only ever sees the allow-list" is a property of
the code rather than something each caller must remember to re-implement.

### A pre-existing test asserted nothing
The e2e comparing `GET /courses/:id/dashboard`'s and `GET /dashboard`'s `nextLiveSession` had been
passing `null` against `null` all along — every seeded session predates the branch's "today", so the
field was never populated on either side and the assertion never exercised the comparison it claimed
to. The new regression test schedules a session 45 minutes out first and keeps a count guard, which is
what caught the vacuity.

### A hidden ceiling, named
The unscoped week grid (`GET /staff/sessions` with no `groupId`) gathers the caller's groups via
`findAll(100, 0)`. Past 100 groups, the teacher's grid would silently lose sessions belonging to
groups sorting past that page — presenting as a data problem, not a limit. Named as
`MAX_GROUPS_FOR_UNSCOPED_GRID` with the failure mode recorded in its own comment, not fixed (the
product runs at ~10 groups today, §1).

### A UTC window edge handed to S5
`GET /staff/sessions` widens a bare `YYYY-MM-DD` `to` to `T23:59:59.999Z` — **UTC**. The school runs
on Egypt time, so a week requested with bare dates is a window two to three hours off the local week.
Clients must send offset-bearing ISO instants; the DTO's `@IsISO8601()` already accepts them. S5 does
this correctly; recorded so a future caller of the same route does not repeat the bare-date mistake.

**Affected.** `backend/src/manage/sessions.controller.ts`, `backend/src/live-sessions/
student-session-view.ts`, `backend/src/database/migrations/026_*.sql`, `DOMAIN_MODEL.md`,
`API_GAP_ANALYSIS.md`, `AUTHORIZATION_MODEL.md`, `IMPLEMENTATION_PLAN.md`, `PHASE_ROADMAP.md`,
`CLAUDE.md`, `ARCHITECTURE.md`.

## 2026-09-24 — Unit 8 lands: `origin/redesign` wins for everything that is not unit 8

`redesign` had diverged into two histories carrying units 7 and 13 twice, under different SHAs. The
user ruled: those units are finished, so **origin is authoritative for everything that is not unit
8**. Every conflict was resolved that way, and three local duplicates were deleted rather than
merged — local's mark book on `StaffManageController` (origin puts it on `StaffGroupsController`),
local's `manage/markbook-csv.ts` (origin's `groups/markbook-csv.ts` is the wired one, and the better
file: it documents the UTF-8 BOM, RFC 4180 quoting and CSV formula injection), and local's copies of
three unit 7 e2e tests written against response shapes origin does not produce.

**The migration renumbers 019 → 026.** Both branches claimed `019`. Unit 8's file moves to the end
of the sequence, which is behaviour-neutral: only `001`, `005`, `012` and unit 8's own migration
touch `live_sessions` or `attendance`, so nothing between `019` and `025` can observe the move.
`001–026` were applied in order against an empty PostgreSQL 15.19 database to confirm it. The
duplicate `023_recording_thumbnails.sql` was deleted after verifying it matched origin's `024`.

**The mirror drift check earned its place twice in one merge.** `OPS-1` failed on unit 8's three new
audit actions (`session.planned`, `session.published`, `attendance.marked`) and the `attendance`
target type, none of which had reached `frontend/lib/types.ts` — exactly the defect the rule was
written about, caught this time by a compiler rather than a reader. Fixing the mirror then made the
activity page's exhaustive `Record<AuditAction, …>` fail, which is the second half of the same
mechanism working.

**Dead code the merge exposed, removed rather than left loaded.**
`LiveSessionsService.getSessionsForCourse` served `GET /courses/:id/live-sessions`, a route unit 8
replaced. It had no caller left, and it built its response by **spreading the session row** — the
precise field-leak shape unit 8 spent a slice closing, sitting unreachable but intact for the next
caller to find. It and its two response types (`LiveSessionListResponse`,
`LiveSessionWithAttendance`) are gone. Its private helper `sessionsForCourse` is **kept**: it is
still called by `getNextSession` and `getAttendanceSummary`.

**The controller count was right for once, and the sub-count was not.** `role-guards.spec.ts`
carried `CONTROLLERS` = 34, guessed mid-merge, which the spec confirmed; but
`Object.keys(EXPECTED)` was still 28 against an actual 29. The invariant (`EXPECTED` + 2 public + 3
per-method = 34) is now written beside the assertion so the next merge can check it by arithmetic
instead of by running into it.

**Gates on the merged tree, all measured here:** 803 unit / 48 files · 402 e2e / 5 files (via
`run-e2e.mjs`, one file per process) · 191 integration, 0 skipped, against real PostgreSQL 15.19 ·
`001–026` from an empty schema · backend and frontend `tsc --noEmit` both 0 · `npm run lint` exit 0
with the 4 pre-existing warnings · `typecheck:drift` clean.

**Affected.** `backend/test/postgres-repositories.integration-spec.ts`,
`backend/test/staff.e2e-spec.ts`, `backend/src/manage/manage.controller.spec.ts`,
`backend/src/auth/role-guards.spec.ts`, `backend/src/live-sessions/live-sessions.service.ts`,
`backend/test/drift/mirror-drift.check.ts`, `frontend/lib/types.ts`,
`frontend/app/(app)/manage/activity/page.tsx`, `DATABASE_PLAN.md`, `ARCHITECTURE.md`, `CLAUDE.md`,
`PHASE_ROADMAP.md`, `IMPLEMENTATION_PLAN.md`.
