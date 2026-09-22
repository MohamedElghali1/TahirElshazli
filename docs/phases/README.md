# Phase artifacts

One directory per chat unit (`docs/phases/<unit-id>/`), holding the three handoff artifacts the
sequential pipeline passes state through. They are committed with the phase — they are the record of
what was planned, what was built, and what was found.

| File | Written by | Read by |
|---|---|---|
| `PHASE_PLAN.md` | `redesign-planner` | executor, reviewer |
| `EXECUTION_NOTES.md` | `redesign-executor` | reviewer |
| `REVIEW.md` | `redesign-reviewer` | the coordinator |

`SendMessage` carries the signal; these files carry the payload. An agent that cannot find its input
artifact stops rather than reconstructing it.

The contract is `PHASE_ROADMAP.md` §1.1. Run a phase with `/redesign-phase <unit id>`.
