# Review: unit 7, Marking and the mark book

**Reviewer:** the coordinator, as a separate pass after implementation (the user ran the pipeline
without the agent harness). **Range:** `6657c7a..4803911`. **Against:** `PHASE_PLAN.md` with its
Revision 1, and the rulings `D-40`…`D-46`.

**An honest limit on this review:** the same actor planned, built and reviewed. The pass was run
after the work was finished, read the diff rather than memory, and produced two findings fixed below;
it is still not an independent reviewer. A `redesign-reviewer` run, or the user's own browser pass,
is the stronger check.

## Verdict: **APPROVED WITH FOLLOW-UP** — unit 7 stays `[~]`, **not complete**

Two conditions keep it open (roadmap §2):
1. **Condition 9 — an unresolved blocker in scope.** `MARK-6` is blocked on `B-1`/`B-2`, escalated to
   the user. The unit cannot close until they are ruled and built, or the user moves `MARK-6` out.
2. **The browser pass has not been performed.** Every screen typechecks, lints and is wired to the
   real API, but none has been seen working (`CLAUDE.md` §13: never declare completion on
   compilation). The coordinator stopped at the sign-in form; the checks are listed in
   `EXECUTION_NOTES.md` §8.

## Did we move toward the NEW product?

Yes, within the limit stated in the execution notes' first paragraph.
- **Annotations are data** over an immutable original — pins, and freehand strokes with their
  points; no flattened file, no server-side PDF library (`D-2`). ✔
- **Save and return are two operations**, on the staff screen and in the API; the student sees
  nothing until return — one predicate over all five student reads, e2e-proven end to end. ✔
- **Non-submitters are listed** on the per-task queue, per group, with no cross-group total. ✔
- **A missing mark is null / an em-dash** in the JSON, the grid, the CSV and the student view; a real
  zero stays `0` (CSV spec asserts both). ✔
- **Progress and performance do not meet:** the mark book carries no completion figure (unit test
  asserts it) and uses `Score`, not `Meter`. ✔
- **`MARK-6` escalated, not decided,** and no part of it remains in the code (grep for
  `SubmissionFile`, `files JSONB`, `D-38`, `D-39` in code: the only hits are
  `countBySubmissionFiles`, which counts marks per file URL for the stale-marks figure, not `MARK-6`). ✔

## Checks performed

| Area | Check | Result |
|---|---|---|
| Tests | Real output after `c86f511`: 735 unit / 43 files, 330 e2e, 173 integration / 0 skipped on PG 15.19 from a database with 0 tables; `019` in `schema_migrations`; `tsc` 0; lint exit 0 | Pass |
| Migration | `019` additive plus one backfill; CHECKs refuse incoherent strokes/comments and a return without a mark; CASCADE and RESTRICT exercised; backfill run on a populated schema | Pass |
| Both drivers | `SubmissionAnnotationRepository`, `returnSubmission`, `claimMarker`, `findMembersForGroups`, `findSubmissionsForStudents`, `findLatestScoresForStudents` — each in memory and Postgres, with integration coverage; ordering identical (`page, created_at, id`; `assigned_at, id`; latest by `submitted_at, id`) | Pass |
| Authorization | Every new or changed route refused in both directions, 404 bodies compared `===` to a genuine miss: per-task queue, four annotation routes (`it.each`, both scoped assistants), return, `/grade` (new under `D-44`), course queue items, mark book and CSV; students 403 on every `/staff` route | Pass |
| Order of refusals | Scope 404 before ownership 403 before state 409 in every handler | Pass |
| Audit | `submission.returned`, `submission.annotated`: union, exhaustive `Record`, frontend mirror and labels, specs asserting the entry; no second entry on a re-return; `before` copies; the `D-43` claim audited as `assessment.updated` inside the same transaction | Pass |
| Validation | Every DTO field decorated; stroke points checked per element (0–100, 2–2000); coherence re-checked in the service | Pass |
| Output minimisation | Student annotations carry no author; queue and CSV carry names, not emails | Pass |
| XSS | No `dangerouslySetInnerHTML` in the marking, manage or homework trees; comment text and names render as text | Pass |
| CSV | BOM, CRLF, RFC 4180 quoting, `=`/`+`/`-`/`@`/TAB/CR neutralised, em-dash, server-minted filename | Pass |
| SSRF / third-party files | The API never fetches a submission URL; the browser loads only platform-stored files, and the student's marked copy loads only when marks exist, which the server allows only on platform files | Pass |
| Headers | Helmet unchanged; CORP handled by a CORS fetch, not relaxed | Pass |
| Dependency | `pdfjs-dist` 6.3.289 pinned exact, past the CVE-2024-4367 fix; lazy; same-origin worker; `npm audit` 0 | Pass |
| Design rules | No `text-[var(`; one utility per property (two double-utility slips caught while writing, fixed before commit); no card in a card (sibling `Panel`s); overlay `dir="ltr"` with physical `left`/`top`; sticky column logical `start` | Pass, browser check pending |
| Docs | Every owner in `CLAUDE.md` §12 updated; the stale roadmap and `CLAUDE.md` lines fixed; the 12 document conflicts recorded | Pass |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| R-1 | Medium | **Marking view state was not scoped to the submission** (`manage/tasks/[id]/submissions/[submissionId]/page.tsx`). Typed mark, feedback, page and local marks lived in page state; if the router reused the component on "Next student", the previous student's typed mark could be saved against the next. | **Fixed** in `4803911`: the view is keyed by `submissionId` |
| R-2 | Low | **The course grading tab mixed grains silently** (`manage/courses/[id]/grading/page.tsx`). Under `D-44` the list is the caller's groups but the averages and counts are the whole course's; a scoped assistant saw "Submitted 30" over a list of 10. | **Fixed** in `4803911`: the panel says "Whole course, every group" |
| R-3 | Info | `D-45` × `D-46`: the average excludes Google Form scores (follows `D-45`'s "`GROUP-4`'s arithmetic"). Stated on the screen. | Surfaced to the user |
| R-4 | Info | Rows for non-submitters on the per-task table are focusable buttons that do nothing when activated. Their accessible label says so, but a plain row would be cleaner. | Left; minor |
| R-5 | Info | Pre-existing: `MARK-F2` (oldest form response shown on Postgres in the analytics read), `MARK-F3`, `MARK-F4`, and one lint warning in `dashboard.controller.spec.ts`. | Filed, not in scope |

## Follow-ups that must close before `[x]`

1. `B-1` and `B-2` ruled by the user, then `MARK-6` built (migration `020`), or `MARK-6` moved out of
   unit 7 by the user.
2. The browser pass in `EXECUTION_NOTES.md` §8, performed and reported.

Once both hold, this review can be closed as **`APPROVED`** without another round, provided the
browser pass finds nothing and the `MARK-6` work gets its own review.

---

# Addendum — review of slice 7i (`MARK-6`), 2026-09-23

**Range:** `bec909f..c4823e4`. **Against:** `PHASE_PLAN.md` Revision 2 and `D-47`/`D-48`. The same
limit as above applies: the coordinator reviewed its own work, as a separate pass after the build.

## Verdict: **APPROVED WITH FOLLOW-UP** — unit 7 stays `[~]`

Both conditions of the first review are now met:
- `MARK-6` is ruled (`D-47`, `D-48`) and built.
- The browser pass for 7a–7h is **reported complete by the user**. It was not observed by the
  coordinator.

**One condition remains:** the 7i screens have not been seen in a browser — the student's upload form,
the file switcher in the marking view, and the authoring gate. Everything under them is covered by unit,
e2e and integration tests. Once the user confirms those three screens, this review closes as
**`APPROVED`** with no further round, and every roadmap §2 condition holds.

## Did `MARK-6` land as ruled?

- Modes enforced at submit time, exactly one per submission, a note never alone — `checkSubmission`,
  tested in both directions (unit and e2e). ✔
- The student upload route has its own contract: modes-derived types, `min(task, 20 MB)`, its own rate
  limit, server-minted names, and a 404 identical to a missing task for an untargeted student. Staff
  get 403 and an anonymous caller 401. ✔
- Upload modes are refused while storage is off. `allowedFileTypes` is derived, so it cannot disagree
  with the modes. ✔
- The file set is replaced and archived whole. Migration `020` ran from an empty schema; both drivers
  are integration-tested. ✔
- Staff mark up every file of a hand-in, and a mark on a replaced file counts as stale. ✔

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| R-6 | Medium | **A moded resubmission kept the old note when none was sent**, contradicting `D-48` (c) (the whole hand-in is replaced); a student could not remove a note. | **Fixed** `c4823e4`, unit + integration |
| R-7 | Low | **The upload route accepted files that could never be handed in** — after a one-shot submission or once corrected — disk use with no purpose. | **Fixed** `c4823e4`: 409/400 as the submit route would answer; e2e |
| R-8 | Low | **A submitted file URL was checked by prefix**, so `/uploads/../x.pdf` passed (no exposure: the static server normalises it). | **Fixed** `c4823e4`: the exact minted shape; unit |
| R-9 | Info | Found while building 7i: the mark-book test fixture failed backend `tsc` (vitest does not typecheck). | Fixed `bec909f`; backend `tsc` added to the recorded checks |
| R-10 | Info | A-15: a submitted file is not bound to its uploader (`MARK-F5`). An authenticated student can make the server buffer up to 20 MB before the task check, 12/min (`SECURITY.md` §2.4). | Recorded, not built |

## Real output after `c4823e4`

Unit 750 / 44 files · e2e 337 · integration 176, 0 skipped, PostgreSQL 15.19, 001–020 from a database
with 0 tables · backend `tsc` 0 · frontend `tsc` 0 · lint 0 · `npm audit` 0.

---

# Closure — **APPROVED**, 2026-09-23

The one remaining condition is met. The user confirmed the three 7i screens in a browser: the student
upload form, the file switcher in the marking view, and the authoring gate. That confirmation is the
user's verification, not something the coordinator observed, as with unit 6. Per the addendum it closes
the review as **`APPROVED`** with no further round.

Roadmap §2, all nine conditions:
1. **Planner completed, plan approved** — `PHASE_PLAN.md` with Revisions 1 and 2. ✔
2. **Executor completed the approved scope** — 7a–7o; `MARK-6` (7i) built after the user's ruling. ✔
3. **Reviewer `APPROVED`** — this closure. ✔
4. **Required tests pass, with real output recorded** — 750 unit / 44 files, 337 e2e, 176 integration,
   0 skipped, on PostgreSQL 15.19; 001–020 from an empty schema. ✔
5. **Security checks, with a refusal test for every permission added** — both review tables. ✔
6. **Documentation updated** — the `CLAUDE.md` §12 owners. ✔
7. **`IMPLEMENTATION_PLAN.md` statuses updated.** ✔
8. **`PHASE_ROADMAP.md` status updated.** ✔
9. **No unresolved blockers in scope.** ✔ The `MARK-F1`…`MARK-F5` follow-ups and the open question below
   are outside the unit's scope.

**Open question, not a blocker:** should Google Form quiz scores count in the mark book's "Average of
marked work"? Today they are shown as columns but not averaged, following `D-45`'s "`GROUP-4`'s
arithmetic". A yes would be a new ruling.
