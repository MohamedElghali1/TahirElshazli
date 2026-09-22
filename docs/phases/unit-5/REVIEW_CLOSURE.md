# Review — unit 5, closure of the two carried-forward follow-ups

**VERDICT: APPROVED WITH FOLLOW-UP**

**Unit 5 may not be marked `COMPLETE` yet.** Both follow-ups from `REVIEW_5D.md` are genuinely
closed. The three frontend fixes are correct and I found no regression from them. The verdict is held
back by one small but real unit-5 defect that the browser pass surfaced and then mis-filed (`C-1`), and
by the phase-end documentation that has not been written yet (`C-3`). Neither is a security issue, and
neither blocks unit 6's work. Condition 3 of `PHASE_ROADMAP.md` §2 needs `APPROVED`, so the unit
stays `[~]` until both close. The fix for `C-1` is a few lines.

## Scope reviewed

- **Revision.** `redesign` @ `e9f7f15` plus the closure change, which was uncommitted when this review
  began. Part-way through the review the change was committed as `1c74513` on branch
  `claude/compassionate-einstein-p1o6i0`, not on `redesign` (`CLAUDE.md` §12). The commit holds the
  same six files with the same line counts I reviewed. Which branch it belongs on is the coordinator's
  call.
- **Files.** `backend/test/postgres-repositories.integration-spec.ts` (+13 tests),
  `frontend/app/tokens/semantic.css`, `frontend/components/shell/{console,student}-shell.tsx`,
  `frontend/lib/format.ts`, `docs/phases/unit-5/FOLLOW_UP_CLOSURE.md`. For the coverage check I also
  read these against the tests: migration `017`,
  `manage/repositories/postgres-assistant-invitation.repository.ts`,
  `students/repositories/postgres-student.repository.ts`, `manage/admin-assistants.service.ts`, and
  `git diff --name-only a8e6d57~1..e9f7f15 -- backend/`.
- **Suites I ran myself** (Node v22.22.2, PostgreSQL 16 on :5433):

| Suite | Result |
|---|---|
| `TEST_DATABASE_URL=…/lms_test npm run test:integration` | **125 / 125, 1 file.** It actually executed: the log shows `001`…`017` each `Applied` after `DROP SCHEMA public CASCADE` (spec line 58), then four seeds, then `Schema is up to date` on the second pass. |
| `npm test` | **573 / 36 files** |
| `npm run test:e2e` | **244 / 4 files** |
| `frontend: npx tsc --noEmit \| grep -c "error TS"` | **0** |
| `npm run lint` | clean. The one warning is pre-existing (`dashboard.controller.spec.ts:17`, unused import). |
| Browser | I booted the dev stack myself (Postgres driver, `lms_dev`) and drove headless Chromium 1194 through `playwright-core`. Details below. |

## Did this move toward the NEW product?

Yes. This is a closure, not feature work. Its job was to prove the unit-5 build against real Postgres
and a real browser, and it did both.

- **Follow-up 1 (integration).** The executor saw correctly that the existing 112 tests never touched
  the unit-5 SQL. The two `Postgres*` changes in `a8e6d57..e9f7f15` are
  `PostgresAssistantInvitationRepository` (new) and `PostgresStudentRepository.updateByUserIdAsStaff`
  (new). I checked the name-only diff: no other `Postgres*` file, and no other migration, changed in
  unit 5. `AuthService.acceptInvitation` writes through `PostgresAssistantScopeRepository.setScope`,
  which is unchanged since unit 2 and already covered. The new tests reach every method of the
  invitation repository: `create`, `findById`, `findByToken`, `findPending`, `findPendingByEmail`,
  `reissue`, `updateDetails`, `markAccepted`, `remove`. They check the `accepted_at IS NULL` guard on
  each mutator after acceptance, and every constraint in `017`: `UNIQUE(token)`, both `CHECK`s, the
  `invited_by` FK in both directions, the `'{}'` default and the partial index predicate. The
  staff-edit tests cover the `CASE WHEN $n::boolean` omitted-versus-null contract, the no-row case and
  the `enrolled_course_count` subquery. This is real coverage, not a count bump.
- **Follow-up 2 (browser).** I re-ran the screens myself; results are below. All three fixes move the
  rendered product toward the handoff:
  - console links take their own tint instead of indigo;
  - the RTL desktop sidebar is back;
  - a missing mark reads `—` (`CLAUDE.md` §11.1).

## Findings

### C-1: an admin's reach renders as "0 groups", and the API reports it as `assigned_groups` / `[]`

- **Severity:** low. **Confidence:** confirmed. **Scope:** unit 5 (`PEOPLE-4`, slice 5c).
- **Where:** `backend/src/manage/admin-assistants.service.ts:330` (`scope: scope ?? 'assigned_groups'`)
  and `frontend/app/(app)/manage/assistants/page.tsx:64-68`.
- **Scenario:** signed in as the seeded teacher, `/manage/assistants` shows
  `Mona Saleh · admin · active · 0 groups`. `admin-1` has no `assistant_scopes` row (psql confirms it:
  only `assistant-1`, `assistant-2` and the browser-invited account have one), so `fromUser` falls back
  to `assigned_groups` with no groups.
- **Why it matters:** the comment at `:326-329` justifies that fallback for an *unconfigured
  assistant*, who really does reach nothing. An admin is unscoped (`CLAUDE.md` §7, `STAFF_ADMIN`). The
  screen, and the `Assistant` payload behind it, therefore tell the teacher that a full admin reaches
  no groups.
- **Security:** none. No authorization path reads this field for an admin.
- **Why it matters that it was mis-filed:** this is exactly the kind of defect follow-up 2 existed to
  catch. The closure doc files it as `F5-3`, "pre-existing, out of scope", and describes it
  inaccurately (see `C-4`).

### C-2: the base `a:hover` underline still reaches nav items and button-links

- **Severity:** low. **Confidence:** confirmed. **Scope:** pre-existing unit-4 behaviour; this change
  did not introduce it.
- **Evidence:** hovering a console sidebar item computes `text-decoration-line: underline`. So does
  hovering the header's primary `+ Live Session` button-link (white on `rgb(58,92,204)`).
- **Before the change,** the same underline applied, together with the indigo colour, because the
  unlayered rule beat everything.
- **After the change,** the colour is fixed and the underline remains. Layering is also what now makes
  this fixable: a `no-underline hover:no-underline` in the shell nav item and the button primitive
  would win. `components/ui/tabs.tsx` and `page-header.tsx` already do exactly this.
- **Why it does not block:** it is not a regression.

### C-3: phase-end documentation is not written yet

- **Severity:** process. **Confidence:** confirmed.
- **What is missing:**
  - `semantic.css` now departs from the handoff's text: the `a` rules are layered, and its own comment
    calls this "a change to the handoff's text". That is a decision, and it belongs in `CHANGELOG.md`
    (`CLAUDE.md` §12).
  - `IMPLEMENTATION_PLAN.md`, the unit-5 status in `PHASE_ROADMAP.md` and `project_log.md` do not yet
    reflect the closure.
  - `CLAUDE.md` §4.1's integration count should mention the new baseline, 125.
- **Consequence:** until these are written, `PHASE_ROADMAP.md` §2 conditions 6–8 do not hold. This is
  normally the coordinator's phase-end step, and it is listed here so it is not skipped.

### C-4: the closure record is inaccurate in three small places

- **Severity:** low. **Confidence:** confirmed.
- **`F5-3` is misdescribed.** The column renders `0 groups` / `1 group` (I read the page text and the
  screenshot), not `groups 0` / `group 1`. Nothing "reads backwards". The real defect is `C-1`.
- **The "0 console errors" claim is incomplete.** On the marketing pages I recorded three
  `/_next/image` **403**s (external `picsum.photos` sources) and one `ERR_TUNNEL_CONNECTION_FAILED` for
  `cdn.example.com`. All four come from the sandbox network and none is from a unit-5 screen, but the
  claim should say it covers the console flows only.
- **The stack was not fully stopped.** "The dev stack is currently STOPPED" was not true when I started.
  A leftover API from 20:50 (`backend/dist/main`, same Postgres config) still held `:3001`. I stopped
  it together with my own processes.
- **What is accurate:** the environment caveats (Postgres 16 not 15, Node 22 not 24, headless
  Playwright rather than the Chrome tool) are stated honestly and match what I observed.

### Test-quality notes (not findings)

- **Inviter-delete test.** The test that "the inviting admin cannot be deleted" only asserts
  `/foreign key/`, which another FK on `users` could also satisfy. I checked it directly: with the
  invitations removed, `DELETE FROM users WHERE id='admin-1'` succeeds in `lms_test`. So
  `assistant_invitations` is the constraint that actually refuses. Asserting the constraint name would
  make the test self-proving.
- **Ordering test.** "Newest first" asserts only that the oldest row is last.
- **Test independence.** The invitation `describe` block is order-dependent (`tok-1` → `tok-2`). That
  matches how the rest of the file is written.

## Adversarial check of the three frontend fixes

1. **`a` rules moved into `@layer base`.**
   - **Built CSS.** In `.next/static/chunks/0of6hr49x_1gh.css`, Tailwind's preflight
     `a{color:inherit;…}` sits at offset 7386 and the moved rule at 10237. Both are inside
     `@layer base{…}` (6549–10344), and `globals.css` imports `tailwindcss` before `semantic.css`. The
     handoff default therefore still beats preflight: an unclassed `<a>` stays indigo. The browser
     confirms it: skip link, footer Privacy/Terms, course-card and blog-card anchors, and the groups
     page's course link all still compute `rgb(62,99,221)`.
   - **Anchors with a colour utility.** These now take the utility: sidebar `fg-2`, active item `fg`,
     site nav `fg-3`/`fg`, auth links `fg-2`, header button white.
   - **Anchors that also carry `text-[var(--fs-*)]`.** That class compiles to `color:` too. `.text-fg-2`
     (offset 28284) is emitted after `.text-\[var\(--fs-base\)\]` (27826) and `--fs-h2` (27922), so the
     named colour wins. I measured every visible anchor on `/`, `/courses`, `/blog`, `/contact`,
     `/login` and `/forgot-password`. No anchor fell through to an inherited or invalid colour.
   - **Hover.** The underline is unchanged (`C-2`).
   - **Result:** no regression.
2. **`:focus-visible` left unlayered.**
   - **Correct per `CLAUDE.md` §11.** The global outline has to keep beating `focus-visible:outline-none`,
     which the build does emit (offset 41781). The unlayered rule sits at 75716, outside any layer.
   - **Measured:** a keyboard-focused sidebar link computes `outline-style: solid; outline-width: 2px`.
3. **`max-md:-translate-x-full max-md:rtl:translate-x-full`.**
   - **Built CSS.** Both rules sit inside `@media not all and (min-width:768px)`. They have equal
     specificity (`:where` adds none), and `rtl` is emitted later, so it wins in RTL below `md`. The
     `rtl:` selector also matches `:lang(ar)` and similar.
   - **Measured on `/manage/groups`:**

     | Direction | Width | Sidebar | Main |
     |---|---|---|---|
     | LTR | 1360 | [0, 244] | [244, 1360] |
     | LTR | 420 | [-244, 0] (off-screen) | |
     | RTL | 1360 | [1116, 1360] | [0, 1116] |
     | RTL | 420 | [420, 664] (off-screen) | |

   - **Open state:** `translate-x-0` is unconditional, so it is unaffected.
   - **Print:** `print:hidden` is retained on the console shell. Under print emulation the sidebar
     computes `display: none`. The student shell never had `print:hidden`; that is unchanged.
4. **`formatPercent(null)` → `—`.**
   - **Consumers.** Twelve call sites, in `marks`, `manage/courses/[id]`, `…/grading`,
     `manage/groups/[id]/report` and `dashboard`. None parses, compares or matches the returned string.
   - **Guarded caller.** `dashboard/page.tsx:157` already guards `null` before `Scored ${…}`.
   - **Tests.** The frontend has no unit tests to update.
   - **Measured:** both group reports render `—` for missing averages, and `--` appears nowhere on
     either page.

## Recorded-not-fixed findings `F5-1`…`F5-3`: are they real, and do they block unit 5?

| Finding | Real? | Blocks unit 5? |
|---|---|---|
| `F5-1`: `text-[var(--fs-*)]` compiles to `color` | **Real.** The build contains `.text-\[var\(--fs-h2\)\]{color:var(--fs-h2)}`, and there are 113 uses. Six tokens are undefined, with 87 references between them: `--fs-h1` (8), `-h2` (16), `-h3` (9), `-body` (32), `-lead` (16), `-display` (6). | **No, I agree.** It is unit-4 port debt on the marketing and auth surfaces. Fixing it needs a token-mapping decision that should not be guessed. It is high severity for the public site and should be scheduled as its own task. |
| `F5-2`: the "Teacher" role chip is amber | **Real.** `roleTone` falls through to `'amber'` (`console-shell.tsx:124-128`). | **No, I agree.** This is unit-4 shell code, and whether amber is right is a design question. |
| `F5-3`: the assistants "Reach" copy | **Misdescribed.** The real issue is `C-1`. | **I disagree that it is a unit-4 finding.** It lives on the `PEOPLE-4` screen and the unit-5 service, so it is unit-5 scope. It is low severity and not a security issue. It is what holds this verdict at follow-up. |

## Definition of Done (`PHASE_ROADMAP.md` §2) for unit 5

| # | Condition | Status |
|---|---|---|
| 1 | Plan approved | holds |
| 2 | Executor completed scope | holds |
| 3 | Reviewer `APPROVED` | **does not hold.** This verdict is `APPROVED WITH FOLLOW-UP`. |
| 4 | Tests pass, integration on real Postgres | **holds.** 573 / 244 / 125 executed. The caveat is Postgres 16 rather than production's 15; `017` uses nothing 16-only. |
| 5 | Security checks and refusal tests | holds. The unit-5 refusal tests were accepted in 5a–5d, and the closure changed no route. |
| 6 | Docs: CHANGELOG, project_log | **does not hold yet** (`C-3`) |
| 7 | `IMPLEMENTATION_PLAN.md` statuses | **does not hold yet** (`C-3`) |
| 8 | `PHASE_ROADMAP.md` status | **does not hold yet** (`C-3`) |
| 9 | Zero unresolved blockers in scope | holds. `C-1` is a follow-up, not a blocker. |

## Verified claims

**Confirmed:**

| Claim | How I checked |
|---|---|
| 001–017 apply from empty | Reproduced. |
| 125/125 | Reproduced. |
| 573 / 244 / tsc 0 / lint | Reproduced. |
| Only two `Postgres*` changes in unit 5 | Confirmed from the name-only diff. |
| All three fixes, and their rendered results | Reproduced in the browser. |
| `F5-1` numbers | Confirmed: 113 uses, 6 undefined tokens, 87 references. |
| `F5-2` | Confirmed in source. |
| The `:focus-visible` reasoning | Confirmed: `course-filters.tsx` pairs `outline-none` with a ring, and the unlayered outline still wins. |

**Not re-run by me:**

- The full invite → accept → sign-in UI flow, and the byte-identical 401 on a spent or unknown token.
- The staff-notes edit confirmed in `psql`.

Indirect evidence for the invite flow: an account named `ليلى فهمي` with `browser-invite@example.com`,
`status active`, an `all_groups` scope row and a `Last active` date exists in `lms_dev`. That is
consistent with the claim. The 401 identity is asserted by the existing e2e suite, which passed.

**Inaccurate:** see `C-4`.

## Remediation checklist

1. Fix `C-1`. Either:
   - have `AdminAssistantsService.fromUser` report `all_groups` for `role === admin` (admins are
     unscoped), with a spec asserting it; or
   - have the page render the Reach of an `admin` row as "Every group".

   The service fix is preferred, because the payload is the thing that is wrong.
2. Correct `FOLLOW_UP_CLOSURE.md`'s `F5-3` description, and scope its "0 console errors" claim to the
   console flows (`C-4`).
3. Write the phase-end documents (`C-3`):
   - a `CHANGELOG.md` entry for the `@layer base` departure from the handoff and the `max-md:` sidebar
     fix;
   - `IMPLEMENTATION_PLAN.md`;
   - `PHASE_ROADMAP.md`;
   - `project_log.md`;
   - `CLAUDE.md` §4.1's baseline (+ integration 125).
4. Decide which branch `1c74513` belongs on (`CLAUDE.md` §12 names `redesign`).

Once 1–3 hold, a short re-check can return `APPROVED`, and unit 5 can then be marked `COMPLETE`.

## Open decisions (surfaced, not ruled on)

- **`F5-1`:** what should `--fs-h1/h2/h3/body/lead/display` map to? The existing marketing tokens are
  `--fs-marketing-*`, and `--fs-h3` has no marketing equivalent. The question that closes it: *"Which
  `--fs-marketing-*` step is each of the six legacy size names, and what does `h3` use?"*
- **`F5-2`:** *"Should the teacher's role chip use a neutral or accent tone rather than amber, given
  that §11.1 reserves amber for a queue?"*

## Follow-ups for `IMPLEMENTATION_PLAN.md`

- `C-1`: admin Reach and payload scope (unit 5, blocks `COMPLETE`).
- `C-2`: add `no-underline hover:no-underline` to the shell nav item and the `ButtonLink` primitive
  (unit-4 debt, low).
- `F5-1`: port `text-[var(--fs-*)]` to `text-(length:--…)` and define or map the six missing tokens
  (unit-4 debt, high, needs the decision above).
- `F5-2`: role chip tone (design question).
- Test hardening: assert the FK constraint name in the inviter-delete integration test.

---

## Re-check — 2026-09-22, after the remediation pass

**RE-CHECK VERDICT: APPROVED WITH FOLLOW-UP**

**Unit 5 may not yet be marked `COMPLETE`.** Almost everything in the remediation checklist is done,
and I re-derived each item. What remains is `C-1`'s sibling path: the pending-invitation half of the
same defect. It is a one-line fix plus a spec. Everything else is ready.

### Scope

- **Commits.** `f92b492` on top of `1c74513`, on `claude/compassionate-einstein-p1o6i0`.
- **Branch.** The coordinator records that the harness mandates this branch. I accept that as outside
  this verdict; the user has it on record.
- **Files re-read.**
  - `backend/src/manage/admin-assistants.service.ts`
  - `admin-assistants.service.spec.ts`
  - `backend/test/postgres-repositories.integration-spec.ts`
  - `docs/API_SPEC.yaml`
  - `docs/CHANGELOG.md`
  - `docs/IMPLEMENTATION_PLAN.md`
  - `CLAUDE.md`
  - `FOLLOW_UP_CLOSURE.md`
  - `frontend/app/(app)/manage/assistants/page.tsx`
- **Suites, run by me:**

| Suite | Result |
|---|---|
| `npm test` | **574 / 36** |
| `npm run test:e2e` | **244 / 4** |
| `TEST_DATABASE_URL=…/lms_test npm run test:integration` | **125 / 125**. `017` applied from empty in this run too. |
| backend `tsc --noEmit` | 0 errors |
| frontend `tsc --noEmit` | 0 errors |
| `npm run lint` | only the pre-existing `dashboard.controller.spec.ts:17` warning |

### Checklist items

| Item | Status |
|---|---|
| **C-1, active accounts** | **Closed.** `fromUser` now returns `all_groups` for `role === Admin`, while an unconfigured assistant still fails closed as `assigned_groups` with `[]`. The new spec asserts both absent-row cases in one test, against `admin-1` and a freshly created assistant with no row. Against the old line it would fail on `admin-1`. `API_SPEC.yaml`'s `Assistant.scope` comment matches the code. No authorization path reads an admin's scope, so this is a response correction only, as the CHANGELOG says. |
| **Test note** | **Closed.** The inviter-RESTRICT test now matches `/assistant_invitations_invited_by_fkey/` and passed on real Postgres. |
| **C-4** | **Closed.** One remaining nit: the corrections section calls all four failed marketing loads "`picsum` images". Three were `picsum.photos` through `/_next/image`, and one was `cdn.example.com`. All four were sandbox egress failures either way, so it does not matter to the verdict. |
| **C-3** | **Closed as far as it can be.** The two CHANGELOG entries are accurate. Both record the `@layer base` narrowing of "ported verbatim" with the `:focus-visible` reason, and the admin-scope correction. `IMPLEMENTATION_PLAN.md` now shows `AUTH-4`'s `017` as run, closes `F2B2-3` with evidence I saw in `lms_dev`, and adds the `F5-1`…`F5-5` table, with `C-2` as `F5-4`. `CLAUDE.md` §3/§4.1 carry 574/244/125, the stale "009 and 010 never run" line in §9 is replaced accurately, and the two new §11 rules plus the size half of rule 1 are correct statements of what the browser pass found. |
| **Writing `PHASE_ROADMAP.md` and `project_log.md` after this verdict** | **Correct ordering.** Both documents state the verdict, so they cannot be written before it exists. Conditions 6–8 hold once they are written to match this re-check. |

### Residual finding

**R-1 (low, confirmed, unit-5 scope): a pending admin invitation can still read "0 groups".**

- **Cause.**
  - `validateWrite` (`admin-assistants.service.ts:281`) explicitly accepts `role: admin` with
    `scope: assigned_groups` and no groups.
  - `fromInvitation` (`:339-345`) returns `invitation.scope` verbatim.
  - In the page's `InvitePanel` (`manage/assistants/page.tsx:218, 230-236`), the scope state
    survives a role change, because the Reach picker returns `null` for an admin (`:173`) but the
    stale value is still sent.
- **Scenario.** The teacher opens *Invite assistant*, sets Reach to "Assigned groups only", then
  switches Role to Admin and sends. The pending row reads `admin · invited · 0 groups` until the
  invitation is accepted. That is the same false statement `C-1` described, on the invitation half of
  the same list.
- **What happens on acceptance.** `acceptInvitation` writes an `assigned_groups` scope row for the
  admin. This is harmless, because no authorization path reads it and `fromUser` now overrides it.
- **Why `F5-3` should not yet be marked `[x]`.** The `IMPLEMENTATION_PLAN.md` row and the CHANGELOG's
  "the two absent rows cannot read alike again" are true of active accounts only.
- **Security impact.** None.

### Remediation

1. Normalise an admin's scope once, at the service. Either:
   - have `validateWrite`/`invite`/`update` store `all_groups` whenever `role === admin`; or
   - have `fromInvitation` apply the same `role === Admin ? 'all_groups' : …` rule `fromUser` now uses.

   The first is preferable, because the stored invitation is then right as well as the response.
2. Extend the new spec, or add one, so that a pending admin invitation sent with `assigned_groups`
   lists as `all_groups`.
3. Keep `F5-3` open in `IMPLEMENTATION_PLAN.md` until then.

When those hold, and `PHASE_ROADMAP.md` and `project_log.md` are written from the final verdict,
nothing else stands between unit 5 and `COMPLETE`. `F5-1`, `F5-2` and `F5-4` are correctly
recorded as non-blocking unit-4 debt or design questions.
