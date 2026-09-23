# Unit 7 — Marking and the mark book

**Scope** `MARK-1` … `MARK-6`, `BOOK-1` … `BOOK-3`. **Branch** `redesign`. **Migration** `020_marking.sql`.

**Pipeline, as the user chose on 2026-09-23:** not the three-agent `/redesign-phase` pipeline and not
the units-3-6 Antigravity pipeline. This session orchestrates and **reviews**; implementation is
delegated to Sonnet subagents, one slice at a time, both sides on the ponytail skill at full. The
reviewer and the implementer are different agents, which is the property that mattered in units 1-6
and is preserved.

**Amended twice on the day, and the second amendment cost the property above.** The user first
switched the implementer from a Sonnet subagent to Antigravity (`agy-delegate`). That ran 7b-i and
it worked as intended — the review caught a real defect the implementer's own tests could not see
(`D-41`, the `pdf_upload`/`.txt` widening). Partway through **7b-ii, every agy model hit its quota**:
`claude-opus-4-6-thinking`, then `claude-sonnet-4-6`, then the `gemini-3.1-pro-high` fallback, all
returning `Resets in ~167h`. The Gemini run was truncated mid-slice, leaving a partial tree.

On the user's instruction the orchestrator finished 7b-ii itself. **For that slice the implementer
and the reviewer are the same agent**, which is strictly weaker than every slice before it. Recorded
here rather than left implicit, because the phase record should not imply a review that did not
happen. Slices 7c onward should restore the split — either agy quota returning, or a Sonnet
subagent as this plan originally specified.

---

## 1. Migration number

**020, not 019.** The unit 8 session (sessions and attendance, worktree `.claude/worktrees/unit-8`,
branch `unit-8`, cut from `redesign` @ `6657c7a`) claimed 019 for `019_sessions_reparent_to_group.sql`.
Authored here as 019 first and renumbered on their message; no other file referenced the number.

`MigrationRunner` sorts lexicographically, so **whichever of unit 7 and unit 8 merges second must
verify 019 and 020 apply in order from an empty schema**, not merely its own.

**No overlap between the two units in either direction** — verified, not assumed: `attendance` and
`attended` appear in unit 7's surface (`backend/src/manage/`, `backend/src/assessments/`) only inside
four comments, with zero reads of the table or the column. The mark book is per-task scores; composing
marks with attendance is unit 9's.

---

## 2. Decisions taken before the migration was authored

`IMPLEMENTATION_PLAN.md:293` left `MARK-6` explicitly undecided. All three answers change 020's
columns, so they went to the user rather than being assumed (`CLAUDE.md` §13). Full reasoning in
`CHANGELOG.md` under `D-38` … `D-40`.

| ID | Ruling |
|---|---|
| `D-38` | Multi-file is a **`submission_files` table**, not `TEXT[]`. An annotation FKs to a file **id**, because an array index silently re-aims every later stroke when a photo is deleted or reordered. |
| `D-39` | `doc_link` admits **either** a file or a link. `link_url` is nullable and sits beside the files. https-only scheme check **in the service**, not a SQL CHECK — one copy of the whitelist. |
| `D-40` | `pdf_upload` admits **pdf, docx, zip**. `photo_upload` admits images, **five at most**. Enforced at submit time in the service. Supersedes 018's "govern the upload exactly as before". |
| `D-41` | **Narrows `D-40`: pdf and docx only — zip is refused.** The global upload whitelist admitted neither, so `D-40` required widening it, which is a `SECURITY.md` §4 decision. A zip can hold anything and §8 admits nothing executable. |

**A pre-existing gap found while implementing `D-40`, and fixed on the user's call rather than
filed:** a task's `allowedFileTypes` was **enforced nowhere** — the upload route validates only the
global whitelist and does not know which task a file belongs to, so a "PDF only" task accepted a
`.png`. Open since unit 1. Cheap to close because `UploadsService` mints the stored extension from
the already-validated MIME and never reads the client's filename, so the extension on a stored URL
is server-controlled and can be enforced against without trusting the client.

**`TASK-F3` closed in the same pass:** deleting a task with submissions now answers **409**, aligning
it with `D-36`'s sibling refusal. The e2e moved with it and passes.

**One thing 020 does that nobody asked for:** it backfills `returned_at = corrected_at` on every
already-corrected row. `MARK-2` moves student visibility from `corrected_at` to `returned_at`;
leaving the column NULL would have removed, on deploy, every mark every student can currently see.

---

## 3. Slices

| Slice | Content | Status |
|---|---|---|
| **7a** | Migration `020`; interface types + 8 methods; **both** repository drivers | `[~]` memory driver done; Postgres driver delegated |
| **7b** | `MARK-6` — submit-time mode enforcement, multi-file, `link_url` validation | `[x]` split 7b-i / 7b-ii, both landed |
| **7c** | `MARK-1` — annotation service, 4 routes, authz, audit actions | `[ ]` |
| **7d** | `MARK-2` — save vs save-and-return; student visibility moves to `returnedAt` | `[ ]` |
| **7e** | `MARK-3` — submissions for one task **including non-submitters** | `[ ]` |
| **7f** | `MARK-4` + `MARK-5` — marking view: canvas overlay, toolbar, marker/eraser | `[ ]` |
| **7g** | `BOOK-1` … `BOOK-3` — grid endpoint, screen, CSV export | `[ ]` |

---

## 4. Verification status

**`020` PASSES the empty-schema gate.** PostgreSQL 15.19, `psql -v ON_ERROR_STOP=1`, 001→020 in
lexicographic order against a database created empty moments before — run by the unit 8 session on its
container, from `8eb6ad9` via `git show`, no merge and no checkout touched. It applied on top of a
schema already carrying 019's reshaping, so the two compose. Objects confirmed against the live
catalog: both unique constraints, all five annotation CHECKs, `returned_at` at `datetime_precision 3`.

**The backfill's behaviour is still unproven, and this is the one to watch.** That run was bare
`psql`, so the three vitest tests under `describe('migration 020')` did not execute — and on an empty
schema the `UPDATE ... WHERE corrected_at IS NOT NULL` touches zero rows regardless. **An empty-schema
gate is structurally silent about any backfill.** Closing it needs the integration suite run with
`TEST_DATABASE_URL` against a seeded database; Docker is unavailable here.

Docker Desktop is still down locally, so nothing in this unit can be browser-verified or
integration-tested in this environment. Substituting curl/direct-API checks, as unit 5 did, and
saying so rather than implying coverage.

---

## 5. Binding constraints carried in

- **A missing mark is an em-dash, never `0`** (`CLAUDE.md` §11.1). Applies to the mark book grid and
  the marking queue alike.
- **The original submission is immutable.** Annotations are an overlay drawn *over* the file; the
  eraser clears the teacher's own strokes, never page content (`D-2`). No server-side PDF library.
- **Progress and performance never merge** (§11.1 rule 2). The mark book is achievement — `Score`
  over a denominator, never a `Meter`.
- **The queue must show non-submitters** (`MARK-3`). This is the answer to the old "no `missed`
  status" gap, and it is the requirement most easily lost by writing the obvious `JOIN`.
- **Every new audit action** needs the `AuditAction` union entry, the query DTO's exhaustive
  `Record<AuditAction, true>` entry, and a spec asserting the entry written (`CLAUDE.md` §9).
- **A refusal test for every permission** (§10). Both directions, or it is not evidence of a boundary.
