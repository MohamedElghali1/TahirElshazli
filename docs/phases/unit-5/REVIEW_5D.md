# Review — unit 5, slice 5d: `GROUP-3`, `GROUP-4`, and closing the frontend's `tsc` count

**Implementer/reviewer:** Claude (orchestrator, done directly — one agent throughout) ·
**Date:** 2026-09-21

## Verdict: **APPROVED WITH FOLLOW-UP**

Same two follow-ups slice 5c carried, still open: no integration run against real Postgres (no
Docker in this environment — nothing in this slice added a migration, so the gap is unchanged, not
widened), and interactive browser verification (the Chrome automation tool's tab is still
unresponsive to clicks and typing, reproduced again on a fresh tab this slice — same symptom
reported as product feedback during 5c). Both are pre-existing, disclosed, and unaffected by
whether this slice's code is correct.

## What was built

**Backend**:
- `GroupsService.bulkMove` (`GROUP-3`): `POST /admin/groups/{groupId}/members/bulk`. Every
  `studentId` validated (exists, is a student) **before** any write, so a batch that is half valid
  is refused whole rather than leaving the group half-moved. Each placement then goes through the
  same `addMember` a single placement uses, in one transaction, each one audited individually
  (`group.student_assigned`) — the route saves the UI N requests, it does not change what a
  placement means. Teacher/admin only, matching `API_SPEC.yaml`'s pre-existing route contract (this
  route was specified but never implemented — confirmed by grepping the backend for `bulk` before
  writing anything).
- `GroupsService.report` (`GROUP-4`): `GET /staff/groups/{groupId}/report`, scoped through the same
  `requireGroup` chokepoint every other group read uses. Scored against
  `findByCourseForGroups(courseId, [groupId])` — what was actually **targeted** at this group, not
  `findByCourse`'s every-assessment-on-the-course reading, which would have shown a group work
  another cohort was set. The group-level `averageScorePercent` is rolled up from every individual
  graded submission's share directly, not from an average of the per-student rounded averages —
  those disagree once students carry different numbers of graded tasks, and the direct rollup is
  the one that does not quietly reweight a student with one grade the same as one with ten.
  `GroupsModule` now imports `AssessmentsModule` for `ASSESSMENT_REPOSITORY`; confirmed no cycle
  (`AssessmentsModule` does not import `GroupsModule` — its own doc comment already records why it
  stopped needing to).
- **No PDF route, and that is a corrected assumption, not an oversight.** The phase plan carried an
  open item (`B-9`) that this slice's PDF might reuse marking's rendered-overlay pattern (`D-2`).
  Reading `D-2` before building anything found it answers a different question — annotating an
  *existing* submitted PDF with strokes that never touch the source file. A group report has no
  source PDF to overlay; it is generated from scratch. This stack carries no server-side PDF
  library (`CLAUDE.md` §3, §5), so the correct answer is the same one browsers have offered natively
  for decades: render the report as a normal page and let `window.print()` (→ "Save as PDF") produce
  the file. `API_GAP_ANALYSIS.md`'s "Group report ... PDF" row and `IMPLEMENTATION_PLAN.md`'s
  `GROUP-4` row are annotated with this rather than left to look unfinished.

**Frontend** — the actual point of this slice, closing the `tsc` count `CLAUDE.md` §4.1 has carried
since `SHELL-4`:
- `manage/groups/page.tsx` **rewritten**. It was calling `api.admin.createGroup(token, name)` and
  reading `group.courses`/`pairing.learningMode` — a join-table and an axis that migrations 012/013
  retired outright (`D-9`: "every course is now taught the same way", not moved to the group as an
  earlier plan assumed). Rebuilt on the current `Group` shape: name, one required course at
  creation, an edit panel for name/course/assistant/meets/room, a link to each group's report.
- `manage/courses/[id]/groups/page.tsx` **fixed, not rewritten** — the unplaced-student panel and
  the per-group roster were already correct; only the retired `pairing.learningMode` tag was
  removed. Two additions: the remove-member button is now hidden for a caller who is not
  teacher/admin (`isAdminRole`) — courtesy, matching the server-side `assertMay` gate that already
  refused an assistant with 403, so the control is simply not offered rather than offered and then
  refused; and a checkbox-select-then-move control per group card, wired to the new bulk-move route
  (also admin-only, same reasoning).
- `manage/courses/[id]/staff/page.tsx` **deleted**, not rewritten. Confirmed orphaned before
  deleting: no nav item links to it (`console-shell.tsx`'s nav list has no "staff" entry under
  courses), no other page references the path, and its backend routes
  (`courseStaff`/`assignStaff`/`unassignStaff`) were already retired by `AUTH-2` — assigning an
  assistant's reach is a *group* grant now (`PATCH /admin/assistants/{userId}` or a group's own
  `assistantId`), not a per-course list. Same consumer-count discipline `SHELL-4` used for
  `components/app/*`'s dead files (`D-25`).
- `manage/groups/[id]/report/page.tsx` (new): stats (`StatNumber` — members, assessments set,
  average score) plus a per-student table, and a "Print / save as PDF" button. The console shell
  (`components/shell/console-shell.tsx`) gained `print:hidden` on its nav rail and header so the
  printed output is the report alone, not the whole app chrome.
- `lib/api.ts`/`lib/types.ts`: `bulkMoveMembers`, `groupReport`, `GroupReport`/`GroupReportEntry`.
  The dead `addGroupCourse`/`removeGroupCourse` methods the old `manage/groups/page.tsx` called had
  already been removed from `lib/api.ts` in an earlier unit — confirmed by grep before assuming they
  needed removing, they did not exist to remove.

**Result: `npx tsc --noEmit` in `frontend/` is now 0**, not 22. `CLAUDE.md` §4.1 rewritten: the
mid-redesign "don't gate on the total" exemption is retired along with the count it was covering
for — a `tsc` error from here on is an ordinary regression, not tolerated debt.

## Verification

- `npm test --workspace=backend`: **573 passed, 36 files** (7 new in `groups.controller.spec.ts`:
  bulk-move's happy path with per-student audit entries, 404 on an unknown group, atomicity — a
  batch with one bad id writes nothing — and the 400 for a non-student id; the report's shape, an
  assistant reading a group they hold, and the same-message 404 for one they do not).
- `npx tsc --noEmit --project backend`: clean.
- `npm run lint`: clean (the one pre-existing, unrelated warning, untouched).
- `npx vitest run --config ./vitest.config.e2e.ts`: **244 passed, 4 files** (up from 242 — one new
  admin-route parity entry for the bulk-move route, one new 404-parity row for the report route in
  the existing assistant-scoping `it.each` table).
- **Integration suite: not run.** No Docker in this environment. This slice added no migration, so
  the gap `REVIEW_5B.md`/`REVIEW_5C.md` already carry is unchanged, not widened by this work.
- `npx tsc --noEmit` in `frontend/`: **0** (down from 22). `npx eslint .` across the whole
  `frontend/` tree: clean, zero warnings.

## Live-verified against the real running dev stack

Backend, via direct requests against the actually-running dev server: `POST
/admin/groups/group-2/members/bulk` with two real students moved into a real group
(`{"moved":2}`, confirmed present on a follow-up `GET`); `GET /staff/groups/group-1/report` against
the real seed fixture returned real per-student figures (`averageScorePercent: 81` for the student
with graded work, `null` — not `0` — for the one with none). Every new/rewritten frontend page
(`/manage/groups`, `/manage/groups/group-1/report`, `/manage/courses/course-1/groups`) fetched
directly and confirmed 200 with no SSR error.

**Interactive browser verification did not complete**, for the same reason recorded in
`REVIEW_5C.md`: the Chrome automation tool's tab does not deliver clicks or typed input to the page
(confirmed again this slice, on a freshly-created tab, logging in as the seeded teacher — the
`Sign in` click never fired the login request). This is a tool-level failure, not observed to
correlate with anything this slice changed; the print-to-PDF layout, the bulk-move UI, and the
report page's rendering were therefore verified by direct API calls and SSR fetches rather than by
watching them run in a browser. Flagged as a standing follow-up until the tool recovers.

## Outstanding, carried forward

- Integration coverage against real Postgres, once Docker is available in this environment —
  covers migration `017` (unit 5 slice 5c) and every `Postgres*Repository` touched since the last
  integration run.
- Interactive browser verification of every screen built across slices 5a–5d, once the Chrome
  automation tool is usable again.

## Unit 5, taken as a whole

`PEOPLE-1` … `PEOPLE-6`, `GROUP-1` … `GROUP-4`, and `AUTH-4` are all built and tested. The frontend
`tsc` count this unit was explicitly asked to close (`CLAUDE.md` §4.1, `PHASE_ROADMAP.md`'s unit-5
entry) is at 0. Per `PHASE_ROADMAP.md` §2 condition 4, the unit stays `APPROVED WITH FOLLOW-UP`
rather than `COMPLETE` until the two items above close — both are environment limitations external
to the code, not open questions about what was built or whether it is correct.
