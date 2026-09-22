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
