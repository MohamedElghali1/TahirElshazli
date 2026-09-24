# Phase plan: unit 10, Announcements

**Planner:** `redesign-planner` (ponytail full) · **Date:** 2026-09-23 · **Worktree:** `unit-10` ·
**Branch:** `unit-10`.

**Read:** `CLAUDE.md` in full · `PHASE_ROADMAP.md` §1–4 (unit 10) · `IMPLEMENTATION_PLAN.md` Phase 12
+ DoD · `PRODUCT_SPEC.md` §5.1 · `DATABASE_PLAN.md` (migration list, conventions) ·
`AUTHORIZATION_MODEL.md` (announcement mentions) · `API_SPEC.yaml` announcements block (only two
routes are stubbed there today) · `SECURITY.md` mail rules · existing `backend/src/announcements/*`
in full, `backend/src/mail/*` in full, `staff/staff-scope.service.ts` in full, `groups` repository
interface, `common/validators/is-media-url.validator.ts`, `common/storage/upload-types.ts`,
`blog/dto/blog.dto.ts` (media DTO precedent), `manage/task-drafts.service.ts` (draft-lifecycle audit
precedent), `audit/interfaces/audit-log-repository.interface.ts`.

**Migration number: `021`** (reserved for unit 10 by the coordinator; `019`/`020` are unit 8/unit 7,
in flight in sibling worktrees). Current last migration in this tree: `020_marking.sql`.

---

## 0. Headline

Today an announcement is created and sent atomically — `AnnouncementsService.send()` resolves the
audience, writes the row, fans out in-app notifications, and audits, all in one call. There is no
draft state, no email, no group audience, no media, and no reach preview.

This unit turns "post" into "create a draft", and adds a separate "publish" action that resolves the
audience **at publish time**, fans out both the in-app notification and an email per recipient, and
is guarded so a second publish call is a no-op on the side effects (409, not a silent re-send).

**A genuine conflict found and resolved (§2.3 of CLAUDE.md — recorded, not silently picked):**
`API_SPEC.yaml` already stubs `GET /admin/announcements/reach` with
`x-roles: [assistant, teacher, admin]`. That is an `/admin/*` route naming `assistant`, which
contradicts CLAUDE.md §6's route-split rule verbatim: "`/admin/*` — teacher and admin only,
unscoped." Nothing implements this route today, so there is no back-compat cost. **Resolution:** the
route moves to `GET /staff/announcements/reach` (still all three roles, now consistent with the
class-level convention) — the fix is the route's *placement*, not its permissions; `assistant`
belongs in the roles list, `/admin/*` does not. `API_SPEC.yaml` is corrected in the same change; the
`CHANGELOG.md` entry names the conflict itself (the two documents disagreed), not only the fix.

**REVERSED 2026-09-23 by user ruling, via the coordinator: a published announcement IS editable.**
The planner's original assumption here was that a published row is immutable (no `PATCH` once
`publishedAt` is set), based on the existing repository's docstring. The user ruled otherwise: a
typo in a published announcement must be correctable. This is recorded as a reversal, not hidden —
see the `CHANGELOG.md` entry.

**What actually ships:** `PATCH` now works on a published announcement too, editing `title`/`body`
(and media). The `published_at` guard that already exists for the idempotent-publish mechanism is
now doing double duty: it is *also* what guarantees an edit never re-triggers a send — `publish()`
only fires the fan-out from inside its own guarded `UPDATE ... WHERE published_at IS NULL`, and a
`PATCH` never touches `published_at` at all, so there is no path from "edit" to "second send". This
is tested explicitly: publish, then edit, then assert exactly one `mail_deliveries` row and one
`notifications` fan-out — not two.

**The audience is the one field `PATCH` refuses to change once published (409), and only once
published.** Widening the audience after send would mean recipients who never got the original mail
— building a delta fan-out for that is a real feature nobody asked for; the lazy and honest answer is
to refuse it. Before publish (still a draft), the audience is fully editable, same as
title/body/media. `DELETE` was **not** part of the user's ruling — it stays refused on a published row
(409) pending its own decision; flagged to the coordinator as a follow-up rather than assumed.

**A capability preserved, not invented:** a TA can already write one course's worth of announcements
(§2.2 preset, unchanged scope). This unit extends that to **drafting** for a course or a group they
hold; publishing stays teacher/admin-only per the spec's explicit `x-roles` on `/publish` — a TA
drafts, a teacher/admin reviews and sends. This is the minimal reading that keeps the TA's existing
write and satisfies the new route's stated roles without inventing a wider or narrower capability.

---

## 1. Scope

`ANN-1` group audience · `ANN-2` media (image/video/YouTube/file) · `ANN-3` draft + publish ·
`ANN-4` email fan-out, idempotent on `published_at` · `ANN-5` live reach preview · `ANN-6` compose
screen with student-view preview.

Sliced in two, sequential, each its own Antigravity dispatch and review:
- **Slice 10a — backend.** Migration `021`, both repositories, service, DTOs, controllers, audit,
  mail fan-out, `API_SPEC.yaml`, backend tests.
- **Slice 10b — frontend.** Compose screen, drafts/sent list, media picker (reusing
  `/staff/uploads`), live reach counter, student-view preview, `lib/api.ts` + `lib/types.ts` mirror.

---

## 2. Data model — migration `021_announcement_drafts.sql`

Against `announcements` (migration `005`):

1. **`created_at`**: add nullable, backfill `UPDATE announcements SET created_at = posted_at`, then
   `SET NOT NULL, SET DEFAULT now()`. Every pre-021 row already has a `posted_at` (nothing was ever a
   draft); this preserves it as the row's authoring time.
2. **Rename `posted_at` → `published_at`; drop `NOT NULL` and the `now()` default.** Existing rows
   keep their true send time as `published_at` (they were already sent, so this is exactly correct).
   New rows insert with `published_at = NULL` until `publish()` runs. Draft-ness is **derived from
   nullability**, matching the house idiom (`returned_at` on submissions, `D-2`'s state fields) —
   no separate `status` column, so there is exactly one thing to keep in sync.
3. **`audience_type` CHECK** widens to `'all_students' | 'course' | 'all_tas' | 'group'`.
4. **`group_id TEXT REFERENCES groups (id) ON DELETE CASCADE`**, nullable. New CHECK:
   `(audience_type = 'group') = (group_id IS NOT NULL)`, alongside the existing course-pair CHECK —
   together they pin exactly one locator column per type.
5. **`media_kind TEXT CHECK (media_kind IN ('image','video','youtube','file'))`**, nullable.
   **`media_url TEXT`**, nullable. CHECK `(media_kind IS NULL) = (media_url IS NULL)`. One optional
   item, not a list — plain columns, not JSONB (unlike `assessments.attachments`, which is a list).
6. Indexes: rename `announcements_course_posted_at_idx` / `announcements_posted_at_idx` to the
   `published_at` column name (same shape); add
   `announcements_group_published_idx ON announcements (group_id, published_at DESC, id DESC)
   WHERE group_id IS NOT NULL`.
7. `recipient_count` unchanged: `0` on a draft, set to the real count inside `publish()`.

Gate: run from an empty schema against real Postgres (`CLAUDE.md` §9). If Docker is unavailable in
this worktree, the executor must say so plainly rather than claim it passed.

---

## 3. Domain / service changes

- `announcement-audience.ts`: `AnnouncementAudienceType` gains `'group'`; `AnnouncementAudience`
  gains `groupId: string | null`; `AUDIENCE_PATTERN` gains `group:[A-Za-z0-9_-]{1,64}`
  (`API_SPEC.yaml`'s own pattern — reuse it verbatim); `encodeAudience`/`parseAudience` handle the
  third locator symmetrically with `course`.
- `AnnouncementRepository`: add `findById`, `publish(id, recipientCount): Announcement | null` (the
  guarded `UPDATE ... WHERE published_at IS NULL` — this is the ONLY write that touches
  `published_at`), `update(id, patch): Announcement | null` (an ordinary update — no `published_at`
  guard, since `PATCH` now works on published rows too; never writes `published_at` or
  `recipient_count` itself) and `remove(id): boolean` (guarded — `WHERE published_at IS NULL`, a
  status check in the in-memory driver — `DELETE` stays draft-only), `findByGroup`, and a
  `status?: 'draft' | 'published'` filter on `findByCourse`/`findAll`.
- `AnnouncementsService`:
  - `createDraft(audience, actor, content)` replaces `send()`'s write — no recipient resolution, no
    fan-out, no `announcement.posted` audit. Audits `announcement.created` instead (mirrors
    `task_draft.created`).
  - `updateDraft(id, actor, patch)` — **works on a draft or a published announcement** (reversed
    2026-09-23, see §0). Scope-checked the same way the creating route was (course/group assignment,
    or admin unscoped). `title`/`body`/`media` are editable at any time. The **audience fields**
    (`audience` / `courseId` / `groupId`) are editable only while still a draft — refuse with `409`
    if the caller tries to change the audience on an already-published row (a delta fan-out is out of
    scope; see §0). Never writes `published_at` or `recipient_count`, so an edit cannot, even by
    accident, re-trigger `publish()`'s fan-out. Audits `announcement.updated`.
  - `deleteDraft(id, actor)` — **draft-only**, unchanged: scope-checked the same way, `409` once
    `publishedAt` is set (no ruling yet on deleting a published announcement — flagged as an open
    follow-up, not assumed). Audits `announcement.deleted`.
  - `publish(id, actor)` — **admin/teacher only** (enforced at the controller via `@Roles`, and
    re-checked here for defense in depth since this is a security-sensitive path): resolves the
    audience fresh, does the guarded `UPDATE`; if it returns `null` (already published), throws
    `ConflictException` rather than re-running any side effect — this is the mechanism that makes a
    double publish not double-send. On success: `notifications.fanOut` (unchanged shape) **and**,
    per recipient with a resolvable email (`userRepo.findByIds` → `.email`), `mail.send({ to, template:
    'announcement', data: { title, body } })` — the `'announcement'` template already exists
    (`MAIL-3`). Both fan-outs plus the `announcement.posted` audit stay inside the one transaction the
    guarded `UPDATE` opened, so a crash mid-fan-out leaves `published_at` unset and the whole publish
    retriable — not a half-sent state.
  - `resolveRecipients` gains the `group` case: `groupRepo.findMembers(groupId).map(m => m.studentId)`.
  - `postToGroup(groupId, actor, content)` — TA/admin group-scoped draft creation via
    `StaffScopeService.mayReachGroup`, 404 `GROUP_NOT_FOUND` on a miss (byte-identical to
    `GroupsService`'s own message, per the anti-enumeration rule).
  - `previewReach(rawAudience, actor)` — parses the audience, scope-checks it per CLAUDE.md §7's
    actual rule (404-byte-identical is the default; 403 is the narrow exception for a resource
    listed on the caller's own screen), not by copying neighbouring code:
    - `course` → `assertAssigned` (already 404 `COURSE_NOT_IN_SCOPE` on a miss — unchanged).
    - `group` → `mayReachGroup` is a non-throwing predicate; on `false`, **throw 404 with the exact
      `GROUP_NOT_FOUND` string**, not 403. The compose screen's audience picker only ever offers
      groups the actor holds (it has no route to list groups outside their reach), so an unheld
      group id is never on their screen — the default rule applies, not the exception.
    - `all_students` / `all_tas` for a non-admin → **403**, deliberately not the default: these are
      not addressable resources that could-or-couldn't exist (they're two fixed, universally-known
      audience labels), so a refusal here isn't a lookup whose 404 must stay indistinguishable from
      "doesn't exist" — it's a category-level permission refusal, the same shape as any other role
      check in this codebase (§2.2: a TA never sees platform-wide data). Test both directions: a
      held group's reach returns a real count; an unheld group's returns the byte-identical
      `GROUP_NOT_FOUND` 404.
    Admin: unscoped throughout. Returns the count only — never the recipient list (§5.14).
- If mail is unconfigured (`MAIL_DRIVER=none`), `MailService.send` throws `ServiceUnavailableException`
  mid-loop; the transaction rolls back and `publish()` fails cleanly with nothing partially sent —
  this is the existing port contract, not new behaviour.

## 4. DTOs / controllers

- `PostCourseAnnouncementDto` gains optional `mediaKind` (`@IsIn` the four kinds) and `mediaUrl`
  (`@IsMediaUrl`), paired in the service (both or neither — the DB CHECK is the backstop, not the
  only check).
- New `PatchAnnouncementDraftDto` — all fields optional (title/body/media).
- `ListAnnouncementsQueryDto` gains optional `status?: 'draft' | 'published'` (`@IsIn`).
- `StaffAnnouncementsController`: existing course routes gain `PATCH`/`DELETE .../announcements/:id`;
  new `POST/GET/PATCH/DELETE staff/groups/:groupId/announcements[/:id]` mirroring the course ones;
  new `GET staff/announcements/reach` (moved here per §0's conflict finding), `@Roles(...STAFF_ALL)`.
- `AdminAnnouncementsController`: existing `POST /admin/announcements` now creates a draft;
  new `PATCH/DELETE /admin/announcements/:id`; new `POST /admin/announcements/:id/publish` exactly as
  `API_SPEC.yaml` already specifies (`x-roles: [teacher, admin]`, `409` on an already-published row).
- `StudentAnnouncementsController` / the course "for students" read: unchanged route, but the
  repository call underneath must force `status: 'published'` — a draft must never be visible to a
  student, full stop, regardless of any query the client sends.

## 5. Audit

Add three `AuditAction` members: `announcement.created`, `announcement.updated`,
`announcement.deleted` (to the union **and** the DTO's exhaustive `Record<AuditAction, true>` — a
missing one is a compile error, which is the point). `announcement.posted` is reused for `publish()`,
now carrying the real `recipientCount` resolved at publish time rather than at creation.

## 6. Security checklist (CLAUDE.md §8)

- **Authorization/object-level access:** every draft mutation re-scoped the same way the original
  create was; `publish` is role-gated at the controller and re-checked in the service.
- **Anti-enumeration:** group 404 message matches `GroupsService.GROUP_NOT_FOUND` byte-for-byte;
  course 404 unchanged (`COURSE_NOT_IN_SCOPE`).
- **Input validation:** DTOs for every field; `mediaUrl` never trusts a raw string — `IsMediaUrl`
  only, same validator the blog gallery already relies on.
- **Sensitive-data exposure:** `mail_deliveries` records recipient + template only, never the
  rendered body — unchanged, already enforced by `MailService.send`.
- **Output filtering:** `previewReach` returns a count, never a recipient list (§5.14's rule,
  unchanged).
- **No new upload surface:** media reuses the existing `/staff/uploads` route and its MIME
  whitelist; nothing new to validate server-side there.

## 7. Tests required

**Unit** — audience parse/encode round-trip for `group`; `resolveRecipients` per audience type
including `group`; `publish()` called twice: second call asserts `ConflictException`, asserts
`notifications.fanOut` and `mail.send` were each called exactly once (not twice), asserts
`recipientCount` unchanged on the second call; **`publish()` then `updateDraft()` (edit title/body):
asserts the edit succeeds, asserts `notifications.fanOut` and `mail.send` are STILL each called
exactly once in total** — this is the load-bearing test for the reversed ruling, since an edit path
that accidentally re-triggers `publish()`'s fan-out is exactly the bug the guard exists to prevent;
`updateDraft()` changing the audience on an already-published row → `409`; `deleteDraft` after
publish → `409`; `previewReach` for a TA on `all_students`/`all_tas` → 403; `previewReach` for a TA
on a **held** group → real count, on an **unheld** group → 404 with the exact `GROUP_NOT_FOUND`
string (both directions, not just the refusal); `mediaKind` without `mediaUrl` (and vice versa) →
400.

**Refusal test for every permission** (CLAUDE.md §10): TA posting/drafting to an unheld course → 404
`COURSE_NOT_IN_SCOPE`; TA posting/drafting to an unheld group → 404 `GROUP_NOT_FOUND`
(byte-identical to a genuinely missing group); TA calling `/admin/announcements/:id/publish` → 403
(role guard); TA calling `previewReach` with `all_students`/`all_tas` → 403; unconfigured mail driver
→ `publish()` 503, nothing partially sent (assert no notification/audit row on rollback).

**Integration** — `PostgresAnnouncementRepository`: create, the guarded `publish`/`update`/`remove`
against real Postgres, `findByGroup`, the `status` filter. Migration `021` from an empty schema.

**E2E** — happy path for every new/changed route; the idempotent-publish case end-to-end (two `POST
.../publish` calls, second is `409`).

## 8. Definition of Done tie-back

Both repositories for the schema change · authorization in the service, not only the decorator ·
refusal test for every permission · migration run against real Postgres from empty · `API_SPEC.yaml`
updated in the same change (including the `/admin` → `/staff` reach-route correction) ·
`docs/CHANGELOG.md` entry for that correction · frontend typecheck stays at 0 after slice 10b.

## 9. Blockers

None that block starting. The two items in §0 (immutability-after-publish, the reach-route prefix)
are resolved calls, not open blockers — recorded so a reviewer can challenge the reasoning rather than
rediscover the ambiguity.
