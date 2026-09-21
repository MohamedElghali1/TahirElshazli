# Phase plan — unit 4: Shells

**Planner:** Claude (orchestrator, custom units-3-5 pipeline — see `docs/phases/unit-3/PHASE_PLAN.md`
header and `CHANGELOG.md` `D-24`) · **Date:** 2026-09-21 · **Branch:** `redesign` · **Base:** `16efdd9`
**Input read:** `PHASE_ROADMAP.md` §4 (unit 4), `IMPLEMENTATION_PLAN.md:179-187` (`SHELL-1..5`),
`CLAUDE.md` §4.1/§11/§11.1, `docs/redesign-mapping.md` (full), `components/ui/` (all 12 primitive
files + `index.ts`), the current `components/app/app-shell.tsx` and `app/(app)/layout.tsx`, a fresh
`npx tsc --noEmit` baseline.

---

## 0. Headline — read this before §1

**This unit is too large for one dispatch**, for the same shape of reason unit 2 was split into
2a/2b (`docs/phases/unit-2/PHASE_PLAN.md` §0) — recorded here rather than discovered mid-run.
Current `npx tsc --noEmit` baseline: **401 errors, `lib/` still 0** — `app/` 314, `components/site`
15, `components/app` 11. `components/app/*` is imported by **32 files**, `components/site/*` by
**10 files** — together that is nearly every route in the app. `SHELL-4`'s own exit bar
("frontend builds again from here") is a claim about the **whole frontend**, not just the two shell
components, so this unit's real scope is: build the two new shells, then **port every existing
page off the deleted legacy components**, then delete the legacy components for real and confirm
zero errors. **Split into four sequential slices, each independently reviewed and landed** (§5).

**What "port" means for a page this unit does not otherwise redesign.** `docs/redesign-mapping.md`'s
own Build order sequences whole-screen redesigns *after* the shells (`2. Console: shell → students →
…`, `3. Student: shell → overview → …`), and `PHASE_ROADMAP.md` gives most screens their own later
chat unit (5 People, 6 Tasks, 7 Marking, 8 Sessions, 9 Reports, 10 Announcements, 13 Student
surface/public site). Unit 4 is not those units. For a page with no chat unit of its own yet, "port"
means: swap every import from `components/app/*`/`components/site/*` to the equivalent
`components/ui/*` primitive per `redesign-mapping.md`'s component map, keep the existing data hooks
and business logic completely untouched (`redesign-mapping.md`: "the hooks and handlers stay, only
what they render changes"), and get it compiling and functionally correct under the new shell. It is
**not** a pixel-perfect redesign of that screen's content — that arrives with its own chat unit.
Where a screen's owning chat unit *is* in this pipeline's near future (none currently — 5 comes
after this), no such case applies yet.

**`SHELL-5` folded into this unit's scope**, though `PHASE_ROADMAP.md`'s unit-4 scope line only
names `SHELL-1..4`. Reasoning, disclosed rather than silently assumed: `SHELL-5`'s own dependencies
(`SHELL-2`, `DOM-4`) are both satisfied, its target file (`app/(auth)/register/page.tsx`) is
necessarily touched by this unit's own port work regardless (`components/site/*` deletion), and
leaving it out would land a register screen that still assumes the pre-`DOM-4` API contract —
`POST /auth/register` has returned `201 {status:'waiting'}` with no token since unit 2b-i
(`20580a1`) — which is not "not yet redesigned," it is **broken**. `CLAUDE.md` §13: "never declare
completion on the basis of compilation."

---

## 1. Scope

### IN

| Ticket | What |
|---|---|
| `SHELL-1` | Console shell: 244px `--surface-2` sidebar with a right border, course switcher, search, six nav sections (Main/People/Teaching/Sessions/Communication/System per `redesign-mapping.md:142-147`), 52px sticky crumb header. |
| `SHELL-2` | Student shell: 248px `--surface-3` sidebar, **no right border**, white-pill active item (`NavItem appearance="pill"`, already built), course switcher, 52px crumb header, 1080px content cap, 96px bottom padding for the WhatsApp FAB. |
| `SHELL-3` | Flat student IA: `/learn/[id]/*` collapses to top-level routes (`/overview`, `/lessons`, `/quizzes`, `/homework`, `/marks`, `/timetable`, `/attendance`) scoped by the selected course via the shell's course switcher, per `redesign-mapping.md` Decision 1. |
| `SHELL-4` | Delete `components/app/*`, `components/site/*`, and every now-dead legacy page. Zero `tsc`/lint errors after. |
| `SHELL-5` | Register screen shows the waiting-for-approval state from `register`'s own `201` body — never navigates to a dashboard, never assumes a session. Login and `JwtStrategy` already return the two deliberately indistinguishable messages (`CLAUDE.md` line refs in `PHASE_ROADMAP.md:187`) — the UI must not try to tell waiting/rejected/wrong-password/deleted apart. |

### OUT, and why

| Not in scope | Reason |
|---|---|
| Pixel-perfect redesign of any screen's *content* (dashboard cards, roster table styling, course detail, etc.) | Each has its own later chat unit per `PHASE_ROADMAP.md`. This unit ports the plumbing, not the room. |
| Quizzes, draft tasks/timetable, MarkingView annotation, registration-approval queue, admin live-session week grid, Settings→Google, student photo upload | `redesign-mapping.md` §"Designed, but no backend" — no backend exists yet; out of every unit until its own dependency lands. |
| Mobile layout, dark-mode commissioning | `redesign-mapping.md` §"Still open" 6/7 — client decisions, not this unit's to make. Build desktop-first per the handoff; do not regress the existing theme toggle. |
| A new abstraction for "page chrome" beyond what already exists | `PageChromeProvider`/`usePageChrome` already does this job and is preserved, not rebuilt — see §2. |

---

## 2. Design — reuse, don't reinvent

**Primitives are already built** (`components/ui/`, unit 2a): `NavItem`/`NavSection` (already sized
for exactly this — "Both consoles use `lg`", `appearance="pill"` already exists for the student
rail), `Panel`, `PageHeader`/`Breadcrumb`, `Avatar`, `IconButton`, `Icon` (115 Tabler glyphs),
`Tag`, `Table`, `Score`/`Meter`, `Banner`/`Callout`/`Loader`/`EmptyState`, `TextInput` etc. **Do not
fork or re-derive any of these.** Read `components/ui/index.ts` first.

**Business logic to carry over unchanged from `components/app/app-shell.tsx`**, re-expressed with
the new primitives and measurements:
- `navFor(role)` — the role-gated nav array, now split into the console's five sections
  (Main/People/Teaching/Sessions/Communication/System) vs. the student's flat list, per
  `redesign-mapping.md:136-147`. `*` items (Assistants/Assistant activity/Settings) are
  teacher-only **courtesy**, not access control — `CLAUDE.md` §7's "hiding is not security" applies
  verbatim; the server-side `@Roles` guard is unchanged and unrelated to this unit.
- `PageChromeProvider`/`usePageChrome` (`components/app/page-chrome.tsx`) — the per-page
  title/back-link/actions contract every existing page already calls. **Keep this file and its
  contract**; only the header markup that consumes it moves into the new shell. Moving it is a
  `components/app/*` deletion candidate in slice 4d *only if* every remaining consumer has been
  ported to something else by then — check before deleting.
- The notifications-unread badge (`useApi` call gated on `!staff`), the mobile off-canvas sheet
  (`open`/`setOpen`, closes on route change), the collapse toggle, sign-out — all preserved
  behaviour, new markup.
- `AppLayout`'s routing guard (`app/(app)/layout.tsx`) — the staff/student redirect logic is
  correct and untouched; only the loading-state markup and the `<AppShell>` it renders change.

**Course switcher** — new to this codebase (`redesign-mapping.md:139-140`: "carried over from the
console kit", a switch not a dropdown since a student holds 1-3 courses). No existing primitive for
this; build the smallest correct control (a small `NavItem`-styled row list or `Select`, whichever
reads closer to the handoff's own structure — inspect the handoff project if reachable, otherwise
match `redesign-mapping.md`'s own description and keep it a switch, not a multi-level dropdown).

**Flat student IA (`SHELL-3`)** — `/learn/[id]/*` (`page.tsx`, `assessments/`, `materials/`,
`recordings/`, `report/`, `sessions/`) collapses to top-level routes matching the nav list
(`/overview`, `/lessons`, `/quizzes`→ existing achievements/catalog stay where they are unless the
nav list says otherwise, `/homework`, `/marks`, `/timetable`, `/attendance`), with the course
selection carried by the shell's course switcher (client state or a route segment — pick whichever
keeps `lib/api.ts` calls unchanged; this is layout, not a wire-format decision, `lib/` stays
untouched per `redesign-mapping.md`'s own split). Existing page content/data-fetching moves,
verbatim in logic, to its new route file.

---

## 3. Slices — each is its own dispatch, review, and commit

**4a — New shells, additive only.** Build the console shell, student shell, and course switcher as
new components (e.g. `components/shell/`) using `components/ui/*` primitives. Wire `app/(app)/layout.tsx`
to render the new shell instead of the old `AppShell`. **Nothing deleted yet** — `components/app/*`
and `components/site/*` still exist, untouched, for pages not yet ported (marketing, and any
`(app)` page not yet touched). This slice alone should not reduce the error count much (existing
pages still import the old components) but must not *increase* it, and must render a working,
navigable shell for both a student and a staff session.

**4b — Flatten student IA (`SHELL-3`) + port every `app/(app)/*` page.** Collapse `/learn/[id]/*`
into the new top-level routes. Port all 32 files currently importing `components/app/*` (per the
grep in §0) onto `components/ui/*` and the new shell's chrome contract. Expect the `app/` error
count to fall sharply; `components/app` errors should reach 0 once every consumer is ported (do not
delete the directory yet — that is 4d, after confirming nothing still imports it).

**4c — Port every `app/(site)/*` + `app/(auth)/*` page, and build `SHELL-5`.** 10 files import
`components/site/*` today (`app/(site)/{page,about,blog,blog/[slug],contact,courses,courses/[slug]}.tsx`,
`app/(site)/layout.tsx`, `app/(auth)/layout.tsx`, plus `app/(app)/manage/blog/[id]/page.tsx` which
reuses a site component for its editor — check whether that one stays on a site primitive or moves
to a `components/ui/*` equivalent, and record which). This is the mechanical port only — full
marketing-specific redesign is chat unit 13's job (`redesign-mapping.md` Build order step 5); this
slice must compile, preserve the marketing site's own 17px type scale as a *visual* choice (still
sourced from the ported tokens, not reintroduced as literals — `CLAUDE.md` §11's two-scale rule is
about tint/size discipline within the console, not a license to hardcode marketing typography), and
not regress any marketing functionality. `app/(auth)/register/page.tsx` gets `SHELL-5`'s actual
behaviour change here, not just a component swap.

**4d — `SHELL-4` for real.** Delete `components/app/*`, `components/site/*`. Grep the whole
`frontend/` tree for any remaining import of either path — zero tolerance, per this unit's own exit
criterion. Delete any page left with no route or no content (only if slices 4b/4c leave one
genuinely dead — do not delete a page that still has a route). Run `npx tsc --noEmit` and
`npx eslint .` in `frontend/` to a **clean** result — this is the hard gate this unit exists to
close (`CLAUDE.md` §4.1).

Each slice gets its own brief, its own dispatch, and its own review before the next starts — same
protocol as unit 3, adapted for size the way unit 2 was.

---

## 4. Definition of done for this unit

Universal criteria (`PHASE_ROADMAP.md` §3) plus: **`npx tsc --noEmit` and `npx eslint .` clean in
`frontend/`** (this unit's own hard gate, `CLAUDE.md` §4.1) · no import of `components/app/*` or
`components/site/*` remains anywhere · role-based nav hiding documented as courtesy with the
server-side `@Roles` guard named at each hidden item · both themes checked (existing toggle, no
regression — commissioning a full dark pass is explicitly out of scope, §1) · `dir="rtl"` checked
on the new shells specifically (the existing shell already handles RTL rail-flipping; carry that
forward, don't drop it) · backend suite untouched and still green (this unit is frontend-only,
confirm nothing broke by accident).

---

## 5. Process note

Given Antigravity's account quota is exhausted (`~4.5h` from 2026-09-21 04:45 UTC, per unit 3), and
per the user's standing instruction for this pipeline, each slice below is implemented by a fresh
Claude Code subagent (`model: sonnet`) rather than Antigravity, still under ponytail (full) and
still reviewed independently by this orchestrator session before landing. If Antigravity's quota
resets before slice 4d, either implementer may be used for the remainder — the review bar is
identical either way.

## 6. Open items, disclosed rather than guessed silently

- **B-5**: the course switcher has no existing primitive to reuse; built new in 4a per the sizing
  in `redesign-mapping.md`. Flag if the handoff project (`59f824fd`) turns out to specify exact
  measurements this plan didn't have access to.
- **B-6**: `app/(app)/manage/blog/[id]/page.tsx`'s use of a `components/site/*` editor component is
  unusual (a manage-surface page reaching into the marketing component tree) — resolve which side
  it belongs to in slice 4c and record the reasoning, don't silently pick one.
- **B-7**: whether any currently-`components/app/*`-backed page has no real screen owner yet in the
  redesign at all (i.e. genuinely dead) is unknown until slice 4b's per-file audit; if one turns up,
  it is a `SHELL-4` deletion candidate, not a port target — record which, don't guess.
