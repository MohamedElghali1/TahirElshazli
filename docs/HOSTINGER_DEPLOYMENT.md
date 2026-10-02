# Hostinger VPS deployment — Dr. Tahir LMS

**Status: NOT DEPLOYABLE YET.** This document is the target architecture and the runbook. It is
blocked by the P0 items in `docs/REMEDIATION_PLAN.md` (Phase 1), chiefly: no way to create the first
staff account in production (`REM-001`), and the production files below do not exist in the repo yet
(`REM-020`, `REM-021`). Everything here was derived from the repository as of commit `4687787`
(2026-09-27) and, where marked **verified**, by actually running the production artifacts during the
audit (`docs/PROJECT_AUDIT.md` §5).

---

## 1. What this project actually needs

| Component | What | Evidence |
|---|---|---|
| Web | Next.js 16.3.3 standalone server, `node frontend/server.js`, port 3000 | `Dockerfile.frontend`, `next.config.ts` `output: 'standalone'` — **verified**: image builds and serves |
| API | NestJS 12, `node dist/main.js`, port 3001 (`PORT`) | `Dockerfile.backend` — **verified**: production boot on empty schema |
| Database | PostgreSQL 15 (`postgres:15-alpine`), one database | migrations 001–026 — **verified** from empty schema |
| Reverse proxy | nginx on the host: TLS, two server blocks, body-size limit | not in repo — `REM-021` |
| Edge | Cloudflare (DNS, proxy, WAF, CDN), SSL mode **Full (strict)** | `CLAUDE.md` §3 |
| Mail | Any SMTP provider (`MAIL_DRIVER=smtp` + 5 vars). **Required in practice** | `backend/src/common/config/env.ts` `resolveSmtpConfig` — **verified**: with the default `none`, publishing an announcement, creating a student and password reset all return 503 |
| File storage | **Cloudflare R2** (private bucket, presigned short-lived reads) for student PDF/DOCX submissions (`D-59`). **The `r2` driver is not built yet** (`REM-030`); until it is, the only production-legal value is `none` | `env.ts` `resolveStorageDriver` — **verified**: `local` refused in production |
| Video | **None.** Recordings are plain links (user decision 2026-09-27) | `create-recording.dto.ts` `@IsUrl({protocols:['http','https']})` |
| Process manager | **Docker Compose** (`restart: unless-stopped`) + the Docker systemd unit. **Not PM2** — it would duplicate what Docker already does | |
| Background jobs / queue / Redis | **None.** One replica; rate limiter and token denylist are in-process by design | `CLAUDE.md` §5, §8 |

No WebSockets, no cookies (bearer JWT in `sessionStorage`, so no CSRF surface), no cron inside the app.

## 2. Topology

```
Browser ──HTTPS──► Cloudflare (proxied, Full strict)
                     │
                     ▼  :443 (only Cloudflare IP ranges allowed — §6)
                   nginx on the VPS host (Let's Encrypt or Cloudflare Origin cert)
                     ├─ tahirelshazli.com      → 127.0.0.1:3000  (web container)
                     └─ api.tahirelshazli.com  → 127.0.0.1:3001  (api container)
                                                   │ compose network
                                                   ▼
                                               postgres:5432 (not published to the host)
```

**Why a subdomain for the API:** the backend has no global `/api` prefix (`CLAUDE.md` §6). Its
routes (`/courses`, `/dashboard`, `/notifications`…) collide with frontend page paths, so it cannot
share the web hostname without a path rewrite. `api.` keeps every path unmodified.

## 3. Server

- **Plan (estimate):** Hostinger **KVM 2** (2 vCPU / 8 GB RAM) is comfortable; KVM 1 (1 vCPU / 4 GB)
  is the floor. Measured during the audit: web container **55 MB** RSS, Postgres **62 MB** idle.
  Building the images *on* the VPS (option B, §8) needs ~2 GB free RAM for `next build` — the main
  reason to prefer KVM 2.
- **OS:** Ubuntu 24.04 LTS (Hostinger template). Install Docker Engine + the Compose plugin, nginx,
  certbot (or use a Cloudflare Origin Certificate — 15-year, no renewal job).
- **Runtime version:** the images pin `node:24-alpine`, matching development (`REM-011`, done). Node
  20 reached end-of-life in April 2026, which is why the bump happened before launch. Nothing on the
  host needs Node; it runs only inside the images.
- **Ports:** 22 (SSH, key-only), 80 and 443 (Cloudflare ranges only). Nothing else. 3000/3001 bind
  to `127.0.0.1` only; 5432 is not published at all.

## 4. Environment — production values

Put these in `/opt/tahirelshazli/.env` (mode `600`, owned by the deploy user, never committed).
The full inventory with defaults and validation is in `docs/PROJECT_AUDIT.md` §7.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | turns on every refusal below |
| `JWT_SECRET` | `openssl rand -base64 48` | boot refuses unset / placeholder / short |
| `JWT_EXPIRY` | `1h` (default) | also the logout-propagation window |
| `PERSISTENCE_DRIVER` | `postgres` (default in prod) | `memory` refused |
| `DATABASE_URL` | `postgresql://lms:<pw>@postgres:5432/tahirelshazli` | |
| `DB_AUTO_MIGRATE` | `0` | migrations are an explicit runbook step |
| `CORS_ORIGIN` | `https://tahirelshazli.com` | boot refuses unset |
| `FRONTEND_URL` | `https://tahirelshazli.com` | mail links; boot refuses unset |
| `TRUSTED_PROXY_HOPS` | `2` | Cloudflare → nginx → app. **Only correct if §6's Cloudflare-only firewall is in place** |
| `STORAGE_DRIVER` | `r2` once `REM-030` lands (`none` until then) | plus the R2 account, bucket and key variables `REM-030` defines |
| `MAIL_DRIVER` | `smtp` | `none` (the default) breaks announcements, student creation, invitations, password reset |
| `MAIL_SMTP_HOST` `…_PORT` `…_USER` `…_PASS` `…_FROM` | from the mail provider | all five required when `smtp` |
| `GOOGLE_DRIVER` | `none` until the client provides a Google Cloud OAuth client | then the four `GOOGLE_*` vars + `GOOGLE_TOKEN_ENCRYPTION_KEY` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.tahirelshazli.com/admin/integrations/google/callback` | only with `google` |
| `GOOGLE_SIGN_IN_REDIRECT_URI` | `https://tahirelshazli.com/google/callback` | optional; https required |
| `STAFF_GOOGLE_DOMAINS` | empty unless staff use a Workspace domain | |
| `DATABASE_POOL_MAX` | `10` (default) | fine for one replica |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | for the postgres container | |
| **Build-time (web image):** `NEXT_PUBLIC_API_URL` | `https://api.tahirelshazli.com` | inlined into the JS bundle at `docker build`; a wrong value needs a rebuild |
| **Runtime (web container):** `INTERNAL_API_URL` | `http://api:3001` | server-side rendering calls the API over the compose network |

Never set: `DB_AUTO_SEED`, `LOG_RESET_TOKENS`, `STORAGE_DRIVER=local`, `PERSISTENCE_DRIVER=memory`.
Ignore the `.env.example` entries for R2, Bunny, Resend, Paymob and Stripe — nothing reads them
(`REM-012`).

## 5. Files to add to the repo (`REM-020`, `REM-021`)

### 5.1 `docker-compose.prod.yml`

Build-on-VPS variant (§8 option B). The images are built from the checked-out commit.

```yaml
name: tahirelshazli
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tahirelshazli
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d tahirelshazli"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

  api:
    build: { context: ., dockerfile: Dockerfile.backend }
    image: tahirelshazli-api:${DEPLOY_TAG:?set DEPLOY_TAG to the git sha}
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: 3001
      DB_AUTO_MIGRATE: "0"
    ports: ["127.0.0.1:3001:3001"]
    depends_on: { postgres: { condition: service_healthy } }
    restart: unless-stopped
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

  web:
    build:
      context: .
      dockerfile: Dockerfile.frontend
      args: { NEXT_PUBLIC_API_URL: "https://api.tahirelshazli.com" }
    image: tahirelshazli-web:${DEPLOY_TAG:?set DEPLOY_TAG to the git sha}
    environment:
      INTERNAL_API_URL: http://api:3001
    ports: ["127.0.0.1:3000:3000"]
    depends_on: [api]
    restart: unless-stopped
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

volumes:
  postgres_data:
```

### 5.2 nginx — `/etc/nginx/sites-available/tahirelshazli`

```nginx
server {
    listen 80;
    server_name tahirelshazli.com www.tahirelshazli.com api.tahirelshazli.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tahirelshazli.com www.tahirelshazli.com;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 443 ssl http2;
    server_name api.tahirelshazli.com;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    # Student PDF/DOCX uploads (D-59) pass through the API, which caps a submission at 100 MB.
    # Cloudflare Free/Pro caps a request body at 100 MB regardless; ~25 MB is ample for homework.
    client_max_body_size 110m;
    proxy_read_timeout 60s;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

`TRUSTED_PROXY_HOPS=2` reads the client IP as the second-from-right `X-Forwarded-For` entry, which
Cloudflare writes. It is correct **only** while §6 blocks direct-to-origin traffic; otherwise any
client can forge `X-Forwarded-For` and get a fresh rate-limit bucket per request.

## 6. Firewall

```
ufw default deny incoming
ufw allow 22/tcp                         # SSH, keys only (PasswordAuthentication no)
for r in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  ufw allow from $r to any port 80,443 proto tcp
done
ufw enable
```
Also enable Hostinger's hPanel firewall with the same rules if the plan offers it. Docker publishes
ports by writing iptables rules that bypass ufw — that is why §5.1 binds 3000/3001 to `127.0.0.1`
and does not publish 5432 at all.

## 7. First deployment — runbook

Prerequisites: Phase 1 of `docs/REMEDIATION_PLAN.md` done; DNS for `tahirelshazli.com`, `www` and
`api` in Cloudflare (proxied); SMTP credentials in hand.

1. Create the VPS (Ubuntu 24.04). Create a non-root deploy user with sudo and an SSH key; disable
   password SSH login.
2. Install Docker Engine + Compose plugin, nginx. Apply §6.
3. `git clone <repo> /opt/tahirelshazli && cd /opt/tahirelshazli && git checkout <release-sha>`
4. Write `.env` (§4), `chmod 600 .env`.
5. `export DEPLOY_TAG=$(git rev-parse --short HEAD)`
6. `docker compose -f docker-compose.prod.yml build`
7. `docker compose -f docker-compose.prod.yml up -d postgres`
8. Migrate: `docker compose -f docker-compose.prod.yml run --rm api node dist/database/cli/migrate.js`
   (**not** `npm run db:migrate` — that script runs `nest build`, which the runtime image cannot).
   **Verified** during the audit: prints `Nothing to apply` on an up-to-date schema.
9. Create the first teacher account — `REM-001` must exist first:
   `docker compose -f docker-compose.prod.yml run --rm -e BOOTSTRAP_EMAIL=… -e BOOTSTRAP_NAME=… -e BOOTSTRAP_PASSWORD=… api node dist/database/cli/bootstrap-staff.js`
   (see `REM-001`; clear the shell history afterwards). Until it exists the only option is a
   hand-written `INSERT` with a bcrypt hash — do not use the seed files, they carry a published password.
10. `docker compose -f docker-compose.prod.yml up -d`
11. Install certificates (Cloudflare Origin cert, or certbot with DNS challenge), enable the nginx
    site, `nginx -t && systemctl reload nginx`. Cloudflare SSL mode → Full (strict).
12. Smoke test (§10). Sign in as the teacher, create a group, invite assistants.

## 8. Updates and rollback

**Option B — build on the VPS (recommended for one replica):**
```
cd /opt/tahirelshazli
./backup.sh pre-deploy                  # §9 — MANDATORY before any migration
git fetch && git checkout <new-sha>
export DEPLOY_TAG=$(git rev-parse --short HEAD)
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm api node dist/database/cli/migrate.js
docker compose -f docker-compose.prod.yml up -d
```
Downtime is the few seconds of container restart. Option A (push to GHCR from CI, pull on the VPS)
only earns its keep with a second host; the CI `deploy` job is currently an inert placeholder
(`push: false`, echo-only release step — `REM-022`).

**Rollback — migrations are forward-only.** An older image started against a newer schema can
crash-loop: **observed during this audit** (a two-week-old API image seeding into a newer schema).
In order of preference:
1. Roll forward with a fix.
2. Re-tag the previous image (`DEPLOY_TAG=<old-sha> docker compose … up -d`) **only** after reading
   the migrations landed since that sha and confirming none renames/drops/retypes a column the old
   code reads.
3. Otherwise restore the pre-deploy dump (§9) **and** start the old image together.

## 9. Backups

State lives in two places: the database, and the R2 bucket holding submitted files (recordings are
links). Turn on object versioning for the R2 bucket, or copy it to a second bucket on a schedule: the
nightly database dump does not cover files.

- `deploy/backup.sh nightly|pre-deploy` runs `pg_dump -Fc` into
  `/var/backups/lms/<kind>-<UTC timestamp>.dump` (mode 600, overridable via `BACKUP_DIR`), fails
  non-zero on an empty dump, and deletes dumps older than `BACKUP_RETENTION_DAYS` (default 30) while
  never deleting the newest one. **30 days, not "14 daily + 8 weekly"** — `docs/legal/privacy-policy.md`
  §7 promises backups are overwritten on a rolling 30-day cycle, and the retention window is what makes
  that true. An optional `BACKUP_OFFSITE_CMD` hook runs with the dump path as its argument (`REM-023`).
- Nightly, host cron (the script's own header comment repeats this):
  `0 3 * * * /opt/tahirelshazli/deploy/backup.sh nightly >> /var/log/tahirelshazli-backup.log 2>&1`
- Before every deploy: `./deploy/backup.sh pre-deploy` (the rollback mechanism, §8).
- Copy off the VPS (a second provider / object storage / the client's machine) — a backup on the box
  it protects is not a backup. `BACKUP_OFFSITE_CMD` is where that copy step goes.
- Hostinger VPS snapshots are a useful extra, not a substitute (whole-disk, coarse, on the same provider).
- **Test a restore before launch** into a scratch database:
  `pg_restore -d <scratch> --clean --if-exists <dump>` then start an API against it. Untested backups
  are an assumption (`REM-024`; the script and cron are `REM-023`, done).

## 10. Health and monitoring

- `GET https://api.tahirelshazli.com/health` → `200 {"status":"ok"}`. Liveness only — it does not
  touch the database (deliberate, `app.controller.ts`). Docker `HEALTHCHECK` uses it.
- Readiness proxy for an external monitor (UptimeRobot / Cloudflare health check): `GET
  https://api.tahirelshazli.com/public/courses` — anonymous, reads the database.
- Web: `GET https://tahirelshazli.com/` → 200.
- Logs: `docker compose -f docker-compose.prod.yml logs --since 1h api`; capped by the `logging:`
  blocks (10 MB × 3 per container). nginx logs in `/var/log/nginx/` (logrotate default).
- Reboot recovery: the Docker service starts at boot and `restart: unless-stopped` brings the three
  containers back. **Test it once** (`sudo reboot`, then §10 checks).
- No error tracker is wired in; the API logs unhandled errors to stdout. An external error tracker
  is optional and not planned — add one only if the logs prove insufficient.

## 11. Smoke test after every deploy

```
curl -fsS https://api.tahirelshazli.com/health
curl -fsS https://api.tahirelshazli.com/public/courses | head -c 200
curl -fsSI https://tahirelshazli.com/ | head -1
curl -s -o /dev/null -w '%{http_code}\n' https://api.tahirelshazli.com/dashboard      # expect 401
```
Then in a browser: sign in as the teacher, open `/manage`, open a group's mark book, sign out.

## 12. Unresolved — needs the client

- SMTP provider and credentials (blocking).
- The Cloudflare R2 account and bucket for student uploads (`D-59`, `REM-030`) — a client subscription.
- Weekly reports ship after launch (`D-58`); nothing extra to provision for them at go-live.
- Google Cloud OAuth client (only if Google Forms sync or Google sign-in is wanted).
- Who holds the Cloudflare, Hostinger, mail and domain accounts (`CLAUDE.md` §1: the client's responsibility).
