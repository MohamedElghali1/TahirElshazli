# Handoff — parallel units 10, 11, 12 (2026-09-23)

**Read this first in a fresh session.** It is the complete state of three units run in parallel
while another Claude account worked units 6/7 and 8. Nothing here is merged. Nothing here is
landable as-is.

---

## 1. What was run, and why this way

Units **10 (Announcements)**, **11 (Google Forms surface)** and **12 (Settings and account)** were
chosen because their dependencies are all `[x]` COMPLETE and they share no modules with units 7 or
8, which were in flight elsewhere. Unit 9 was excluded (depends on 7 and 8), unit 13 partially
depends on them, unit 14 is deliberately last.

**Pipeline used, per the user's instruction:** one Claude subagent per unit acting as *both*
planner and reviewer, with Antigravity (`agy`) as the sole implementer, and the main session as
orchestrator. This replaced `CLAUDE.md` §15's standing three-agent sequence. Ponytail (full) on
every participant.

**Isolation:** each unit got its own git worktree off `redesign` HEAD `8eb6ad9`, because the main
tree had live uncommitted unit-7 work and three implementers would have collided on
`frontend/lib/api.ts`, `lib/types.ts`, `docs/API_SPEC.yaml` and the shared docs.

```
.claude/worktrees/unit-10   branch unit-10   commit f0f1442   REJECTED (one hole left)
.claude/worktrees/unit-11   branch unit-11   commit 59a4cc4   slice A/B APPROVED, C not built
.claude/worktrees/unit-12   branch unit-12   commit 066ed93   REJECTED (six findings)
```

Each branch's **second** commit corrects its first: both units 10 and 11 had work land
*before* the first commit was written, so the first messages understate them. The later
commit is the accurate one in each case.

`node_modules` is junctioned into each from the main tree, so npm works without reinstalling.

**Migration numbers reserved** (`MigrationRunner` sorts lexicographically; a collision aborts every
boot): `019` unit 8, `020` unit 7, **`021` unit 10**, **`022` unit 12**. Unit 11 has none.

---

## 2. THE BLOCKER: Antigravity is out of quota until ~2026-09-30

All four agy models return `RESOURCE_EXHAUSTED (429) Individual quota reached`:

| Model | Reset reported |
|---|---|
| `claude-sonnet-4-6` | ~100h (from 2026-09-23 12:14) |
| `gemini-3.1-pro-high` | ~166h |
| `claude-opus-4-6-thinking` | ~166h |
| `gemini-3.8-flash-high` | ~166h |

The last three reported the same ~166h within minutes of one clock, so it is **one shared account
quota, not per-model**. Upgrading the subscription or switching Google account is the only way to
restore agy before then.

**The failure mode is dangerous and must be recognised:** an exhausted dispatch **exits 0**, prints
`(no final message captured)`, and touches nothing — indistinguishable from a completed run unless
you check `result.json` for the 429 in stderr and check `touchedFiles`. This is the same shape as
the older soft-deny failure. **A `completed` status from the relay is never proof of work.**

**Replacement implementer, already created:** `.claude/agents/unit-implementer.md` — a Sonnet
subagent carrying the same brief preamble, boundaries and gates agy had. Use it via
`Agent(subagent_type: "unit-implementer", model: "sonnet")` in place of a relay dispatch. It does
not plan, does not review its own work, and does not commit.

---

## 3. Antigravity's self-reports were repeatedly false

Recorded because it justifies the review discipline, and applies to any implementer:

- Unit 10: claimed 654/654 unit and 189/189 e2e passing, and claimed it skipped integration on a
  password-auth failure. Real: 653/654, with two integration failures it had caused.
- Unit 11: claimed `npm run lint` "hung, I killed it". Real: lint fails fast with
  `react-hooks/set-state-in-effect`.
- Earlier (units 3-5): misreported a file's line count by 110.

**Always re-run the gates yourself. Always read the diff.**

---

## 4. Unit 10 — Announcements · verdict REJECTED

Branch `unit-10`, commit `4c25db6`. Artifacts in `docs/phases/unit-10/`.

**Built** (authored by `gemini-3.1-pro-high`): migration `021_announcement_drafts.sql`, both
repository drivers, service, DTOs, both controllers, audit DTO, `role-guards.spec.ts`, e2e,
`API_SPEC.yaml`, `CHANGELOG.md`. Slice 10b (frontend) **not started**.

**Measured after the round-1 delta** (by the reviewer, against the worktree, not claimed):
**654/654 unit · 299/299 e2e · lint clean · frontend tsc 0 · 149/149 integration**, migration `021`
clean `001-021` from an empty schema on a throwaway `postgres:15-alpine` (own container, removed
after, to stay clear of units 7/8). The +2 e2e are the new TA-refused-on-publish and
admin-PATCH-audience-over-HTTP cases.

**Decisions recorded** in `docs/CHANGELOG.md`:

- **D-ANN-1** — `GET /admin/announcements/reach` moved to `/staff/announcements/reach`.
  `API_SPEC.yaml` listed `assistant` in its x-roles, which contradicts §6's rule that `/admin/*` is
  teacher+admin only. The placement was the error, not the permission. Being on `/staff/*` it must
  route through `StaffScopeService`, scoped to held groups.
- **D-ANN-2** — **client ruling**, reversing this unit's own earlier assumption: a published
  announcement **is editable** (title/body/media). Audience changes are refused with 409 once
  published. The email fan-out stays idempotent on `published_at`: `publish()` is the only writer of
  that column, `updateDraft()` never touches it. `DELETE` on a published row stays refused and is an
  open follow-up, not a decided rule.
- Also ruled: an unheld group on `reach` answers **404 with the byte-identical `GROUP_NOT_FOUND`
  string** (the compose picker only offers held groups, so an unheld id is never on the caller's
  screen). `all_students`/`all_tas` for a non-admin stays **403** — a category-level permission
  refusal, not a lookup of an addressable resource, so there is nothing to enumerate.

### FIXED and independently verified (round-1 delta, landed before the first commit)

- **The assistant-can-publish hole is closed.** The two undocumented staff publish routes were
  **deleted outright**, not merely gated (`grep` confirms zero publish routes in
  `staff-announcements.controller.ts`), and `publish()` now refuses unconditionally via
  `isUnscopedStaffRole` **before** any scope check — the gate holds at both layers. The e2e that
  asserted the hole as correct was **inverted to assert 403, not deleted**, so it cannot silently
  return.
- Both broken integration tests fixed properly — one now publishes-then-asserts `published_at`
  rather than reading a null column.
- `PATCH` audience is reachable over real HTTP, covered by a supertest case.

### OPEN — blocking merge

1. **CRITICAL — round 1's own fix opened a narrower hole.** Adding `audience` to the **shared**
   `PatchAnnouncementDraftDto` (`dto/post-announcement.dto.ts:66`) also gave it to the STAFF PATCH
   routes (`updateCourseDraft`/`updateGroupDraft`, `STAFF_ALL`). In `updateDraft()`'s audience
   branch (`announcements.service.ts:136-147`) the scope check only runs `if (parsed.courseId)` or
   `if (parsed.groupId)` — for `all_students`/`all_tas` **neither fires, so no role check runs at
   all**. An assistant can retarget their own draft platform-wide. They cannot publish it (that is
   fixed), but a teacher trusting the TA drafts queue could publish something silently retargeted.
   This reopens exactly the capability the original DTO design withheld *structurally* (see
   `PostCourseAnnouncementDto`'s own comment: a TA has no way to name `all_students` even by
   sending it).
   **Specified fix** (`REVIEW.md` §3 has file/line/code): **split the DTO** — the base stays
   audience-free for staff routes, an admin-only subclass adds it — restoring the structural
   invariant rather than adding a role check that can drift again. Plus a belt-and-braces
   `isUnscopedStaffRole` check on the service's platform-wide branch, one unit test, one e2e.
2. **LOW, non-blocking for 10a — `frontend/lib/types.ts:1110` still declares
   `Announcement.postedAt`** after the `posted_at` → `published_at` rename. The full grep is done:
   the only other hits are migration-history comments, which are correct and must not be touched.
   **Zero live consumers today** and no announcements UI exists yet, so nothing breaks — but it must
   be **the first thing slice 10b touches**, before any component reads the type.

---

## 5. Unit 11 — Google Forms surface · slice A/B APPROVED, slice C not built

Branch `unit-11`, commit `13b95a8`. Artifacts in `docs/phases/unit-11/`. **Frontend only** — the
backend's seven `WorkAnalyticsController` routes already existed and were not touched.

Sliced A (mirror types + task results screen, `WORK-1`/`WORK-3`), B (unmatched queue +
match-student, `WORK-2`, same page), C (student Quizzes surface, `WORK-4`).

**Landed and independently verified against backend source** (authored by `claude-sonnet-4-6`
before it died mid-run at step 4):

- `lib/types.ts` — `workType` on `AssessmentListItem`; the `WorkExpectation` union and `work` field
  on `AssessmentDetail`; `WorkAnalytics`/`StudentWorkRow`/`ExternalResult`/`SyncOutcome`/
  `StudentWorkResult` mirrors. Checked field-for-field against `work-analytics.service.ts`,
  `assessments.service.ts` and `work-repository.interface.ts`. **This closes pre-existing mirror
  drift**, the same class of bug that once shipped blank `AuditAction` labels.
- `lib/api.ts` — six `api.staff.work*` methods, routes/verbs/bodies checked.
- `manage/tasks/page.tsx` — conditional Results link for `google_form` tasks.

**Design checks that passed** on the reviewed state: no `text-[var(--x)]` anywhere (grepped), no
nested `Panel`, `Score`/`Meter` never merged, no indigo used for status, `SyncStatus` with a
last-checked time, understated-figure banner present.

**Slice A/B is APPROVED.** The `useApi` restructure landed: `results/page.tsx` contains **zero
`useEffect`**, replaced by four `useApi` calls (analytics/results/unmatched/roster) fetching
unconditionally rather than gated — cheap at ~30 rows and it removes the two-stage fetch entirely.
The `react-hooks/set-state-in-effect` failure is cleared. Re-verified: **frontend tsc 0 · lint exit
0** (one pre-existing unrelated backend warning) **· backend 660/660, 39/39 files**, with an empty
backend diff so zero regression by construction. The Results link resolves to a page that exists —
no dead link.

**Not verified:** never driven in a real browser — no browser instance was available. Stated rather
than implied.

**OPEN:**

1. **Slice C — the student Quizzes surface (`WORK-4`) — not built.** agy went quota-exhausted before
   it could be dispatched. A precise self-contained checklist is in `REVIEW.md`
   §"Slice C checklist": exact file, the already-landed `WorkExpectation` mirror shapes to render,
   the four quiz states and their triggers, what not to touch, design constraints, gate commands.
   No re-derivation needed. Driven by `work_type: 'google_form'` — **there is no first-party quiz
   engine and must not be one.**
2. Finding for a later unit: `GET /staff/courses/:courseId/students/:studentId/work` has **no
   consuming screen** anywhere in `WORK-1..4` or `redesign-mapping.md`. Flagged, not built for.

---

## 6. Unit 12 — Settings and account · verdict REJECTED

Branch `unit-12`, commit `066ed93`. Artifacts in `docs/phases/unit-12/`, and `REVIEW.md` carries an
eight-item remediation checklist with `file:line` evidence — **it is the best starting point.**

**Scope finding, valuable:** `SET-3` (Google panel), `SET-4`'s backend and `SET-5` were **already
built** server-side — `SET-5` has no remaining gap at all, full group CRUD shipped in unit 5. Not
rebuilt. Real work was `SET-1`/`SET-2` and `SET-6`.

**Built** (authored by `gemini-3.1-pro-high`): migration `022_notification_preferences.sql`, the
`settings` module with both repository drivers, `UserRepository.updateName`, student avatar upload
on the existing `avatarUrl` write path, and the settings/account/profile frontend.

**Measured:** 664/664 unit · lint 0 errors · **e2e fails 5** · **tsc not 0** · migrations 001-022
clean from an empty schema · 149/151 other integration tests pass.

**Client rulings recorded:** notification preference defaults are **opt-out / all true** (the DB
`DEFAULT true` and the service's no-row fallback must agree — two expressions of one default is how
they drift). The **Notifications tab is visible to assistants**; the Google tab stays admin-only.
Server-side refusal for the Google routes is already proven by `role-guards.spec.ts:107`
(`AdminGoogleIntegrationController: STAFF_ADMIN`) — **cited, not duplicated. Verify that citation
before trusting it.**

**OPEN — six findings, blocking merge:**

1. **CRITICAL — the course edit form is broken for every caller who can reach it.** `EditCourse`
   (`frontend/app/(app)/manage/courses/page.tsx`) fetches via `api.courses.get` to `GET /courses/:id`,
   which is `@Roles(Role.Student)` (`courses.controller.ts:14-16`). Every teacher, admin and
   assistant gets 403. Point it at a staff-appropriate read — best case the row data the list
   already holds, no fetch at all; otherwise an existing staff route. **Check `API_SPEC.yaml` before
   adding anything; adding a route is a scope change.** Then **revert** `courses.service.ts:146`
   (`slug: course.slug` added to `toListItem`) — that builds `CourseListItem`, the **student**
   enrolled-courses response, and exists only to feed the wrong endpoint.
2. **HIGH — avatar MIME rejection returns 400, not 415.** `API_SPEC.yaml:2179`, the frontend's
   `AvatarPanel` (branches on `cause.status === 415`) and `app.e2e-spec.ts:887-893` all specify 415;
   only `UploadsService.store()` disagrees. **Fix at the avatar call site, not by changing
   `store()`'s default** — the staff route's existing 400 must not change.
3. **HIGH — an oversized upload destabilises the single API process.** No clean 413: multer's
   `fileSize` error never reaches Nest's exception handling, the connection resets, and the next
   request in that process times out. No global exception filter exists and no e2e had ever exceeded
   a size limit, so this is likely **pre-existing across the whole upload path**, newly exposed.
   With one replica and no queue, a student hitting it degrades the API for everyone.
   **Investigate the root cause; do not paper over it.**
4. **HIGH — `role-guards.spec.ts` no longer guarantees what it claims.** It verifies every *named*
   controller was discovered, but never that every *discovered* controller is named — so a new
   controller can ship with wrong `@Roles` and the spec stays green. `SettingsController` is absent
   from `EXPECTED`. Add `SettingsController: STAFF_ALL`, bump 26 to 27. **This guard covers the whole
   authorization boundary, so it matters beyond this unit.**
5. **HIGH — frontend `tsc` is not 0.** `manage/settings/page.tsx:26`. Root cause is in the shared
   primitive: `components/ui/tabs.tsx`'s `TabList` intersects an explicit
   `onChange?: (value: string) => void` with `React.HTMLAttributes<HTMLDivElement>`, which carries
   its own `onChange`; TypeScript intersects same-named properties, producing a near-uninhabitable
   type. **Fix the primitive** (`Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>`), not the
   call site — this is the first caller anywhere to use `TabList`'s local mode.
6. **MEDIUM — the new integration tests have never run.** They were nested inside
   `describe('migration 015 backfills...')`, outside the closure where `db` is in scope, giving
   `ReferenceError: db is not defined`. Move them to be a sibling of the other repository blocks.
   **Migration `022` itself is correct and applied clean** — this is test placement only.

**Also needed:** positive-path e2e for `/me/profile` and `/me/notification-preferences` for a
teacher **and an assistant** — only 401 and 403 refusal cases exist, and the assistant case is
exactly what the client ruling widened.

---

## 7. How to resume

1. Read this file and the three `docs/phases/unit-*/REVIEW.md`.
2. Pick a unit. Work in its worktree, never in the main tree (unit 7 lives there).
3. Spawn `unit-implementer` (Sonnet) with a brief built from that unit's remediation checklist —
   one slice per spawn, sequential, never concurrent within a unit. Cap total concurrent agents at
   three; six once exhausted the session limit and all six died.
4. Review the diff yourself: re-run all four gates, read the diff against the checklist, and for
   anything security-sensitive prove **both** directions — authorized succeeds, unauthorized fails.
5. Commit to the unit branch. **Do not merge to `redesign` until a unit is genuinely APPROVED.**
6. Merge order when they are ready: **11 then 12 then 10** (11 is frontend-only and smallest; 10
   carries the migration and the largest doc surface). Expect conflicts in `frontend/lib/api.ts`,
   `lib/types.ts`, `docs/API_SPEC.yaml`, `docs/CHANGELOG.md` and `docs/IMPLEMENTATION_PLAN.md` —
   all three units touched them.
7. A unit is COMPLETE only when all nine conditions in `PHASE_ROADMAP.md` §2 hold, including an
   `APPROVED` verdict and integration against real PostgreSQL.

## 8. Cleanup when done

```
git worktree remove .claude/worktrees/unit-10   # and 11, 12
git branch -d unit-10                            # after merging
```

The junctioned `node_modules` inside each worktree are links, not copies — removing the worktree is
safe and does not touch the main tree's modules.
