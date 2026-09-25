# Handoff — finishing chat unit 13

Written 2026-09-25, at `redesign` = `2917d8f` + this commit. Unit 8 has landed, which unblocks the
last item.

**Read `CLAUDE.md` first, in full.** This document does not repeat it and does not override it.

---

## 1. Where it actually stands

Verified by running the gates on this tree, not quoted from a previous report:

| Gate | Measured |
|---|---|
| `npm test --workspace=backend` | **803 passed, 48 files** |
| `npm run test:e2e --workspace=backend` | **402 passed, 5 files** |
| `npm run lint` | 0 errors (4 pre-existing backend oxlint warnings) |
| backend `npx tsc --noEmit -p tsconfig.json` | **0** |
| frontend `npx tsc --noEmit` | **0** |
| `npm run typecheck:drift` | clean |

Unit 13 is `[~]` with **one task left**.

| Task | State |
|---|---|
| `SITE-1`…`SITE-5` | `[x]` — the 491-reference token repair (`F13-1`) |
| `STU-2` | `[x]` — `recordings.thumbnail_url`, library grid/list, watched `Meter` |
| `STU-3` | `[x]` — lesson detail, work set, **its material** (migration `025`), next-recording |
| `STU-4` | `[x]` — the four attempt states were already server-derived; the real gap was `F13-4` |
| `STU-5` `STU-6` `STU-7` | `[x]` — verified rather than rebuilt; `F13-2` ruled: **no avatars** |
| **`STU-1`** | **`[ ]` — the only remaining work. Now unblocked.** |

---

## 2. The remaining task: `STU-1`, the student Overview

`docs/PRODUCT_SPEC.md` §6:

> **Overview `[CHANGED]`** — Action-first: continue-watching, three action cards, due-today,
> dismissible announcement. **No mark anywhere on this page.**

The file is `frontend/app/(app)/dashboard/page.tsx` — **822 lines**, and the largest student screen.
It is fed by one endpoint, `GET /students/me/home` (`backend/src/dashboard/student-home.service.ts`),
which deliberately returns the whole screen in one request to kill a `2N + 2` fan-out. **Do not
reintroduce per-course calls**; that service's header explains why at length.

### 2.1 Two live defects I found while writing this handoff — read before designing

Neither is in scope for me to fix mid-handoff, and both change what `STU-1` should do. **Verify them
yourself before acting; do not take this document's word for it.**

**(a) The Overview renders a mark today, and the spec forbids it.**
`dashboard/page.tsx:165-167` renders `Scored ${formatPercent(assessment.scorePercentage)}`. The spec
row says *no mark anywhere on this page* — and `CLAUDE.md` §11.1 non-negotiable 2 separates progress
from performance everywhere. `DashboardStats.overallReportPercentage`
(`backend/src/dashboard/dashboard.service.ts:24`) is a **grade average** served to this screen and
described in its own comment as *"performance, not completion"*.

So the question `STU-1` has to answer is not only "what does the page render" but **"should the
endpoint still serve that field at all"**. Removing a field from a response is a contract change:
update `API_SPEC.yaml`, the `lib/types.ts` mirror, and let `npm run typecheck:drift` prove the
mirror agrees. Do not simply stop rendering it and leave the number travelling to the browser.

**(b) A heuristic on this page infers an axis that `D-9` retired.**
`dashboard/page.tsx:782`:

```ts
const isRecorded = progress.totalLessons > 0 || progress.totalSessions === 0;
const percentage = isRecorded ? progress.completionPercentage : progress.attendancePercentage;
```

Its comment cites *"the enrollment's mode decides what progress means"*. **There is no mode.** `D-9`
retired `learning_mode` **entirely** (migration `012`): every group now runs external-link sessions
*and* accumulates uploaded recordings. So `totalLessons > 0` is true for a normal course, the
heuristic always picks the *recorded* branch, and **`attendancePercentage` is effectively dead on
this screen**.

That matters directly, because the reason `STU-1` was deferred to unit 8 was that *"the Overview
composes unit 8's attendance figures"*. Unit 8 has landed
(`GET /students/me/attendance` → `StudentAttendanceResponse`, `lib/api.ts:1601`), so the attendance
figures now exist properly and this heuristic should go rather than be re-plumbed.

**Note the discrepancy and rule on it before building:** `PRODUCT_SPEC.md` §6's Overview row names
*continue-watching, three action cards, due-today, dismissible announcement* — and does **not**
mention attendance. The deferral reason did. Check the design handoff for what the three action
cards actually are; if the spec and the deferral reason disagree, that is a `CLAUDE.md` §2.3 finding
— record it and raise it, do not pick the easier reading.

### 2.2 What is already available to compose

- `GET /students/me/home` — per course: `stats`, `quickAccess` (`MaterialCounts`),
  `nextLiveSession` (`StudentSessionView`), `assessments`; plus `studentName` and `notifications`.
- `GET /students/me/attendance` — `present / late / absent / expected / percentage / history`.
- `GET /students/me/timetable?from&to` — `StudentSessionView[]`.
- Recording progress for continue-watching: `GET /courses/:courseId/recordings` already returns
  `watchedSeconds`, `completed` and `thumbnailUrl` per recording (`STU-2`).
- `frontend/app/(app)/lessons/[recordingId]/page.tsx` is the link target for continue-watching, and
  already exists.

**Prefer extending `student-home.service.ts` over adding a second round trip**, for the reason that
service already documents. If attendance belongs on the Overview, composing it there is consistent
with the endpoint's whole purpose.

---

## 3. Rules this unit learned the hard way

All are in `CLAUDE.md`; these are the ones that actually bit during unit 13.

1. **`npm run lint` now fails the build on an undefined design token** (`OPS-2`,
   `frontend/scripts/check-tokens.mjs`). That class shipped four times — 478, 113, 491, then 3 more
   in unit 14's Google screens *days after* the 491 were removed. The unit-8 session extended the
   same script with a `.num` bidi rule after a score rendered `6 / 2` under RTL. **If you add a
   check, prove it by reintroducing the real regression** — a checker only ever run against a clean
   tree has not been tested.
2. **`npm run test:e2e` runs one file per process and fails when any file prints no summary**
   (`OPS-3`, `backend/scripts/run-e2e.mjs`). `staff.e2e-spec.ts` dies with `0xC0000409` roughly one
   run in three on this machine, in its own process, under both pools. Up to 3 attempts, only on a
   summary-less run, 5s apart — a real failure prints `N failed` and is never retried. **Read the
   printed counts, never a piped exit code**: piping through `grep` returns grep's exit 1 when a
   crash suppresses output, which reads as a red suite when it is not.
3. **Measure a baseline at the commit you branch from, not in a shared working tree.** I reported
   726/325 early in this unit; the real branch-point baseline was 721, because the main tree still
   held another session's uncommitted edits.
4. **`git worktree remove` on worktrees nested inside the repo deleted `backend/` and `frontend/`
   from the main tree on this machine.** Everything was committed and `git checkout --` restored all
   452 files, but do not run it here until someone understands why.
5. **Shell artifacts.** Stray zero-byte files named things like `{,+`, `0)` and `$(git` keep
   appearing from quoting accidents and one got **committed** in unit 8's merge (removed in this
   commit). Check `git status` for junk before every commit.
6. **A migration is not done until it runs from an EMPTY schema against real PostgreSQL.** Container
   `tahirelshazli-db`, user `dev`, password **`devpassword`** (not `dev` — that error cost an
   implementer an hour). Create a throwaway database; never touch the dev one.
   **And note unit 8's sharper lesson:** an empty-schema run is *silent about every guard and every
   backfill*, because there are no rows to trip them. Seed fixtures too if your migration guards or
   backfills anything.
7. **Never let a spec file shrink.** Compare `it(`/`test(` counts across any merge — unit 10 once
   replaced a spec instead of extending it and silently deleted 19 tests, including three
   `CLAUDE.md` invariants, and three reviewers missed it.

---

## 4. Migration numbering

`001`–`026` are taken. **`027` is next.** The last three moved during this unit's life — `023` →
`024` (unit 14 collision), unit 8's `019` → `026` — so **check `ls backend/src/database/migrations/`
rather than trusting any document, including this one.**

`STU-1` should need no migration at all; if you find yourself writing one, re-read the scope first.

---

## 5. Scope boundaries — what NOT to do

- **No avatars on Classmates.** Ruled by the client 2026-09-24, `F13-2` closed. The service returns
  name and id deliberately; `PRODUCT_SPEC.md` §6 was corrected at source. Do not add one back
  because a design shows a circle.
- **No material authoring surface.** Migration `025` added `materials.lesson_id`, but materials have
  **no** create/update/delete for any field — one `GET`, everything seeded. Material CRUD is a
  feature in its own right and nothing in §6 asks for it.
- **`/catalog` and the student `/achievements` rail entry are `[REMOVED]`.** Do not build them.
- **No quiz engine.** Quizzes are driven by the existing `work_type: google_form`.
- The homework/quiz split runs through one exhaustive `Record<WorkType, …>` in `lib/format.ts`
  (`isQuizWork`). **Do not hand-roll a fourth `workType === 'google_form'` filter** — two
  hand-written ones are exactly what caused `F13-4`, where every Form task rendered on both
  `/homework` and `/quizzes`.

---

## 6. Definition of done for unit 13

`docs/PHASE_ROADMAP.md` §2's nine conditions. Concretely, what remains:

1. `STU-1` built, with the §2.1 defects ruled on rather than inherited.
2. Every gate in §1 still green, with no test deleted or skipped to get there.
3. `IMPLEMENTATION_PLAN.md` `STU-1` → `[x]`; `PHASE_ROADMAP.md` unit 13 → `[x]`.
4. `CHANGELOG.md` for any decision that narrows or reverses one — in particular a ruling on the
   mark-on-Overview question and on the retired-axis heuristic.
5. `API_SPEC.yaml` if the home endpoint's shape changes, with `typecheck:drift` proving the mirror.
6. `project_log.md` entry.
7. A reviewer verdict of `APPROVED`. `APPROVED WITH FOLLOW-UP` leaves the unit `[~]`.

**The unit has never been driven in a real browser.** Unit 8's own browser check is what caught the
RTL score reversal (`F8-1`) that every automated gate passed. Worth doing for the Overview, in both
themes and `dir="rtl"`, before calling it done.
