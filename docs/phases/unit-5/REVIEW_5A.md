# Review — unit 5, slice 5a: `PEOPLE-1` finish (waiting queue UI)

**Implementer/reviewer:** Claude (orchestrator, done directly — Antigravity's dispatch for this
slice failed on quota with zero work done, and per the user's instruction the work continues as one
agent rather than a further subagent) · **Date:** 2026-09-21

## Verdict: **APPROVED**

## Correction this slice's own research produced

The phase plan's first draft claimed `PEOPLE-1` was entirely unbuilt. It wasn't: reading the actual
files (not grepping for a stale comment) showed `backend/src/manage/{directory.service.ts,
registration-approval.service.ts}` + `admin-manage.controller.ts` already fully implement the
directory read, accept, and reject — transactional, audited, anti-enumeration 404, tested
(`registration-approval.service.spec.ts`) — and `frontend/lib/api.ts`/`lib/types.ts` already mirror
all of it. The only real gap was `manage/students/page.tsx` itself, which unit 4's mechanical port
never wired to the accept/reject calls that already existed. `PHASE_PLAN.md` §0 was rewritten before
any implementation started, so no work was wasted on the wrong premise.

## What was built

Rewrote `frontend/app/(app)/manage/students/page.tsx`: added a status column (`Tag`, tone per
status), a status filter (`Select`), and a "Decide" action on `waiting` rows opening an inline
panel (no `Modal` primitive exists yet — a deliberate, disclosed choice not to invent one for a
single call site) with a group picker for accept (the group decides the enrolled course, matching
`registration-approval.service.ts`'s own design) and an optional reason field for reject. No backend
change; reused `api.admin.students/acceptRegistration/rejectRegistration/groups` exactly as they
already existed.

## Verification

- `npx tsc --noEmit 2>&1 | grep -c "error TS"`: **22**, unchanged (this file already compiled
  before; new usage is fully typed). `npx eslint` on the file: clean.
- **Live-verified both directions against the real backend**, not just compiled: registered two
  fresh `waiting` accounts via the real `/auth/register` endpoint, signed in as the seeded teacher,
  and used the actual screen to accept one (group picker, real `POST .../accept`) and reject the
  other (real `POST .../reject` with a reason). Confirmed via a direct API read after each action —
  not just trusting the UI — that `accept` correctly set `status: 'active'` and
  `enrolledCourseCount: 1` (real enrollment on the group's course, the one-transaction guarantee
  `registration-approval.service.ts` promises), and `reject` correctly set `status: 'rejected'`,
  `enrolledCourseCount: 0`. Zero console errors throughout.
- Browser-automation screenshots were flaky mid-session (a recurring CDP/extension issue this whole
  session, not an app bug) — worked around by verifying outcomes directly against the backend API
  rather than trusting a stalled screenshot, which is the more reliable check anyway.

## Outstanding

None new. Slice 5b (`PEOPLE-2`/`PEOPLE-3`) is next.
