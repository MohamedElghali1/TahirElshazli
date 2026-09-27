# DevOps / Hostinger VPS Audit — Dr. Tahir LMS
Agent F, 2026-09-27. Read-only audit, no repo edits, no test/build runs.
Revised after a user requirement update (relayed by team-lead): **recordings are links
only — Bunny Stream is out of scope for this deployment.** Findings below reflect that;
see OPS-D2b. Rewritten a second time after the session scratchpad directory was wiped;
now written to the gitignored, stable `tmp/audit/` folder per team-lead's instruction.

Note: `.env.example` could not be read via Read/Grep tools in this session (denied by a
tool-permission rule on `.env*` files). Its content was recovered read-only via
`git show HEAD:.env.example` (also read-only, no working-tree change) and is quoted below.

Each fix below is written as a standalone implementable brief — file(s) to touch, what to
change, and why — for a later `agy-delegate` implementation pass. Nothing in this report
was applied to the repo.

---

## Findings

### OPS-D1 — P0 — No way to create the first admin/teacher account in production
**Evidence.** `backend/src/auth/auth.controller.ts:37-41` — the only public
account-creation route is `POST /register`, and `backend/src/auth/auth.service.ts:124-146`
hardcodes it to `role: Role.Student`, `status: 'waiting'`. No other `@Public()` route
creates a staff account. Production refuses both would-be escape hatches:
`resolveAutoSeed` throws when `NODE_ENV=production` (`env.ts:301-309`), and
`npm run db:seed` refuses itself the same way (`backend/src/database/cli/seed.ts:18-22`)
— correctly, since the fixtures carry a published bcrypt hash.

**Impact.** On a fresh production database, nobody can sign in as teacher or admin
through the application. Today the only path is a manual `INSERT` against production
Postgres, undocumented anywhere in the repo.

**Implementable brief.** Add `backend/src/database/cli/bootstrap-admin.ts`, mirroring the
existing `migrate.ts`/`seed.ts` application-context shape (`NestFactory.createApplicationContext(DatabaseModule)`,
no HTTP server bound):
- Reads `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` from
  the environment; throws with a clear message if any is missing.
- Refuses (logs and exits 0, not an error) if a row with `role IN ('teacher','admin')`
  already exists — idempotent, safe to leave in a deploy runbook permanently.
- Hashes the password the same way `AuthService.register` does (reuse the same
  `PasswordHasher` provider/interface rather than re-implementing bcrypt calls).
- Inserts via the existing `UserRepository` (`create`), with `role: Role.Teacher` (or
  `Role.Admin` — confirm which with the user; CLAUDE.md treats `admin` as "teacher access
  under a separate identity for attribution," so `teacher` is the more likely first
  account) and `status: 'active'` (this account should not sit in the registration queue).
- Add `"bootstrap-admin": "nest build && node dist/database/cli/bootstrap-admin.js"` to
  `backend/package.json` scripts, matching `db:migrate`/`db:seed`'s pattern — but see
  OPS-D6 for why the **runbook** should invoke `node dist/database/cli/bootstrap-admin.js`
  directly against the already-built runtime image, not this npm script.
- One test: `bootstrap-admin.spec.ts` asserting (a) it refuses when a staff row exists,
  (b) it creates exactly one active teacher row otherwise.

### OPS-D2a — P1 — `.env.example` omits real vars, documents dead ones (R2/mail/payment)
**Evidence.** `.env.example` (repo root) lists `CLOUDFLARE_R2_*` (4 vars), `EMAIL_SERVICE`,
`RESEND_API_KEY`, `NEXT_PUBLIC_STORAGE_URL`, `PAYMOB_API_KEY`, `STRIPE_SECRET_KEY` — grep
across `backend/src` and `frontend/` for `R2`, `STRIPE`, `PAYMOB`, `RESEND` found no
reads of any of them (only doc-comment prose in `common/storage/file-storage.interface.ts`
mentioning "R2" as a future value). The real storage driver type is `'none' | 'local'`
(`backend/src/common/config/env.ts:353`) — **no `r2` driver is implemented**. There is
also no payment integration anywhere in the codebase. Conversely, `.env.example` never
mentions vars the code actually requires: `STORAGE_DRIVER`, `UPLOAD_DIR`, `MAIL_DRIVER`,
`MAIL_SMTP_HOST/PORT/USER/PASS/FROM`, `FRONTEND_URL`, `DATABASE_POOL_MAX`, `PGSSLMODE`.

**Impact.** A deployer following `.env.example` today configures services that don't
exist (R2, Stripe, Paymob, a generic "email service") and misses the two settings
(storage driver, mail transport) the running code actually reads.

**Implementable brief.** Rewrite `.env.example` from `backend/src/common/config/env.ts`'s
`resolve*` functions (the actual source of truth) — for each: the var name, its
comment already exists in `env.ts`, reuse it; group as DATABASE / JWT / CORS & PROXY /
STORAGE / MAIL / GOOGLE / FRONTEND. Remove `CLOUDFLARE_R2_*`, `EMAIL_SERVICE`,
`RESEND_API_KEY`, `NEXT_PUBLIC_STORAGE_URL`, `PAYMOB_API_KEY`, `STRIPE_SECRET_KEY`
outright (nothing reads them; keeping them as "future" placeholders is how OPS-D2b's
Bunny leftovers happened in the first place — don't repeat the pattern). Add the eight
missing vars listed above with the same one-line-comment style the file already uses.

### OPS-D2b — P3 — Bunny Stream / video CDN vars are stale, confirmed out of scope
**Evidence.** `.env.example` lists `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`,
and `NEXT_PUBLIC_VIDEO_CDN`. Grep confirms **no Bunny client exists anywhere** in
`backend/src` or `frontend/` — recordings are already implemented as plain URL fields
validated by `backend/src/common/validators/is-media-url.validator.ts`
(`backend/src/manage/dto/create-recording.dto.ts`,
`frontend/components/student/recording-player.tsx`). **User has confirmed this is by
design, not a gap: recordings are links-only for this deployment, and Bunny Stream is
out of scope.** This downgrades what would otherwise read as a missing integration
(matching R2) to pure documentation cleanup — no driver needs building, no fix beyond
deleting stale template lines.

**Implementable brief.** In the same `.env.example` rewrite as OPS-D2a, delete
`BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `NEXT_PUBLIC_VIDEO_CDN` and the
"Bunny Stream (Video Hosting)" section header. No code change — `is-media-url.validator.ts`
and the URL-field recording flow already are the intended implementation; don't build a
Bunny client. If `docs/PRODUCT_SPEC.md` or `CLAUDE.md`'s tech-stack table (§3, "Video:
Bunny Stream — adaptive streaming, signed URLs only") still names Bunny as the video
layer, that line is now stale too and worth flagging to whoever owns docs — out of this
audit's scope to edit, but noted so it doesn't resurface as a "missing integration" in a
future pass.

### OPS-D3 — P1 — No real mail transport is wired up; password reset/invitations degrade to 503 by default
**Evidence.** `env.ts:427-451` defines `MailDriver = 'none' | 'log' | 'smtp'`. Production
default is `none` (`MailModule` wires `MAIL_SENDER` to `null`). `smtp` exists
(`backend/src/mail/smtp-mail-sender.ts`, nodemailer, keyed on the five `MAIL_SMTP_*`
vars) but appears nowhere in `.env.example`, `docker-compose.yml`, or CI.

**Impact.** Since password reset and staff invitations depend on mail (CLAUDE.md §8:
"Email is the highest-consequence new path"), a production deploy that just follows the
existing docs ships with password reset silently unusable — the code degrades honestly
(503, not a swallowed failure), but nothing tells a deployer they need `MAIL_DRIVER=smtp`
+ 5 vars. There is no Resend/SendGrid driver in the code at all — only SMTP.

**Implementable brief.** Two independent pieces, either doable alone:
1. Docs-only: add `MAIL_DRIVER=smtp` + the five `MAIL_SMTP_*` vars to the OPS-D2a
   `.env.example` rewrite, and to the runbook below, marked "required before launch"
   even though the code itself treats it as optional.
2. If the client's mail provider turns out to not offer plain SMTP credentials (some
   transactional-email services gate SMTP behind a paid tier): that's a business/subscription
   question for the client (CLAUDE.md §3 — third-party subscriptions are the client's
   responsibility), not something to solve by adding a Resend/SendGrid HTTP-API driver
   speculatively. Confirm the provider supports SMTP before treating this as done.

### OPS-D4 — P1 — Node 20 in both Dockerfiles and CI; Node 20 is past EOL
**Evidence.** `Dockerfile.backend:9,42`, `Dockerfile.frontend:8,32`,
`.github/workflows/ci.yml:24` all pin `node:20-alpine` / `NODE_VERSION: '20.x'`. Node 20
LTS end-of-life was April 2026; today is 2026-09-27. This also disagrees with CLAUDE.md
§3 ("Node 24, v24.15.0") and `backend/package.json`'s `@types/node: ^24.0.0` (while
`frontend/package.json` pins `@types/node: ^20` — a second small drift). Checked:
`next` requires `node >=20.9.0`, `@nestjs/core` requires `node >= 20` — both satisfied by
22 or 24, nothing blocks the bump.

**Implementable brief.** In `Dockerfile.backend` (both `FROM node:20-alpine AS builder`
and `AS runtime` lines) and `Dockerfile.frontend` (same two lines): change to
`node:22-alpine`. In `.github/workflows/ci.yml`, change `NODE_VERSION: '20.x'` to
`'22.x'`. Also bump `frontend/package.json`'s `@types/node: ^20` to `^22` (or `^24` to
match backend) so the type declarations track the runtime. Rebuild both images locally
and confirm `npm run test:e2e` / `npm run test:integration` still pass under the new base
— this is a mechanical version bump but the gate is "did the suite actually run," per
CLAUDE.md §10, not "did the Dockerfile build."

### OPS-D5 — P1 — No reverse proxy / production compose file exists
**Evidence.** No `nginx*`, no `docker-compose.prod.yml`, no second Dockerfile anywhere
in the repo. `docker-compose.yml` is explicitly the **local dev** stack (its own header
comment says so) and publishes Postgres on `5432:5432` to the host.

**Implementable brief.** Add `docker-compose.prod.yml` and nginx server-block config
(sketches provided in full below, under "Draft Hostinger deployment architecture") as new
files — this is new infrastructure the repo genuinely lacks, not a case of reusing
something that already exists. Keep them minimal: Compose for the three containers +
`restart: unless-stopped` + `logging:` caps (OPS-D8), nginx for TLS termination and the
two server blocks. No load balancer, no separate reverse-proxy container image beyond
stock `nginx` — this is a one-VPS, one-replica target (CLAUDE.md §1) and stock nginx via
apt/certbot is the boring, already-available choice.

### OPS-D6 — P1 — `npm run db:migrate` does not run in the production runtime image as-written
**Evidence.** `backend/package.json`: `"db:migrate": "nest build && node dist/database/cli/migrate.js"`.
The runtime stage of `Dockerfile.backend` runs `npm ci --omit=dev`, so `@nestjs/cli` (a
devDependency backing the `nest` binary) is absent from that image — running
`npm run db:migrate` *inside the built container* would fail. Not fatal: the runtime
image already contains `dist/database/cli/migrate.js` (copied wholesale from the builder
stage), so `node dist/database/cli/migrate.js` works directly. CI's `deploy` job avoids
this entirely by running the full script on the **runner** (full `npm ci`), which is
correct as-is.

**Implementable brief.** Documentation-only fix (folded into the runbook below): wherever
a human or a deploy script runs migrations against the running production containers,
use `docker compose -f docker-compose.prod.yml run --rm backend node dist/database/cli/migrate.js`
— never `npm run db:migrate` inside that container. Same applies to the OPS-D1 bootstrap
CLI once it exists. No code change needed; this is purely "don't reach for the npm
script when working inside the runtime image."

### OPS-D7 — P2 — Dev compose publishes Postgres 5432 to the host; don't reuse it verbatim on a VPS
**Evidence.** `docker-compose.yml` `postgres.ports: ["5432:5432"]` — correct for
localhost dev, exposes Postgres to the internet on a VPS with a public IP unless a host
firewall blocks it. No `docker-compose.prod.yml` exists yet (OPS-D5).

**Implementable brief.** Covered by the OPS-D5 `docker-compose.prod.yml` sketch below —
it omits the `ports:` mapping for `postgres` entirely (reachable only on the Compose
network). Additionally, part of the VPS provisioning runbook: `ufw allow 22,80,443` and
`ufw enable`, nothing else open.

### OPS-D8 — P2 — No process manager / restart / log-rotation decision recorded
**Evidence.** Compose already sets `restart: unless-stopped` on all three services
(adequate reboot recovery for one VPS). Docker's default `json-file` log driver has no
size cap, so backend logs grow unbounded over a long-lived deployment. No PM2 usage
anywhere in the repo — correctly so; a second process supervisor duplicating what Docker
already provides would be exactly the kind of unrequested infra CLAUDE.md warns against.

**Implementable brief.** Do **not** add PM2. In the `docker-compose.prod.yml` from
OPS-D5, add to each service:
```yaml
logging:
  driver: json-file
  options: { max-size: "10m", max-file: "3" }
```
Three lines per service, no new dependency — this is the whole fix.

### OPS-D9 — P3 — CI deploy job is an inert placeholder (confirmed)
**Evidence.** `.github/workflows/ci.yml` `deploy` job runs migrations against
`secrets.DATABASE_URL` then only echoes what a real rollout would do; its own comment
says the `images` job builds with `push: false`, so nothing exists yet for a rollout to
pull. Deliberate per CLAUDE.md §3 (no VPS provisioned yet), not a defect.

**Implementable brief.** See "CI/CD — minimal real deploy flow" below for the two options
(GHCR push+pull vs. build-on-VPS) once the VPS exists and `DEPLOY_ENABLED` is meant to
flip on. Not actionable until the client provisions the host.

### OPS-D10 — P3 — Stray tracked junk at repo root; one inside `backend/`
**Evidence.** `git ls-files` shows `0`, `1036`, `and`, `2.2.5` (root) and
`backend/{const` (a literal `{const` filename, almost certainly a broken heredoc/escape
from an earlier agent session). None of the four root files are `COPY`'d into either
image. `backend/{const` is inside the tree `COPY backend/ ./backend/` picks up in the
Dockerfile.backend **builder** stage, but the runtime stage only copies `dist/` out of
the builder and `nest build` won't emit a stray non-TS file into `dist/`, so it never
reaches the final image either. Cosmetic repo litter, not a build or security issue.

**Implementable brief.** `git rm 0 1036 and 2.2.5 "backend/{const"` — a one-line cleanup
commit, safe to do any time, no review risk.

### OPS-D11 — Informational — media/upload size ceilings, for nginx sizing
`backend/src/common/storage/upload-types.ts:75`: general uploads `MAX_UPLOAD_BYTES = 64MB`.
`backend/src/manage/dto/assessment.dto.ts:33`: assessment submissions `100MB`.
`upload-types.ts:84`: avatars `5MB`. Unaffected by the recordings-are-links-only
clarification (recordings never went through the upload pipeline — they're URL fields).
A reverse proxy in front of the API must allow at least **100MB** request bodies or the
largest legitimate upload gets a proxy-level 413 before Nest/multer ever sees it. Folded
into the nginx sketch below (`client_max_body_size 110m`).

### OPS-D12 — Informational — no cookies anywhere; CSRF is out of scope by design
Grep for `cookie`/`Set-Cookie` across `backend/src` (excluding specs) returned nothing.
Auth is bearer-JWT only (frontend holds the token client-side) — no cookie-based session
for CSRF to target. Noted only so the runbook below doesn't propose CSRF-related
nginx/CORS config the app doesn't need.

---

## Environment variable inventory

All resolvers live in `backend/src/common/config/env.ts` unless noted. "Prod default"
is what happens when the var is **unset**; "—" means no default (boot fails or feature
is off).

| Var | Required in prod? | Prod default if unset | Validated at boot | Secret? | In `.env.example`? |
|---|---|---|---|---|---|
| `NODE_ENV` | yes (effectively) | `development` (unset never means prod) | yes, rejects unknown values | no | not listed, but standard |
| `JWT_SECRET` | **yes** | boot fails | yes — rejects known placeholders, <32 chars | **yes** | yes (placeholder value) |
| `JWT_EXPIRY` | no | `1h` | yes, regex on duration | no | yes |
| `TRUSTED_PROXY_HOPS` | no (but must be *correct*) | `0` (trust nothing) | yes, non-negative int | no | yes (example shows `1`, should be `2` behind Cloudflare+nginx) |
| `PORT` | no | `3001` | yes, 1–65535 | no | not listed |
| `PERSISTENCE_DRIVER` | no | `postgres` in prod (then `DATABASE_URL` required) | yes; `memory` **refused** in prod | no | yes |
| `DATABASE_URL` | **yes** (postgres driver) | boot fails | yes, must be `postgres(ql)://` | **yes** | yes (placeholder) |
| `DATABASE_POOL_MAX` | no | `10` | no (bare `Number(...)`, no bounds check) — only var in env-reading code not validated via a `resolve*` function | no | **not documented** |
| `PGSSLMODE` | no | unset = verify certs; `no-verify` disables verification | no | no | **not documented** |
| `DB_AUTO_MIGRATE` | no | `false` | yes, `0/1/true/false` | no | yes |
| `DB_AUTO_SEED` | no | `false`; **refused outright if true in prod** | yes | no | not listed (dev-only concern) |
| `CORS_ORIGIN` | **yes** | boot fails | yes | no | yes |
| `STORAGE_DRIVER` | no | `none` in prod; `local` **refused** in prod | yes | no | **not documented** (only dead `CLOUDFLARE_R2_*` is) |
| `UPLOAD_DIR` | no (only if `local`) | `var/uploads` | no | no | **not documented** |
| `FRONTEND_URL` | **yes** | boot fails | yes (trims trailing slash) | no | **not documented** |
| `MAIL_DRIVER` | no | `none` in prod (mail 503s) | yes | no | **not documented** |
| `MAIL_SMTP_HOST/PORT/USER/PASS/FROM` | only if `MAIL_DRIVER=smtp` | boot fails if `smtp` selected and any missing | yes | `PASS` is | **not documented at all** |
| `GOOGLE_DRIVER` | no | `none` (Forms integration off) | yes | no | yes |
| `GOOGLE_CLIENT_ID/SECRET` | only if `GOOGLE_DRIVER=google` | boot fails | yes | `SECRET` is | yes |
| `GOOGLE_OAUTH_REDIRECT_URI` | only if `google` | boot fails | yes, must be absolute URL | no | yes |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | only if `google` — **every env, not just prod** | boot fails | yes, 32 bytes base64 | **yes** | yes (empty placeholder) |
| `GOOGLE_SIGN_IN_REDIRECT_URI` | no (unset = sign-in off) | null → 503 | yes, https required in prod | no | yes |
| `STAFF_GOOGLE_DOMAINS` | no | empty = staff Google sign-in off | yes, domain regex | no | yes |
| `NEXT_PUBLIC_API_URL` | **yes, at build time** | `http://localhost:3001` | no (frontend, not validated) | no | yes |
| `INTERNAL_API_URL` | recommended (SSR) | falls back to `NEXT_PUBLIC_API_URL` | no | no | not listed (only in compose comments) |
| `CLOUDFLARE_R2_*` (4), `EMAIL_SERVICE`, `RESEND_API_KEY`, `NEXT_PUBLIC_STORAGE_URL`, `PAYMOB_API_KEY`, `STRIPE_SECRET_KEY` | **nothing reads these** | n/a | n/a | n/a | yes — all dead (OPS-D2a) |
| `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `NEXT_PUBLIC_VIDEO_CDN` | **nothing reads these — confirmed out of scope**, recordings are links-only | n/a | n/a | n/a | yes — stale, delete (OPS-D2b) |

**Minimum viable production env** (given the code's actual refusals): `NODE_ENV=production`,
`JWT_SECRET` (real, ≥32 chars), `DATABASE_URL`, `CORS_ORIGIN`, `FRONTEND_URL`,
`TRUSTED_PROXY_HOPS=2` (behind Cloudflare+nginx). `STORAGE_DRIVER` defaults safely to
`none` (uploads 503, blog still usable via URL field). `MAIL_DRIVER` defaults safely to
`none` too — but see OPS-D3, that silently breaks password reset, so treat `MAIL_DRIVER=smtp`
+ 5 vars as launch-blocking in practice even though the code doesn't force it.
`GOOGLE_DRIVER` stays `none` until Google Forms/sign-in is actually wanted. No storage
or video-CDN vars are needed at all for recordings, now confirmed links-only.

---

## Draft Hostinger deployment architecture

**Domains.** `tahirelshazli.com` → frontend (port 3000 upstream). Backend has **no global
`/api` prefix** (CLAUDE.md §6), so routes like `/courses`, `/staff/*`, `/admin/*` collide
with plausible frontend paths if path-mounted behind the same host. Use a **subdomain**:
`api.tahirelshazli.com` → backend (port 3001 upstream). This keeps
`NEXT_PUBLIC_API_URL=https://api.tahirelshazli.com` a clean build-time value and keeps
`GOOGLE_OAUTH_REDIRECT_URI=https://api.tahirelshazli.com/admin/integrations/google/callback`
(API-origin, per `.env.example`) and `GOOGLE_SIGN_IN_REDIRECT_URI=https://tahirelshazli.com/google/callback`
(web-origin, per `env.ts` comment) on their correct hosts without path-rewriting.

**Cloudflare.** Full (strict) SSL mode — the origin needs its own cert regardless (see
nginx sketch: self-managed via certbot). Proxy both DNS records (orange-cloud) for
CDN/WAF/DDoS. `TRUSTED_PROXY_HOPS=2` (Cloudflare hop + nginx hop) so Express reads the
real client IP for rate limiting.

### `docker-compose.prod.yml` (sketch — new file, per OPS-D5)

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tahirelshazli
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d tahirelshazli"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    # No `ports:` — reachable only on the compose network (OPS-D7).

  backend:
    build: { context: ., dockerfile: Dockerfile.backend }
    environment:
      NODE_ENV: production
      PORT: 3001
      PERSISTENCE_DRIVER: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/tahirelshazli
      DB_AUTO_MIGRATE: "0"        # migrations run as an explicit step, see runbook §8
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRY: 1h
      CORS_ORIGIN: https://tahirelshazli.com
      TRUSTED_PROXY_HOPS: 2
      STORAGE_DRIVER: none        # blog media via URL field until R2 is actually built (OPS-D2a)
      MAIL_DRIVER: smtp
      MAIL_SMTP_HOST: ${MAIL_SMTP_HOST}
      MAIL_SMTP_PORT: ${MAIL_SMTP_PORT}
      MAIL_SMTP_USER: ${MAIL_SMTP_USER}
      MAIL_SMTP_PASS: ${MAIL_SMTP_PASS}
      MAIL_SMTP_FROM: ${MAIL_SMTP_FROM}
      FRONTEND_URL: https://tahirelshazli.com
    depends_on: { postgres: { condition: service_healthy } }
    restart: unless-stopped
    # Pin the image tag deployed, never `:latest`, so a rollback names an exact
    # artifact rather than "whatever was last pushed" (see Rollback section).
    image: ghcr.io/<org>/tahirelshazli-backend:${DEPLOY_TAG}
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    # No `ports:` published to the host — nginx reaches it over the compose
    # network at backend:3001. If nginx runs OUTSIDE compose (host nginx),
    # publish 127.0.0.1:3001:3001 instead — never 0.0.0.0.

  frontend:
    image: ghcr.io/<org>/tahirelshazli-frontend:${DEPLOY_TAG}
    environment:
      INTERNAL_API_URL: http://backend:3001
    depends_on: [backend]
    restart: unless-stopped
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    # Same host/port note as backend.

volumes:
  postgres_data:
  # No upload volume: recordings are links, and STORAGE_DRIVER=none in production
  # (local disk uploads are dev-only and refused outright in prod anyway).
```

### nginx server blocks (sketch — new file, per OPS-D5)

```nginx
# tahirelshazli.com — frontend
server {
    listen 443 ssl;
    server_name tahirelshazli.com;
    ssl_certificate     /etc/letsencrypt/live/tahirelshazli.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tahirelshazli.com/privkey.pem;

    client_max_body_size 1m;   # the frontend itself never receives uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# api.tahirelshazli.com — backend
server {
    listen 443 ssl;
    server_name api.tahirelshazli.com;
    ssl_certificate     /etc/letsencrypt/live/api.tahirelshazli.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tahirelshazli.com/privkey.pem;

    # 100MB assessment submissions are the ceiling (OPS-D11) + headroom.
    client_max_body_size 110m;
    proxy_read_timeout 120s;    # uploads/large grading payloads over slow links

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name tahirelshazli.com api.tahirelshazli.com;
    return 301 https://$host$request_uri;   # Cloudflare Full-strict needs a valid origin redirect too
}
```

With Cloudflare in front (orange-cloud), `TRUSTED_PROXY_HOPS=2` matches this exact chain:
Cloudflare edge → nginx → Express. If nginx is later replaced by Cloudflare Tunnel
(`cloudflared`), that's a different hop count and the value must be re-derived, not
copied.

### Minimal runbook

1. Provision VPS (see sizing below), install Docker + Compose, `ufw allow 22,80,443`,
   `ufw enable`.
2. `certbot` (standalone or nginx plugin) for both hostnames; renew via cron/systemd timer
   (standard certbot packaging handles this — no custom code needed).
3. `git clone` the repo to the VPS (or `git pull` on redeploy — see CI/CD below).
4. `docker compose -f docker-compose.prod.yml build`
5. Start Postgres only: `docker compose -f docker-compose.prod.yml up -d postgres`
6. **Take a pre-deploy `pg_dump`** (see Backups below) — this is the actual rollback
   mechanism once a migration has run; do this every time, not only for "risky" releases.
7. Run migrations **before** the backend serves traffic (OPS-D6 — do not use the
   `npm run db:migrate` script inside the image):
   `docker compose -f docker-compose.prod.yml run --rm backend node dist/database/cli/migrate.js`
8. Bootstrap the first admin/teacher (OPS-D1 — once that CLI is implemented):
   `docker compose -f docker-compose.prod.yml run --rm backend node dist/database/cli/bootstrap-admin.js`
9. `docker compose -f docker-compose.prod.yml up -d` (backend + frontend).
10. Point nginx at both, reload.
11. Confirm `/health` returns 200 through the proxy (see health-check caveat below).

### Backups

- `pg_dump` nightly via a host cron job (`docker compose exec -T postgres pg_dump -U ... tahirelshazli | gzip > backup-$(date +%F).sql.gz`)
  — a one-line cron entry, no queue/worker needed.
- **Also `pg_dump` immediately before every deploy that runs a migration** (runbook step
  6) — this is what actually makes a bad release recoverable; see Rollback below for why
  redeploying an old image is not enough on its own.
- Copy the dump off-host (Hostinger snapshot, or `rclone`/`scp` to a second location) —
  a backup that lives only on the box it backs up is not a backup.
- **Test the restore** at least once (`gunzip | docker compose exec -T postgres psql`)
  before relying on it.
- No upload volume to back up: `STORAGE_DRIVER=none` in production, and recordings are
  links — the database dump is the entire backup surface.

### Rollback hazard — forward-only migrations vs. image rollback

**Observed during this audit cycle (team-lead):** an older API image booted against a
database that a newer migration had already run crash-loops on the first write —
`INSERT`/`SELECT` against a column the old code's queries don't expect (a column added,
renamed, or dropped by the migration the old image predates). This is the sharp edge of
CLAUDE.md §9's "migrations are forward-only": **the schema cannot roll back with the
image**, only forward, so "redeploy the previous image tag" is only safe when that tag's
queries are still compatible with the *current* schema.

**What this means for the two CI/CD options below and for any manual rollback:**
- **A tagged image rollback is safe only if no migration ran between the old tag's
  deploy and now that changed a column/table the old code's repository queries touch.**
  Check `schema_migrations` (or the migration file list) for what's landed since the tag
  being rolled back to was last live — if anything in that window is a rename, a drop, a
  `NOT NULL` add without a default, or a type change, image rollback alone will
  crash-loop exactly as observed.
- **When in doubt, don't roll back the image — restore the pre-deploy `pg_dump`
  (runbook step 6) and redeploy the tag that was live before that dump was taken.**
  Schema and code then agree again, at the cost of losing writes made between the dump
  and the incident (acceptable for a single-VPS, ~300-student platform; unacceptable data
  loss for anything transactional like payments — there are none yet per this audit).
- **The actually-safe rollback path, in order of preference:**
  1. Roll the **application code forward** with a fix (a `PATCH`, not a rollback) —
     always possible, never destructive, the default choice.
  2. Roll the **image back** only after confirming (by reading the migration files
     between the two tags) that no landed migration is a breaking schema change for the
     older code's queries.
  3. **Restore the pre-deploy dump** and roll the image back together, when (2) can't be
     confirmed safe or the migration is confirmed breaking. This is the only path that is
     unconditionally correct, which is why runbook step 6 makes the dump non-optional.
- **Longer-term, cheap mitigation** (implementable brief, no new infra): a repo
  convention of *additive-then-cleanup* migrations for anything renaming or dropping a
  column that live code still reads — land the additive half, deploy the code that
  reads/writes both, only then land a later migration that drops the old column. This is
  a authoring discipline, not a tool; it doesn't need a migration framework change, just
  a rule to write down in `docs/DATABASE_PLAN.md` (out of this audit's scope to edit, but
  worth a pointer since CLAUDE.md §9 already governs that file).

### Health checks

- Backend `/health` (`backend/src/app.controller.ts:18-22`) is a bare liveness probe —
  `{status: 'ok'}`, no DB ping, deliberately (its own comment: an authenticated dependency
  report would be reconnaissance). The Docker `HEALTHCHECK` in both Dockerfiles therefore
  only proves the process is up, **not** that it can reach Postgres — a reasonable
  tradeoff per the code's own stated reasoning, not a bug. Pair it with an external
  uptime monitor that does a real read (e.g. `GET /courses` on the public surface) if
  DB-outage detection matters. Note this also means `/health` returning 200 does **not**
  prove the rollback hazard above didn't happen — a crash-looping write path can coexist
  with a healthy liveness probe until the first request hits it.
- Frontend Docker `HEALTHCHECK` checks `/` returns `<500` — adequate.
- No external uptime monitoring is configured in-repo (expected — Cloudflare/UptimeRobot
  dashboard concern, not code).

### CI/CD — minimal real deploy flow

Current `images` job builds with `push: false` — nothing to pull anywhere (OPS-D9). Two
options, both fit a one-VPS, one-replica target:

**A — GHCR push + pull:** add registry login + `push: true` to the `images` job, tag
`ghcr.io/<org>/tahirelshazli-{backend,frontend}:${{ github.sha }}` and `:latest`. The
`deploy` job (already gated on `DEPLOY_ENABLED`, already runs migrations first) SSHes to
the VPS and runs `docker compose -f docker-compose.prod.yml pull && ... up -d`. **Never
deploy `:latest` in production compose** — pin `DEPLOY_TAG` to the SHA (see the compose
sketch above) so a rollback names an exact, known-good artifact rather than "whatever was
last pushed."

**B — Build-on-VPS:** `deploy` job SSHes in, `git pull`,
`docker compose -f docker-compose.prod.yml build && up -d`. No registry, fewer moving
parts, at the cost of building on the production box. **B is the lazier, equally correct
choice for one replica** — A only earns its keep with a second host or a want for
build/deploy separation. Rollback under B means `git checkout <previous-good-sha> &&
build && up -d` — same schema-compatibility caveat above applies just as much; the
mechanism differs, the hazard doesn't.

### Resource sizing (estimate, ~300 students / ~10 groups / 1 teacher / 2-3 assistants)

Rough, not measured — flagged as an estimate:
- Postgres: 256–512MB is generous for this data volume (a few hundred users, thousands
  of submission/attendance rows).
- Node API (NestJS): 256–512MB at this request volume (no batch jobs, no queue).
- Node frontend (Next.js standalone SSR): 256–512MB, similar reasoning.
- OS/Docker overhead + certbot + nginx: ~256MB.

**Total: ~1.5–2GB RAM is a reasonable floor.** A **Hostinger KVM 2** (2 vCPU / 8GB RAM,
per their current published tiers) gives comfortable headroom for traffic spikes (report
season, live-session days) without over-provisioning for a ~300-student single-teacher
platform. Validate against real `docker stats` numbers after a few weeks live.
