# Unit 7 — Marking and the mark book

**Scope** `MARK-1` … `MARK-6`, `BOOK-1` … `BOOK-3`. **Branch** `redesign`. **Migration** `020_marking.sql`.

**Pipeline, as the user chose on 2026-09-23:** not the three-agent `/redesign-phase` pipeline and not
the units-3-6 Antigravity pipeline. This session orchestrates and **reviews**; implementation is
delegated to Sonnet subagents, one slice at a time, both sides on the ponytail skill at full. The
reviewer and the implementer are different agents, which is the property that mattered in units 1-6
and is preserved.

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
| **7b** | `MARK-6` — submit-time mode enforcement, multi-file, `link_url` validation | `[ ]` |
| **7c** | `MARK-1` — annotation service, 4 routes, authz, audit actions | `[ ]` |
| **7d** | `MARK-2` — save vs save-and-return; student visibility moves to `returnedAt` | `[ ]` |
| **7e** | `MARK-3` — submissions for one task **including non-submitters** | `[ ]` |
| **7f** | `MARK-4` + `MARK-5` — marking view: canvas overlay, toolbar, marker/eraser | `[ ]` |
| **7g** | `BOOK-1` … `BOOK-3` — grid endpoint, screen, CSV export | `[ ]` |

---

## 4. What is NOT verified

**`020` has never run against real PostgreSQL.** Docker Desktop is not running in this environment.
`CLAUDE.md` §9 makes an empty-schema run a hard gate, and 001-008 each found something on their first
run. **The unit cannot be called complete until it clears**, and authoring a later migration on top of
an unverified one is exactly what §9 forbids.

The backfill `UPDATE` is the specific thing that needs watching: it is the only non-additive statement
in the file.

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
