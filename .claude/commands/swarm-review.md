---
description: Run the full LMS review swarm - security and architecture teams in parallel, then the review team verifies, then the team lead delivers one verdict.
argument-hint: "[what to review — e.g. 'the working tree', 'the auth module', 'HEAD~3..HEAD'. Defaults to the current diff.]"
allowed-tools: Agent, Read, Grep, Glob, Bash, SendMessage
---

Run the Tahir Elshazli LMS review swarm over: **$ARGUMENTS** (default: the uncommitted working tree
plus the last commit).

## Pipeline

```
   ┌─ lms-sec-rbac        ─┐
   ├─ lms-sec-appsec      ─┤
   ├─ lms-sec-datatrail   ─┤──► lms-review-code ──┐
   ├─ lms-arch-scale      ─┤    (verifies every   ├──► lms-team-lead ──► you
   └─ lms-arch-maintain   ─┘     claim)           │
                               lms-review-reqs  ──┘
                               (traceability)
```

## Steps

**1. Establish the scope yourself, first.** Run `git status --porcelain`, `git diff HEAD --stat`, and
`git log --oneline -5`. Put the concrete file list and revision range in every agent's prompt — do
not make five agents each re-derive it. If the target is empty, stop and say so rather than sending
the swarm at nothing.

**2. Spawn the analysts in WAVES OF AT MOST THREE — never all at once.**

> Six parallel agents on a 100-file diff exhausted the session rate limit and *all six* died with
> HTTP 429 before producing a single report. Two waves of three cost the same tokens but survive.

Wave A — `lms-sec-rbac`, `lms-sec-appsec`, `lms-sec-datatrail`.
Wave B — `lms-arch-scale`, `lms-arch-maintain`, `lms-review-reqs`, once Wave A has returned.

Give each: the scope from step 1, the file list, and the instruction *"You are read-only. Report
findings in your defined output format."* Collect each wave's reports yourself and relay them
onward — do not rely on agents messaging each other by name.

**Narrow the scope before adding agents.** On a diff this size, point each agent at the specific
files in its domain rather than the whole commit. A focused agent finishes; a broad one burns budget
re-reading files another agent already covered.

**Skip an analyst whose domain the diff does not touch**, and say which you skipped and why. Running
`lms-sec-appsec` on a change touching no auth, upload, or config file wastes a slot and pads the
report with noise.

**If an agent dies on a 429**, say so plainly and name which reports are missing. Do not present a
partial or intermediate note from a dead agent as a finding — verify it yourself first, or drop it.

**4. When the analysts report, run `lms-review-code`.** It reviews the diff for correctness on its
own account *and* verifies every incoming claim at the cited `file:line`, rejecting what the code
does not support. This gate is not optional — it is what keeps confidently-wrong findings out of the
final report.

**5. Run `lms-team-lead` last**, with the verified findings from `lms-review-code` and the
traceability report from `lms-review-reqs`. It deduplicates, adjudicates conflicts, rules on scope
against CLAUDE.md §0, and issues the verdict.

**6. Relay the lead's verdict to the user.** Subagent output is not shown to them. Lead with the
verdict line and the blockers; keep the full detail available but do not dump every section verbatim.

## Rules

- Every agent is **read-only**. None may edit a file or run a mutating git command. If the user wants
  fixes applied, that is a separate, explicit follow-up.
- Do not fabricate or predict a pending agent's results. If the user asks before a report lands, say
  it is still running.
- `CLAUDE.md` §0 governs every disagreement: current conversation → Report 2 → report 1 → the signed
  agreement → the prototype doc → background notes → the §9 wish list.
- If the swarm finds nothing, report that plainly with the scope that was checked. A clean verdict is
  a result, not a failure.
