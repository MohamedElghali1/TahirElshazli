# Review — unit 2, slice 2b-i (people and courses)

**VERDICT: APPROVED WITH FOLLOW-UP**

**Reviewer:** `redesign-reviewer` · **Date:** 2026-09-20 · **Branch:** `redesign`
**Revision range:** `ab2e324..20580a1` (one commit, 58 files). `9914c3b` read for context, not
reviewed.

The substance is correct and safe. Nothing in this slice fails a security, authorization,
correctness or requirements check, and every number in `EXECUTION_NOTES_2B_I.md` reproduced on my
own machine. Three findings stand, all on the documentation/evidence side; **F-1 is the only one
worth closing before the audit surface is built on** and none of them blocks 2b-ii.

---

## Scope reviewed

- `git diff ab2e324..20580a1`, read in full. Tree clean, one commit, `git diff --stat` under
  `backend/src/staff/` is empty, migrations stop at `014`, `staff-scope.service.spec.ts` untouched.
- Prior artifacts: `PHASE_PLAN_2B.md` §4.1–4.7 and §6–7, `COORDINATOR_RULINGS.md` R-2/R-5…R-8,
  `EXECUTION_NOTES_2B_I.md`, slice 2a's `REVIEW.md`.
- Requirements re-derived against `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DATABASE_PLAN.md`,
  `API_SPEC.yaml`, `AUTHORIZATION_MODEL.md`, `SECURITY.md`, `CLAUDE.md` §5–§10.

**Suites I executed myself** (not taken on trust):

| Suite | Command | Result |
|---|---|---|
| Unit | `npm test --workspace=backend` | **515 passed (515), 32 files**, 0 skipped |
| e2e | `npm run test:e2e --workspace=backend` × **4 consecutive runs** | **228/228 every run**, 4 files, zero `Worker exited` |
| Integration | fresh `lms_rev_u2bi`, `DROP`/`CREATE` immediately before | **103 passed (103)**, 0 skipped, **14 migrations applied from an empty database**, 4 seeds |
| Lint | `npm run lint` | exit 0, one **pre-existing** warning (`dashboard.controller.spec.ts:17`) |
| Frontend | `cd frontend && npx tsc --noEmit` | `grep -cE "^lib/"` = **0** · `grep -c "error TS"` = **328** |

Both new `app/` errors are the two the executor named and both are the *correct* errors:
`app/(app)/catalog/page.tsx(49,25)` (`api.courses.enroll` retired) and
`app/(auth)/register/page.tsx(50,47)` (`RegistrationResult` has no `role`).

---

## Did this move toward the NEW product?

**Yes, and on the axis that matters.** This is not a feature bolted onto the old application; it
removes a door the old product had and replaces the way people get in.

- **Self-enrolment is gone, not re-roled.** `courses.controller.ts` no longer declares
  `@Post(':id/enroll')`; `frontend/lib/api.ts` no longer exports `courses.enroll`; an e2e case
  asserts `POST /courses/course-1/enroll` → 404 (`app.e2e-spec.ts:408`). `CoursesService.enroll`
  survives as the thing `accept` calls, and its three properties kept their tests by moving from the
  controller to the service. That is `PRODUCT_SPEC.md:41-49` implemented rather than approximated.
- **`students.mode` is struck, not built.** Ruling R-2 is honoured in the migration *and* in all
  five documents. `grep -rn "StudyMode\|studyMode"` across `backend/src`, `frontend/lib` and
  `API_SPEC.yaml` returns exactly one hit: the tombstone comment at `API_SPEC.yaml:156`. The
  `required: [..., mode]` on `StudentSummary` and `StudentWrite` is gone, and an integration case
  asserts `student_profiles` has **no** `mode` column against the catalog rather than inferring it.
- **The queue is a real gate, in two places**, which is the thing that would have been easy to half-
  build. See F-1 under Verified claims.
- **The API contract narrowed to what the server can actually fill.** `accept` returns a new
  `StudentDirectoryEntry` schema instead of `StudentDetail`, with `PEOPLE-1` named as the task that
  widens it. That is the same reconciliation unit 1 did for `Assistant`, applied before it became
  drift rather than after.

---

## Findings

Ranked. Each re-derived at the cited line.

### F1 — `accept` writes no `group.student_assigned` entry, and the audit union says it does — **low/medium · confirmed**

`backend/src/audit/interfaces/audit-log-repository.interface.ts:152-154` justifies the new `student`
target type with:

> *"the placement that `accept` also writes gets its own `group.student_assigned` entry"*

It does not. `registration-approval.service.ts:115` calls `this.groupRepo.addMember(...)` — the
**repository** — not `GroupsService.addMember`, which is the only thing that records
`group.student_assigned` (`groups.service.ts:309`). The only entry `accept` writes is
`student.accepted` (`registration-approval.service.ts:121-130`).

Calling the repository directly is itself right: `GroupsService.addMember` opens its own
`runInTransaction` and does its own 404/role checks that `requireWaitingStudent` has already done.
The problem is the claim, and what it costs.

**Failure scenario.** Post-`DOM-4`, acceptance is the *only* activation path, so nearly every
placement in the system now happens through `accept`. An admin answering "who put this student in
group-1, and when" filters the audit log by `action=group.student_assigned` or
`targetType=group_membership` — the filter the union comment tells them is populated — and gets an
empty result for every student admitted since the queue shipped. The fact is recoverable (it is in
`student.accepted.after.groupId`), but only by someone who already knows the comment is wrong.

**Two acceptable closures, and the choice is a product call, not a defect fix:** either delete the
claim from the comment and say plainly that a placement made by acceptance is recorded once, under
`student.accepted`; or write the second entry inside the same transaction. I do not rule on which.

### F2 — `students.service.ts:30` cites a spec file that does not exist — **low · confirmed**

The `StudentProfileView` doc comment says *"`students.service.spec.ts` asserts the exact key set."*
There is no `students.service.spec.ts` — `ls backend/src/students/*.spec.ts` returns only
`students.controller.spec.ts`, which is where the exact-key-set assertion actually lives
(`students.controller.spec.ts:55-73`).

**Failure scenario.** The next person adding a staff column reads the comment, opens the named file,
finds nothing, and concludes the guarantee is unenforced — then either re-writes the test that
already exists or, worse, spreads the row because "nothing asserts it anyway". The mechanism is
sound; the pointer is wrong.

### F3 — a test name claims a property the test does not prove — **low · confirmed**

`test/registration.e2e-spec.ts:202` is named *"400s a body the DTO does not declare, and a null over
a NOT NULL column"*. It asserts three things: `{title: null}` → 400, a bad slug → 400, and an empty
accept body → 400. **None of them sends an undeclared field.** With `ValidationPipe({whitelist:
true})` an undeclared field is *stripped*, not rejected, so the first half of that title cannot be
true as written. The `@IsOptionalNotNull` half is genuinely proved.

Plan DoD item 4 asks for "no undeclared field accepted". That is satisfied by the global pipe, but
this slice added no case demonstrating it. Rename the test to what it proves, and — if the property
is wanted as evidence — add one case sending `{title:'x', isPublished:false, smuggled:true}` and
asserting the stored row carries no `smuggled`.

### Nits — not findings, recorded so they are not rediscovered

- `in-memory-course.repository.ts:94` copies fixtures with `STUB_COURSES.map(c => ({...c}))`, a
  **shallow** copy: the `modules` arrays are still shared between instances. Harmless today (neither
  `create` nor `update` touches `modules`, and `update` returns `{...course}` for the same reason),
  but the leak the per-instance copy exists to close is only closed one level deep.
- `courses.controller.ts:39-50` leaves the retired route's doc comment in place, directly above
  `getCourseDetail`, describing a handler that no longer exists. Clearly labelled, but it now reads
  as documentation of the method under it.
- **Outside this review's range, but it will mislead unit 4:** `9914c3b`'s `SHELL-5` entry states
  that a waiting/rejected account is refused on every authenticated route *"with the byte-identical
  `'Invalid credentials'` message"*. `JwtStrategy.validate` throws **`'Account no longer exists'`**
  (`jwt.strategy.ts:57`) — deliberately identical to a *deleted* account, which is the correct
  property, but it is not the login message. The conclusion SHELL-5 draws (the waiting state is
  knowable only from register's 201 body) is still right.

---

## Definition of Done — `PHASE_PLAN_2B.md` §7, the points in 2b-i's scope

| # | Point | Verdict |
|---|---|---|
| 1 | Each change in `ARCHITECTURE.md`'s layer | **holds.** Controllers route and validate only; `RegistrationApprovalService` and `CourseAdminService` hold the rules; both drivers hold persistence and neither reaches another aggregate. |
| 2 | `014` run against real PostgreSQL 15 from an empty schema | **holds.** Re-run by me on a database created empty immediately before: 14 migrations, 103 tests, 0 skipped. (`015` out of scope, R-5.) |
| 3 | Both drivers for every changed table | **holds.** `users`, `student_profiles`, `courses` all updated in `InMemory*` **and** `Postgres*`, and the integration suite exercises the new Postgres methods (`create`, `update`, `setStatus`, the `status` filter) against the same contract. |
| 4 | DTO on every new body; `@IsOptionalNotNull` over `NOT NULL` | **holds.** `course.dto.ts` uses `@IsOptionalNotNull` on all five NOT NULL fields and plain `@IsOptional` only on the nullable `thumbnailUrl`; `registration.dto.ts` the same for `reason`. 2a's remediated class is not reintroduced. |
| 5 | Authorization in the service, not only `@Roles` | **holds for this slice's surface.** `/admin/*` is `@Roles(...STAFF_ADMIN)` at class level; `reject` additionally calls `assertMay(actor,'registration.reject')` as its **first statement, outside the transaction**. `accept` is correctly decorator-gated only — it is not one of the four withheld verbs. (The 21 `StaffScopeService` sites are 2b-ii.) |
| 6 | Four audit actions, union + exhaustive `Record` + a spec asserting the row | **holds.** All four in both places (`audit-log-repository.interface.ts:65-77`, `list-audit-log-query.dto.ts:44-47`), two new target types, `audit.service.spec.ts` unedited, nothing retired removed. |
| 7 | Every refusal test named, in both directions | **holds.** Five of the eleven named tests are in 2b-i's scope and all five exist and pass; the rest belong to `AUTH-2`/`D-10` (2b-ii). |
| 8 | 404-with-identical-message, 409, not-found | **holds.** One exported `STUDENT_NOT_FOUND`; a staff id gets the same 404 as a missing one, asserted (`registration-approval.service.spec.ts:177`); 409 covered on both routes and on a taken slug. |
| 10 | `API_SPEC.yaml` matches | **holds.** `+/auth/register`, accept/reject/course bodies and statuses, `StudentDirectoryEntry`/`Course`/`CourseWrite`/`CoursePatch` added, `StudyMode` and both `mode` requirements removed. |
| 11 | The commands | **holds.** All five re-run by me; every number reproduces. |
| 13 | Documentation | **holds with F1/F2.** All nine documents updated and honest about what was and was not run; two in-code pointers are wrong. |

Points 9 and 12 are n/a as the plan states. `015`, `AUTH-2`, `D-10` and the final `DOM-6` pass are
**correctly absent** under R-5 — I confirmed `015` was not authored even as an empty file.

---

## Verified claims — the executor's report, re-derived

| Claim | Verdict |
|---|---|
| **Both status gates exist, and the `JwtStrategy` one is real** | **Confirmed.** `jwt.strategy.ts:56` folds `user.status !== 'active'` into the `!user` check on the read that already runs every request. The named test *"a token for a rejected account is refused on every route"* (`registration-status.spec.ts:150`) **would fail if the clause were removed**: it asserts `validate` **resolves** first, then flips the status and asserts it rejects. It proves the negative, not just the positive. |
| **`waiting` is passed explicitly, asserted on the argument** | **Confirmed.** `registration-status.spec.ts:47-66` spies `users.create` and asserts `create.mock.calls[0][0]` carries `status:'waiting'` — the argument, not the row read back, so `DEFAULT 'active'` cannot mask it. An e2e case additionally proves a fresh registration gets 401 at login (`app.e2e-spec.ts:306-311`). The queue cannot be silently empty. |
| **The login oracle is closed** | **Confirmed, all three properties.** `auth.service.ts:144` is a single `if (!user \|\| !passwordMatches \|\| user.status !== 'active')` **after** the one `hasher.verify` against `DUMMY_PASSWORD_HASH`, throwing the unchanged `'Invalid credentials'`. `registration-status.spec.ts:115-137` loops all four paths (unknown email, wrong password, waiting, rejected) asserting **exactly one** `verify` call each, and `:88` asserts the waiting message `===` the unknown-email message in the same test. No early return, no distinct message, no extra hash. |
| **`accept` is one transaction, with a forced-failure test** | **Confirmed, and honestly bounded.** `registration-approval.service.ts:97` wraps all four writes in one `runInTransaction`. `registration-approval.service.spec.ts:120` forces `CoursesService.enroll` to throw, asserts `db.inTransaction` was `true` at that moment, asserts one wrap, and asserts the placement did not happen — and its comment says plainly that **the memory driver cannot prove the rollback**, pointing at the integration case that can. That case exists and I ran it: *"rolls a half-finished acceptance back"* sets `status='active'`, throws inside `runInTransaction`, and asserts the row reads `waiting` afterwards against real Postgres. This is exactly the honesty `CLAUDE.md` §12 asks for. |
| **PII containment is real, on a fixture where the leak is possible** | **Confirmed, and I checked beyond `GET /students/me/profile`.** `seeds/001` gives `profile-1` all three values and the in-memory fixture mirrors it, so the key-set test runs over populated fields. `StudentProfile` reaches **exactly two** call sites outside its own drivers — `students.service.ts:71` and `:85` — and both pass through `toStudentView`. (`auth.service.ts:120` calls `createForUser` and discards the return.) The dashboard has its own guard (`dashboard.controller.spec.ts:119`) asserting the payload contains none of the three values or key names. `grep` finds no other consumer. |
| **`pool: 'threads'` is stable** | **Confirmed on my machine.** Four consecutive full runs, **228/228 every time**, zero `Worker exited`. See the judgement below. |
| **The four re-homed e2e cases keep their property** | **Confirmed.** The deleted block tested self-enrolment, which no longer exists. `unenrolledToken` now means "holds none of the fixtures" via `course-2` rather than "enrolled in nothing", and `app.e2e-spec.ts:540` explicitly re-states the property it now tests — including the load-bearing one, that the student cannot **submit** either. Coverage was retargeted, not weakened. |
| **`reject`'s audit `after` carries `reason`, and no PII** | **Confirmed and I agree with the deviation.** A validated-then-dropped field is drift, and this entry is the only durable record of the refusal. `reason` is staff's own free text about their own decision, capped at 500 chars, and `registration-approval.service.spec.ts:253` asserts the entry carries nothing about the student. `null` when absent, so the key is always present. |
| **`StudentProfileUpdate` deliberately without the staff fields** | **Confirmed correct.** That interface backs `PATCH /students/me/profile` — a student-driven path. A writable member with no writer there is an open door; the plan's instruction predates the discovery that the same interface serves both. `PEOPLE-1` needs a staff-only DTO anyway. |
| **Nothing under `backend/src/staff/` touched; nothing retired removed from either audit union** | **Confirmed** by `git diff --stat` and by reading both unions. |
| **`enrolledCourseCount` driver divergence left unfixed** | **Confirmed, and leaving it is right.** The memory driver stores it; Postgres derives it with a subquery. The divergence can only produce a wrong number **on the memory driver**, which `CLAUDE.md` §8 refuses in production. The only production reader is `GET /students/me/profile`, which is Postgres-derived and correct. Fixing it inside a repository would require reading another aggregate, which §5 forbids — so it is a design decision, correctly deferred. The e2e asserts the field's type and names the note rather than asserting a number it knows is driver-dependent. |

**One claim I could not fully verify:** the executor's per-configuration crash table (6/4/6/4/13 runs
under different pools and options). I reproduced only the end state — `threads`, four runs, clean. I
have no way to re-observe the `forks` flake without reverting the config, which I am not authorized
to do.

---

## Judgement on item 5 — the `pool: 'threads'` change

**Accept it.** It is the right call, for the right reason, and the reasoning is one I would have had
to make myself.

- **The problem is real and is the one `CLAUDE.md` §10 names.** A forked worker exiting mid-run with
  every executed assertion green produces `181 passed (228)` and `0 failed`. That is precisely *"a
  suite that skips itself is indistinguishable from one that passes"*, wearing a different costume —
  and it is worse than a skip, because a skip at least announces itself. Choosing to live with it
  would be choosing a green tick that means nothing.
- **Cross-test state leakage between files is not introduced.** `fileParallelism: false` is still
  set and is still doing its work — the files run one at a time, so no two `AppModule` instances
  share a heap concurrently. Vitest's `isolate` default remains `true` and is not overridden in
  either config, so each file still gets a fresh module registry rather than inheriting the previous
  file's singletons. The risk a shared heap actually carries here is *sequential* residue (a stray
  `process.on` listener, a timer, a module-level cache surviving between files), not concurrent
  interference — and the in-memory repositories, which are the obvious candidates, are per-`AppModule`
  providers re-instantiated in each file's `beforeAll`.
- **228/228 on four consecutive runs of mine**, after the executor's thirteen. Two independent
  machines-worth of evidence, zero worker exits.
- **The config change is honest about itself.** The comment states what it fixes, what it measured,
  and — the part that matters most — *"this is not a licence to boot more apps"*. It names the real
  ceiling instead of hiding it: the suite is at the resource line, and `threads` bought headroom, not
  immunity.

The one thing I would hold the project to: **this is a mitigation with a known ceiling, not a fix.**
A fifth e2e file booting a fifth `AppModule` will find the same wall from the other side. The
follow-up below records that.

---

## Remediation checklist

Nothing here blocks slice 2b-ii. Ordered.

1. **Close F1.** Decide, and make the code and the comment agree:
   *either* edit `backend/src/audit/interfaces/audit-log-repository.interface.ts:152-154` to say the
   placement made by an acceptance is recorded **once**, under `student.accepted`, with the group in
   `after.groupId`; *or* add a second `audit.record({action:'group.student_assigned', targetType:
   'group_membership', targetId: membership.id, ...})` inside `accept`'s existing transaction, using
   the membership returned by `groupRepo.addMember` at `registration-approval.service.ts:115`, with a
   spec asserting both entries commit together. Do not leave the comment as it stands.
2. **Fix F2.** `backend/src/students/students.service.ts:30` — cite `students.controller.spec.ts`,
   which is where the exact-key-set assertion lives. One word.
3. **Fix F3.** Rename `test/registration.e2e-spec.ts:202` to what it proves (`400s a null over a NOT
   NULL column, and a malformed slug`). If the undeclared-field property is wanted as evidence rather
   than as a global-pipe assumption, add one case asserting a smuggled field is stripped from the
   stored row.
4. **Optional, cheap:** deep-copy the module arrays in `in-memory-course.repository.ts:94`, and
   delete the orphaned retired-route comment at `courses.controller.ts:39-50`.
5. **Not this slice's, but file it:** correct `SHELL-5` in `IMPLEMENTATION_PLAN.md` — the
   `JwtStrategy` refusal message is `'Account no longer exists'`, matching a *deleted* account, not
   `'Invalid credentials'`. The conclusion SHELL-5 draws is unaffected.

---

## Open decisions — surfaced, not ruled on

1. **There is no way to activate a student without enrolling them** (executor `F-3`). Acceptance is
   the only activation path and it always enrols, so a student cannot be admitted into a group whose
   course is unpublished — `CoursesService.enroll` refuses a draft and the whole transaction aborts
   with `Course not found`, which is a confusing message for staff who can see the group on screen.
   *The one question that closes it:* **should staff be able to accept a student into a group whose
   course is still a draft — and if not, should the refusal say so in words a teacher can act on?**
2. **`GET /courses/catalog` still serves an open catalog.** `PRODUCT_SPEC.md:205` marks Catalog
   `[REMOVED]` *"with open enrolment"*; `DOM-4` retired the enrol route but not the browse route, so
   a signed-in student can still list courses they cannot join. Both the planner and the executor
   recorded it the same way and neither built it. *The question:* **does a student still see courses
   they are not enrolled on, now that they cannot act on them?**
3. **`enrolledCourseCount` belongs to a service, not to either driver** (executor `F-2`). Deferred
   correctly. *The question:* **does the count move to `StudentsService` composing two repositories,
   or does the field leave `StudentProfile` entirely?**
4. **`DELETE /admin/students/{id}/enrollments/{courseId}`** is specified in `API_SPEC.yaml:657` with
   an `x-audit: student.unenrolled` that does not exist in the `AuditAction` union. Not named by
   `DOM-4`, correctly not built here, and now the one remaining piece of accept/reject-adjacent
   contract with no implementation.

---

## Follow-ups for `IMPLEMENTATION_PLAN.md`

- **`F2B-1`** — close F1: the audit union's claim about `group.student_assigned` and `accept` must
  match the code, one way or the other. *(Owner: whoever builds the people surface, unit 5.)*
- **`F2B-2`** — F2 and F3: correct the spec-file citation at `students.service.ts:30` and the test
  name at `registration.e2e-spec.ts:202`. *(Trivial; fold into the next 2b-ii commit.)*
- **`F2B-3`** — **the e2e suite is at its resource ceiling.** `pool: 'threads'` bought headroom, not
  immunity; the next file that boots a fifth `AppModule` should expect to find the same wall. Prefer
  adding cases to an existing file, and if a fifth boot becomes necessary, treat it as its own task
  rather than a side effect.
- **`F2B-4`** — `SHELL-5`'s description of the `JwtStrategy` refusal message is wrong; correct it
  before unit 4 builds the sign-up screen against it.
- **`F2B-5`** — junk in the repository root (`1`, `[a.id`, `before`, `value`) is still untracked and
  still nobody's. The executor deleted the three it created. Someone should confirm they are worthless
  and remove them; `CLAUDE.md` §12 forbids destroying work you did not create, so this needs a human.
