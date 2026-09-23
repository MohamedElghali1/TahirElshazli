# Execution notes: unit 10 slice 10a — Announcements backend

**Implementer:** Antigravity CLI (`agy`), model `gemini-3.1-pro-high`.
`claude-sonnet-4-6` was attempted first and hit an account-wide quota exhaustion (~100h reset) before
doing any work — zero files touched, only the untracked plan directory the planner had already
created. Redispatched clean to Gemini; no `--resume-last` was used across that model switch.

## What was built
- Migration `021_announcement_drafts.sql`: `created_at` (backfilled), `posted_at` renamed to
  `published_at` (nullable), `audience_type` widened to include `group`, `group_id` column + CHECK,
  `media_kind`/`media_url` columns + CHECK, indexes renamed/added. Ran clean against a real
  empty-schema `postgres:15-alpine` (verified independently by the reviewer, not just agy's
  self-report — see `REVIEW.md`).
- Both repositories updated for the new shape; new `findById`, guarded `publish`, ordinary `update`,
  guarded `remove`, `findByGroup`, `status` filter on the list reads.
- `AnnouncementsService`: `createDraft`/`updateDraft`/`deleteDraft`/`publish`/`previewReach`/
  `postToGroup`, matching the phase plan.
- Three new `AuditAction` members in both the union and the exhaustive `Record` — confirmed present
  in both places directly.
- `docs/API_SPEC.yaml` and `docs/CHANGELOG.md` updated (the two `D-ANN-*` entries the planner had
  already written stayed as the source; agy did not duplicate them).

## What the reviewer found wrong (see `REVIEW.md` for full detail)
1. **Security regression:** agy added two undocumented staff-reachable publish routes
   (`/staff/courses/:id/announcements/:id/publish`, `/staff/groups/:id/announcements/:id/publish`)
   that let an assistant publish their own course/group's announcement — real email, no teacher/admin
   review. This directly contradicts the plan and `API_SPEC.yaml`'s `x-roles: [teacher, admin]` on
   publish. Proven by the diff's own e2e edit, which asserts an assistant token gets `200` from a
   publish call. **This is the reason for the REJECTED verdict**, not a stylistic nit.
2. A pre-existing integration test file (`test/postgres-repositories.integration-spec.ts`, not touched
   by this diff) still references the old `postedAt`/`posted_at` name the migration renamed away —
   two tests broke. Migration `021` itself is fine; the test file needed a matching update that never
   happened.
3. The admin draft-audience-edit path is unreachable in production: `PatchAnnouncementDraftDto`
   doesn't declare `audience`, so the global `whitelist: true` pipe silently drops it before the
   controller sees it. The service-side logic for it is otherwise correct.

## Assumption reversed mid-unit, by user ruling (not an execution deviation)
The phase plan originally assumed a published announcement is immutable. The user ruled otherwise —
a typo must be correctable — before slice 10a was (re-)dispatched. See `PHASE_ROADMAP` history and
`docs/CHANGELOG.md`'s `D-ANN-2` for the reasoning. The dispatched brief already reflected the
reversal; agy built to the reversed rule correctly (confirmed: `updateDraft` never touches
`published_at`, and the publish-then-edit-no-double-send unit test passes).

## Round 1 delta: what was fixed, and by whom
A delta brief covering the three findings above was dispatched (fresh `gemini-3.1-pro-high`, not a
resume) and completed — confirmed via `result.json` directly (`exitCode: 0`, `resumed: false`, no
quota error, real `finalMessage`, 7 touched files matching the brief), then independently re-verified
by re-running all four gates myself against a fresh throwaway Postgres: **654/654 unit, 299/299 e2e,
lint clean, 149/149 integration with migration `021` applying clean from empty**. All three findings
confirmed fixed by reading the diff directly, not the self-report. Full detail and gate numbers in
`REVIEW.md` §2.

## Round 2: agy is now fully exhausted, all models, account-wide
While independently re-verifying the round-1 delta, this review found a **fourth** problem — round
1's own fix for finding 3 (adding `audience` to the shared `PatchAnnouncementDraftDto`) reopened a
narrower version of finding 1: an assistant can now `PATCH` their own draft's `audience` to
`all_students`/`all_tas` with no role check, because `updateDraft()`'s audience-change branch only
gates the `course`/`group` cases, not the platform-wide ones. Full diagnosis, exact file/line, and a
precise fix (DTO split + one service-level check + two new tests) are written out in `REVIEW.md` §3.

Before a delta could be dispatched for this, the coordinator confirmed agy's quota is exhausted
**account-wide, across all four available models** (`claude-sonnet-4-6`, `gemini-3.1-pro-high`,
`claude-opus-4-6-thinking`, `gemini-3.8-flash-high`) — every dispatch now returns
`RESOURCE_EXHAUSTED (429)`, exits 0 with no final message, and touches nothing, which looks
identical to a completed no-op run unless `result.json` is checked directly. **No further dispatch
was made.** `REVIEW.md` §3 is written as a self-contained implementation checklist for whoever picks
this up next (this session once agy resets, or a person), so the finding does not need
re-deriving.

## Honest state as of this note
Slice 10a is **not done**. Findings 1-3 are fixed and independently verified. Finding 4 (`REVIEW.md`
§3) is diagnosed and specified but **unimplemented** — no code has been written for it.
`docs/IMPLEMENTATION_PLAN.md` and `docs/PHASE_ROADMAP.md` are left showing unit 10 / Phase 12 as in
progress, not complete. Slice 10b (frontend) has not started and should not start until this slice's
verdict changes from REJECTED — it also needs the `frontend/lib/types.ts` `postedAt` → `createdAt`/
`publishedAt` fix noted in `REVIEW.md` §2 done as part of its own first commit, before any component
reads the `Announcement` type.

---

## Resolution of §3, and a regression the round-2 review did not see (2026-09-23, later)

**§3's hole is closed and slice 10a is `APPROVED`.** The DTO was split so `audience` is structurally
unreachable from `/staff/*` (the global `whitelist: true` pipe strips it), and the service gained
the role check independently, because §7 wants the rule true regardless of DTO shape. Two tests
prove both directions: an assistant is refused at the service, and over real HTTP the draft's
audience is *unchanged* after the PATCH — asserting the value, not merely a status code, because a
stripped field and a rejected one both look like a 200. Gates re-run by the orchestrator:
655/655 unit, 300/300 e2e, lint 0, 149/149 integration with migrations 001–021 from an empty schema.

**A regression this unit caused, found only at merge — `B-ANN-3`.** The round-1 commit
(`4c25db6`) **replaced** `announcements.controller.spec.ts` instead of extending it. Its 14 new
tests are correct and cover the new draft/publish/reach lifecycle, but all 19 pre-existing tests
went with the old file, leaving about fifteen behaviours untested anywhere — including three this
repository names as invariants:

- *"takes the audience from the URL, so a TA cannot widen it from the body"* — the structural
  invariant `B-ANN-2` is about, so the unit deleted the test for the very rule it then re-broke;
- *"does not store a recipient list, only how many there were"* — §5.14's PII rule;
- *"records the teacher as teacher, not as an assistant"* — the `actorRoleOf` attribution rule.

Also gone: the whole audience-codec group (round-trip, malformed rejection, DTO-pattern-and-parser
in step), send-time resolution, and read-back scoping.

**Three independent reviewers passed over this unit and none caught it**, because each was handed
the round-2 diff and the deletion had happened in round 1. It surfaced when the backend unit count
fell from 698 to 693 across the merge. The coverage was restored against the *current* module
rather than pasted back from the old file, which no longer compiles against it.

**The durable lesson:** a green suite says nothing about what a rewrite took away with it. Compare
test counts across a merge, and read a shrinking spec file as a finding rather than a tidy-up.

## Still outstanding

**Slice 10b — the announcements frontend — is the whole of what remains on unit 10.** Compose screen
with student-view preview (`ANN-6`), drafts/sent list (`ANN-3`), audience picker (`ANN-1`), media
picker reusing `/staff/uploads` (`ANN-2`), live reach counter (`ANN-5`). The `lib/types.ts`
`Announcement` mirror is stale against the current backend and must be the first thing 10b touches.
