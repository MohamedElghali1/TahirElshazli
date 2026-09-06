# Tahirelshazli.com — Educational Platform

A premium Learning Management System (LMS) for Dr. Tahir Elshazli's educational brand, targeting IGCSE and IELTS students.

**Status:** Phase 1 — Core platform scaffold in progress.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | Next.js (React) + TypeScript + Tailwind CSS |
| Backend | NestJS (Node.js) + TypeScript |
| Database | PostgreSQL 15 |
| Storage | Cloudflare R2 |
| Video | Bunny Stream |
| Hosting | Hostinger VPS (Docker) |
| Security | Cloudflare (WAF, DDoS, CDN) |

## Quick start

### Prerequisites

- **Node.js** 20+ (LTS)
- **npm** 10+
- **Docker** — only for the Postgres and full-stack options below

### Option 1 — run the sample (no database, no config)

Two commands from a fresh clone. This is the fastest way to click through the
real UI.

```bash
npm install     # once, at the ROOT only - see "A note on installing" below
npm run dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001>

The API starts on the **in-memory driver** (`PERSISTENCE_DRIVER` defaults to
`memory` outside production), so there is no database to set up and no `.env` to
write. Data resets on every restart — that is the point of this mode.

Sign in with the seeded fixture account:

| Field | Value |
|---|---|
| Email | `student@example.com` |
| Password | `password123` |

That password is published in this repository and exists only in the
development fixtures. `npm run db:seed` refuses to run when `NODE_ENV=production`
for exactly this reason.

### Option 2 — run against a real PostgreSQL

```bash
docker compose up -d postgres

PERSISTENCE_DRIVER=postgres \
DATABASE_URL=postgresql://dev:devpassword@localhost:5432/tahirelshazli \
  npm run db:migrate

PERSISTENCE_DRIVER=postgres \
DATABASE_URL=postgresql://dev:devpassword@localhost:5432/tahirelshazli \
  npm run db:seed

npm run dev
```

Migrations are forward-only and recorded in `schema_migrations`, so re-running
them is a no-op. The SQL lives in `backend/src/database/migrations/`; the
`database/schema.sql` at the repo root is a design outline and is **not**
applied.

### Option 3 — full stack in containers

```bash
npm run docker:up     # builds both images and starts postgres + api + web
npm run docker:logs
npm run docker:down
```

Compose builds the same production images CI builds, from the repo root — it
does not hot-reload. For day-to-day iteration use Option 1.

### A note on installing

This is an **npm workspaces monorepo with a single lockfile at the root**. Run
`npm install` at the root and nothing else: there is no
`frontend/package-lock.json` or `backend/package-lock.json`, so `npm ci` from
inside either workspace fails outright. The same rule is why both Dockerfiles
build from the repo root rather than from their workspace directory.

### Ports

The API defaults to **3001** (`resolvePort` in
`backend/src/common/config/env.ts`) because 3000 belongs to Next.js and
`npm run dev` starts both. Override with `PORT`; if you do, set
`NEXT_PUBLIC_API_URL` to match, since the frontend inlines that value at build
time.

## Project Structure

```
TahirElshazli/
├── CLAUDE.md                    # Project guidance & requirements
├── package.json                 # Root workspace
├── docker-compose.yml           # Local development stack
├── .env.example                 # Environment template
│
├── frontend/                    # Next.js student & admin UI
│   ├── app/                     # App router (Next.js 13+)
│   ├── components/              # Reusable React components
│   ├── lib/                     # Utilities, hooks, helpers
│   ├── public/                  # Static assets
│   ├── tsconfig.json            # TypeScript config (strict)
│   ├── tailwind.config.ts       # Tailwind theming
│   └── package.json
│
├── backend/                     # NestJS API server
│   ├── src/
│   │   ├── auth/                # Authentication & JWT
│   │   ├── users/               # User management
│   │   ├── courses/             # Course CRUD & management
│   │   ├── assessments/         # Assignments/quizzes
│   │   ├── storage/             # File uploads (R2)
│   │   ├── video/               # Video streaming (Bunny)
│   │   ├── payments/            # Payment processing
│   │   ├── audit/               # Audit logging
│   │   └── main.ts
│   ├── tsconfig.json            # TypeScript config (strict)
│   └── package.json
│
└── database/
    ├── schema.sql               # Full database schema outline
    └── seed.sql                 # Sample seed data
```

## Key Features (Phase 1)

- ✅ Git repository initialized
- ✅ Next.js frontend scaffolded (TypeScript + Tailwind)
- 🔄 NestJS backend setup
- 🔄 PostgreSQL schema designed
- 🔄 Docker Compose configuration
- 📋 Module structure for all major features

## Build & Test

```bash
# Build all packages
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Type check
npm run type-check
```

## Security & Compliance

See [CLAUDE.md](CLAUDE.md) § 8 for security requirements:
- RBAC (role-based access control)
- 2FA for teacher/admin
- Secure file uploads with R2
- Audit logs for all TA/admin actions
- Password hashing (argon2/bcrypt)
- Rate limiting & brute-force protection

## Project Phases

### Phase 1 (Current)
Core UI/UX and platform setup.

### Phase 2
Assignment system, quiz engine, reports, CMS, notifications.

### Phase 3+
Payments (Paymob/Fawry/Stripe), Zoom API, WhatsApp, SMS, multi-tutor marketplace.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — Complete project requirements, architecture, data model, and working conventions.
- `context/download.pdf` — Signed development agreement (stack, timeline, scope).
- `context/Report 2 - Mr Tahir Elshazli LMS.pdf` — Latest client meeting notes & feature requests.

## Contributing

All code must:
- Follow TypeScript strict mode
- Match surrounding style and conventions
- Be validated at the API boundary (DTOs, schema validators)
- Include server-side enforcement of business logic
- Never trust client-supplied data

## Contact

**Dr. Tahir Elshazli** — tahirelshazli.com
**Project Lead** — Ali Esam

---

*Last updated: 2026-08-27*
