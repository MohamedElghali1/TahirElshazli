# Coordinator rulings — unit 1

Decided by the coordinator on 2026-09-19 after reviewing `PHASE_PLAN.md`. **These are settled.**
An executor or reviewer reads this file alongside the plan; nothing here is to be re-litigated.

Recorded as a file rather than passed in a prompt because the first executor run died on a session
limit and its brief died with it. The handoff must survive an agent death.

## 1. B-1 ACCEPTED — scope is `AUTH-1` + `AUTH-3` only

`AUTH-2` defers to unit 2 (beside `DOM-1`/`DOM-2`). `AUTH-4` defers to unit 5 (needs `MAIL-1`,
unit 3). `AUTH-5` stays `[!]` on `D-1`.

The argument is technically forced, not a preference: migration 014's DDL joins `groups.course_id`,
which does not exist until 013, and `MigrationRunner.sqlFilesIn` sorts lexicographically — so a
`014` with no `013` applies straight after `012` and aborts every boot and every integration run.

**Do not touch** `course_staff_assignments`, `CourseStaffRepository`, either of its drivers, or
`StaffScopeService`'s internals, beyond the single line at `staff-scope.service.ts:57`.

## 2. Repository item (b) IS IN SCOPE

Widen `findByRole(role: Role, …)` → `findByRole(roles: readonly Role[], …)`.

**Preserve the safety property** at `user-repository.interface.ts:61-66`: the parameter stays
required and non-empty, and an empty array must **throw or return `[]` — never "all accounts"**.

Update both drivers, `DirectoryService.listAssistants` (pass `[Role.Assistant, Role.Admin]`),
`listStudents` (pass `[Role.Student]`), and the integration-suite entry. Emit `role` on the
assistants list response. Do **not** add `scope`, `groupIds`, `status` or `lastSeenAt`.

## 3. D-a APPROVED — admins receive `all_tas` announcements

`announcements.service.ts:180` resolves over `[Role.Assistant, Role.Admin]`, reusing the same
multi-role widening. A silently missed recipient is worse than a redundant one, and
`PHASE_ROADMAP.md:262` keeps `all_tas` precisely because staff broadcast has no other route.

**Record in `docs/CHANGELOG.md`** — it changes who receives mail, so it is a decision, not a refactor.

## 4. D-b — `lastSeenAt` emits `null` always

Already nullable in the contract. Add a task to `IMPLEMENTATION_PLAN.md` noting the field has no
source anywhere in the repository. **Do not** add a hot-path write for it.

## 5. D-c — `011` contains the two CHECK widenings and nothing else

Correct `docs/DATABASE_PLAN.md` §2 so `users.status` is not also attributed to `011`; `DOM-4` takes
its own number.

## 6. D-d — out of scope

Leave the flag in place for `AUTH-4`'s planner.

## 7. B-2 / `SPEC-12` — proceed, but DoD point 2 is NOT MET

No reachable Postgres on this machine: Docker daemon down, `C:` at 99% (~2 GB free) where Docker's
VM disk and `%TEMP%` live, nothing on 5432, no `psql`.

- **Do NOT mark `AUTH-1` `[x]`.** **Do NOT mark unit 1 complete.** Both stay `[~]`.
- Record in `EXECUTION_NOTES.md` that the **environment** blocked verification, not the work.
- Migration `011` is the safest in the plan — two CHECK widenings, no data loss possible — so
  authoring it unverified is defensible. It is not *done*.

**Remediation, in order:** free space on `C:` → start Docker Desktop → `docker compose up -d db` →
run the integration suite with `TEST_DATABASE_URL` against an **empty** schema → record the real
output → close `SPEC-12`.

## 8. Doc-drift corrections owed by this unit

From `PHASE_PLAN.md` §9 R-8:
- `StaffScopeService` has **nine** callers, not eight (`AUTHORIZATION_MODEL.md:192`,
  `ARCHITECTURE.md:102`, `CHANGELOG.md:91`).
- The role widening is **14 decorator sites / 63 routes**, not "~30 call sites"
  (`AUTHORIZATION_MODEL.md:36`, `SECURITY.md:81`, `CHANGELOG.md:66`).
- **The audit-action count is 27. The coordinator already corrected this one — leave it alone.**

Apply appendix fix 1 (`frontend/lib/roles.ts:26`'s now-false comment). Leave appendix fixes 2 and 3
for the work that touches those files.
