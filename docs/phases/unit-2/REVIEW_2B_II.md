# Review — unit 2, slice 2b-ii (scope)

**VERDICT: APPROVED WITH FOLLOW-UP**

*Written incrementally as the review proceeded; sections below were filled in order.*

## Scope reviewed

Revision range `9c754d0..e1e8fe3` — `2abd54b` (code), `e1e8fe3` (docs). Tree clean at review time.
39 files, +2145 / −1037.

**Suites I executed myself, on this tree:**

| Suite | Result | Notes |
|---|---|---|
| `npm test --workspace=backend` | **32 files / 517 tests passed** | matches the executor's report |
| `npm run test:e2e --workspace=backend` | **4 files / 228 tests passed** | the *first* invocation through `npm run` aborted with Windows exit code `3221226505` (`STATUS_STACK_BUFFER_OVERRUN`) **after** the run started; re-run directly via `npx vitest run --config ./vitest.config.e2e.ts` it completed green. A teardown crash, not a failing assertion — but see finding F5 |
| `npm run test:integration` on a **new empty database** (`lms_rev_2bii`, created immediately before) | **1 file / 110 tests passed, 0 skipped** | all 15 migrations applied from nothing: `schema_migrations` = 15, `to_regclass('course_staff_assignments')` = NULL |
| `npm run lint` | clean but the one **pre-existing** `EXTERNAL_WORK_BINDER` oxlint warning | reproduces |

Post-migration database state, read by me directly:

```
assistant-1 | assigned_groups
assistant-2 | assigned_groups
27f986e7-…  | (no scope row)      <- created at runtime by the integration suite; D-20
assistant_group_assignments: assistant-group-1 | assistant-1 | group-1 | teacher-1
```

## Did this move toward the NEW product?

**Yes, and the riskiest part of it is done properly.** The grain of assistant authorization moved
from course to group, the one-way `DROP TABLE` ran with its backfill verified from an empty schema,
and `D-10` — the decision this slice exists to implement — is enforced at one chokepoint
(`groups.service.ts:113-126`) that every group read and write already passes through, with the
refusal proved in both directions at the unit *and* e2e levels.

The judgement I was asked for is narrower than "is it green", so here it is plainly:

- **The seven contract cases genuinely survived unmodified.** I read the diff hunk by hunk and then
  re-read the file as it now stands (`staff-scope.service.spec.ts:56-137`). Not one assertion, not
  one expected value and not one fixture *semantic* in the seven was touched. The only edits in that
  region are the `beforeEach` provider swap (ruling R-8's single permitted edit), two import lines,
  and two doc comments above `ASSIGNED_TA` / `UNASSIGNED_TA`. The fixture reproduces the old reach at
  the new grain — `assistant-1` → group-1 → course-1, `assistant-2` → nothing — so the cases prove
  what they always proved rather than passing because the ground moved under them. The four deleted
  cases are exactly the `assign`/`unassign` four, and §4.4.1's replacements landed in the same commit
  (`staff-scope.service.spec.ts:140-296`, plus the Postgres half of the idempotence contract in
  `postgres-repositories.integration-spec.ts`).
- **The 404 property is real, not a spec agreeing with itself.** Both messages are exported
  `const`s — `COURSE_NOT_IN_SCOPE` (`staff-scope.service.ts:68`) and `GROUP_NOT_FOUND`
  (`groups.service.ts:39`) — and each is compared **against the genuine-miss path in the same test**
  *and* against the exported constant: course at `staff-scope.service.spec.ts:218-231`, group at
  `groups.controller.spec.ts:334-370` and over the wire in `staff.e2e-spec.ts`'s `D-10` block, which
  additionally asserts the body carries no SQL or stack. I found no route where an out-of-scope
  resource now answers 403 or a differently-worded 404: the two 403s that exist
  (`DELETE /staff/groups/:id/members/:studentId`, blog authorship) are *capability* refusals,
  documented as such, and `removeMember` runs `assertMay` as its first statement
  (`groups.service.ts:367`) so it is not an existence oracle. `requireGroup` reads the group before
  the scope check, so a nonexistent id costs one query and an out-of-scope id two — a difference far
  below anything observable over HTTP on this stack, and not usable as an oracle.
- **Ruling R-1 still holds and still means it.** `grep` for `assistant_id`/`assistantId` outside
  `groups/{interfaces,repositories,dto}` returns only write/audit-payload lines and one comment
  saying the column is never read for access. No new query reads it. Both behavioural proofs pass and
  are now *stronger* than before: `groups.controller.spec.ts` names `assistant-2` on group-2 and
  asserts the same `GROUP_NOT_FOUND`, and `staff.e2e-spec.ts` creates a group with
  `assistantId: 'assistant-2'` over the wire and asserts a 404 on reading it.
- **`015` and the backfill are verified, not asserted.** I ran all fifteen migrations into a database
  created empty seconds earlier and read the result myself (above). The fan-out is proved
  unconditionally in a side-schema test that builds to `014`, seeds **two groups on one course and a
  third elsewhere**, applies `015`, and asserts exactly `csa1:g1, csa1:g2` with `assigned_by` and
  `assigned_at` carried forward and the other course's group untouched — plus the empty case, plus
  every assistant ending `assigned_groups`. A missing scope row fails closed at **every** read:
  `heldGroupIds` returns `null`, so `assertAssigned` throws, `scopeFor` returns an empty list and
  `mayReachGroup` returns `false` (`staff-scope.service.ts:139-147, 175-178, 205-210, 272-276`), each
  with its own test.

Where I differ from the executor is not in what it built. It is in **how completely `D-10`'s leak is
closed** — finding F1.

## Findings

### F1 — the roster leak `D-10` closes at the group door is still open at the course door · **high** · confirmed

`D-10` scopes every route that *names* a group. It does not touch the routes that name a **course**,
and those still run at the course grain — which, now that scope is group-grained, means an assistant
holding **one** group of a course reads data about **every** cohort on it:

| Route | Where | What an assistant holding only `group-1` gets |
|---|---|---|
| `GET /staff/courses/:courseId/roster` | `staff-manage.controller.ts:77` → `manage.service.ts:182-232` | **every enrolled student on the course: name, email, average** — regardless of group |
| `GET /staff/courses/:courseId/submissions` | `staff-manage.controller.ts:93` → `grading.service.ts:92-130` | every submitter's **name and email**, and the work itself, across all cohorts |
| `GET /staff/assessments/:id/analytics` · `.../students/:studentId/work` | `work-analytics-gate.service.ts:67-110` | analytics, and a named student's record, for tasks set to groups they do not hold (this is `B-4`) |

**Failure scenario.** `assistant-1` holds `group-1` only. `GET /staff/courses/course-1/roster`
returns every enrolled student on course-1 with their email address, cohorts `assistant-1` was never
given included. `GET /staff/groups/group-2/members` — the same people, one door over — correctly
answers 404. The stated purpose of this slice is *"the roster leak (names and emails of every cohort)
is what this slice exists to close"*; it is closed on one of the two paths that serve it.

**This is not a regression and it is not outside the executor's authority.** It is shipped behaviour;
`D-10`'s text scopes only the group reads; `PHASE_PLAN_2B.md` §4.4 lists all 21 `assertAssigned`
sites as *"need no edit"*. The executor saw the shape of it, named the analytics instance as `B-4`,
and correctly refused to invent the answer. **The decision is the user's**, and it is one question,
not three — see **Open decisions**.

### F2 — `AUTHORIZATION_MODEL.md` now says the general rule is **Built**, and F1 is what it is not · **medium** · confirmed

`docs/AUTHORIZATION_MODEL.md:217` changes *"Any assistant-facing read/write | group scope → 404"* to
*"group scope → 404. **Built** (`AUTH-2` + `D-10`) … `StaffScopeService.assertAssigned` for a route
naming a course"*. Read as written, that says course-grained `assertAssigned` **satisfies** group
scope. It does not: on a course with several cohorts it grants an assistant everything in F1's table.
§2's new paragraphs are accurate and honest; this one row overstates, and it is the row a future
agent will cite to conclude the question is settled. `IMPLEMENTATION_PLAN.md:147-149` strikes the
open `D-10` paragraph through as closed without naming the residue, which compounds it.

**Fix (documentation only):** qualify the row — group-named routes are scoped to the held group;
course-named routes remain course-grained — and name the open question there.

### F3 — an assistant can target work at a group they do not hold · **medium** · confirmed

`assessment-authoring.service.ts:170-199` (`assertTargets`) validates only that a targeted group
**studies the course**; `create` and the target routes gate on the course (`:227, :232, :253`). So
`assistant-1`, holding `group-1`, can `POST /staff/courses/course-1/assessments` targeted at a cohort
they cannot read, and the task appears for those students with a window and a due date they set. It
is an assistant-facing **write naming a group** that does not pass through `mayReachGroup` — exactly
the shape `AUTHORIZATION_MODEL.md:217` says is refused. Same provenance as F1, and the same decision
closes it: one `mayReachGroup` per target inside `assertTargets`.

### F4 — `GET /staff/courses/:courseId/groups` lists cohorts an assistant does not hold · **low** · confirmed

`groups.service.ts:404-415`. Scoped on the course, so an assistant holding `group-1` sees every group
on course-1: name, schedule, room, `assistantId`, `memberCount`. Metadata, not the F1 PII leak — but
it is the screen that tells an assistant which cohorts exist, sitting beside a `GET /staff/groups/:id`
that now 404s each of them. One `.filter` on `mayReachGroup`, under the same decision as F1/F3.

### F5 — `npm run test:e2e` aborted once with exit `3221226505`, after a green run · **low** · plausible

My first invocation of `npm run test:e2e --workspace=backend` exited `3221226505`
(`STATUS_STACK_BUFFER_OVERRUN`) **after** the suite had started, with no failure output; the same run
through `npx vitest run --config ./vitest.config.e2e.ts` completed **4 files / 228 passed**, and the
unit and integration suites were clean first time. I could not reproduce the abort and could not
attribute it to anything in this diff. Recorded because CI would read that exit code as a failed
suite — and because the mirror-image mistake, a teardown crash after a *red* run being read as green,
is the one that hides things.

### F6 — a runtime-created assistant still has no scope row (`D-20`) · **informational** · confirmed live

My own post-migration read found a third `role='assistant'` account with **no** `assistant_scopes`
row — created at runtime by the integration suite. This is `D-20`, recorded by the executor in
`EXECUTION_NOTES_2B_II.md`, `AUTHORIZATION_MODEL.md` §2 and `DATABASE_PLAN.md` §4.2. It fails
**closed** — such an account reaches nothing — and nothing in the product creates an assistant today
(a grep for assistant creation finds only the in-memory fixtures and two read-side role filters).
Unit 5's `PEOPLE-4` must write the row. No action in this slice.

## Definition of Done — `AUTH-2`, `D-10`, `DOM-6`

| # | Point | Verdict |
|---|---|---|
| 1 | Implementation in the layer `ARCHITECTURE.md` §6 names | **Holds.** The reachability decision is in `StaffScopeService`/`GroupsService`, not a controller; the two repositories hold no business rule and `PostgresAssistantScopeRepository` deliberately joins no other aggregate |
| 2 | Migration run against real Postgres **from an empty schema** | **Holds** — I ran it myself: 15 migrations into a database created empty immediately before, plus the side-schema test that applies `015` alone on top of `014` |
| 3 | Both repository drivers | **Holds.** `InMemoryAssistantScopeRepository` + `PostgresAssistantScopeRepository` against one interface, both wired through `repositoryProvider`, both exercised |
| 4 | DTO validation at the boundary | **Not applicable** — no new request body; `AddGroupMemberDto` unchanged, `AssignStaffDto` deleted with its route |
| 5 | Authorization in the service, not only `@Roles` | **Holds.** `requireGroup` is private to the service and reached by `get`, `members`, `addMember`, `update`, `removeMember`; the controllers only pass the actor |
| 6 | Audit inside the same transaction, union + exhaustive `Record` | **Holds.** No new action; the three retired members are kept and commented, `audit.service.spec.ts` is untouched, and a new e2e case proves the log still filters by both retired actions with the table gone. `before` snapshots are copies in both drivers |
| 7 | Unit, integration, **and a refusal test for every permission** | **Holds for what this slice built.** Both directions asserted for `get`, `members` and the placement write, for held / not-held / no-groups / never-configured / `all_groups` / teacher / full admin, at unit and e2e. The permissions in F1/F3/F4 are course-grained and unchanged, so no permission introduced here lacks a refusal test |
| 8 | Error cases: not-found, out-of-scope (404, identical body), conflict, unconfigured driver | **Holds.** Identical-message assertions on both paths; `CHECK` violation and `UNIQUE` violation exercised in Postgres; the conflicted-insert-then-gone race is handled explicitly rather than silently |
| 9 | Frontend integrated against the real API | **Not applicable** — `frontend/app/**` is unit 4. `lib/api.ts` and `lib/types.ts` had the retired route and `CourseStaffMember` removed, which is the mirror staying honest |
| 10 | `API_SPEC.yaml` matches what was built | **Holds.** The three `/staff/groups/*` paths added with their `D-10` 404 semantics; `Assistant.scope`/`groupIds` correctly left optional (storage exists, no emitter); no retired path was in the contract to remove. See F2 for the one document that overstates — it is not this one |
| 11 | `npm test` + `npm run test:e2e` green; frontend typecheck/lint clean | **Holds for the backend** (517 / 228, reproduced). Frontend is **340** `error TS`, **0** in `lib/` — the +12 delta is `app/(app)/manage/courses/[id]/staff/page.tsx`, a screen for a route that no longer exists, inside the `app/**` exclusion `CLAUDE.md` §4.1 grants until `SHELL-4`. Honestly reported by the executor |
| 12 | Design adherence | **Not applicable** — no frontend surface built |
| 13 | `IMPLEMENTATION_PLAN.md` and `CHANGELOG.md` updated | **Holds**, with F2's qualification. `AUTH-2` is `[~]` not `[x]` and 2b-ii is `[~]` awaiting this verdict, which is correct |

## Verified claims

| Executor claim | Verdict |
|---|---|
| Seven contract cases pass unmodified; only the `beforeEach` provider changed | **Re-derived.** True, including the fixture semantics |
| Exactly the four `assign`/`unassign` cases deleted; replacements in the same commit | **Re-derived** from the diff and the file |
| 21 `StaffScopeService` call sites, none edited | **Re-derived.** `git diff` touches none of the nine services' call statements; `groups.service.ts:300,407` moved only because `requireGroup` was inserted above them |
| Both 404 messages exported and asserted `===` against a genuine miss in the same test | **Re-derived** at four sites (unit and e2e, course and group) |
| `015` ran from an empty schema; 15 migrations; `course_staff_assignments` gone | **Reproduced independently** on a database I created empty |
| Every assistant gets a scope row; a migration never grants `all_groups` | **Re-derived** — and the exception (`D-20`, a runtime-created assistant) I observed live and it fails closed |
| `groups.assistant_id` never read for access (ruling R-1) | **Re-derived** by grep and by both behavioural tests |
| No response shape gained a field; the staff roster is unchanged | **Re-derived** |
| Two new repository files, parameterised only; `015` has no interpolation | **Re-derived**, line by line |
| Audit untouched; the three retired members kept | **Re-derived** — no file under `audit/` is in the diff |
| 517 / 228 / 110, 0 skipped; lint clean but the pre-existing warning; `lib/` at 0 | **All reproduced**, with F5's note on the e2e invocation |
| Eight tests moved `group-2` → `group-1` without weakening | **Re-derived, case by case.** Each still asserts its original property — the audited placement still names the assistant as actor, the "add stays / remove moves" pair still asserts both halves, and the `removeMember`-then-`addMember` setup means no case passes vacuously. The refusals they used to imply are now asserted directly in the new blocks, which is a net strengthening |
| Six deviations honestly recorded and within authority | **Yes, all six.** The `WorkAnalyticsService` switch to `GROUP_REPOSITORY` (`D-21`) was **forced** — `GroupsService.members` gained a required actor — and is the right call: a caller-scoped denominator would have produced a silently wrong completion rate. I checked the other consumers: `GroupsService.members` now has exactly **one** remaining caller (`staff-groups.controller.ts:82`), and `GroupsService` has **no** consumer outside `groups/`. `StudentGroupsService` is a different, student-facing service and is untouched. **Nothing of that shape remains unfixed or unnamed** |
| The five "least sure of" items | Checked, and I agree with the executor on all five. The seed split is FK-forced and the R-1 proof survives it — it is now made by a *test* that names `assistant-2` on a group rather than by a fixture gap, which is stronger. The two comments inside `listCourses` were right to correct: the executable body is byte-identical and a comment naming a dropped table would have been false. The `ON CONFLICT DO NOTHING` on `assistant_scopes` is harmless defensive code, as described |

## Open decisions — surfaced, not ruled on

**One question, which closes `B-4`, F1, F3 and F4 together.**

> Now that an assistant's scope is a **group**, should a course-named staff route stay
> **course-grained** — so holding one group of a course grants the whole course's roster with emails,
> the whole grading queue, analytics for tasks set to cohorts they do not hold, and the ability to
> target work at those cohorts — or should every course-named staff read and write be **narrowed to
> the held groups**?

- **Reading A — narrow everything to held groups.** Consistent with `AUTHORIZATION_MODEL.md:207` and
  with why `015` exists. Cost: ~6 services gain a group filter; some numbers become per-assistant, so
  the `CLAUDE.md` §11.1 "a number must not depend on who is looking" rule has to be settled
  per-screen (this is the half of `B-4` the executor was right to refuse to guess).
- **Reading B — keep course-grained reads, narrow only writes and rosters.** Keeps every analytic a
  single fact about the task. Cost: an assistant keeps read access to every cohort's PII on a course
  where they hold one group — which is the thing `D-10` was raised about.

**My answer on `B-4` specifically: preserving behaviour was right, and the current behaviour does
leak.** Right, because the alternative available to the executor was not "refuse" but "silently
narrow a denominator" — `GroupsService.members` had just become caller-scoped, and letting that flow
into `expectedStudentIds` would have made two staff members see different completion rates for one
task, with nothing failing. A wrong number that nobody can detect is worse than an unclosed door that
is written down. What it leaks, stated plainly: for a task targeted at a group they do not hold, an
assistant who reaches the task's **course** can read its completion rate, its averages, its unmatched
responses, and — through `.../students/:studentId/work` — a named student's record. The denominator
itself is correct and caller-independent, which is what `D-21` bought.

## Remediation checklist — ordered

1. **Put the question above to the user.** Nothing else in F1/F3/F4/`B-4` can be decided without it.
2. **F2, and it is the one item I would not defer:** qualify `AUTHORIZATION_MODEL.md:217` so it stops
   claiming that course-grained `assertAssigned` satisfies group scope, and note the residue where
   `IMPLEMENTATION_PLAN.md:147-149` strikes `D-10` through. Documentation only; no code.
3. **Record the decision** in `CHANGELOG.md` as the successor to `D-10`, and open a task for whichever
   unit owns it (analytics for `B-4`, `manage` for the roster and grading queue, `assessments` for
   `assertTargets`, `groups` for `listForCourse`).
4. **F5:** if CI runs `npm run test:e2e` through npm, watch for that exit code; consider invoking
   vitest directly so a teardown abort cannot be confused with a failing suite.

## Follow-ups for `IMPLEMENTATION_PLAN.md`

| Id | Follow-up | Blocks the next phase? |
|---|---|---|
| `F2B2-1` | The open question above, and the code that follows from whichever reading the user picks (F1, F3, F4, `B-4`) | **No** — it is shipped behaviour, older than this slice |
| `F2B2-2` | `AUTHORIZATION_MODEL.md:217` and `IMPLEMENTATION_PLAN.md:147-149` qualified (F2) | **No**, but it should land before anyone plans off those lines |
| `F2B2-3` | `PEOPLE-4` (unit 5) must write an `assistant_scopes` row when an assistant is created (`D-20`), and is the only route that can grant a group until it ships | No — already recorded in three documents |
| `F2B2-4` | `frontend/app/(app)/manage/courses/[id]/staff/page.tsx` is dead: it calls a retired route and carries the +12 TS errors. Delete with `SHELL-4` | No |
| `F2B2-5` | The `npm run test:e2e` exit-code abort (F5) | No |

## Verdict

**APPROVED WITH FOLLOW-UP.** The phase remains incomplete until F2B2-2 lands and the user rules on
F2B2-1.

The substance of this slice is correct, and it is the highest-quality work in unit 2 so far: the
authorization contract survived intact and I could prove it did, the irreversible migration was
verified from nothing and its backfill proved on a multi-group course, the anti-enumeration property
is asserted the only way that actually holds it, and the one thing the executor could not decide it
stopped on and wrote down instead of inventing. I found **no** finding attributable to the change
itself — no lost object-level check, no weakened test, no swallowed failure, no unparameterised SQL,
no new per-process state, no response field gained, no spec drift.

What I am withholding a clean `APPROVED` for is one documentation line that claims more than the code
does (F2), and the fact that the leak this slice exists to close is closed at one of its two doors
(F1) — which is a decision for the user, not a defect in the execution.

---

## Addendum — reviewed against the amended docs commit `b0e734c`

The docs commit was amended after this review began (`e1e8fe3` → `b0e734c`; code commit `2abd54b`
unchanged). The amendment is 24 lines in `EXECUTION_NOTES_2B_II.md` deviation 3: the `D-21` sweep,
now recorded as a search for the *shape* — who consumes a caller-scoped read as **data** rather than
as an authorization decision — rather than for the call.

**I verified the enumeration rather than accepting it. It is correct, and no follow-up is owed.**

- **`GroupsService` is injected in exactly two files**, both its own controllers
  (`admin-groups.controller.ts:44`, `staff-groups.controller.ts:53`). A grep for `GroupsService`
  across all of `backend/src` returns, outside spec files and its own module, only those two
  constructors and comments. `work-analytics.service.ts` was the third and is fixed. `GroupsModule`
  is imported only by `app.module.ts`, so nothing else can reach the service without an import edge
  that would be visible.
- **The `StudentGroupsService` exclusion is sound.** `groupsFor(courseId, studentId)` /
  `groupIdsFor(courseId, studentId)` (`student-groups.service.ts:41-49`) take the subject as an
  explicit argument and read `GROUP_REPOSITORY` directly — keyed on *whose* groups are being asked
  about, never on who is asking. `WorkAnalyticsGateService.studentWork` passes the student id from
  the path after scope-checking the course, so the value is data about that student, not about the
  caller. The file is untouched by this slice, and `D-10` gave it nothing to inherit.
- **The `ClassmatesService` exclusion is sound.** It never calls `GroupsService`: it reads
  `groupRepo.findStudentGroups` and `findMembers` itself, gates on the caller's own enrolment, and
  returns names without email (`classmates.service.ts:53-90`). The separation the file's own comment
  claims — widening the staff roster must not widen the student one — holds structurally, because
  the two lists are built by different methods on different services.

Nothing in the amendment changes any finding, the Definition-of-Done table or the verdict. It closes
item 8 of the review brief: **the sweep is complete, and the one consumer of that shape was the one
that was fixed.**
