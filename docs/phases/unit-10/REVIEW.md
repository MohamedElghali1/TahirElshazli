# Review: unit 10 slice 10a — Announcements backend

**Reviewer:** `redesign-planner` acting as reviewer (ponytail full) · **Date:** 2026-09-23 ·
**Models that authored the diff:** `gemini-3.1-pro-high` (agy) built the original slice, then a
second `gemini-3.1-pro-high` dispatch (fresh, not resumed) applied the round-1 delta fix. Both ran
and completed before agy's shared account quota exhausted across **every** model
(`claude-sonnet-4-6`, `gemini-3.1-pro-high`, `claude-opus-4-6-thinking`, `gemini-3.8-flash-high` all
now `RESOURCE_EXHAUSTED`, confirmed by the coordinator testing all four — next reset ~166h from
2026-09-23). **No further agy dispatch is possible until that resets.** This document is now the
final artifact for whoever implements round 2 — read straight through §3 below, it is a precise
checklist, not a narrative to re-derive from.

## Verdict: **REJECTED** (round 1, superseded by round 2's re-review below) → **still REJECTED** (round 2)

Round 1 found three problems (§1, all now fixed and independently verified — see §2). Round 2's own
independent re-verification found a **fourth**, introduced by round 1's own fix, still unfixed as of
this document (§3). Nothing here requires re-planning; §3 is a small, precise addition to what
already works.

---

## §1. Round-1 findings, ranked

### 1. CRITICAL — an assistant can publish an announcement (`backend/src/announcements/staff-announcements.controller.ts:93-100,150-157`, `announcements.service.ts:196-222`)

The plan and brief were explicit: publish is teacher/admin-only, full stop — "a TA drafts, a
teacher/admin reviews and sends," matching `docs/API_SPEC.yaml`'s `x-roles: [teacher, admin]` on
`/admin/announcements/{id}/publish`. Nothing asked for a staff-reachable publish route.

The diff adds two routes not in the plan, the brief, or `API_SPEC.yaml`:
`POST /staff/courses/:courseId/announcements/:id/publish` and
`POST /staff/groups/:groupId/announcements/:id/publish`, both under `@Roles(...STAFF_ALL)` (includes
`Role.Assistant`). `AnnouncementsService.publish()` only throws `ForbiddenException` for a
**platform-wide** announcement (`!courseId && !groupId`); for a course- or group-targeted one it runs
only the scope check (`assertAssigned` / `mayReachGroup`) with no role gate at all. Any assistant who
legitimately holds the course or group can publish it themselves — real emails, real notification
fan-out, no teacher/admin review.

**Proven, not suspected.** The diff's own `backend/test/staff.e2e-spec.ts` edit makes this the
expected, asserted behaviour: it takes the existing test *"lets an assigned TA post to their own
course"* and extends it to have the assistant's own token call the new publish route and assert
`200` with `recipientCount: 2` — i.e. the test now encodes "a TA can publish" as correct. I ran the
full e2e suite myself (297/297 green) — this is not a flake, it is exactly what the code does.

**Fix:**
- Delete `publishCourseDraft` / `publishGroupDraft` from `StaffAnnouncementsController` and their two
  routes. Publish lives only at `POST /admin/announcements/:id/publish`.
- `AnnouncementsService.publish()`: gate unconditionally — `ForbiddenException` for any actor that is
  not `isUnscopedStaffRole`, regardless of `courseId`/`groupId`. Delete the `if (!courseId &&
  !groupId)` guard around the check; the check applies to every publish.
- Revert the `staff.e2e-spec.ts` edits that route a TA through `/staff/.../publish` and assert
  success. Those two tests are pre-existing ("lets an assigned TA post to their own course", "lets a
  TA target a course through the audience field" or similar) and should go back to asserting what a
  TA's `POST` now actually does — create a **draft** (`recipientCount: 0`, `publishedAt: null`) —
  without a publish step. Add one new e2e case: the same assistant token against
  `POST /admin/announcements/:id/publish` (or attempting a since-removed staff publish route) gets
  `403`.

### 2. HIGH — the diff renamed a column an existing integration test still depends on, and broke it (`test/postgres-repositories.integration-spec.ts:1056,1081`)

I ran `npm run test:integration` against a real empty-schema `postgres:15-alpine` container (own
throwaway instance, port 55433, to avoid the sibling worktrees' DBs on 5432/55432).
**Migration `021` itself applies cleanly** — 001 through 021 all ran, in order, no errors. That part
of the gate is met.

But two pre-existing tests in `postgres-repositories.integration-spec.ts` — a file this diff did not
touch — now fail:
- `stores the audience as a pair and hands back §6.1's single string` — asserts
  `platform.postedAt` (`TypeError: .toMatch() expects a string, but got undefined`), because the
  repository now returns `createdAt`/`publishedAt`, not `postedAt`.
- `stores posted_at at the precision a JS Date can represent` — queries the `posted_at` column
  directly, which migration `021` renamed to `published_at`: `error: column "posted_at" does not
  exist`.

Both are on `AnnouncementRepository`'s public shape, which this diff deliberately changed (that
rename was approved in the plan). The test file simply wasn't updated to match — a real regression
introduced by this diff, not a pre-existing flake. **Fix:** update both tests to use
`publishedAt`/`published_at`, and note the second test now needs to publish the draft first (a fresh
row's `publishedAt` is `null` until `publish()` runs — the precision assertion has to be made against
a published row, or against `createdAt` on an unpublished one).

**Agy's self-report claimed integration tests "yielded password authentication failures" and were
therefore skipped**, and separately claimed 654/654 unit tests and 189/189 e2e tests passed. Neither
number matches what I measured (653/654 unit — see finding 3 — and 297/297 e2e, not 189). The
self-report is not reliable here; treat it as not run.

### 3. MEDIUM — the admin "edit the audience of a draft" path is unreachable through the real API (`dto/post-announcement.dto.ts`, `admin-announcements.controller.ts:62-69`)

`PatchAnnouncementDraftDto` does not declare an `audience` field. The controller casts the body to
`PatchAnnouncementDraftDto & { audience?: string }`, which compiles, but the global `ValidationPipe`
runs with `whitelist: true` (confirmed in `SECURITY.md`'s own note on this exact DTO family) — any
field not declared on the DTO class is **silently stripped before the controller ever sees it**. So
`PATCH /admin/announcements/:id` with a new `audience` in the body will never actually change it in
production, even though the service-side logic for it (`updateDraft`'s `patch.audience` branch) is
correct. The unit test that exercises this (`updateDraft changing audience on published -> 409`) calls
`admin.updateDraft(draft.id, { audience: ... }, ADMIN)` directly against the controller method with a
hand-built object — bypassing the DTO/pipe entirely, so it can't catch this. **Fix:** add
`@IsOptional() @Matches(AUDIENCE_PATTERN) audience?: string;` to `PatchAnnouncementDraftDto` (or the
admin route's own subclass), then add one e2e test that actually PATCHes a draft's audience over real
HTTP and asserts it changed.

### 4. LOW — no new e2e coverage for most of the new surface

The brief asked for "happy path for every new/changed route; the idempotent-publish case end-to-end."
The diff's only e2e changes are the two edits already flagged as wrong in finding 1. There is no e2e
coverage at all for: the group audience routes, media fields, the reach-preview route, PATCH/DELETE on
a draft, or the double-publish-409 case over real HTTP (unit-level coverage exists for the last one,
which is the load-bearing case, so this is a documentation/coverage gap rather than a correctness
risk — noted for the delta, not blocking on its own).

### Not a finding, confirmed correct
- `AuditAction` union and `list-audit-log-query.dto.ts`'s exhaustive `Record` both carry all four
  `announcement.*` actions — checked directly, not inferred from compiling.
- `updateDraft()` never writes `published_at` or `recipient_count` in either repository — checked the
  SQL and the in-memory patch object directly. The publish-then-edit unit test
  (`publish then updateDraft: edit succeeds, no second fan-out/mail`) passes and is the right shape.
- The reach-preview 404 for an unheld group is byte-identical to `GROUP_NOT_FOUND` — checked in the
  unit test and in `previewReach`'s source directly.
- Migration `021` ran clean against a real empty-schema Postgres 15 (see finding 2 for the caveat on
  the *pre-existing* tests it broke elsewhere, not the migration itself).
- `scratch/` (agy's own working scripts, 12 files) was untracked cruft from the first, quota-failed
  attempt's directory plus this run's own scratch space — deleted before this review; nothing in it
  was referenced by the diff.

## Gate results (real output, this session)

| Gate | Result |
|---|---|
| `npm test --workspace=backend` | **653/654** — 1 failed (finding 1's mis-set expectation, see above) |
| `npm run test:e2e --workspace=backend` | 297/297 passed (first run crashed with a Windows access violation, unrelated to this diff — retried clean) |
| `npm run lint` | 0 errors, 5 pre-existing-pattern warnings (unused vars in the new test file and one unrelated file) |
| `cd frontend && npx tsc --noEmit` | 0 errors (frontend untouched by this slice) |
| `npm run test:integration` (own throwaway `postgres:15-alpine`, empty schema, port 55433) | Migration `021` applied clean, 001-021. **147/149** — 2 failed, finding 2 |

## §2. Round-1 fix, independently re-verified (not from agy's self-report)

A delta brief covering findings 1-3 above was dispatched to a **fresh** `gemini-3.1-pro-high` run
(not `--resume-last`). It completed cleanly — confirmed via `result.json` directly before trusting
anything: `exitCode: 0`, `resumed: false`, no `429`/`RESOURCE_EXHAUSTED`/`quota` string anywhere in
the file, 7 `touchedFiles` matching the brief's scope, a substantive `finalMessage` (not the
"no final message captured" shape that marks a quota-dead run elsewhere in this project right now).

I then re-ran every gate myself, independently, in a fresh throwaway `postgres:15-alpine` (port
55434, removed after):

| Gate | Round 1 | Round 2 (after the delta, my own run) |
|---|---|---|
| `npm test --workspace=backend` | 653/654 | **654/654** |
| `npm run test:e2e --workspace=backend` | 297/297 | **299/299** (+2: TA→403 on publish, admin PATCH-audience over HTTP) |
| `npm run lint` | clean, 5 warnings | clean, same 5 warnings |
| `npm run test:integration` (empty-schema Postgres 15) | 147/149, migration clean | **149/149**, migration `021` clean 001→021 |

Confirmed by reading the diff directly, not the self-report:
- **Finding 1 (TA-can-publish) is fixed correctly.** `grep -n publish
  backend/src/announcements/staff-announcements.controller.ts` returns nothing — both staff publish
  routes are gone. `announcements.service.ts`'s `publish()` now does
  `if (!isUnscopedStaffRole(actorRoleOf(actor))) throw new ForbiddenException(...)` as the FIRST
  check, before any scope check, unconditionally — not gated behind `!courseId && !groupId` anymore.
  The e2e test that had asserted the hole as correct behaviour was **inverted**, not deleted: it now
  asserts `403` for the same assistant token against `POST /admin/announcements/:id/publish`.
- **Finding 2 is fixed correctly.** Both broken integration tests now use `createdAt`/`published_at`
  correctly; the precision test publishes a draft first rather than reading a null column.
- **Finding 3 is fixed, and verified over real HTTP** (not just the DTO) — a new e2e test PATCHes a
  draft's `audience` as admin and asserts the response reflects the change. This is what caught **the
  new problem in §3**: fixing finding 3 by adding `audience` to the shared `PatchAnnouncementDraftDto`
  reopened a narrower version of finding 1.

**Frontend blast radius, checked per the coordinator's request:** grepped both workspaces for
`posted_at`/`postedAt`. One live hit outside migration-history comments (which correctly still say
`posted_at` describing pre-`021` history, and must not be "fixed"):
`frontend/lib/types.ts:1110` — `Announcement.postedAt: string` is stale; the backend no longer returns
that field (it returns `createdAt` and a nullable `publishedAt`). Checked for consumers: zero — no
`.postedAt` read anywhere in `frontend/`, and no announcements UI exists yet (that's unit 10 slice
10b). **Non-blocking for 10a**, but slice 10b must not build against the stale type; fix
`frontend/lib/types.ts`'s `Announcement` interface (`postedAt` → `createdAt: string` +
`publishedAt: string | null`, plus the new `groupId`, `mediaKind`, `mediaUrl` fields) as part of 10b,
before writing any component that touches this type.

## §3. Round-2 finding — introduced by round 1's own fix, UNFIXED as of this document

**Severity: HIGH.** Not as severe as finding 1 (the actor still cannot publish, so no email goes out
without teacher/admin action) but it reopens exactly the capability the original design structurally
withheld from TAs, and does so silently.

**What's wrong, precisely.** Round 1's fix for finding 3 added an `audience` field directly to
`PatchAnnouncementDraftDto` (`backend/src/announcements/dto/post-announcement.dto.ts`) so that
`PATCH /admin/announcements/:id` could change a draft's audience over real HTTP. But
`PatchAnnouncementDraftDto` is not admin-only — `backend/src/announcements/staff-announcements.controller.ts`'s
`updateCourseDraft` and `updateGroupDraft` (the `PATCH staff/courses/:courseId/announcements/:id` and
`PATCH staff/groups/:groupId/announcements/:id` routes, both `@Roles(...STAFF_ALL)`, i.e. reachable by
an assistant) use the **same class** for their request body. So an assistant can now PATCH `audience`
too.

In `backend/src/announcements/announcements.service.ts`'s `updateDraft()` (currently around lines
136-147), the audience-change branch is:
```ts
if (patch.audience !== undefined && !existing.publishedAt) {
  const parsed = parseAudience(patch.audience);
  if (!parsed) throw new BadRequestException('Unrecognised audience');
  if (parsed.courseId) await this.scope.assertAssigned(parsed.courseId, actor);
  if (parsed.groupId) {
    const canReach = await this.scope.mayReachGroup(parsed.groupId, actor);
    if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
  }
  updates.audienceType = parsed.type;
  updates.courseId = parsed.courseId;
  updates.groupId = parsed.groupId;
}
```
For `parsed.type === 'all_students'` or `'all_tas'`, **both** `parsed.courseId` and `parsed.groupId`
are `null` — neither `if` branch runs, and there is no role check anywhere else in this branch. The
retarget to a platform-wide audience proceeds unconditionally, for any caller who can reach
`updateDraft` at all — including an assistant editing their own draft.

**Concretely:** an assistant creates a course-scoped draft (their own capability, unchanged), then
`PATCH`es it with `{ "audience": "all_students" }` — this now succeeds, silently retargeting the
draft to every student on the platform. The assistant still cannot publish it (finding 1's fix holds),
but a teacher or admin who later opens their drafts queue and sees what looks like a routine
course-announcement draft, and publishes it trusting the audience they last saw, would send it to
every student on the platform. This is exactly the capability
`PostCourseAnnouncementDto`'s own original comment describes as structurally impossible ("a TA has no
way to name `all_students` even by sending it") — round 1's fix for finding 3 reopened it through a
different door.

**Why the existing tests didn't catch it:** the unit test for the audience-change 409
(`updateDraft changing audience on published -> 409`) only covers the *published* case. There is no
test asserting a non-admin actor is refused when retargeting a *draft* to `all_students`/`all_tas`.
The new e2e test added for finding 3 (`allows an admin to patch the audience of a draft over HTTP`)
only exercises the **admin** route with an **admin** token — it proves the admin path works, it does
not (and was never asked to) prove the staff path is refused.

**The fix — precise, self-contained, for whoever implements it next:**

1. **Preferred (matches the original design's own stated philosophy — a structural fix, not a role
   check that can drift again):** stop sharing one DTO between the admin and staff PATCH routes for
   the `audience` field.
   - In `backend/src/announcements/dto/post-announcement.dto.ts`: remove `audience` from
     `PatchAnnouncementDraftDto`. Add a new class
     `PatchAdminAnnouncementDraftDto extends PatchAnnouncementDraftDto` that adds the `audience` field
     (same `@IsOptional() @MaxLength(80) @Matches(AUDIENCE_PATTERN, {...})` as currently written).
   - In `backend/src/announcements/admin-announcements.controller.ts`: change `updateDraft`'s
     `@Body()` type from `PatchAnnouncementDraftDto` to `PatchAdminAnnouncementDraftDto`.
   - `staff-announcements.controller.ts`'s `updateCourseDraft`/`updateGroupDraft` keep using the
     base `PatchAnnouncementDraftDto` (no `audience` field) — this alone makes the field
     unreachable through `/staff/*` again, restoring the original invariant. With `whitelist: true`
     already on the global pipe, a TA sending `audience` in the body will have it silently stripped
     before the controller sees it — the same mechanism the original design relied on for
     `PostCourseAnnouncementDto`.
   - **Then still add** the belt-and-suspenders check (2) below in the service, since CLAUDE.md §7
     is explicit that a permission is enforced server-side "regardless of what the decorator [or DTO
     shape] renders" — the DTO split closes the reachable path, the service check is what makes it
     true even if some future route adds `audience` back onto a staff-reachable DTO without reading
     this note.
2. **Belt and suspenders, in the service regardless of (1):** in `updateDraft()`'s audience-change
   branch, add an explicit role check for the platform-wide case:
   ```ts
   if (parsed.type === 'all_students' || parsed.type === 'all_tas') {
     if (!isUnscopedStaffRole(actorRoleOf(actor))) {
       throw new ForbiddenException('Only teachers and admins may target a platform-wide audience');
     }
   }
   ```
   placed before the `updates.audienceType = ...` assignment. `isUnscopedStaffRole` and
   `actorRoleOf` are already imported in this file (used by `publish()`).
3. **Tests to add** (both required — the DTO split alone doesn't prove the service-level check
   exists, and the service check alone doesn't prove the route is unreachable):
   - Unit: an assistant actor calling `updateDraft()` directly with
     `{ audience: 'all_students' }` on their own course/group draft → `ForbiddenException`.
   - E2e: `PATCH staff/courses/:courseId/announcements/:id` with an assistant token and
     `{ "audience": "all_students" }` in the body → assert the response's `audience` is **unchanged**
     from what it was before the PATCH (proving the field was stripped, not merely that some error
     came back — a stripped-and-silently-ignored field and a rejected field can look identical at
     `200` if the assertion isn't specific).
4. **`docs/CHANGELOG.md`:** one entry, same terse style as the existing `B-ANN-1` entry a few lines
   above it, recording this as a second bug in the same unit, caused by round 1's own fix for finding
   3, with the one-sentence reason (the shared DTO reopened a capability the design withheld) — not a
   new design decision, so it doesn't need a `D-ANN-*` slot.

**Everything else in the diff is sound and does not need touching.** `createDraft`, `deleteDraft`,
`publish`, `resolveRecipients`, `previewReach`, both repositories, the migration, and the media/DTO
validation are all correct as verified in §1 and §2. This is a single, narrow, well-understood gap.

## Current honest state / what happens next

Slice 10a is **not done**. Three of four findings are fixed and independently verified against real
gates (not self-reports). The fourth (§3) is fully diagnosed and has a precise fix written above, but
**no code has been written for it** — agy is unreachable (account-wide quota, all four models,
~166h). `docs/IMPLEMENTATION_PLAN.md` and `docs/PHASE_ROADMAP.md` remain marked in-progress, not
complete, until §3 lands and is re-reviewed. Do not proceed to slice 10b until this file's verdict
changes from REJECTED.
