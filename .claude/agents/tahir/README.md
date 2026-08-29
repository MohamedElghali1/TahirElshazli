# LMS review swarm

Project-specific agents for the Tahir Elshazli LMS. All eight are **read-only** — they produce
findings, never edits. Ruflo's generic agents (`consensus/`, `sparc/`, `swarm/`, `testing/`) sit
alongside these and know nothing about this project; these do.

| Agent | Team | Owns | Model |
|---|---|---|---|
| `lms-team-lead` | Lead | Final verdict, dedup, conflict adjudication, CLAUDE.md drift | opus |
| `lms-sec-rbac` | Security | TA scoping via `CourseStaffAssignment`, `@Roles` coverage, IDOR/BOLA, route split | opus |
| `lms-sec-appsec` | Security | Auth, JWT, rate limiting, uploads, signed URLs, injection, secrets | sonnet |
| `lms-sec-datatrail` | Security | Audit log coverage, refund trail, server-derived status, PII, storage conventions | sonnet |
| `lms-arch-scale` | System design | In-memory→Postgres path, N+1, pagination, per-process state, portability | sonnet |
| `lms-arch-maintain` | System design | Interfaces, DTO validation, strict TS, data-driven permissions, schema naming | sonnet |
| `lms-review-code` | Review | Diff correctness, tests, **and verification of every other agent's claims** | sonnet |
| `lms-review-reqs` | Review | Requirement traceability, scope creep, §11 open decisions | sonnet |

## Flow

```
   ┌─ lms-sec-rbac        ─┐
   ├─ lms-sec-appsec      ─┤
   ├─ lms-sec-datatrail   ─┤──► lms-review-code ──┐
   ├─ lms-arch-scale      ─┤    (verifies every   ├──► lms-team-lead ──► you
   └─ lms-arch-maintain   ─┘     claim)           │
                               lms-review-reqs  ──┘
```

Run it with `/swarm-review [target]`, or invoke any agent on its own for a focused pass.

## Why the verification gate

`lms-review-code` re-opens every cited `file:line` before a finding reaches the lead. Analysis agents
report bugs that do not exist — a global guard they missed, a filter one layer below the decorator
they never followed. The gate is what makes the swarm's output trustworthy rather than voluminous.

## Design notes

- **Grounded, not generic.** Each agent cites the CLAUDE.md sections it enforces, so when the spec
  shifts (§0 promises it will), you update CLAUDE.md and the agents follow. Do not restate the spec
  inside an agent file — reference the section instead.
- **Findings carry a confidence label** (`confirmed` / `plausible`) and a concrete failure scenario.
  A finding without a `file:line` and a failure scenario is an opinion; the lead cuts it.
- **`Bash` is granted for reading** — `git diff`, `npm test`, `grep`. Every agent is instructed not
  to run mutating commands. That is a prompt-level constraint, not a sandbox one; if you want it
  enforced, add a `deny` rule to `.claude/settings.json`.
- **Open decisions are surfaced, never ruled on.** CLAUDE.md §11 items get flagged as notes with the
  one question that would close each. That is a deliberate division of labor: the swarm finds the
  decision, the client makes it.
