# Phase plan — chat unit 12: Settings and account

Written by `redesign-planner` (ponytail active). Read-only research; no production code touched.

## 0. Scope recap

`SET-1` … `SET-6`, `docs/PHASE_ROADMAP.md` §4 "Chat unit 12". Depends on units 1, 2, 4 — all `[x]`.

`docs/IMPLEMENTATION_PLAN.md:332-334`:
`SET-1` `/me/profile` for staff · `SET-2` Notification preferences · `SET-3` Google panel over the 5
existing routes (four states) · `SET-4` Courses tab (`DOM-5`) · `SET-5` Groups tab ·
`SET-6` Student Settings + avatar upload.

## 1. What already exists (do not rebuild)

Checked against the actual tree, not the docs, per `CLAUDE.md` §0/§13.

- **Backend target contract already written**, `docs/API_SPEC.yaml:2085-2182` — `GET/PATCH /me/profile`,
  `GET/PUT /me/notification-preferences` (both `x-roles: [assistant, teacher, admin]`, thin specs, no
  schema — implementation detail is ours to fill), `POST /students/me/avatar` (`[student]`, "images
  only, tighter size cap than the staff endpoint … filename is server-minted").
- **`/admin/courses` create/edit already built and audited** (`DOM-5`, `[x]`) —
  `backend/src/courses/admin-courses.controller.ts`, `course-admin.service.ts`. `docs/API_SPEC.yaml:2033-2083`
  tags both `settings`. **No backend work for SET-4.**
- **`/admin/groups` create/edit already built** (`DOM-2`, `[x]`) — `backend/src/groups/admin-groups.controller.ts`.
  **No backend work for SET-5.**
- **The Google integration's 5 routes are complete and teacher/admin-scoped**
  (`backend/src/integrations/google/admin-google-integration.controller.ts`: `GET /admin/integrations/google`,
  `POST .../connect`, `GET .../callback` (`@Public`), `DELETE .../`, `POST .../inspect`). **No backend
  work for SET-3.**
- **Frontend nav already reserves the two routes this unit fills**, `frontend/components/shell/console-shell.tsx:78-80`:
  `/manage/settings` (admin-only nav gate — `isAdminRole`, courtesy only, CLAUDE.md §7) and
  `/manage/account` (every staff role). **Neither page exists yet** (`app/(app)/manage/settings`,
  `app/(app)/manage/account` — both 404 today). This unit creates them.
- **`frontend/app/(app)/manage/courses/page.tsx`** is a **read-only list** — no create/edit form, despite
  the backend supporting both. This is `SET-4`'s actual gap: a frontend form, not a route.
- **`frontend/app/(app)/manage/groups/page.tsx`** already has full create/edit (`CreateGroup`/`EditGroup`,
  built in unit 5 slice 5d per `CLAUDE.md` §4.1) and its own nav entry under People. **`SET-5` has no
  remaining gap** — see §5 finding.
- **`frontend/app/(app)/profile/page.tsx`** is the student Settings screen (nav: `student-shell.tsx:50`
  `Settings → /profile`), and its own doc comment says exactly what is missing: *"The upload capability
  has no backend yet … adding a photo control with nothing to call would be inventing a feature that
  does not work."* This is `SET-6`, precisely scoped by the page already in the tree.
- **Staff have no `/me/*` routes today.** `UserRepository` (`backend/src/auth/interfaces/user-repository.interface.ts`)
  has no `updateName`. No notification-preferences table exists (`grep` confirmed).
  `docs/DATABASE_PLAN.md:83` already names the shape: `notification_preferences` — `user_id PK`, four
  booleans.
- **Avatar upload backend pattern exists and is reusable**: `backend/src/common/storage/uploads.service.ts`
  (`UploadsService.store`), `upload-types.ts` (MIME whitelist keyed by kind), the student's own
  `avatarUrl` write path already exists — `StudentProfileUpdate.avatarUrl` (`students/interfaces/student-repository.interface.ts:43`),
  wired through `StudentsService.updateProfile` → `StudentRepository.updateByUserId`. **No repository or
  migration change needed for the avatar write itself** — only a new upload endpoint that stores the
  file and then calls the existing update.

## 2. Decisions taken here (documented per `CLAUDE.md` §2.3/§13, not silently assumed)

1. **`/me/profile` and `/me/notification-preferences` are new top-level routes**, matching
   `API_SPEC.yaml` literally (not nested under `/students` or `/staff`) — `CLAUDE.md` §6's route table
   has an "everything else" bucket and these are self-service routes for three roles at once, so neither
   `/staff/*` (would drag `StaffScopeService`, which has nothing to scope here) nor `/students/*` fits.
   New controller: `backend/src/settings/` (mirrors the shape of `students/`).
2. **`PATCH /me/profile` writes `name` only.** API_SPEC gives no request schema for either staff route.
   Email change and password change are absent from the spec and from every design note found; adding
   either would be inventing business behaviour (`CLAUDE.md` §13). Staff already have the password-reset
   flow. **Not a blocker** — narrowest reading, matches what the spec actually asks for.
3. **Notification preference defaults: all four `true`** (opt-out) when no row exists yet, so a staff
   member who never visits the tab still gets submitted-work and registration-queue emails — the two
   PRODUCT_SPEC.md:188 calls out as the reason this exists. `PUT` upserts the row. Labelled assumption;
   no document states the default, and opt-out is the safer failure mode for staff-facing operational
   email (a queue nobody is told about is worse than an unwanted email).
4. **`SET-4` (Courses tab) is a frontend-only slice**: add create/edit forms to the existing
   `/manage/courses` page, in the same shape `/manage/groups` already uses (`CreateGroup`/`EditGroup`
   inline panels — ladder rung 2, reuse the pattern already in this codebase). **Not** moved under
   `/manage/settings` — Courses already has its own nav entry and dedicated screen; duplicating the list
   under a second route is the kind of unrequested restructuring `CLAUDE.md` §12 rules out, and
   `console-shell.tsx:59-64`'s own comment says Courses' nav placement is provisional pending exactly
   this unit, not that it must move under Settings specifically.
5. **`SET-5` (Groups tab) has no engineering gap.** Full CRUD already ships at `/manage/groups`, built in
   unit 5 slice 5d (`CLAUDE.md` §4.1) — before this unit existed. Re-verify it still works (browser or
   integration check) and mark it `[x]` on that basis; do **not** duplicate it under Settings. This is
   recorded as a **finding**, not silently absorbed: `docs/IMPLEMENTATION_PLAN.md`'s Phase 14 row
   predates unit 5's build and is stale on this point.
6. **`/manage/settings` (admin-gated) holds: Notifications, Google.** Both are staff-wide preference /
   integration screens a teacher configures once. Two tabs (`TabList`, the ported primitive) rather than
   a bare page, since the nav already promises a "Settings" surface with more than one concern under it.
   Includes a small "Manage courses" / "Manage groups" link-out pair so Settings does not read as an
   empty promise relative to the phase name — this is presentation only, no new logic, and is dropped if
   the reviewer finds it padding.
7. **`/manage/account` (every staff role) holds: Profile (SET-1), Notifications is *not* duplicated
   here** — notification preferences are operational/admin-flavoured (registration queue, unmatched
   forms) so they stay in Settings, gated the same as the nav's own admin-only Settings entry, even
   though the API role list (`[assistant, teacher, admin]`) technically allows an assistant to call it.
   **Labelled assumption**, flagged for the reviewer: an assistant who never opens `/manage/settings`
   (hidden by the nav's admin-only courtesy gate, `console-shell.tsx:79`) has no route to their own
   notification preferences even though the API accepts their call. Cheapest fix if wrong: drop the
   `admin` gate on the Settings nav item, which is a one-line, no-blocker change — flagged for the
   reviewer to weigh rather than decided unilaterally, since "hiding a control is courtesy" (`CLAUDE.md`
   §7) cuts both ways here (the route itself does check the real role, so hiding it from assistants is
   not a security gap — only a possible product-fit miss).
8. **Avatar upload size cap: 5 MB**, tighter than the staff 64 MB ceiling (`API_SPEC.yaml:2165`: "tighter
   size cap than the staff endpoint"). Labelled assumption — no document names a number. 5 MB comfortably
   covers a phone-camera portrait at reasonable compression and is a common default for this exact use
   case (a profile photo, not a document).
9. **Avatar upload MIME whitelist: the existing `image/*` subset** of `ALLOWED_UPLOAD_TYPES`
   (jpeg/png/webp/gif/avif) — reused, not duplicated. No SVG, matching the existing table.

## 3. Backend changes

### 3.1 Migration `022` — `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  user_id        TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  submissions    BOOLEAN NOT NULL DEFAULT true,
  registrations  BOOLEAN NOT NULL DEFAULT true,
  unmatched      BOOLEAN NOT NULL DEFAULT true,
  weekly_summary BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No FK-ordering issue (only depends on `users`, from migration `001`). **Must run against real
PostgreSQL from an empty schema before this unit is done** (`CLAUDE.md` §9). Add the post-condition
`describe('migration 022')` check the recent migrations use (018's pattern).

### 3.2 New module `backend/src/settings/`

Mirrors `backend/src/students/` in shape:

- `interfaces/notification-preferences-repository.interface.ts` — `NotificationPreferences` (the four
  booleans + `userId`/`updatedAt`), `get(userId)` (returns defaults, not null, when no row exists —
  decision 3), `upsert(userId, prefs)`. `NOTIFICATION_PREFERENCES_REPOSITORY` token.
- `repositories/in-memory-notification-preferences.repository.ts`,
  `repositories/postgres-notification-preferences.repository.ts` — both required (`CLAUDE.md` §9).
- `dto/update-notification-preferences.dto.ts` — four `@IsBoolean()` fields, **all required** (`PUT` is
  a full replace per `API_SPEC.yaml`'s schema, which lists all four with no `required` override —
  read as replace-semantics, matching HTTP `PUT`, not `PATCH`).
- `dto/update-staff-profile.dto.ts` — `name` only, same shape as `students/dto/update-profile.dto.ts`'s
  `name` field (`@IsOptionalNotNull @IsString @MinLength(2) @MaxLength(100)`), but here it is the only
  field, so drop `@IsOptional` — a `PATCH` with an empty body should 400 (mirrors
  `StudentsService.updateProfile`'s "no profile fields supplied" guard — reuse that guard's shape).
- `settings.controller.ts` — `@Controller('me')` `@Roles(...STAFF_ALL)` (`auth/staff-roles.js`):
  - `GET profile` → `{ id, name, email, role, googleEmail }` (staff view — no `StoredUser.passwordHash`,
    ever; `status` omitted, it is never anything but `active` for a signed-in caller).
  - `PATCH profile` → updates `name`.
  - `GET notification-preferences`
  - `PUT notification-preferences`
- `settings.service.ts` — the two profile methods over `UserRepository`, the two preference methods over
  the new repository. No audit entry (self-service; the same choice `StudentsService` already made for
  its own profile route — no `AuditService` import there either).
- `settings.module.ts` — `imports: [AuthModule, DatabaseModule]`, wires the repository via
  `repositoryProvider`, registers in `app.module.ts` alongside `StudentsModule`.

### 3.3 `UserRepository` gains `updateName`

`backend/src/auth/interfaces/user-repository.interface.ts` — one new method,
`updateName(userId: string, name: string): Promise<void>`, implemented in both
`in-memory-user.repository.ts` and `postgres-user.repository.ts` next to `updatePassword`. Existing
interface spec/contract tests will need this method covered — the interface is already asserted by a
contract-shaped spec pattern elsewhere in the codebase (follow whatever covers `updatePassword` today).

### 3.4 Student avatar upload — `POST /students/me/avatar`

- `backend/src/common/storage/upload-types.ts`: add `AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024` and
  `ALLOWED_AVATAR_MIME_TYPES` (the `image/*` subset of `ALLOWED_UPLOAD_TYPES`, derived by filtering on
  `kind === 'image'` — do not hand-duplicate the list, so it cannot drift from the staff table).
- `backend/src/common/storage/uploads.service.ts`: extend `store()` to accept an optional
  `{ maxBytes?, allowedTypes? }` override (defaulting to today's staff-wide values) rather than adding a
  second near-identical method — ladder rung: smallest diff over the existing method, not a new class.
- `backend/src/students/students.controller.ts`: add
  `POST me/avatar` (`@UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_UPLOAD_BYTES, files: 1 } }))`,
  `@RateLimit(UPLOAD_LIMIT)` — reused, not a new rule), calling `UploadsService.store(file, { maxBytes: AVATAR_MAX_UPLOAD_BYTES, allowedTypes: ALLOWED_AVATAR_MIME_TYPES })`
  then `StudentsService.updateProfile(userId, { avatarUrl: result.url })` — reuses the existing method,
  no new service method.
- **Security re-check, explicit** (per the roadmap's own care note): stored filename is still
  server-minted (unchanged code path); MIME whitelist is the image subset, still fixed server-side; no
  SVG in that subset; size cap enforced both in the multer interceptor and inside `store()`, same
  double-check pattern as the staff route; the route sits under `@Controller('students')` `@Roles(Role.Student)`,
  so a student cannot reach any other student's avatar — `updateByUserId` is keyed off the caller's own
  `req.user.sub`, never a path parameter, so there is no object to authorize past the role check itself.

## 4. Frontend changes

- **`frontend/lib/api.ts`**: `api.staff.profile` (get/patch), `api.staff.notificationPreferences`
  (get/put), `api.students.uploadAvatar` (generalise the existing `uploadFile()` helper to take a path
  parameter instead of hardcoding `/staff/uploads` — one-line change, reused by both callers).
  `api.admin.createCourse` / `updateCourse` **already exist** (`frontend/lib/api.ts:1003-1010`, types
  `AdminCourseWrite`/`AdminCoursePatch`) — SET-4 needs no new client methods, only the form UI that
  calls them.
- **`frontend/lib/types.ts`**: `StaffProfile`, `NotificationPreferences` types.
- **`frontend/app/(app)/manage/account/page.tsx`** (new) — Profile panel: name (editable), email
  (read-only, same "contact us to change" pattern as the student profile page), role tag. Reuse
  `Panel`/`TextInput`/`Button`/`InlineBanner` exactly as `app/(app)/profile/page.tsx`'s `DetailsPanel`
  does — same component family, same save/error pattern.
- **`frontend/app/(app)/manage/settings/page.tsx`** (new) — `TabList`: Notifications | Google.
  - Notifications tab: four checkboxes/toggles bound to the four preference booleans, one `PUT` on save.
  - Google tab: the four-state panel over the 5 existing routes — not connected / connected (shows
    `googleEmail`, `connectedAt`, disconnect button) / no server credentials configured (from `status()`'s
    two-state distinction the controller's own doc comment calls out) / error (`lastError` from status).
    `connect()` returns an `authUrl` — the frontend performs the browser navigation itself
    (`window.location.href = authUrl`), per the controller's own doc comment on why it returns a URL
    rather than redirecting.
- **`frontend/app/(app)/manage/courses/page.tsx`**: add `CreateCourse`/`EditCourse` inline panels,
  mirroring `manage/groups/page.tsx`'s `CreateGroup`/`EditGroup` shape and using `CourseWrite`/`CoursePatch`
  from `API_SPEC.yaml` (title, description, thumbnailUrl, teacherName, sequentialLockEnabled,
  isPublished — confirm the exact `CourseWrite` schema fields in `API_SPEC.yaml` before writing the DTO
  binding, do not guess the field list).
- **`frontend/app/(app)/profile/page.tsx`**: add an `AvatarPanel` — current avatar (`Avatar` primitive,
  already in `components/ui`), a file input, calls `api.students.uploadAvatar`, then reloads the profile.
  Client-side accept filter (`accept="image/*"`) is a courtesy only — the 415/413 paths must still be
  exercised, since the client filter is not the security boundary (`CLAUDE.md` §7).
- **Do not touch `console-shell.tsx` or `student-shell.tsx`** — both nav entries already exist and point
  at the right routes; this unit only has to make the routes resolve.

## 5. Tests required

- **Unit**: `settings.service.spec.ts` (profile get/patch incl. the "no fields supplied" 400,
  notification-preferences get-with-defaults and upsert), `in-memory-notification-preferences.repository`
  covered by whatever spec pattern the sibling repositories use.
- **Integration**: `postgres-notification-preferences.repository` against real Postgres, same contract
  as the memory driver (`CLAUDE.md` §9's "every new table adds two implementations").
- **e2e / authorization refusal tests** — one per permission touched:
  - `GET/PATCH /me/profile`, `GET/PUT /me/notification-preferences`: 401 with no token; refused for
    `Role.Student` (403, since these are staff-only per `x-roles`); succeeds for assistant, teacher, admin.
  - `PATCH /me/profile` with an empty body → 400. With `name` under 2 chars → 400 (DTO boundary).
  - `POST /students/me/avatar`: succeeds for a student uploading an allowed image type; **refuses an SVG
    and an HTML file** (415, matching the staff route's behaviour — prove the same whitelist actually
    applies here, not just that *a* whitelist exists); refuses over `AVATAR_MAX_UPLOAD_BYTES` (413);
    refused for a staff role (403 — the route is `@Roles(Role.Student)` only, this is the "widened to
    students, not to everyone" boundary the roadmap's care note is about); the stored URL is a
    server-minted path, never the original filename — mirror `backend/src/common/storage/uploads.service.spec.ts`'s
    pattern (the existing coverage for the staff route is unit-level on `UploadsService`, not e2e; match
    that shape for the avatar path — an e2e test for the role boundary is still required, since 403 for
    staff / 401 for no token is a routing/guard concern `UploadsService`'s own unit tests cannot see).
  - `DOM-5`'s existing `/admin/courses` authorization tests are unchanged — SET-4 is frontend-only,
    nothing to add there beyond a frontend smoke check.
- **Frontend**: `npx tsc --noEmit` stays at 0. No new `lib/` errors.
- **Migration**: `022` run against real PostgreSQL 15 from an empty schema
  (`docker compose up -d db && TEST_DATABASE_URL=... npm run test:integration --workspace=backend`),
  001–022 in order. **If Docker is unavailable in this worktree, say so plainly and mark the condition
  NOT MET** — do not claim it passed (`CLAUDE.md` §9, §13).

## 6. Definition of done for this unit

1. `022` authored, and run against real Postgres from an empty schema (or explicitly recorded as
   blocked by environment, never asserted without having run).
2. Both repository drivers for `notification_preferences`.
3. `/me/profile`, `/me/notification-preferences` implemented, authorized (`STAFF_ALL`, refused for
   `Role.Student` and for no token), tested both directions.
4. `POST /students/me/avatar` implemented; the upload contract re-verified explicitly (server-minted
   filename, image-only whitelist, size cap, no SVG/HTML) with a refusal test for each, plus the
   staff-vs-student role boundary.
5. `/manage/account` and `/manage/settings` render, backed by real API calls, no mock data.
6. Course create/edit UI added to `/manage/courses`; group create/edit confirmed already present and
   working (SET-5 finding, §2.5).
7. `npm test`, `npm run test:e2e`, `npm run lint`, `cd frontend && npx tsc --noEmit` (0 errors) all
   re-run and green, real output recorded — not asserted from the executor's self-report.
8. `docs/API_SPEC.yaml` updated if any route's actual shape differs from what's written today (the two
   `/me/*` entries currently have no request/response schema — fill them in from what gets built).
9. `docs/IMPLEMENTATION_PLAN.md`, `docs/PHASE_ROADMAP.md`, `docs/DATABASE_PLAN.md` (migration order
   table — it currently predicts `022` as weekly reports, which is wrong; correct it and note the
   renumbering, same pattern as the unit-6 renumbering note already in that file),
   `docs/CHANGELOG.md` (decisions 2-9 above worth a durable record if the reviewer doesn't overturn
   them), `project_log.md` updated.

## 7. Blockers

None outright block the unit. Two labelled assumptions are flagged for the reviewer rather than decided
unilaterally (§2.7's nav-gate question; §2.3's default-preference value) — both are cheap to reverse and
neither blocks writing the rest of the unit.

## 8. Dispatch

Single slice — the pieces are individually small (one migration, one new thin module, two new pages,
two existing-page additions, one upload-path generalisation) and share enough context that splitting
would cost more in re-reading than it saves in review granularity.
