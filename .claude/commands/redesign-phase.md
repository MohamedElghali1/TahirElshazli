---
description: Run one redesign phase through the sequential planner -> executor -> reviewer pipeline. Enforces the handoff contract and the phase completion protocol.
argument-hint: "[chat unit id from docs/PHASE_ROADMAP.md — e.g. '1', 'unit 2'. Omit to use the current phase.]"
allowed-tools: Agent, Read, Write, Edit, Grep, Glob, Bash, SendMessage
---

Run the redesign pipeline for chat unit: **$ARGUMENTS** (omit → read the current `[~]` or first `[ ]`
unit from `docs/PHASE_ROADMAP.md`).

You are the **coordinator**. You do not implement; you sequence, approve scope, and relay.

```
redesign-planner  ──►  redesign-executor  ──►  redesign-reviewer
   read-only            the only writer          read-only
  PHASE_PLAN.md      EXECUTION_NOTES.md          REVIEW.md
```

---

## 0. Git safety and entry criteria — before anything else

```bash
git rev-parse --abbrev-ref HEAD    # must be `redesign`
git status --porcelain
npm test --workspace=backend 2>&1 | tail -5
```

- **Not on `redesign` → stop.** Never work on `main`.
- **Uncommitted changes → report them and ask** before proceeding. Never reset, force, clean or
  discard work you did not create. No destructive git command to "tidy up".
- Read `docs/PHASE_ROADMAP.md`: identify the unit, and verify its entry criteria and §3's universal
  ones. **A dependency unit that is not `[x]` stops the run** — say which, and stop.
- Create `docs/phases/<unit-id>/` for the artifacts.

---

## 1. Planner — first, alone

Spawn **`redesign-planner`**. Give it: the unit id, its scope from `PHASE_ROADMAP.md`, the baseline
you established in step 0, and the instruction *"You are read-only. Write only
`docs/phases/<unit-id>/PHASE_PLAN.md`."*

When it returns, **read `PHASE_PLAN.md` yourself** and check:

- Scope matches the unit in `PHASE_ROADMAP.md` — nothing added, nothing quietly dropped.
- The reconciliation is filled in with citations, not assertions.
- Every new table lists **both** repository implementations.
- Every permission has a named refusal test.
- Blockers are recorded as blockers, and their dependent tasks are scoped **out** — not left
  half-specified.

**Relay the plan's scope and blockers to the user and get approval before continuing.** If a blocker
needs a client decision, surface it now: one question, both readings, the impact. That is far cheaper
here than after the executor has built against a guess.

**Do not start the executor until the plan exists and its scope is approved.**

---

## 2. Executor — second, only after the planner has finished

Spawn **`redesign-executor`** with: the path to `PHASE_PLAN.md`, the approved scope, and any decision
the user just made. Instruct it to write `docs/phases/<unit-id>/EXECUTION_NOTES.md`.

While it works, do not implement anything yourself in the same files — **one writer, always.**

When it returns, read `EXECUTION_NOTES.md` and check the shape of what came back:

- Are the test commands' **real outputs** recorded, or asserted?
- Which suites actually **executed**? `test:integration` skips itself without `TEST_DATABASE_URL`, and
  a skipped suite is not a pass.
- Are deviations from the plan recorded? An unrecorded deviation is the failure mode here.
- Were blockers stopped-and-recorded, or guessed past?

---

## 3. Reviewer — third, only after the executor reports completion

Spawn **`redesign-reviewer`** with: the unit id, both prior artifacts, and the revision range. Instruct
it to write `docs/phases/<unit-id>/REVIEW.md` and that it is **read-only** — no production edit
without explicit authorization.

Its central question is *"did we move toward the NEW product?"*, not *"does the old app still work?"*

---

## 4. Act on the verdict

| Verdict | What you do |
|---|---|
| **`APPROVED`** | Check all nine conditions in `PHASE_ROADMAP.md` §2. If all hold, mark the unit `[x]`. |
| **`APPROVED WITH FOLLOW-UP`** | Unit stays `[~]`. Add each follow-up to `docs/IMPLEMENTATION_PLAN.md`. Say plainly that the phase is **not complete**. |
| **`REJECTED`** | Unit stays `[~]`. Relay the remediation checklist. Re-run the executor on that checklist only, then the reviewer again. Do not re-run the planner unless the scope itself was wrong. |

**Never mark a unit `[x]` on your own judgement over a non-`APPROVED` verdict.**

---

## 5. Close the phase, then stop

- Confirm the documentation updates in `CLAUDE.md` §12 landed: `IMPLEMENTATION_PLAN.md`,
  `PHASE_ROADMAP.md`, `CHANGELOG.md`, `API_SPEC.yaml` if routes changed, `project_log.md`, and
  `CLAUDE.md` only if a durable rule changed.
- Summarize for the user: what was completed, the verdict, decisions recorded, blockers still open,
  and what remains.
- **Then stop.** The next chat unit begins in a new Claude Code conversation. Do not roll on into it.

---

## Rules

- **The order is a contract.** Never run the three concurrently. The executor does not start before the
  planner finishes; the reviewer does not start before the executor finishes.
- **State passes through the artifact files**, with `SendMessage` carrying the signal. Never rely on
  unstructured conversation context alone.
- **Read every artifact yourself.** Subagent output is not shown to the user — you are the only one who
  can catch a plan that drifted or a claim that was asserted rather than run.
- **Do not fabricate or predict a pending agent's results.** If the user asks before a report lands,
  say it is still running.
- **Cap concurrent agents at three.** Six parallel agents on a large diff exhausted the session limit
  and all six died on HTTP 429. If an agent dies, say so and name the missing artifact — never present
  a partial note as a finding.
- **One phase per conversation** (`CLAUDE.md` §14).
