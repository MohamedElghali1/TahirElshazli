# Security Audit — Dr. Tahir LMS (Agent E)

Read-only review against CLAUDE.md §7/§8, docs/SECURITY.md, docs/AUTHORIZATION_MODEL.md, verified
against code (backend `main`, no uncommitted changes touched).

## CONFIRMED ISSUES

### SEC-01 — Course-grained staff routes leak cross-group data to scoped assistants (AUTH-6 remainder)
**Severity:** P1 (real for launch with 2-3 assistants; not P0 because it requires an assistant
account, which nothing in the product creates yet — `AUTHORIZATION_MODEL.md` §2)
**File:line:**
- `backend/src/manage/manage.service.ts:182-183` — `roster(courseId, actor)` calls
  `this.scope.assertAssigned(courseId, actor)` only.
- `backend/src/manage/work-analytics-gate.service.ts:68-76` (`assertMayRead`) and `:99-104`
  (`studentWork`) — same `assertAssigned(courseId, actor)` pattern, used by
  `WorkAnalyticsController`'s `/staff/assessments/:id/analytics` and
  `/staff/courses/:id/students/:studentId/work`.

**Evidence:**
```ts
// manage.service.ts:182
async roster(courseId: string, actor: StaffActor): Promise<CourseRosterResponse> {
  await this.scope.assertAssigned(courseId, actor);   // course grain, not group grain
```
`StaffScopeService.assertAssigned` (per `AUTHORIZATION_MODEL.md` §4) proves the caller holds *a*
group on the course, not the specific group(s) whose data the route returns.

**Impact:** An assistant with `scope=assigned_groups` holding one group on a multi-cohort course
reads the full course roster and every student's per-task analytics for cohorts they were never
assigned — the exact IDOR-class leak `CLAUDE.md` §7 names as "the single easiest way to leak the
whole platform." Confirmed still open in the current tree (not fixed since the doc's last update).

**Confidence:** High — read the actual service code, not just the doc's claim.

**Minimal fix:** Already scoped and tracked as `AUTH-6`/`D-23` in the project's own docs; narrow
`roster` and the analytics pair to `reachableGroupIds`, same pattern already used by
`GET /staff/tasks` and `manage.service.ts`'s group-scoped routes. Not a new discovery — flagging
because it is a real pre-launch gap given the client is bringing on 2-3 assistants, and the docs'
own severity note ("High" in `SECURITY.md` §6 gaps table) should carry into the go/no-go call.

---

### SEC-02 — Password-reset and assistant-invitation tokens stored in plaintext
**Severity:** P2
**File:line:**
- `backend/src/auth/repositories/postgres-user.repository.ts:239-256` — `createPasswordResetToken`
  inserts the raw token; `findPasswordResetToken` does `WHERE token = $1`.
- `backend/src/manage/repositories/postgres-assistant-invitation.repository.ts:26,56` — same
  pattern, `token TEXT NOT NULL UNIQUE` in `017_assistant_invitations.sql`.

**Evidence:**
```ts
const token = randomUUID();
await this.userRepo.createPasswordResetToken(user.id, token, expiresAt);
// ...
const stored = await this.userRepo.findPasswordResetToken(token);
```
No hashing before storage or lookup, unlike the JWT denylist (`jti` is the identifier, not a bearer
secret) or the Google refresh token (AES-256-GCM at rest, per `SECURITY.md` §1).

**Impact:** Both tokens are high-entropy (UUIDv4, 122 bits), single-use, short-TTL, and looked up
via parameterised SQL — there is no live exploit path through the application itself. The exposure
is narrower: anyone with **read access to the database** (an authenticated pg dump, a leaked backup,
a misconfigured read replica, a future SQLi elsewhere) gets an immediately usable account-takeover
or assistant-onboarding credential, rather than a hash that still needs cracking. This is the same
class of risk the codebase already treats seriously for the Google refresh token.

**Confidence:** High.

**Minimal fix:** Store `sha256(token)` and look up by the hash; the token that goes out in the email
link stays the only place the plaintext exists. Small, contained change — one column, two call
sites per repository. Not urgent enough to block launch (TTL + single-use + parameterised SQL are
real mitigations), but cheap to close and matches the standard the codebase already holds the
Google refresh token to.

---

### SEC-03 — No global exception filter; unexpected errors surface Nest's default 500 body
**Severity:** P2 (already recorded as a known gap in `docs/SECURITY.md` §3.2 — confirmed still true)
**File:line:** no file — absence confirmed by `find backend/src -iname "*exception*filter*"`
(no results) and no `useGlobalFilters` call in `backend/src/main.ts` or `app.module.ts`.

**Impact:** Every `HttpException` (403/404/409/etc.) is deliberately hand-shaped and tested
byte-for-byte (this is load-bearing for the 404-not-403 anti-enumeration rule — confirmed correct
and intentional). But an **unexpected** exception (a raw `pg` driver error, a null dereference, a
third-party client throwing) is not caught by anything and returns Nest's default 500 body, which
can include the raw `Error.message` — for a `pg` error that can be a fragment of the failing query
or a constraint name. Low likelihood (most paths are defensively coded) but the blast radius is
schema/query disclosure on whatever code path nobody anticipated failing.

**Confidence:** High (absence confirmed directly).

**Minimal fix:** Exactly as `SECURITY.md` §3.2 already prescribes: a global filter that logs the raw
error server-side and returns a generic `{statusCode:500,message:'Internal server error'}` body for
anything that is not already an `HttpException`, leaving every existing `HttpException` shape
untouched (so the anti-enumeration tests keep passing unmodified).

---

### SEC-04 — No CSP or other security headers on the Next.js frontend
**Severity:** P3
**File:line:** `frontend/next.config.ts` (full file read) — no `headers()` export, no CSP, no
`X-Frame-Options`, no `Referrer-Policy` configured anywhere in the frontend.

**Impact:** The backend gets `helmet()` (CSP, nosniff, etc. — confirmed in `main.ts:57`), but the
frontend, which is what actually renders in the browser and is the XSS-relevant surface (session
token lives in `sessionStorage`, read in `frontend/lib/session.tsx:69`), ships with only Next's
defaults — no CSP at all. A CSP would not close SEC-02/SEC-03 class issues but is defense-in-depth
against any XSS that does land (e.g. via `dangerouslySetInnerHTML` in `icon.tsx:58`, which renders
a fixed internal SVG glyph set — reviewed, not attacker-controlled, so not itself a finding).

**Confidence:** High.

**Minimal fix:** A `headers()` function in `next.config.ts` adding at minimum
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP once the
asset origins (Bunny Stream, R2/Cloudflare) are known. Not a blocker; genuinely low-effort hardening.

---

### SEC-05 — task `externalUrl` (link-type work) has no scheme/host validation at all
**Severity:** P2
**File:line:** `backend/src/manage/dto/assessment.dto.ts` (`externalUrl` field, ~line 155) —
`@IsOptional() @IsString() @MaxLength(2048)` only, no `@IsUrl` / `@IsPublicHttpUrl`.
`backend/src/manage/assessment-authoring.service.ts:449` — the only server-side check is
`!input.externalUrl?.trim()`, i.e. "is it non-empty," not "is it a safe URL."

**Evidence:**
```ts
// assessment.dto.ts
@IsOptional()
@IsString()
@MaxLength(2048)
externalUrl?: string;
```
```ts
// assessment-authoring.service.ts:449
if (workType === 'link' && !input.externalUrl?.trim()) {
  throw ... 'A link task needs externalUrl - the address students should open.'
```
Compare to every other staff-supplied link field in the codebase (`videoUrl`, `zoomLink`,
course URLs), which all use `@IsUrl({protocols:['http','https']})` or the stricter
`@IsPublicHttpUrl()`. `externalUrl` is the one outlier with no scheme restriction.

**Impact:** An assistant (who can author/edit tasks per the capability matrix, §5.18) can set
`workType: 'link'` with `externalUrl: 'javascript:fetch(...).then(r=>r.text()).then(t=>...)'`
(or `data:text/html,<script>...</script>`). It is stored verbatim and returned to every targeted
student as `assessment.work.url` (`assessments.service.ts:400`, `describeWork`'s `'link'` branch).
**Currently not rendered as a clickable `<a href>` anywhere in the frontend** — grepped the whole
`frontend/app` and `frontend/components` trees for a consumer of `work.kind === 'link'` /
`work.url` and found none; only `google_form` and `file_upload` branches are wired up
(`frontend/lib/types.ts:478` models the `'link'` variant but nothing renders it yet). So there is
no live click-through exploit today, but: (a) the API itself returns the unsanitized value to any
client, and (b) this is exactly the field the frontend will wire up next to make link-type tasks
actually usable — validating it now is cheaper than validating it after a rendering path ships and
someone has to remember this DTO.

**Confidence:** High (DTO and service code both read directly; frontend absence confirmed by
grep across the whole tree, not just a spot check).

**Implementable brief (for agy-delegate):** In `backend/src/manage/dto/assessment.dto.ts`, replace
`externalUrl`'s validators with `@IsPublicHttpUrl()` (reuse the existing
`backend/src/common/validators/is-public-http-url.validator.ts`, the same one `zoomLink` already
uses) in place of/alongside `@IsString() @MaxLength(2048)` — keep the `@MaxLength(2048)`, add
`@IsPublicHttpUrl()`. This is a one-decorator change in one DTO file; no service logic changes
needed since the existing non-empty check stays valid on top of it. No test currently exercises an
invalid `externalUrl`, so add one negative case (e.g. `javascript:` rejected with 400) alongside
whatever suite covers `CreateAssessmentDto`/`UpdateAssessmentDto` validation today.

---

## LINK-PATH XSS / OPEN-REDIRECT REVIEW (recordings-are-links-only scope)

**Scope note:** per explicit user override relayed by team-lead, recordings are link-only
(a stored URL) for this build — Bunny Stream signed/expiring URLs are **out of scope** and
`CLAUDE.md` §8's "media only through signed, expiring URLs" is **superseded for recordings**
specifically. Not reporting the absence of signed URLs as a finding. Reviewed instead: server-side
scheme validation and frontend `rel`/`target` handling on every staff-supplied URL a student can
click.

| Field | Validator | File:line | Verdict |
|---|---|---|---|
| Recording `videoUrl` | `@IsUrl({protocols:['http','https'], require_protocol:true})` | `backend/src/manage/dto/create-recording.dto.ts:61`, `update-recording.dto.ts:43` | Sound — rejects `javascript:`, `data:`, bare scheme-less strings |
| Live session `zoomLink` | `@IsPublicHttpUrl()` (custom, also blocks loopback/private/link-local hosts) | `backend/src/manage/dto/create-live-session.dto.ts:24-28` | Sound — the validator's own doc comment confirms it explicitly targets `javascript:` |
| Course `websiteUrl`/similar | `@IsUrl({protocols:['http','https'], require_protocol:true})` | `backend/src/courses/dto/course.dto.ts:60,112` | Sound |
| Google Form binding rendered to students (`formUrl`) | Not client input at all — `binding?.responderUri`, Google's own published URI read back from the stored sync binding | `backend/src/assessments/assessments.service.ts:411` | Sound — never derived from the teacher-pasted `googleForm` string |
| `meetingLink` render (`href`) | — | `frontend/app/(app)/dashboard/page.tsx:489-491`, `frontend/components/student/join-session.tsx:63-65` | `target="_blank" rel="noreferrer noopener"` present on every render site found |
| `videoUrl` render | — | `frontend/components/student/recording-player.tsx:141,251` | `window.open(..., '_blank', 'noopener,noreferrer')`; sound |
| Task `externalUrl` (link-type work) | none | — | **SEC-05 above** — the one outlier with no scheme validation |

**Bottom line on the link path:** every staff-supplied URL field a student can click is validated
with `@IsUrl`/`@IsPublicHttpUrl` and rendered with `noopener noreferrer`, except `externalUrl`
(SEC-05), which has no server-side validation at all and is the one to fix before its frontend
consumer ships.

---

## HARDENING RECOMMENDATIONS (no code change required to launch)

- **`npm audit`** (root, prod+dev): 3 advisories — 2 high (`multer` <2.3.0, bundled via
  `@nestjs/platform-express`; DoS via crafted multipart field names / fd leak on aborted uploads),
  1 moderate (`qs` DoS/array-limit bypass). `fixAvailable: true` for both. Multer is reachable on
  every upload route (`POST /staff/uploads`, student avatar, assessment file submission) — worth
  bumping before launch since it's a straightforward DoS vector on an internet-facing endpoint, not
  because it's currently exploited. `npm audit fix` (or manual bump) closes it; not a design issue.
  Ran as `npm audit --json` from the repo root:
  ```json
  {
    "metadata": {
      "vulnerabilities": { "info": 0, "low": 0, "moderate": 1, "high": 2, "critical": 0, "total": 3 },
      "dependencies": { "prod": 177, "dev": 594, "optional": 148, "total": 821 }
    }
  }
  ```
- **SEC-01's fix is already scoped in the project's own docs** (`AUTH-6`, `D-23`) — this audit found
  no additional course-grained routes beyond the ones `AUTHORIZATION_MODEL.md` already lists
  (roster, the analytics pair, per-course assessment list, `PATCH`/`DELETE` of a shared task).
  Confirms the doc is accurate as of this tree; does not discharge the task.

## WHAT I CHECKED AND FOUND SOUND (evidence)

- **JWT config** (`backend/src/common/config/env.ts:52-84`): production refuses unset, placeholder,
  or <32-char `JWT_SECRET`; dev gets a clearly-named fallback. `resolveJwtExpiry` validates format,
  defaults 1h (documented tradeoff against the per-process denylist). Algorithm pinning: did not
  find an explicit `algorithms: ['HS256']` allowlist in the verify call — recommend confirming
  `JwtStrategy`/`JwtModule.register` pins the algorithm explicitly (not verified this session as
  P-level finding since `@nestjs/jwt` defaults to HS256 symmetric and there's no asymmetric key
  anywhere in config, so an alg-confusion attack has no RSA public key to exploit against — low risk
  but worth a one-line explicit pin).
- **`purpose` claim refusal**: `JwtStrategy` refuses tokens carrying `purpose` (documented as F-1
  fix, unit 14) — consistent with OAuth `state` tokens being signed with the session secret.
- **Trusted proxy / X-Forwarded-For**: `resolveTrustedProxyHops` (`env.ts:120-135`) defaults to 0
  (trust nothing), documented rationale is correct — a non-zero default with no real proxy would let
  a client forge a fresh rate-limit bucket per request. Deployment must set `TRUSTED_PROXY_HOPS=2`
  for Cloudflare+VPS nginx; this is operational config, not a code defect, but **worth flagging to
  devops explicitly** since forgetting it silently disables brute-force protection rather than
  erroring.
- **CORS**: `resolveCorsOrigins` throws in production if `CORS_ORIGIN` unset rather than defaulting
  to reflect-Origin (`env.ts:309-329`) — correct, since `credentials: true` + reflected origin would
  be an open CORS hole.
- **Frontend token storage**: `sessionStorage`, not `localStorage` or a cookie
  (`frontend/lib/session.tsx:18,69,82,91`) — reduces persistence blast radius of any XSS (tab-scoped,
  cleared on close) and makes CSRF a non-issue (bearer token, not an ambient cookie, so no CSRF
  token machinery needed — correctly absent).
- **SQL injection**: grepped for template-literal SQL across `backend/src` — the only interpolated
  fragment found (`postgres-announcement.repository.ts:144,160,171`, `${this.statusCondition(...)}`)
  is built from a TypeScript union type (`'draft' | 'published' | undefined`), not user input; every
  actual value is a parameterised `$1`/`$2` placeholder. No raw string-built queries found.
- **`dangerouslySetInnerHTML`**: exactly 2 uses in the frontend, both reviewed —
  `app/layout.tsx:83` (a fixed inline theme-bootstrap script, no user data) and
  `components/ui/icon.tsx:58` (renders from the UI kit's own bundled SVG glyph set, not
  attacker-reachable). No occurrence rendering staff/user-authored text as raw HTML — the codebase's
  stated rule (blog bodies, PDF annotation text render as React text nodes) holds.
- **Git history secret scan**: `git log --all -p -S` for `BEGIN PRIVATE`, `sk_live`, `AKIA`,
  `password=` — zero hits across full history. `.env` never tracked (only `.env.example`).
  `env.ts`'s `KNOWN_PUBLIC_SECRETS` set correctly blocklists every placeholder value that does
  appear in the repo/compose files.
- **Auto-seed / driver refusal in production**: `resolveAutoSeed`, `resolvePersistenceDriver`,
  `resolveStorageDriver` all throw at boot for the unsafe production combination
  (`env.ts:176-197, 284-307, 355-378`) — verified directly, matches `SECURITY.md` §1 claims exactly.
- **Uploads**: server-minted UUID filenames confirmed (`main.ts` comment + `LocalDiskStorage`
  reference), `nosniff` via global `helmet()`, static serving has `dotfiles: 'deny'`, `index: false`.
  Did not re-verify magic-byte sniffing (docs already record this as a known gap, §3.4 — MIME is
  declared not sniffed; not re-litigated here since the doc is candid about it and it's mitigated by
  no-SVG/no-HTML in the whitelist).
- **Invitation token flow** (`auth.controller.ts:88-96`, `auth.service.ts:248-283`): `@Public()`,
  rate-limited at `AUTH_ATTEMPT_LIMIT` (same bucket as login), single-use enforced via
  `accepted_at IS NULL` check inside a transaction that also creates the account and scope rows.
  Sound apart from SEC-02's plaintext-storage note.
- **Audit trail spot check**: `WorkAnalyticsGateService.attach` (`work-analytics-gate.service.ts`)
  writes an `external_result.attached` audit entry inside the same `runInTransaction` block as the
  mutation, with `actorRoleOf(actor)` (not a hand-written ternary) — matches the documented pattern.
- **StaffScopeService coverage**: every `/staff/*` and `/manage/*` service file checked either calls
  `StaffScopeService` directly or is reached only from `/admin/*` (teacher/admin, deliberately
  unscoped by design — `directory.service.ts`, `admin-students.service.ts`,
  `registration-approval.service.ts`, all consumed solely by `admin-manage.controller.ts`). No
  orphaned staff route found reaching a repository with zero scope check.
- **Link-path XSS/open-redirect** (see dedicated section above): every staff-supplied clickable URL
  except `externalUrl` (SEC-05) is validated server-side and rendered with `noopener noreferrer`.

## Not covered this session (time-boxed)
Google id_token verifier deep-dive (aud/iss/hd/nonce checks) — took `SECURITY.md`'s detailed §2.6
account at face value after confirming the file exists at the stated path; did not line-by-line
re-derive it. Brute-force lockout beyond rate limiting (is there an account-lock after N failures,
or only throttling?) — not checked. `forbidNonWhitelisted` tradeoff — accepted docs' explanation
without re-verifying every DTO that relies on silent-drop behavior.
