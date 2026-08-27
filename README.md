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

## Quick Start

### Prerequisites

- **Node.js** 20+ (LTS)
- **Docker** (for PostgreSQL and full stack)
- **npm** or **yarn**

### Development Setup

#### Option 1: Direct (without Docker)

```bash
# Install root dependencies
npm install

# Install frontend & backend dependencies
cd frontend && npm install
cd ../backend && npm install

# Set up environment
cp .env.example .env
# Edit .env with your local values

# Start PostgreSQL separately (or use Docker)
# docker run --name postgres -e POSTGRES_PASSWORD=devpassword -p 5432:5432 postgres:15-alpine

# Run in development
npm run dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

#### Option 2: Docker (full stack)

```bash
# Build and start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

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
