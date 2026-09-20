# The redesign pipeline

Three agents, strictly sequential, one per phase. Run with `/redesign-phase [unit id]`.

```
redesign-planner  ──►  redesign-executor  ──►  redesign-reviewer  ──►  you
   read-only            the only writer          read-only
       │                      │                      │
  PHASE_PLAN.md       EXECUTION_NOTES.md         REVIEW.md
       └──────────────────────┴──────────────────────┘
          docs/phases/<unit-id>/ — state passes through files
```

| Agent | Role | Model | Writes |
|---|---|---|---|
| `redesign-planner` | Architect, requirements analyst, phase planner | opus | `PHASE_PLAN.md` only |
| `redesign-executor` | Production engineer | opus | Production code + `EXECUTION_NOTES.md` |
| `redesign-reviewer` | Principal engineer, security and QA gate | opus | `REVIEW.md` only |

## Why sequential

The planner's whole value is reconciling the old implementation with the new requirements *before*
anything is built. An executor that starts early builds against its own reading of the spec, which is
the failure this pipeline exists to prevent. The reviewer's value is independence: it cannot verify a
diff that is still moving.

**One writer at a time.** Two agents editing one worktree is the other failure mode
(`.claude/ruflo-guidance.md`).

## Why the reviewer is the gate

`docs/PHASE_ROADMAP.md` §2 makes a reviewer verdict of `APPROVED` one of nine conditions for a phase
to be complete. `APPROVED WITH FOLLOW-UP` and `REJECTED` both leave it incomplete. The coordinator
cannot override this on its own judgement.

The reviewer's question is deliberately **"did we move toward the NEW product?"** — not "does the old
application still work?" A change that is clean, tested and implements the *previous* product is a
rejection.

## Naming

These are `redesign-*` rather than the bare `planner` / `executor` / `reviewer` for one concrete
reason: **`.claude/agents/core/planner.md` already declares `name: planner`** (Ruflo's stock generic
coordinator). Two agent files with the same name make `subagent_type` ambiguous. The prefix also
matches the existing project convention — the review swarm is `lms-*`.

## Relationship to the `lms-*` swarm

`.claude/agents/tahir/` holds twelve read-only review agents (`/swarm-review`). They **predate the
redesign** and cite the *old* `CLAUDE.md` section numbers, so some rules they quote are stale — the
learning mode moved to the group, scoping moved from course to group, and the section numbering has
changed.

Use them for a focused security or scalability pass, not as a substitute for `redesign-reviewer`, and
check their spec citations against `CLAUDE.md` §2.2 before acting on a finding.

## Design notes

- **Agents cite documents by name and section title, not by `CLAUDE.md` § number.** The `lms-*` agents
  cite § numbers and that is exactly why they went stale. Do not restate the spec inside an agent
  file — reference the owning document instead (`CLAUDE.md` §2.2 maps subject → document).
- **Findings carry a confidence label** (`confirmed` / `plausible`) and a concrete failure scenario. A
  finding without a `file:line` and a failure scenario is an opinion.
- **Open decisions are surfaced, never ruled on.** `PHASE_ROADMAP.md` §6 items get one question each.
  The pipeline finds the decision; the client makes it.
- **`Bash` is granted to all three for reading** — `git diff`, `npm test`, `grep`. The planner and
  reviewer are instructed not to run mutating commands. That is a prompt-level constraint, not a
  sandbox one; to enforce it, add a `deny` rule to `.claude/settings.json`.
- **Tool grants carry part of the contract.** The planner and reviewer get `Write` but **no `Edit`** —
  enough to create their own artifact under `docs/phases/<unit-id>/`, not enough to surgically change
  a production file. Only the executor has `Edit`. It is a weaker guarantee than a sandbox and it is
  not the primary mechanism (the prompts are), but it makes the intended boundary visible in the
  frontmatter.
