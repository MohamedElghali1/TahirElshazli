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

**2. Spawn the five analysts in ONE message, in parallel**, each with `run_in_background: true` and a
`name` matching its `subagent_type`. Give each: the scope from step 1, the file list, and the
instruction *"You are read-only. Report findings in your defined output format. Send your report to
`lms-review-code` via SendMessage when done."*

Skip an analyst whose domain the diff does not touch, and say which you skipped and why — running
`lms-sec-appsec` on a change that touches no auth, upload, or config file wastes a slot and pads the
report with noise.

**3. Spawn `lms-review-reqs` in the same message.** It works from the diff directly and does not wait
on the analysts.

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
