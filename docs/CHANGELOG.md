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
