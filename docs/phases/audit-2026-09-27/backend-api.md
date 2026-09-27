# Backend/API audit — Dr. Tahir LMS

Static, read-only. No tests/build run (lead's job). Cross-checked against
`docs/API_GAP_ANALYSIS.md`, `docs/PRODUCT_SPEC.md` was not fully read line-by-line given
time budget — feature matrix below is derived from controller/repository inventory and
`API_GAP_ANALYSIS.md`'s own classification, not independently re-derived from PRODUCT_SPEC.
Flag this gap explicitly rather than presenting unchecked confidence.

**Note on recordings/video (addendum, see §4a):** a mid-audit requirement update from the
user overrides the docs — recordings are plain links (a stored URL the student opens);
Bunny Stream / signed video URLs are explicitly OUT of scope. The original API-05 finding
below ("no Bunny Stream integration") is **superseded** — it is not a gap. §4a replaces it
with what was actually verified against the new requirement.

---

## 1. Route inventory (backend/src, grep on `@Controller`/`@Get`/`@Post`/`@Patch`/`@Put`/`@Delete`)

Full controller-by-controller list matches `docs/API_GAP_ANALYSIS.md` Part A closely —
spot-checked ~40 of the ~100 routes named there against the actual `@Controller()`/method
decorators and found no drift in path or verb. Notable controllers and their base path:

- `auth.controller.ts` → `/auth/*` (register, login, logout, password-reset, invitations/:token/accept) — all `@Public()` except logout (`@AnyRole()`), matches CLAUDE.md §7.
- `google-sign-in.controller.ts` → `/auth/google/*`
- `courses.controller.ts` → `/courses` (`@Roles(Role.Student)`) — **`GET /courses/catalog` still exists** (see API-01).
- `dashboard/*` → `/dashboard`, `/courses/:id/dashboard`
- `assessments.controller.ts` → `/courses/:id/assessments`, `/assessments/:id`, `/assessments/:id/submissions`, `/assessments/:id/files`
- `materials.controller.ts`, `recordings.controller.ts`, `reports.controller.ts`, `notifications.controller.ts`, `students.controller.ts`, `classmates.controller.ts`, `student-announcements.controller.ts`, `student-sessions.controller.ts` (`/students/me/timetable`, `/students/me/attendance`)
- `staff.controller.ts` → `/staff/courses`
- `staff-manage.controller.ts` → `/staff/overview`, `/staff/courses/:id/{roster,outline,submissions,recordings,assessments}`, `/staff/tasks`, `/staff/assessments/:id`, `/staff/assessments/:id/targets`, `/staff/submissions/:id/grade`
- `marking.controller.ts` → `/staff/assessments/:id/submissions`, `/staff/submissions/:id/annotations[/:aid]`, `/staff/submissions/:id/return`
- `work-analytics.controller.ts` → `/staff/assessments/:id/{analytics,results,unmatched,sync}`, `/staff/courses/:cid/students/:sid/work`, `/staff/results/:id[/attach]`
- `task-drafts.controller.ts` → `/staff/task-drafts[/:id]`
- `sessions.controller.ts` → `/staff/sessions[...]`, `/staff/groups/:id/sessions`
- `staff-groups.controller.ts` → `/staff/courses/:cid/groups`, `/staff/groups/:id[...]`, `/staff/groups/:id/{members,report,markbook,markbook.csv}`
- `staff-announcements.controller.ts` → `/staff/announcements/reach`, `/staff/courses/:cid/announcements[...]`, `/staff/groups/:gid/announcements[...]`
- `staff-blog.controller.ts` → `/staff/blog[...]`
- `uploads.controller.ts` → `/staff/uploads`, `/staff/uploads/config`
- `admin-manage.controller.ts` → `/admin/students[...]`, `/admin/assistants[...]`, `/admin/courses/:id/recordings`, `/admin/recordings/:id`
- `admin-courses.controller.ts` → `/admin/courses[...]`
- `admin-groups.controller.ts` → `/admin/groups[...]`, `/admin/groups/:id/members/bulk`
- `admin-announcements.controller.ts` → `/admin/announcements[...]`, `/admin/announcements/:id/publish`
- `admin-audit.controller.ts` → `/admin/audit-log`
- `admin-google-integration.controller.ts` → `/admin/integrations/google[...]`
- `settings.controller.ts` → `/me/profile`, `/me/notification-preferences`
- `public-courses.controller.ts`, `public-blog.controller.ts` → `/public/*`, `@Public()`
- `app.controller.ts` → `/health`

No global prefix (`setGlobalPrefix` never called) — confirmed, matches `API_GAP_ANALYSIS.md` line 6.

---

## 2. Frontend ↔ API contract matrix (`frontend/lib/api.ts`)

`frontend/lib/api.ts` (1605 lines) is heavily and unusually well self-documented with
comments citing exact requirement codes and backend behavior. Spot-checked every export
group against the controller inventory above. Findings:

### API-01 — P3 — `api.courses.catalog` calls a route the spec says should not exist, but the route is still live
- **Area:** frontend/lib/api.ts:506-507 ↔ backend/src/courses/courses.controller.ts:32-37
- **Expected:** `docs/API_GAP_ANALYSIS.md` line 35 marks `GET /courses/catalog` `[DEPRECATE]` — "Existed only to feed self-enrolment," which was itself retired (`DOM-4`).
- **Actual:** The backend route still exists and is exported from `frontend/lib/api.ts` (`api.courses.catalog`). Grep across `frontend/app` and `frontend/components` finds **no caller** of `api.courses.catalog` — it is dead code on both sides, not a broken call.
- **Confidence:** Confirmed (grep of `frontend/app`, `frontend/components`, `frontend/lib` for `catalog` — only comments, unrelated `CatalogEmpty`/`fetchCatalog` for the *public* marketing catalog, and the `api.ts` definition itself).
- **Impact:** None functionally (unreachable from UI). It is stale scope the gap analysis already flagged for removal and nobody removed.
- **Recommended minimal fix:** Delete the `catalog` route (`courses.controller.ts:32-37`), `CoursesService.getCatalog`, `CatalogItem` type, and the `api.courses.catalog` export together — one slice, per the gap analysis's own `[DEPRECATE]` verdict. Not urgent; no user-facing effect today.

### API-02 — P3 — Duplicate identical functions in the announcements block
- **Area:** frontend/lib/api.ts:995-1021 (`courseAnnouncements`) and :1009-1021 (`announcements`) are byte-identical (both `GET /staff/courses/:courseId/announcements`); same duplication between `postCourseAnnouncement` (:1023) and `postAnnouncement` (:1039) — identical bodies, identical route.
- **Expected:** One function per distinct backend call.
- **Actual:** Two named client functions calling the exact same route with the exact same signature.
- **Confidence:** Confirmed (read both function bodies).
- **Impact:** No correctness bug — just redundant API surface, mild confusion for whoever picks a name at a call site.
- **Recommended minimal fix:** Grep call sites of both names; keep whichever is used (or the better name) and delete the other. Ponytail: this is straightforward deletion-over-addition, not worth more than a follow-up note.

### Verified-consistent (no drift found)
- `staff.grade` → `POST /staff/submissions/:id/grade` matches `staff-manage.controller.ts:109`.
- `staff.returnSubmission` / `annotations.*` → all match `manage/marking.controller.ts` routes and verbs exactly, including the group-grain notes in the comments.
- `staff.sessions.*` → all match `manage/sessions.controller.ts` routes/verbs (list, planned, create, update/PATCH, cancel/DELETE, publish/POST, attendance GET/PUT).
- `students.timetable`/`students.attendance` → match `live-sessions/student-sessions.controller.ts`.
- `admin.acceptRegistration`/`rejectRegistration`/`studentDetail`/`updateStudent`/`createStudent` → match `admin-manage.controller.ts` paths (`students/:id/accept`, `/reject`, `GET/PATCH :id`, `POST students`).
- `admin.groups`/`createGroup`/`updateGroup`/`bulkMoveMembers` → match `admin-groups.controller.ts`, including the `/admin/groups/:groupId/members/bulk` route that `API_GAP_ANALYSIS.md` records as `[BUILT] unit 5 slice 5d`.
- Work-analytics block (`workAnalytics`, `workResults`, `workUnmatched`, `workSync`, `result`, `attachResult`) → matches `work-analytics.controller.ts` 1:1, consistent with the gap analysis calling this subsystem "complete... needs a frontend and nothing else."
- `staff.taskDrafts`/`createTaskDraft`/`updateTaskDraft`/`deleteTaskDraft` → match `task-drafts.controller.ts`.
- `staff.markbook`/`markbookCsv` → match `staff-groups.controller.ts:102,118`, including the `Content-Disposition` filename parsing in `requestBlob`.
- Request-body shape spot checks: `createAssessment` body fields (`title, type, availableFrom/To, dueAt, maxScore, allowedFileTypes, maxFileSizeBytes, targets, workType, externalUrl, googleForm, submissionModes, markerId, visibility, attachments, draftId, allowResubmission`) — did not have time to line-by-line diff every field against `CreateAssessmentDto`; flagged as **unverified**, not confirmed matching. Recommend a follow-up pass specifically diffing DTO field lists against `api.ts` call-site body shapes for the five or six largest write endpoints (`createAssessment`, `updateAssessment`, `createRecording`, `updateStudent`, `createStudent`).

### Backend routes the frontend does not call (present in controllers, absent from `api.ts`)
- `GET /admin/integrations/google/callback`, `POST /admin/integrations/google/inspect` — expected: `callback` is a redirect target hit by Google directly (not called from `api.ts` by design), `inspect` is presumably an admin diagnostic action. Not necessarily dead — didn't have budget to check if a page calls it via a raw `fetch()` outside `api.ts`. **Unverified** whether `inspect` is reachable from any UI.
- `GET /courses/catalog` — see API-01.
- No `fetch(` calls found in `frontend/` outside `lib/api.ts` and `lib/catalog.ts` (grepped `fetch(` and `INTERNAL_API_URL` across `frontend/`); `lib/catalog.ts` calls `api.publicCourses.list()` — not a second HTTP client. So `lib/api.ts` is genuinely the sole HTTP boundary, matching CLAUDE.md §5's stated invariant ("`lib/api.ts` is the ONLY thing that knows the API exists").

### `API_SPEC.yaml` drift
Not independently diffed route-by-route against the live controllers — out of budget for this pass. `docs/API_GAP_ANALYSIS.md` (dated after the last major redesign units) is the more current and more trustworthy source and was cross-checked instead; CLAUDE.md itself documents that `API_SPEC.yaml` "omits the `[KEEP]` routes by design," so a naive diff would show false drift. Recommend a dedicated pass if `API_SPEC.yaml` accuracy is a release gate.

### Validation boundary (main.ts)
`main.ts:52-58`: `ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: false } })`.
- `whitelist: true` strips undeclared properties silently rather than rejecting the request (`forbidNonWhitelisted` is **not** set).
- **P3 — API-03:** CLAUDE.md §6 says "never accept a field the DTO does not declare" — `whitelist` technically satisfies that (the field never reaches the service), but a client sending a bogus/mistyped field gets a silent 2xx instead of a 400 telling them why their write didn't do what they expected. Minor DX/observability gap, not a security hole (unknown fields cannot reach a service either way).
- **Recommended minimal fix (if wanted):** add `forbidNonWhitelisted: true` to the global pipe — one line — and run the full test suite, since e2e specs may currently rely on being silently ignored. Not a P0/P1; flagging only.

---

## 3. Feature matrix

Given the time budget, this is derived from `docs/API_GAP_ANALYSIS.md`'s own Part A/B
classification (which is itself dated and reconciled against PRODUCT_SPEC per CLAUDE.md's
authority order) plus the controller/repository inventory above, **not** an independent
re-read of every line of `PRODUCT_SPEC.md`. Status is capped at **IMPLEMENTED BUT
UNVERIFIED** per the task's own instruction, since this is a static pass.

| Feature area | Frontend | API | Postgres repo | Status | Test coverage note |
|---|---|---|---|---|---|
| Auth (register/login/logout/reset) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | `auth/role-guards.spec.ts` pins `@Public`/`@AnyRole` list per CLAUDE.md §7 |
| Google sign-in | yes | yes | yes (`023_user_google_identities.sql`) | IMPLEMENTED BUT UNVERIFIED | unit 14 (`GAUTH-C1/C2`) per CLAUDE.md history |
| Courses (student list/detail) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | `courses.controller.spec.ts` exists |
| Course catalog (student-facing) | dead (see API-01) | yes (stale) | yes | STALE / DEAD — flagged for deletion by gap analysis, not removed |
| Dashboard / Home | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | `dashboard.controller.spec.ts` exists |
| Assessments (student) + submissions + file upload | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | `assessments.controller.spec.ts`, `submission-rules.spec.ts` |
| Materials | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | — |
| Recordings + progress | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED — see §4a: links-only requirement confirmed, DTO clean, minor doc/copy cleanup needed |
| Weekly reports (student read) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED — `API_GAP_ANALYSIS.md` B7 says the **staff-side** write/send/regenerate/PDF routes (9 routes) are wholly `[MISSING]`; only the student read side and `GET/PATCH .../summary,documents` exist |
| Notifications | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Student profile + avatar | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | avatar goes through `local`/`none` storage driver only (§4) |
| Classmates | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Announcements (student read, staff/admin write) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Staff overview/roster/outline/submissions/grading | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Marking + annotations + return | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | per `API_GAP_ANALYSIS.md`, unit 7 built and specced (`marking.service.spec.ts`) |
| Work analytics / Google Forms sync | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | **Google Forms integration is real** (`google-forms.client.ts`, `google-oauth.service.ts`, token cipher) — not a stub, see §4 |
| Task authoring + drafts | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | `task-drafts.service.spec.ts` |
| Mark book + CSV export | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Sessions & attendance (staff + student) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | migration `026`, per CLAUDE.md landed unit 8, browser-checked for the RTL score bug (`F8-1`) |
| Groups admin (CRUD, bulk move, report) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Admin: student directory, accept/reject registration | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Admin: assistant invite/update/remove/resend | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Admin: course CRUD | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Admin: recordings CRUD | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| Admin: audit log | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | exhaustive `Record<AuditAction,true>` pattern present in query DTO per CLAUDE.md convention (not individually re-verified) |
| Admin: Google integration (connect/status/disconnect/inspect) | partial (no `inspect` call found) | yes | yes | IMPLEMENTED BUT UNVERIFIED, `inspect` route possibly unreachable from UI |
| Blog (public read + staff CRUD) | yes | yes | yes | IMPLEMENTED BUT UNVERIFIED | |
| File uploads (`local`/`none` only) | yes | yes | n/a (filesystem/none) | **PARTIALLY IMPLEMENTED** — `r2` driver does not exist in code at all, see API-04 |
| Video hosting | n/a | n/a | n/a | **OUT OF SCOPE by user decision** — recordings are plain links; see §4a (was previously mis-flagged as a Bunny Stream gap) |
| Payments | n/a | n/a | n/a | **MISSING** (by design/deferred — `courses.service.ts:214` explicitly documents this as future scope, not a bug) |
| Device/session management (`GET/DELETE /auth/sessions`) | no | no | no | **MISSING** — `API_GAP_ANALYSIS.md` B1 already lists this as `[MISSING]`, needs shared session state (blocked by the single-replica/per-process design, §8 of CLAUDE.md) |

---

## 4. Placeholders / stubs — external integrations

### API-04 — P1 — `StorageDriver` type has no `'r2'` member; CLAUDE.md's documented production storage driver does not exist in code
- **Area:** `backend/src/common/config/env.ts:351-378`
- **Expected:** CLAUDE.md §3 states: "File storage: **Cloudflare R2** (`STORAGE_DRIVER=r2`); `local` in dev, `none` in prod until provisioned."
- **Actual:**
  ```ts
  export type StorageDriver = 'none' | 'local';
  const VALID_STORAGE_DRIVERS: StorageDriver[] = ['none', 'local'];
  ```
  Setting `STORAGE_DRIVER=r2` at boot throws `STORAGE_DRIVER must be one of none, local (got "r2")` and the process never starts. There is no R2 client, no S3-compatible SDK dependency, nothing under `common/storage/` for it.
- **However:** the code is self-aware and honest about this — the comment directly above (`env.ts:345-349`) says "`r2` is the value this grows to," i.e., this is **documented future work**, not a silent gap. This is exactly the CLAUDE.md-mandated "degrade to an explicit, honest failure" pattern working as intended: `STORAGE_DRIVER=none` in production means all uploads 503 with a clear message, and the blog/recordings/student-avatar flows fall back to a URL field.
- **Impact:** Real functional gap if the client expects file uploads (blog media, student avatars, profile photos) to work in production today — they will not, by design, until R2 is built. This is worth flagging as a **release-readiness / scope** item, not a code defect. Recommend the lead confirm with `docs/PRODUCT_SPEC.md`'s `[EXISTING]/[NEW]` classification whether R2 upload was committed for this phase or intentionally deferred — I did not have budget to trace that classification line-by-line.
- **Confidence:** Confirmed (type union, boot-time validation, and the module wiring in `storage.module.ts` returning `null` for anything but `local`).
- **Recommended minimal fix:** None needed unless R2 is in scope for this release; if it is, this is a new-feature slice (migration N/A, `R2FileStorage implements FileStorage`, wire into `storage.module.ts`'s factory), not a "fix."

### §4a. Recordings-are-links-only — verified against the user's mid-audit requirement override

The user overrode the docs mid-audit: recordings are just links (a stored URL the student
opens); Bunny Stream / signed video URLs are explicitly out of scope. Verified three things:

**(a) DTO validation — CLEAN, no fix needed.**
`backend/src/manage/dto/create-recording.dto.ts:61` and `update-recording.dto.ts:43` (videoUrl),
and `:89`/`:64` (thumbnailUrl):
```ts
@IsUrl({ protocols: ['http', 'https'], require_protocol: true })
```
class-validator's `IsUrl` with `protocols`+`require_protocol` rejects `javascript:`, `data:`,
and any non-http(s) scheme outright. A malicious `javascript:alert(1)` string is rejected at
the DTO boundary before it ever reaches the DB. No server-side fetch of the URL happens
anywhere (it's stored and handed to the browser only), so SSRF is not in play here despite
this using the looser `@IsUrl` rather than the stricter `isPublicHttpUrl` SSRF-hardened
validator used elsewhere (e.g. `create-live-session.dto.ts`) — that stricter validator exists
specifically for URLs the *server* fetches; recordings are never fetched server-side, so
`@IsUrl` is the correct (not weaker) choice here.

**(b) Frontend rendering — works, but is more than "just a link" and contains dead/misleading Bunny-specific paths.**
`frontend/components/student/recording-player.tsx` classifies `videoUrl` into 5 kinds: `file`
(native `<video src>`), `youtube`/`vimeo`/`bunny` (each gets an `<iframe>` embed), and `link`
(plain `window.open(url, '_blank', 'noopener,noreferrer')` — correctly safe, matches CLAUDE.md
§8 XSS/link-safety norms). Given the new requirement, the `youtube`/`vimeo`/`bunny`
iframe-embed branches (lines 31-50, `classifyVideoUrl`) and the native `<video>` file-detection
branch (lines 27-29, `FilePlayer`) are speculative complexity beyond what's now in scope. The
`bunny` branch in particular actively references a host pattern (`iframe.mediadelivery.net`,
`*.b-cdn.net`) for an integration that is now explicitly out of scope.

**(c) Code/docs/env still assuming Bunny — P3 cleanup list, phrased as agy-delegate briefs:**

1. `frontend/components/student/recording-player.tsx:8-15` — `VideoKind` type includes `'bunny'`, top doc comment says "a future Bunny integration is one case added here," and the `.b-cdn.net`/`iframe.mediadelivery.net` branch (lines 45-50).
2. `frontend/app/(app)/manage/courses/[id]/recordings/page.tsx:30-33` (component doc comment) — "The video lives in Bunny Stream (§3) and playback must go through a signed, expiring URL (§8)."
3. Same file, line 291 — **user-facing form hint text**, currently: `hint="The Bunny Stream link. Playback is signed per request, so this is never handed to a student directly."` This is factually wrong today (nothing signs playback; the raw URL is handed straight to the student) — should be corrected regardless of the Bunny decision, since it currently promises a security property that does not exist.
4. `backend/src/manage/dto/create-recording.dto.ts:53-56` — doc comment "A Bunny Stream id or URL today (CLAUDE.md §3); §8 requires the playback URL to be signed and minted per request."
5. `frontend/app/(app)/manage/blog/[id]/page.tsx:543-544` — comment mentioning Bunny Stream as a long-term storage target for blog media (separate from recordings; same pattern, lower priority since it's blog media not video).
6. `docs/CLAUDE.md` §3 tech stack table ("Video: Bunny Stream — adaptive streaming, signed URLs only") and §8 ("Media is served only through signed, expiring URLs. Course video must not be directly linkable.") — these are the root-level authoritative docs and now contradict the user's override. Flagging for whoever owns doc updates (§12 of CLAUDE.md says a durable-rule change updates CLAUDE.md itself) — not something I'll edit since I'm read-only.
7. `context/tahirlmsprojectknowledge.md`, `README.md`, `.claude/agents/tahir/lms-sec-appsec.md`, `.claude/agents/tahir/lms-arch-scale.md` — all reference Bunny Stream; lower priority (historical/agent-config docs).

**Implementable briefs for agy-delegate (all P3, doc/copy accuracy — no security or data-model change):**

> **BRIEF 1 — Fix the misleading form hint (highest priority of these; it's user-visible and wrong)**
> File: `frontend/app/(app)/manage/courses/[id]/recordings/page.tsx`, line ~291.
> Change: replace the `hint` text on the "Video URL" `TextInput` from claiming a signed/non-direct-playback guarantee to something accurate, e.g. `"A direct link to the video (YouTube, Vimeo, or any hosted file). Students open or watch this link as-is."` Also delete the "Bunny Stream" reference in the component's top doc comment (lines 30-33) and replace with a plain note that recordings are a stored link and the platform does not host or sign video.
> Acceptance check: grep the file for "Bunny" and "signed" — zero hits; the hint text no longer implies a security property that doesn't exist.

> **BRIEF 2 — Simplify recording-player.tsx to drop the Bunny-specific branch (optional simplification)**
> File: `frontend/components/student/recording-player.tsx`.
> Change: remove the `'bunny'` member from `VideoKind` and the `host === 'iframe.mediadelivery.net' || host.endsWith('.b-cdn.net')` branch (lines 45-50); update the top doc comment (lines 8-14) to drop the "future Bunny integration" framing. Keep `file`/`youtube`/`vimeo`/`link` branches as-is since they don't reference Bunny and still function as a superset of "just links" — confirm with the user whether "just links" means literally only the `LinkOutPlayer` path for everything, in which case strip youtube/vimeo/file too.
> Acceptance check: grep the file for "bunny"/"Bunny"/"b-cdn" — zero hits; existing recording-player tests (if any) still pass.

> **BRIEF 3 — Update backend DTO comments (cosmetic, no behavior change)**
> File: `backend/src/manage/dto/create-recording.dto.ts:53-56`.
> Change: replace the comment above `videoUrl` from "A Bunny Stream id or URL today... §8 requires the playback URL to be signed" to something like "A direct link to the video; the platform stores and hands it back as-is, never proxies or signs it."
> Acceptance check: grep `create-recording.dto.ts` for "Bunny" — zero hits.

> **BRIEF 4 (not code — flag to lead/user)** — `docs/CLAUDE.md` §3 and §8 need the video-hosting rule rewritten to reflect the "just links" decision, since CLAUDE.md is the authoritative doc other agents and future sessions read.

### Google Forms / Google sign-in — real, not a stub
`backend/src/integrations/google/` has a genuine OAuth flow (`google-oauth.service.ts`), a real Forms API client (`google-forms.client.ts`), and an AES token cipher for stored refresh tokens (`token-cipher.ts`). This matches CLAUDE.md's unit 14 `GAUTH-C1`/`GAUTH-C2` closure notes and is **not** a placeholder. `admin-google-integration.controller.ts` models 4 connection states per the gap analysis.

### Mail — real SMTP sender exists, degrades honestly
`backend/src/mail/`: `MailSender` interface with `smtp-mail-sender.ts` (real) and `log-mail-sender.ts` (dev fallback, logs instead of sending). `MailService.send()` throws `ServiceUnavailableException` (503) when `MAIL_DRIVER=none`/sender is null, and **refuses to send outside a DB transaction** (`mail.service.ts:31-36`) — matches CLAUDE.md §9's "a mutation and its audit entry commit together" pattern extended to mail delivery. This is a solid, non-stub implementation. Not independently verified that `smtp-mail-sender.ts` actually sends correctly (would need an SMTP server to test — out of scope for static review).

### Payments — correctly absent, not a gap
`courses.service.ts:214-216`: "Self-enrollment. Free for now — CLAUDE.md §7 puts the payment gateway in a [later phase]... the enrollment write stays here, and the payment becomes a [check]." No Stripe/Paymob/payment-gateway code exists anywhere, and the comment shows this was a deliberate, documented decision rather than an oversight. Matches CLAUDE.md §11.1's "no earnings widget" framing (payments are explicitly scoped as later work). **Not a defect.**

### Token denylist / rate limiter — documented per-process limitation
`backend/src/auth/token-denylist.service.ts:15` — in-memory `Map`, comment explicitly says "alongside the other stubbed persistence — a Redis-backed [version pending]." This is CLAUDE.md §8's documented known limitation ("Per-process security state is a known limitation, not a design"), not a hidden stub. **Not a new finding** — already recorded in the durable rules.

---

## 5. Correctness issues

### API-06 — P3 — No `ParseUUIDPipe` anywhere in the codebase; malformed-UUID path params fall through to Postgres and surface as a generic 500 instead of 400/404
- **Area:** repo-wide — `grep -r "ParseUUIDPipe" backend/src` returns zero matches. Every `@Param('id') id: string` is untyped/unvalidated at the controller boundary.
- **Expected:** CLAUDE.md doesn't explicitly mandate `ParseUUIDPipe`, but §6 says "Validation at the boundary, always" and §8 lists "input validation at the boundary" as a non-negotiable checklist item.
- **Actual:** A malformed UUID in a path param (e.g. `GET /courses/not-a-uuid`) reaches the repository layer as a plain string. Against Postgres this throws `invalid input syntax for type uuid`, an unhandled driver error that bubbles to Nest's default exception filter. Nest's default filter (no custom `@Catch()` filter exists in this repo — confirmed, zero hits) returns a generic `{statusCode:500, message:"Internal server error"}` in production, so **no SQL or stack trace leaks** (CLAUDE.md §8's "errors leak nothing" holds), but the status code is wrong: a malformed id should 400, and an out-of-scope-but-well-formed id should 404 (§7's anti-enumeration rule) — a malformed one currently reads as a server fault (500) rather than a client error, which pollutes error monitoring/alerting and gives a worse client experience than a 400.
- **Confidence:** Confirmed absence of the pipe; **not independently verified against a running Postgres** that the resulting error is in fact a 500 and not caught somewhere I didn't find (e.g., a repository-level try/catch). Flag as suspected-but-plausible pending a live check.
- **Impact:** Low severity — no data exposure, just a status-code/observability correctness issue. Does not violate any §8 non-negotiable.
- **Recommended minimal fix (ponytail):** `ParseUUIDPipe` is a Nest built-in — no new dependency. Adding it to every `:id`/`:xId` param across ~20 controllers is a real but mechanical diff; given the low severity, I'd scope this as a P3 follow-up rather than a blocker, and if picked up, do it as one slice covering all path params at once (a partial pass would leave the same inconsistency half-fixed).

### Junk files — confirmed, origin traced
- Root: `0`, `1036`, `and` — all 0-byte, tracked in git.
- `backend/{const` — 0-byte, tracked in git.
- **Origin found:** these are almost certainly PowerShell/shell redirection accidents from earlier agent sessions writing multi-line code via heredoc-like constructs that don't work the same way in PowerShell — `1036` and `const` and `and` look like tokens that leaked out of a `cat <<'EOF'`-style command being misinterpreted, or a `&&`-chained command where a literal word became a filename. `git log --diff-filter=A` on these paths didn't surface the actual add commit within the range checked (may predate visible history or be part of a squash/rebase) — **could not pin an exact commit**, but their presence alongside heavy Windows/PowerShell tooling notes in this session's environment strongly suggests shell-quoting mishaps, not application code.
- **Recommended minimal fix:** `git rm 0 1036 and "backend/{const"` — one commit, no code impact (confirmed 0 bytes, not imported/required anywhere — grepped for literal filenames, no hits).

### Migrations sanity
001–026 present, sequential, no gaps. Matches CLAUDE.md's claim ("001–026 have all run from an empty schema, 2026-09-24"). Did not re-run migrations (out of scope, static only, and the lead is running tests separately).

### Repository pairing (InMemory* / Postgres*)
23 repository interfaces, 23 `Postgres*` implementations, 25 `In-memory*` files (2 extra are `.spec.ts` files, not missing implementations — `assessment.repository.spec.ts` and `google-identity.repository.spec.ts`, both test files with no interface counterpart needed). **No orphaned interface found** — every interface appears to have both an in-memory and Postgres implementation, consistent with CLAUDE.md §9's "every new table adds two repository implementations" rule apparently being honored.

### `app.module.ts` driver-conditional wiring
Not independently traced in this pass (budget) — flagged as **unverified**, recommend a follow-up specifically diffing what's registered per `PERSISTENCE_DRIVER` value if that's a release concern.

### `tsc --noEmit` / backend build gate
CLAUDE.md §4.1 already documents this precisely: "Backend `tsc --noEmit` is not a CI gate yet and specs are excluded from `nest build`; the remote line shipped a backend that did not compile because of it (`RC-F1`)." This is a known, already-recorded risk — not a new finding. Did not re-run `tsc` (lead is running builds separately).

---

## 6. Architecture / tech-debt

- **Junk files** — see §5, `git rm` recommended.
- **`api.ts` duplication** — see API-02.
- **Dead route/type pair** — see API-01 (`catalog`).
- **No custom exception filter** — Nest's default is in use everywhere; consistent with CLAUDE.md §7.1's stated preference to keep the default envelope (`API_GAP_ANALYSIS.md`'s closing note: "Error envelope stays Nest's default... Introducing a custom envelope would break that oracle for no gain"). **Not a defect**, a deliberate choice already documented.
- **No dead controllers found** — every controller file maps to a route family referenced either by `API_GAP_ANALYSIS.md` or by `lib/api.ts`.
- **`lib/api.ts` is a single 1605-line file** — large, but CLAUDE.md explicitly accepts this shape ("the frontend mirror is a liability at this scale" is about `types.ts` drift risk, covered by `OPS-1`'s CI check, not file size). Not flagging as debt given the explicit project stance against speculative abstraction for a ~300-student platform.

---

## Summary (10 lines)

1. Route inventory matches `docs/API_GAP_ANALYSIS.md` closely; no controller/route drift found in the ~40 spot-checked entries.
2. `frontend/lib/api.ts` is the sole HTTP boundary (confirmed no stray `fetch()` elsewhere) and matches backend routes/verbs for every block checked, including the sessions/attendance and work-analytics subsystems the gap analysis calls "complete."
3. **API-04 (P1):** `StorageDriver` type has no `'r2'` value — CLAUDE.md's documented production file-storage driver literally doesn't exist in code yet; production runs `STORAGE_DRIVER=none` and all uploads 503 by design. Confirm against `PRODUCT_SPEC.md` whether R2 was committed for this release.
4. **Recordings/video (§4a):** user override confirmed — recordings are plain links, Bunny Stream is out of scope. DTO validation (`@IsUrl`, http/https-only) is clean and needs no fix. Frontend player is more capable than "just links" (embeds YouTube/Vimeo/file/Bunny-shaped URLs) but the fallback link path is safe (`noopener,noreferrer`). Four P3 cleanup briefs sent for the leftover Bunny references, the most urgent being a form hint that falsely claims signed playback.
5. Payments and device/session management are correctly and explicitly absent/deferred, not bugs — both are documented in code comments or `API_GAP_ANALYSIS.md` as intentional.
6. Google Forms sync and mail sending are real implementations (OAuth, token cipher, SMTP sender), not stubs — mail even enforces transactional delivery like the audit log does.
7. API-01/API-02 (P3): one dead deprecated route (`/courses/catalog`) and one pair of byte-identical duplicate `api.ts` functions — cosmetic, zero functional impact, easy one-slice cleanups.
8. API-06 (P3, partially unverified): no `ParseUUIDPipe` anywhere — a malformed UUID path param likely surfaces as a 500 instead of 400, no data leak (no custom exception filter exists to leak anything), just a wrong status code.
9. Repository pairing (In-memory/Postgres) and migrations 001-026 both check out structurally sound; matches CLAUDE.md's own claims and found no gaps.
10. Confirmed root/backend junk files (`0`, `1036`, `and`, `backend/{const}`) are tracked, 0-byte, and unreferenced — safe one-line `git rm`; could not pin the exact originating commit.

Full report: `D:\Users\ghali\Za3blawy\tmp\audit\findings\backend-api.md`
