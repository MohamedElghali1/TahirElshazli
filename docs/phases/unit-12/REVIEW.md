# Review — chat unit 12: Settings and account

Reviewer: `unit-12` (planner + reviewer). Model that authored the work: `gemini-3.1-pro-high`
(`claude-sonnet-4-6` hit its quota first and touched nothing).

## Verdict: REJECTED

Real, reproduced failures — not theoretical gaps. `npm run test:e2e --workspace=backend` fails (5
tests), `npx tsc --noEmit` is not at 0, and one of the six findings is a functional bug that breaks the
feature for its actual audience. Remediation checklist below; re-review after the next pass.

## Findings, ranked

### 1. `EditCourse` calls a student-only endpoint — the course edit form is broken for every real caller (Critical)

`frontend/app/(app)/manage/courses/page.tsx`'s `EditCourse` fetches course detail with
`api.courses.get(t, courseId)`, which hits `GET /courses/:id` —
`backend/src/courses/courses.controller.ts:14-16` is `@Controller('courses')` `@Roles(Role.Student)`.
A teacher, admin or assistant opening "Edit" on this screen gets a 403. This is the only place in the
diff that reads course detail for the edit form, so the feature does not work for anyone who can reach
it.

This also explains an otherwise-unrelated diff: `backend/src/courses/courses.service.ts:146` adds
`slug: course.slug` to `toListItem`, which builds `CourseListItem` — the **student** enrolled-courses
response (`CoursesService.getEnrolledCourses`), used nowhere in this unit's actual scope. It was added
so the (wrong) student endpoint would carry the field the edit form needs. Both need fixing together:
revert the `courses.service.ts` change (no test caught it because `CourseListItem` has no exact-key-set
assertion — worth a follow-up, not this unit's job to add) and point `EditCourse` at a staff-appropriate
read — either the row data the list already holds (`ManageCourseCard`, if it carries enough fields) or
a real staff/admin course-detail route (`api.staff.courses()` or a comparable existing read; check
`API_SPEC.yaml` before adding a new route — DOM-5 may already expose enough via an existing one).

### 2. Avatar-upload MIME rejection returns 400, not 415 — contract mismatch with the spec, the frontend, and the tests Antigravity itself wrote (High)

`UploadsService.store()` (`backend/src/common/storage/uploads.service.ts:92-98`) throws
`BadRequestException` (400) for a disallowed MIME type — unchanged from before this unit, correct for
the staff route. `docs/API_SPEC.yaml:2179` documents `POST /students/me/avatar`'s `415: Unsupported
media type` explicitly, `frontend/app/(app)/profile/page.tsx`'s new `AvatarPanel` branches on
`cause.status === 415`, and `backend/test/app.e2e-spec.ts:887-893` ("rejects an SVG") asserts
`res.status` is `415`. All three were built to the 415 contract; only the service call site wasn't
adjusted. **Reproduced**: `rejects an SVG` fails with `expected 400 to be 415`.

Fix at the avatar call site, not by changing `store()`'s default (that would alter the staff route's
existing, unspecified-but-presumably-relied-upon 400 behaviour). Either give `store()` an optional
"unsupported-type status" parameter (400 default, 415 passed from the avatar controller) or check the
MIME type against `ALLOWED_AVATAR_MIME_TYPES` before calling `store()` and throw
`UnsupportedMediaTypeException` directly in the controller/service, letting `store()`'s own check stay
a defence-in-depth backstop.

### 3. Avatar upload — oversized file destabilises the shared e2e app instance (High)

`rejects an oversized file` doesn't get a clean 413: the request either resolves without throwing or
the connection resets, and the *next* test in the same file (`app.e2e-spec.ts` runs one `app` for the
whole file) then times out (`ends old sessions on password change`, 5000ms). **Reproduced** both ways —
running the avatar block alone shows `ECONNRESET` on the following test in that block; running the
whole file shows the unrelated timeout further down. No global exception filter exists in this codebase
(`grep` for `ExceptionFilter`/`LIMIT_FILE_SIZE` returns nothing) to turn multer's `fileSize`-exceeded
error into a clean HTTP response, and nobody had an e2e test that actually exceeded a `fileSize` limit
before this unit — this may be a **pre-existing gap in the whole upload path**, newly exposed rather
than newly introduced, but it has to be fixed for this unit's own tests to pass and because a student
hitting it today would degrade the one API process (§1: one replica, no queue — that is not a
theoretical concern here).

Needs investigation before a fix: confirm whether `FileInterceptor`'s `limits.fileSize` error reaches
NestJS's exception handling at all on this Express adapter/multer version, and if not, catch it
explicitly (e.g. wrap the interceptor or check `file.size`/`Content-Length` before multer buffers the
whole body) so it always resolves as a clean `PayloadTooLargeException`.

### 4. `SettingsController` is discovered but not enumerated — the authorization contract test's own guarantee is defeated (High)

`backend/src/auth/role-guards.spec.ts:161` bumped `expect(CONTROLLERS).toHaveLength(31)` (correct, it's
auto-discovered via `import.meta.glob`), but `SettingsController` was never added to the `EXPECTED`
table (still `toHaveLength(26)` unchanged, `SettingsController` absent from the object). The file's own
doc comment explains why this matters: "the count assertion is what makes an added controller land here
rather than slip past" — except the count assertion alone doesn't do that; the `for (const name of
[...Object.keys(EXPECTED)...])` loop only checks that *named* controllers were discovered, not that
every *discovered* controller is named. A new controller can currently ship with the wrong `@Roles` and
this spec will not catch it. `SettingsController`'s actual `@Roles(...STAFF_ALL)` happens to be correct,
but the guard-rail didn't verify it. Fix: add `SettingsController: STAFF_ALL` to `EXPECTED` and bump
`toHaveLength(26)` to `27`.

### 5. `npx tsc --noEmit` is not at 0 (High — hard gate per `CLAUDE.md` §4.1)

`manage/settings/page.tsx:26` — `onChange={(v: string) => setActiveTab(v)}` on `TabList`. Root cause is
in the primitive, not the call site: `components/ui/tabs.tsx`'s `TabList` props type intersects an
explicit `onChange?: (value: string) => void` with `& React.HTMLAttributes<HTMLDivElement>`, which
carries its own `onChange?: ChangeEventHandler<HTMLDivElement>` — TypeScript intersects same-named
properties across an object-type intersection rather than letting the explicit one win, producing an
near-uninhabitable type for `onChange`. This is a **pre-existing latent defect in the shared primitive**,
first tripped by this unit because it is the first caller anywhere in the app to use `TabList`'s local
(`onChange`) mode — every other caller (`manage/courses/[id]/layout.tsx`) uses the route (`href`) mode,
which never touches this prop. Fix in `components/ui/tabs.tsx`: change the props type to
`Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>` in the intersection, not a workaround at the
call site — the doc comment already documents this exact "switches a local view" use case as intended,
so the primitive should actually support it.

### 6. New Postgres integration tests are broken and have never actually run (Medium — but blocks a DoD point)

`backend/test/postgres-repositories.integration-spec.ts` — the two new `notification preferences` tests
were inserted nested under an unrelated existing `describe('migration 015 backfills the course grants it
drops', ...)` block, outside the closure that has `db` (`let db: DatabaseService`, assigned in the
top-level `beforeAll`) in scope: `ReferenceError: db is not defined`. **Reproduced** by the reviewer
against real PostgreSQL 15-alpine (`unit12_test`, created inside the already-running
`tahirelshazli-db` container, migrations 001-022 applied cleanly from empty, 149/151 other integration
tests passed). Move the `describe('notification preferences', ...)` block to a location in the file with
`db` in scope (sibling to the other repository `describe` blocks, not nested inside the migration-015
one), then re-run and confirm both pass for real.

**Positive finding, worth keeping in view:** migration `022` itself is correct and ran clean — this is a
test-placement bug, not a migration or repository defect.

## Not yet verified — needs positive-path e2e coverage

No e2e test exists for the happy path of `GET/PATCH /me/profile` or `GET/PUT /me/notification-preferences`
succeeding for an assistant, a teacher, or an admin — only the 401 (no token) and 403 (student) refusal
cases are covered (`backend/test/staff.e2e-spec.ts:82-101`). Given this unit's own ruling widened
notification-preferences visibility to assistants specifically, at minimum one test proving an
**assistant** can successfully call both routes is needed — the unit-level `settings.service.spec.ts`
tests the service logic but never exercises the actual route/guard/DTO wiring. Add both positive-path
cases in the remediation pass.

## Confirmed correct, not flagged

- Migration `022` — correct shape, correct default (`DEFAULT true` on all four columns, matching the
  in-memory and Postgres repositories' own no-row fallback — the two places expressing this default do
  agree, per the client's requirement).
- `console-shell.tsx` — exactly the one-line, client-ruled nav change requested, nothing else touched.
- `AdminGoogleIntegrationController: STAFF_ADMIN` in `role-guards.spec.ts:107` is unchanged, still
  proves the server-side refusal for an assistant regardless of what the Google tab renders — cited
  rather than duplicated, as planned.
- Backend unit suite: 664/664, up from 660 baseline, 0 skipped, 0 new `any`, no disabled lint rule.
- `npm run lint`: 0 errors.

## Remediation checklist for the next pass

1. Fix `EditCourse`'s data source (finding 1); revert the unrelated `courses.service.ts` `slug` addition
   once the edit form no longer needs it from that endpoint.
2. Avatar upload returns 415 for a rejected MIME type, not 400 (finding 2).
3. Avatar upload returns a clean 413 for an oversized file and does not destabilise the app for
   subsequent requests (finding 3) — investigate root cause first, do not paper over it.
4. Add `SettingsController: STAFF_ALL` to `role-guards.spec.ts`'s `EXPECTED` table, bump the count to 27
   (finding 4).
5. Fix `TabList`'s prop type in `components/ui/tabs.tsx` (`Omit<..., 'onChange'>`) so
   `npx tsc --noEmit` is 0 again (finding 5).
6. Move the notification-preferences integration tests into scope where `db` is defined, confirm they
   pass for real against Postgres (finding 6).
7. Add positive-path e2e coverage for `/me/profile` and `/me/notification-preferences` for at least
   teacher and assistant.
8. Re-run all four gates plus the integration suite against real Postgres, paste real output.
