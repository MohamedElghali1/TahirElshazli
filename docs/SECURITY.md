# Security

A practical review of what the backend does today and what the redesign must add. Written to be
acted on, not filed: every requirement below has an owning task in `IMPLEMENTATION_PLAN.md`.

**The existing backend is in good shape.** The controls in §1 are real, tested, and several of them
are better than typical. This document spends most of its length on §2 and §3 — what the redesign
changes and what is genuinely weak — because that is where the risk is.

---

## 1. Controls already in place (preserve, do not regress)

| Area | Implementation |
|---|---|
| **Password hashing** | bcrypt via `bcryptjs`, **12 rounds** (OWASP floor is 10) |
| **Login timing** | Always runs one bcrypt comparison — against a hardcoded dummy hash when the email is unknown — so response time cannot enumerate accounts |
| **Reset enumeration** | `POST /auth/password-reset/request` returns an identical body for known and unknown emails; asserted byte-for-byte in a spec |
| **Reset token** | UUID, 1-hour TTL, single-use enforced in SQL (`WHERE token = $1 AND used_at IS NULL`), and redemption revokes every existing session |
| **Token handling** | JWT with `jti` and a millisecond `iatMs`; `JwtStrategy` checks the denylist, a per-user password-change cutoff, and that the account still exists — then **re-reads `role` from the database**, so a tampered claim dies at signature verification and a demoted account loses access immediately |
| **Guards** | Three global, in order: rate limit → authenticate → authorize. `RolesGuard` is **fail-closed**: a route with no `@Roles`/`@Public`/`@AnyRole` throws 403 with an explanatory message rather than admitting any signed-in account |
| **Scope leaks** | Out-of-scope resources answer **404 with a message byte-identical to a genuine miss**, so an assistant cannot enumerate courses one id at a time. Tested at unit and e2e level |
| **Injection** | Parameterised queries throughout; `DatabaseService` is the only thing that talks to Postgres |
| **SSRF** | `IsPublicHttpUrl` rejects non-http(s) schemes, loopback, RFC1918, CGNAT, link-local and cloud metadata (`169.254.169.254`), IPv6 equivalents, and bare internal hostnames |
| **Uploads** | MIME whitelist, **server-minted UUID filenames** (the client's filename is never read, so traversal is structurally impossible), 64 MB cap enforced twice, `wx` write flag, no SVG/HTML/zip |
| **Rate limiting** | Global 120/min default; 5/min on login and password change; 3/5min on register and reset-request; 30/min on upload; 10/min on the OAuth callback |
| **Secrets** | `JWT_SECRET` refused in production if unset, < 32 chars, or matching a known placeholder; Google refresh tokens AES-256-GCM encrypted; connection-string passwords redacted before reaching a log |
| **Fail-fast config** | `PERSISTENCE_DRIVER=memory`, `STORAGE_DRIVER=local` and `DB_AUTO_SEED=1` all **throw at boot** in production |
| **Audit** | Append-only by interface (no update, no delete method exists to call), no foreign keys so it outlives what it describes, and `AuditService.record` **throws outside a transaction** so an action and its log entry commit together |
| **Transport** | `helmet()` globally; CORS origins required in production |

---

## 2. What the redesign adds, and the risk each carries

### 2.1 Emailing a child's marks to a parent — the highest-consequence new path
The weekly report sends a PDF containing a named minor's attendance, marks and a written assessment
of their progress to an address typed into a form by staff.

**Requirements:**
- `parent_email` is validated on write and **shown back in the send confirmation** — the design
  already does this ("It goes to parent.family@gmail.com… You cannot unsend it").
- Every send writes a `mail_deliveries` row **and** an audit entry inside the same transaction.
- Sending requires status `reviewed` and a non-empty parent email; both are 409s, not silent no-ops.
- **No send-to-all action exists at the API level**, not merely in the UI. The design's reasoning is
  the security argument: *"a single button that emails 300 parents is how the wrong report reaches
  the wrong family."*
- The PDF must be fetched through an authorized route, never a guessable public URL. If report PDFs
  land in object storage, they need signed, expiring URLs — `CLAUDE.md` §8 already requires this for
  all media and the current local driver does not provide it.

### 2.2 Announcements now send email
Publishing fans out to every recipient once. Risks: a double-publish sending twice (make publish
idempotent on `published_at`), and the audience being resolved from a stored list rather than live
(forbidden — it would silently miss anyone who joined after drafting).

### 2.3 Invitation tokens
A new credential class. Must be: single-use, expiring, high-entropy, invalidated on role change, and
rate-limited on redemption. Redemption failures must be **indistinguishable** for unknown / used /
expired, exactly as the password-reset flow already is.

### 2.4 Student-reachable uploads
The profile photo is the first upload a student can perform. It needs its own tighter contract —
images only, smaller cap, its own rate limit — rather than widening `@Roles` on the staff endpoint.
Widening the existing route would also give students PDF and video upload.

### 2.5 PDF annotations
Stored as coordinates and text, not as a rewritten file, which removes a whole class of file-parsing
risk. The text is staff-authored and rendered to students: **escape it; never
`dangerouslySetInnerHTML`.** Same rule `CLAUDE.md` §5.19 applies to blog bodies.

### 2.6 Google OAuth sign-in (decision 9)
The largest auth change, sequenced last. Non-negotiables when it lands: validate `state` (the
existing signed, expiring, purpose-claimed JWT pattern is correct — reuse it), verify `id_token`
signature and `aud`, pin `hd`/allowed domains for staff, and **never auto-link a Google account to
an existing password account by email alone** — that is an account-takeover primitive if an attacker
can register the same address at Google first.

### 2.7 Role widening
`AUTH-1` touches **63 routes across 14 `@Roles` decorator sites** (corrected 2026-09-19 from "~30
routes"; `@Roles` is class-level throughout, so sites and routes differ by more than a factor of
four). The risk is a missed `@Roles` widening (a broken feature — loud) or an **over-widening** (a
silent hole).

**The compiler helps with neither.** There is no `Record<Role, …>` and no `switch` on a role value
anywhere in `backend/src` or `frontend/`, so adding a `Role` member produces **zero** compile errors
and every site must be found by enumeration.

Mitigation, as built: the teacher/admin pair is defined once as `STAFF_ADMIN` and the three staff
roles once as `STAFF_ALL`; the existing `it.each` refusal tables asserting a TA gets 403 on `/admin/*`
were kept **unedited** and still pass; a 24-route parity table asserts the admin and the teacher
receive identical status codes on every `/admin/*` route; and
`backend/src/auth/role-guards.spec.ts` discovers every controller with `import.meta.glob` and asserts
`STAFF_ADMIN` excludes `Role.Assistant`, that no `admin/`-mounted controller admits an assistant, a
student, a parent or a visitor, that the `@Public()` surface is exactly the ten intended handlers, and
that no route handler relies on `RolesGuard`'s fail-closed 403 to hide it. That test was verified to
**fail** on both an over-widening and a missed widening before being relied on.

---

## 3. Known weaknesses

### 3.1 Per-process security state — the main one
The **token denylist** and the **rate limiter** both live in in-process `Map`s.

- Logout and password-change revocation are invisible to other replicas until natural expiry (why
  `JWT_EXPIRY` defaults to 1h).
- The effective rate limit multiplies by the replica count.
- A process restart wipes both.

On **one replica this is correct and not debt** — `CLAUDE.md` §7.3 names the trigger precisely: a
second replica being configured, not a student count. But the design's **device/session management**
screen cannot be built on it at all: listing and revoking sessions requires shared, enumerable
state. That feature is the forcing function, and it is why decision #1 in the open list is "Redis or
drop the Security tab".

### 3.2 No global exception filter
Nest's default handler is used throughout. This is *deliberate and currently load-bearing* — tests
compare `body.message` byte-for-byte to prove an out-of-scope 404 is indistinguishable from a
missing one. The gap is that an **unexpected** exception (a `pg` error, a null dereference) surfaces
Nest's 500 with whatever message the error carried. Add a filter that logs the detail server-side and
returns a generic 500 body, while leaving every `HttpException` shape exactly as it is.

### 3.3 `forbidNonWhitelisted` is off
Unknown body properties are stripped silently rather than rejected. This is relied on — the TA
announcement DTO has no `audience` field precisely so a smuggled one is dropped. Turning it on would
be stricter but would change that from "silently ignored" to "400", which is arguably better
feedback. Low priority; decide deliberately rather than by default.

### 3.4 Upload MIME is declared, not sniffed
The whitelist checks the client-declared `Content-Type`. A file with a lying header passes. Mitigated
by: no SVG/HTML/executable types, `nosniff` via helmet, server-minted filenames, and `none` being the
production default. Proper fix is magic-byte sniffing, which belongs with the R2 driver.

### 3.5 SSRF validator cannot resolve DNS
A hostname that *resolves* to a private address (`127.0.0.1.nip.io`) passes. The validator documents
this and has a passing test asserting the gap. The real fix is the one the code already names:
clients should stop supplying URLs at all and upload through our own storage.

### 3.6 No 2FA for teacher/admin
`CLAUDE.md` §8 lists 2FA for teacher/admin accounts as a requirement. It does not exist. Google
sign-in (decision 9) partly discharges it by delegating to Google's own 2FA — worth stating as the
intended answer rather than leaving the requirement silently unmet.

---

## 4. File upload contract

| | Staff (`POST /staff/uploads`) | Student avatar (`POST /students/me/avatar`) |
|---|---|---|
| Types | jpeg, png, webp, gif, avif, mp4, webm, mov, pdf, txt | jpeg, png, webp only |
| Max size | 64 MB | 5 MB |
| Rate limit | 30/min | 10/min |
| Filename | Server-minted UUID + extension from the **observed** MIME | Same |
| Storage | `STORAGE_DRIVER` — `none` in production until R2 | Same |
| Access | `/uploads/*` static, dev only; R2 must use signed expiring URLs | Same |
| Refused always | SVG, HTML, zip, `application/octet-stream`, anything executable | Also: all video, all documents |

Never trust the client filename, extension, or `Content-Type` for anything but the whitelist lookup.
Never serve user content from the API's own origin once R2 lands.

---

## 5. Logging and PII

Never log credentials, tokens, full payment details, or student PII in plaintext (`CLAUDE.md` §8).
Current behaviour is good: reset tokens are logged only behind `LOG_RESET_TOKENS=1` (fails closed —
deliberately not keyed on `NODE_ENV`, which is unset in the project's own Dockerfile), and connection
strings are redacted.

New constraint: **`mail_deliveries` stores the recipient address and a template name — never the
rendered body.** A table containing the text of 300 children's progress reports is a breach waiting
for a backup to leak.

---

## 6. Testing requirement

From the brief, and non-negotiable: **every permission rule has two tests — authorized access works,
unauthorized access is rejected.** Security rules are never verified by clicking the UI.

The existing suites are the template and are unusually good at this:
`test/staff.e2e-spec.ts` distinguishes 403 (wrong role) from 404 (out of scope) in separate `it.each`
tables; `test/app.e2e-spec.ts` proves cross-course and cross-role isolation and that a tampered role
claim is rejected at 401. Every capability this redesign adds extends those tables.

Specifically required new coverage: assistant scope in both directions · the four withheld verbs ·
report send refused for an assistant · report send refused when not reviewed · invitation token
reuse · student avatar upload rejecting a PDF · announcement audience resolution at send time · and
one test proving the `admin` role reaches everything `teacher` does.

---

## 7. Not claimed

This document does not assert the system is secure. It records which controls exist, which are
tested, and which are known-weak. A control listed in §1 is only real while its test is green; a
requirement in §2 is only met once its task in `IMPLEMENTATION_PLAN.md` is `[x]` under the definition
of done, which includes its refusal test.
