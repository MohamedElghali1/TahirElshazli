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

## Honest state as of this note
Slice 10a is **not done**. A delta brief covering the three findings above is being dispatched next
(fresh `gemini-3.1-pro-high` run, not a resume). `docs/IMPLEMENTATION_PLAN.md` and
`docs/PHASE_ROADMAP.md` are left showing unit 10 / Phase 12 as in progress, not complete, until the
re-review passes.
