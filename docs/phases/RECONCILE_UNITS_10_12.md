# Reconciliation — units 10/11/12 onto the unit 7 line (2026-09-23)

**Why this exists.** `redesign` split at `6657c7a` (unit 6 COMPLETE) into two lines, each carrying
work the other lacked:

| | local `redesign` (`ba7c1d2`) | `origin/redesign` (`635f62b`) |
|---|---|---|
| Unit 7 | `[x]` — reviewed `APPROVED`, migrations `019`, `020_submission_files` | partial parallel build, slices 7a–7c, migration `020_marking` |
| Units 10–12 | `[ ]` | `[x]` — migrations `021`, `022` |

The two unit 7 builds were not compatible: both numbered a migration `020` with different schemas,
and `D-39`…`D-45` meant different rulings on each line. A plain merge put 20 files in conflict.

**User ruling (in chat):** keep the local unit 7 (reviewed, `APPROVED`); carry units 10–12 across;
drop the remote's partial 7a–7c; renumber where needed; run the full baseline before unit 14.

## What was done

Branch `reconcile/units-10-12` off `ba7c1d2`. Units 10–12 all branched from the remote's 7a
(`8eb6ad9`), so each unit's branch diff (`8eb6ad9..<branch tip>`) was applied as one commit, in the
remote's merge order (11, 12, 10), then the four commits that followed on the remote were
cherry-picked with `-x`. The remote's merges were checked for hand edits beyond conflict resolution
(`git merge-tree` against each merge's tree) — none.

| Commit | Source |
|---|---|
| `port(phases)` | `10c286e`, `f7d364b` — handoff doc + `unit-implementer` agent |
| `port(unit-11)` | `13b95a8..a9c5bc8` |
| `port(unit-12)` | `066ed93..7bbd5d2` |
| `port(unit-10)` | `4c25db6..bc7675c` |
| cherry-picks | `1d85a28`, `68c5a32`, `992ee4c`, `635f62b` |

**Not carried:** `8eb6ad9`, `659a958`, `65ccb95`, `ee06511` (the remote's unit 7 7a–7c) and their
changelog entries (the remote's `D-38`…`D-45`).

**Migrations kept their numbers.** `021_announcement_drafts` alters only `announcements`;
`022_notification_preferences` is a new table. Neither reads anything `020_marking` created.
`DATABASE_PLAN.md` §7 renumbered: sessions `023`, attendance `024`, weekly reports `025`.

**Decision codes do not collide.** Units 10–12 use `D-ANN-*`, `D-SET-*`, `B-ANN-*`.

## Conflicts, and how each was resolved

- `common/storage/uploads.service.ts` — both lines added per-call upload limits. Kept unit 7's
  `UploadRules` (narrow-only; ceiling `min(caller, MAX_UPLOAD_BYTES)`); the avatar route passes
  `allowedMimeTypes` through it.
- `frontend/lib/api.ts` — kept unit 7's `uploadTo(path, …)`; `uploadAvatar` uses it, typed
  `StudentProfile` (what `POST /students/me/avatar` returns).
- `frontend/lib/types.ts` — both added `WorkExpectation`; kept unit 7's (carries `submissionModes`).
- `auth/role-guards.spec.ts` — 32 controllers / 28 `EXPECTED`; assistant deletes carry
  `MarkingController.removeAnnotation` and both announcement draft deletes; unit 12's reverse
  closure loop kept.
- Specs, mirror files, docs — both sides kept. The remote filed `D-ANN-1/2`, `B-ANN-1/2` inside its
  own unit 7 changelog entry; moved verbatim into a unit 10 section.

## Defects found in the ported code, and fixed

The remote tree **does not typecheck** (29 backend `tsc` errors) — `nest build` fails there, so the
image cannot be built. Nothing ran `tsc` on the backend; `vitest` does not typecheck.

1. `settings.controller.ts` — `req.user.sub` on Express's `Request` (14 errors). Now
   `@Request() req: { user: JwtPayload }`, the house pattern.
2. `settings.service.ts` — repository types in a decorated constructor not imported with `type`.
3. `students.controller.ts` — `Express.Multer.File` (no `@types/multer`); now `UploadedFileLike`.
4. **`PostgresAnnouncementRepository.remove` called `db.execute`, which `DatabaseService` does not
   have** — deleting an announcement draft threw on Postgres, on no other driver. Now
   `DELETE … RETURNING id` via `queryOne`. New integration test *deletes a draft, and refuses to
   delete a published row or a missing one*; **verified failing** against the remote's code
   (`TypeError: this.db.execute is not a function`) and passing after.
5. `frontend/lib/types.ts` — every `§` in comments re-encoded as `Ã‚Â§`; restored.

## Baseline on the reconciled tree

| Gate | Result |
|---|---|
| `npm test` | **771 passed / 45 files** |
| `npm run test:e2e` | **354 passed / 4 files** |
| `npm run test:integration` | **179 passed, 0 skipped**, PostgreSQL 15.19 (`postgres:15-alpine`), 001–022 applied in order into a database created empty immediately before |
| `frontend: npx tsc --noEmit` | 0 errors |
| `backend: nest build` | exit 0 |
| `backend: npx tsc --noEmit` (includes specs) | 11 errors, all in `announcements.controller.spec.ts` — see `RC-F1` |
| `npm run lint` | exit 0, 4 warnings (unused identifiers) |

**Recorded honestly:** one integration run, immediately after swapping the repository file back from
the remote's version, reported `1 failed | 178 passed`. The failing test's name was not captured.
Three subsequent runs, each from a freshly created empty database, passed 179/179. Not reproduced;
not explained. `RC-F4`.

## Follow-ups (none blocks unit 14)

- `RC-F1` `announcements.controller.spec.ts` does not typecheck: fixtures pass `id` to
  `users/courses/groups.create`, which ignore it and mint UUIDs. The refusal tests still prove scope
  only because the in-memory seed already has an unheld `group-2`; the `create` calls are dead.
  Rewrite the fixtures against the seed, and add backend `tsc --noEmit` (specs included) to CI.
- `RC-F2` `SettingsService.getProfile` throws a bare `Error` on a missing user — a 500, not a 404.
- `RC-F3` No e2e covers the five `/staff/groups/:groupId/announcements*` routes or
  `/staff/announcements/reach`; only controller-level unit specs do.
- `RC-F4` The single unreproduced integration failure above.
