# Phase plan — chat unit 13: student surface and the public site

Written by the lead in-session (ponytail active), 2026-09-24. Research first, then a three-way
dispatch to Antigravity implementers; the lead re-runs every gate and commits.

## 0. Scope

`docs/PHASE_ROADMAP.md` §4 "Chat unit 13" carries `STU-1` … `STU-7` and `SITE-1` … `SITE-5`.
**This session deliberately takes a subset**, on the user's instruction:

| | Tasks |
|---|---|
| Build | `SITE-1`…`SITE-5`, `STU-2`, `STU-5`, `STU-6`, `STU-7` |
| Deferred | `STU-1` — the Overview composes unit 8's attendance figures |
| Deferred | `STU-4` — the four attempt states need unit 7's `returned_at` |
| Not in either list | `STU-3` (lesson detail + next-recording). Out of this session; recorded here so it is not mistaken for done. |

Units 7 and 8 are in flight on other branches. `backend/src/assessments/`,
`backend/src/live-sessions/` and the marking module are untouched here.

The unit therefore ends `[~]`, not `[x]`.

---

## 1. The finding that turned out to *be* `SITE-1`…`SITE-5`

The marketing pages and the auth screens were assumed done — `CLAUDE.md` §4.1 records that
`components/site/*` "was ported onto the current `components/ui` API *in place* during unit 4 rather
than replaced". That is true of the **component imports**. It is not true of the **token
vocabulary**.

**Every marketing and auth surface is still written against the retired token vocabulary**, which
was deleted when the Claude Design token layer landed (`ad238a7`, which removed
`frontend/app/tokens.css`). A mechanical scan of every `var(--…)` used in `frontend/app` and
`frontend/components` against every custom property defined in `app/tokens/*.css` + `app/globals.css`
returns **38 distinct undefined properties in 491 references across 24 files**:

```
--sp-1 -2 -3 -4 -6 -8 -12 -16 -24          (the 4px spacing scale)
--fs-body --fs-lead --fs-h1 --fs-h2 --fs-h3 --fs-display   (the old marketing type scale)
--bg-primary --bg-secondary --bg-tertiary --bg-wash --bg-scrim
--fg-primary --fg-tertiary
--r-sm --r-md --r-lg --r-full
--maxw-site --maxw-prose --h-sm --h-md --lh-loose --dur-slow --ease-out
--accent-edge --accent-line --accent-press
```

A CSS declaration whose `var()` names an undefined property with no fallback is **invalid at
computed-value time and is dropped**. So every padding, gap, font size, radius, max-width and line
height those utilities name is **not applied at all** on the public site today. It typechecks, it
lints, it builds. Only the rendered stylesheet is wrong.

This is the third recurrence of the same failure class the repository already records twice —
`CLAUDE.md` §11 rule 1 (478 colour instances) and `F5-1` (113 size instances). It is the same root
cause both times: **Tailwind's arbitrary-value syntax accepts any string**, so nothing in the
toolchain can tell a live token from a dead one.

Worst offenders, by dead-reference count:

| File | refs |
|---|---|
| `app/(site)/courses/[slug]/page.tsx` | 92 |
| `app/(site)/page.tsx` | 82 |
| `app/(site)/blog/[slug]/page.tsx` | 37 |
| `app/(site)/about/page.tsx` | 30 |
| `app/(site)/blog/page.tsx` | 29 |
| `app/(site)/courses/page.tsx` | 27 |
| `components/site/site-header.tsx` | 19 |
| …18 more | 175 |

Additionally **114 of those are `text-[var(--fs-*)]`** — the `F5-1` shape specifically, where
Tailwind v4 compiles the bare `var()` after `text-` to `color:` and so never sets a size at all.
Of those 114, 68 name a property that does not exist and 46 name a **console** size token
(`--fs-base` 13px, `--fs-xs` 12px) on a `[data-surface="site"]` page — the exact scale mixing
`CLAUDE.md` §11 forbids.

### What "repairing it" means

The live vocabulary is `app/globals.css`'s `@theme inline` bridge. Spacing maps 1:1 —
`var(--sp-N)` was `N × 4px` and Tailwind's numeric utility `N` is also `N × 4px`, so
`p-[var(--sp-6)]` → `p-6` exactly. Colour becomes a named utility (`bg-surface-2`, `text-fg-3`).
Type becomes the named marketing utilities `text-m-body` / `-lead` / `-h2` / `-h1` / `-display`.

Two places the mapping is a judgment call rather than a translation, both handed to the implementer
as an explicit decision with a required justification in its report:

1. **`--fs-h3` was 24px and the new marketing scale has no 24 step** (17 / 20 / 32 / 44 / 68).
   A section-owning heading takes `text-m-h2`; a card title or sub-heading takes `text-m-lead`.
2. **`--fs-base` (13) and `--fs-xs` (12) on a marketing surface.** The marketing scale has no step
   below 17px, and a console size may not appear on a marketing page. Marketing small print is
   therefore **body size at a lower tint** — `text-m-body` + `text-fg-3` — which is the same rule
   the console already runs on ("a heading differs from a caption by tint, not size").

Radius carries one deliberate correction: `--r-lg` was 16px, the live system names no 16 step, and
`docs/frontend-design-system.md` §4 records that the old implementation "ran one step large
throughout — 16px buttons reading as pills — and correcting that is the single most visible change
in this rebuild." `--r-lg` collapses to `rounded-md`.

`--lh-loose` (1.65), `--dur-slow` (1500ms) and `--ease-out` have no named replacement and keep
their literal values; `--lh-loose` in particular is load-bearing for the 17px body scale.

---

## 2. `STU-2` — the only backend work in this session

`docs/PRODUCT_SPEC.md` §6: *My lessons `[CHANGED]` — "Recording library, thumbnails by default,
grid/list toggle, watched bar. Needs `recordings.thumbnail_url` `[NEW]`."*

`frontend/app/(app)/lessons/page.tsx` says so in its own header comment: the grid/list layout "is a
content redesign out of this unit's scope" — written during unit 4, pointing at this unit.

Migration **023** (`019` unit 8, `020` unit 7, `021` unit 10, `022` unit 12 are taken; `019` is
absent from this branch because it lives on an in-flight branch). One nullable column, no backfill,
no index — nothing reads or filters on it, and every recording that exists today has no thumbnail,
so the null path is the normal path rather than an edge case.

Both repository drivers, per `CLAUDE.md` §9. The DTO guard copies `videoUrl`'s
`@IsUrl({ protocols: ['http','https'], require_protocol: true })` for the reason that field's own
comment gives: without it the value can become a `javascript:` string that an `<img src>` would
accept.

The watched bar is a `Meter`, never a `Score` — §11.1 non-negotiable 2. No mark appears on the page.

---

## 3. `STU-5` / `STU-6` / `STU-7` — verified, largely not rebuilt

Same posture as unit 12's `SET-3`/`SET-5` finding: check before building.

- **`STU-5` Materials — no gap.** `app/(app)/materials/page.tsx` is course-scoped, on the current
  kit, and reachable: it has no rail slot by design (§6 does not list one) and is linked from the
  Overview's own Materials panel (`dashboard/page.tsx:693,728`). Verified, not rebuilt.
- **`STU-7` Help — one real fix.** The card was correct; its call to action was a `Button` running
  `window.open(...)`. That cannot be middle-clicked, copied or opened in a new tab, and a scripted
  `window.open` is exactly what a popup blocker suppresses — which would leave the single support
  route on the platform silently doing nothing. Now a `ButtonLink` anchor with
  `rel="noopener noreferrer"`, which also drops the page's `'use client'` boundary.
- **`STU-6` Classmates — a documentation conflict, raised rather than resolved.** See §4.

---

## 4. Findings to raise

### `F13-1` — the retired token vocabulary is still live on the public site
Recorded in §1. 491 references, 24 files. Fixed this unit.

**It will recur**, because nothing prevents it: `text-[var(--anything)]` and `p-[var(--anything)]`
typecheck, lint and build whether or not the property exists. The durable fix is a check that
resolves every `var(--x)` written in a Tailwind arbitrary value against the defined set and fails
the build on a miss — the same shape `OPS-1` proposes for the `lib/api.ts` mirror, and for the same
reason: **make drift a compile error, not a code review.** Recorded as a follow-up, not built here
(out of this unit's approved scope).

### `F13-2` — two same-rank documents disagree about classmate avatars
`CLAUDE.md` §2.3: a conflict between two sources at the same authority level "is a finding, not a
puzzle to solve silently."

- `docs/PRODUCT_SPEC.md` §6 — Classmates `[EXISTING]`: **"Names and avatars only. Already correct."**
- `docs/redesign-mapping.md` §Coverage — lists classmates under *Maps cleanly* as
  **"classmates (names only — an exact match)"**.

The implementation agrees with the second: `backend/src/groups/classmates.service.ts` returns
**"Name and id, and nothing else"**, and its comment states the rule deliberately — never email,
phone, grades, progress or attendance.

`PRODUCT_SPEC` calls the current state "already correct" while naming a field it does not return, so
at least one of the two sentences is wrong. This is not a judgment call: adding avatars would
publish **a photograph of a child to other children**, which is a field-minimisation and privacy
decision (`CLAUDE.md` §8, "output filtering and field minimisation") and therefore business
behaviour. Per §13, **not invented here.** `STU-6` is verified against the narrower reading and
the conflict goes to the client.

**Decision needed:** do classmate avatars ship? If yes it is a payload change plus a privacy ruling,
not a frontend change.

### `F13-3` — marketing imagery is still `picsum.photos`
`frontend/lib/site-content.ts` `photo()` returns `https://picsum.photos/seed/…`. Placeholder imagery
on the public marketing site. Out of scope (client-supplied content), recorded so it is not
mistaken for finished.

---

## 5. Gates

Baselines, corrected. My first measurement (726 unit / 325 e2e) was taken in the **main working
tree while it still held units 7 and 8's uncommitted edits** — `manage.controller.spec.ts` was 72
there against 62 at the commit, and `staff.e2e-spec.ts` 123 against 119. The worktrees branched from
the *commit*, not the dirty tree, so the real branch-point baseline was **721 unit / ~322 e2e**. The
`stu2` implementer said so and was right; I was measuring against a tree that was not the one being
built on. **Measure a baseline at the commit you branch from, not in a working tree you share with
other sessions.**

Final gates, run on a quiet machine on the merged `redesign` tree (both slices plus unit 7's two
newer commits):

| Gate | Result |
|---|---|
| `npm test --workspace=backend` | **738 passed, 41 files** |
| `npm run test:e2e --workspace=backend` | **329 passed, 4 files** |
| `npm run test:integration` | **153 passed, 1 file** — real PostgreSQL 15, 001..023 from empty, nothing skipped |
| `npm run lint` | 0 errors (4 pre-existing warnings) |
| `cd frontend && npx tsc --noEmit` | **0** |
| compiled stylesheet | all five marketing steps emitted and defined; **zero dead custom properties** |

**Spec counts across the merge** (the `B-ANN-3` check): only `manage.controller.spec.ts` changed,
72 → 75. **No spec file shrank.**

A note on measuring anything here while agents are running. Three implementers plus a `next build`
saturated the machine and vitest began dropping whole test *files* — one run reported 37 of 40 —
while bcrypt-heavy auth tests failed on `Test timed out in 5000ms`. Those were contention, not
regressions, and every one passed in isolation. **A count taken under load is not a measurement.**

e2e on this Windows box also exits `0xC0000409` (3221226505) at process teardown while reporting
every test passed; the `Tests N passed` line is the gate, not the exit code. Capturing it is its own
trap: a Git-Bash `> file 2>&1` redirect returns exit 127 and captures nothing, and PowerShell `*>`
dies at exit 9 with a truncated log. Letting it stream to the terminal and grepping the pipe is what
works.

Migration `023` was verified from an **empty** schema into a throwaway database, twice — once on the
slice branch and once on the merged tree. Note the credential: the password is `devpassword`
(`docker-compose.yml`), not `dev`. My brief said `dev`, and that error cost the implementer most of
an hour.
