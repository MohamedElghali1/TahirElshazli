# The redesign — Claude Design handoff ⇄ this codebase

Branch `redesign`, cut from `6f66e44`. Supersedes `docs/frontend-design-system.md`, which
documented the Twenty-derived system now being replaced. Keep that file until the last screen
lands; it is the record of what the legacy implementation meant, and several of its warnings
(§12's half-mapped-scale trap in particular) apply verbatim to the new system.

Design project: `59f824fd-6470-4cb4-a675-7a756ef04a9f` (claude.ai/design).

## The split

> **CLAUDE DESIGN = visual / design-system source of truth.**
> **EXISTING CODEBASE = functionality source of truth.**

Nothing in `lib/` changes. The API client, the wire types, the session and data hooks, the
role helpers and the redirect guard are the contract with a backend that is not being
redesigned, and the redesign has no opinion about any of them.

| Preserved, untouched | Replaced wholesale |
|---|---|
| `lib/api.ts` — 14 namespaces, ~76 methods | `app/tokens.css` → `app/tokens/` |
| `lib/types.ts` — mirrors `backend/src/**` | `app/globals.css` |
| `lib/session.tsx` — `SessionProvider`, `useApi` | `components/ui/` |
| `lib/roles.ts` — routing + open-redirect guard | `components/app/`, `components/site/` |
| `lib/format.ts`, `catalog.ts`, `site-content.ts` | the JSX inside 39 pages + 6 layouts |

Every screen already follows one shape, which is why this is a component swap and not a
rewrite — the hooks and handlers stay, only what they render changes:

```tsx
const { data, error, loading, reload } = useApi((token) => api.x.y(token, id), [id]);
```

## How the handoff is consumed

The handoff's `.jsx` files are **inline-styled reference prototypes, not importable code**, and
both of its own documents say so:

> "Read them for exact structure, states and measurements; reimplement in the target stack."
> "Implement these primitives in this repo's own component conventions."

| Layer | Action |
|---|---|
| `tokens/*.css` | **Ported verbatim.** Done — `app/tokens/fig-tokens.css`, `app/tokens/semantic.css` |
| `assets/*.png` | Copy to `public/`. **Outstanding** — binary, needs the project zip |
| `components/**/*.jsx` | Reimplement as TSX + Tailwind v4 |
| `ui_kits/**`, `templates/**` | Read for structure and verbatim copy; never ported |

The handoff already assumes a Tailwind target — its own guidance names `text-fg`, `text-fg-2`,
`text-accent` as the utilities to use, which is the `@theme inline` pattern this repo already had.

### The one departure from verbatim

`semantic.css` hardcodes its four washes as literal black (`rgba(0,0,0,0.04)` and friends).
That is correct on the light surfaces every screen in the handoff is drawn against and
invisible on a dark one — a hover that paints nothing reads as a dead control. A marked,
additive `[data-theme="dark"]` block gives those four an alpha-white counterpart, mirroring the
ramp `fig-tokens.css` already uses for `--grays-gray-alpha-*` in dark. Delete the block and the
light theme is untouched.

## Token deltas — names that survive but change meaning

This is where a careless rename breaks the app silently.

| Token | Legacy | New |
|---|---|---|
| **spacing** | `--sp-1` = **4px** | `--space-1` = **2px** (whole scale shifts one step) |
| **motion** | `--dur-fast` 150ms, ease `(.2,0,.2,1)` | `--dur-fast` **80ms**, `--dur` 150ms, ease `(.4,0,.2,1)` |
| **line-height** | `--lh-tight` 1.1 / `--lh-base` 1.5 | `--lh-tight` **100%** / `--lh-body` **1.4** |
| radius | `--r-sm/md/lg` | `--radius-sm` 4 / `--radius` 8 / `--radius-pill` |
| heights | `--h-sm/md/lg/xl` | `--h-control-sm` 24 / `--h-control` 32 / `--h-control-lg` 40 / `--h-tag` 20 |
| ink | `--fg-primary…faint` | `--fg` → `--fg-5` |
| surfaces | `--bg-primary…quaternary` | `--surface` → `--surface-4` |
| status | `--chip-{tone}-{bg,fg}` | `--status-{green,amber,red,violet,blue}` + `-wash` |
| **type scale** | `--fs-xxs…xl` | **identical names and values** ✓ |
| **accent** | `#3E63DD` | **`#3E63DD` — identical** ✓ |

**Spacing is deliberately not redefined in `@theme`.** Tailwind's default numeric scale already
*is* this system's 4px grid — `p-0.5`=2 `p-1`=4 `p-2`=8 `p-3`=12 `p-4`=16 `p-6`=24 `p-8`=32
`p-12`=48 are the same eight values the handoff calls `--space-1..8`, indexed by pixels/4 rather
than by position. Page gutter 24 (`p-6`), panel padding 16 (`p-4`), table cell 8 (`p-2`).

**Amber has two values and using the wrong one fails contrast.** `--status-amber` `#F5D90A` is
a bright lemon and is ground only; amber *ink* is always `--status-amber-text` (`#946800`,
the 11-step). Aliased in `semantic.css` so no screen has to reach into the generated file.

## Rules — the handoff and CLAUDE.md agree

The design's five non-negotiables were arrived at independently and match §1, §5.1, §4.1, §4
and §8 exactly. The design **hardens** §5.1 by shipping `Score` as a primitive separate from
`Meter`: the legacy system had only `Meter` and relied on discipline to keep a grade off a bar.

1. No earnings widget anywhere (a Payments *page* may show amounts; a dashboard total may not).
2. Progress (`Meter`) and performance (`Score`) never merge — not a shared bar, column or average.
3. Status colour is not the accent. Indigo means *the one action here*.
4. Bilingual; nothing may assume Latin metrics or survive only in LTR.
5. Hiding a control is courtesy, never security.

Plus four the handoff adds, each of which has bitten a real build:

- **Never `text-[var(--x)]`** — Tailwind cannot tell a size from a colour, the size wins, and
  the colour is silently dropped. It typechecks, lints and builds. Use the named utilities.
- **One utility per property** — two `rounded-*` in one class string are resolved by stylesheet
  source order, not by the order written.
- **No card inside a card.** `Panel` is the application's one container.
- **No emoji, sentence case everywhere, a missing mark is an em-dash and never `0`.**

## Component map

| Legacy | New |
|---|---|
| `Button` / `ButtonLink` | `Button` (primary/secondary/tertiary × default/danger/blue × small/medium), `LightButton`, `FlowButton`, `DropdownButton`, `ButtonGroup`, `Link` |
| `IconButton` | `IconButton`, `LightIconButton`, `IconGroupButton`, `FloatingButton` |
| `Chip` + `ChipTone` | `Tag` (state) **and** `Chip`/`LinkChip` (entity) — now two different things |
| `Panel` / `Separator` | `Panel`, `Divider`, `SectionTitle` |
| `Metric` | `StatNumber` |
| `Meter` | `Meter` — completion only |
| — | **`Score`** ← new; marks. Makes rule 2 enforceable rather than remembered |
| `Skeleton` / `RowsSkeleton` | **deleted** — "no skeleton pattern is defined; prefer `Loader` inside the panel that is loading" |
| `EmptyState` / `ErrorState` | `EmptyState`, `Callout accent="danger"`, `Banner` |
| `Field`/`Input`/`Textarea`/`Select` | `TextInput` (w/ `error`), `TextArea`, `Select`, `SearchInput`, `Counter`, `Calendar` |
| `Tabs` | `TabList` |
| `app/table.tsx` | `Table` (+ `onRowClick`), `TableToolbar` |
| `app-shell.tsx` | `NavItem size="lg"` + `NavSection` + shell |
| `page-parts.tsx` | `PageHeader`, `Breadcrumb`, `SectionTitle` |
| `@phosphor-icons/react` | **Tabler**, stroke 1.6, local path data (115 glyphs) |
| `motion` (framer) | **dropped** — "colour and opacity only; no transforms, no springs, no bounce" |

Two runtime dependencies come out (`@phosphor-icons/react`, `motion`) and none go in.

## Navigation — the decided IA

**Student** (248px sidebar, `--surface-3` ground, **no right border**, white-pill active item,
52px sticky crumb header, 1080px cap, 96px bottom padding to clear the WhatsApp button):

> course switcher · **Sections**: Overview · My lessons · Quizzes · Homework · Marks · Timetable ·
> Attendance · **More**: Classmates · Settings · Help

The handoff draws this for a single-course student. The course switcher is carried over from the
console kit — §7.3 puts a student at one to three courses, which is a switch, not a dropdown.

**Console** (244px `--surface-2` sidebar with a right border, 52px crumb header):

> course switcher · search · **Main**: Overview · **People**: Students `count` / Groups /
> Assistants\* / Assistant activity\*  · **Teaching**: Tasks / Draft tasks / Marks / Reports `count` ·
> **Sessions**: Live sessions / Draft timetable / Recordings · **Communication**: Announcements ·
> **System**: Settings\* / Account   (\* teacher only — courtesy, not access control)

## Coverage

### Maps cleanly — the design and the backend already agree
Console overview · roster · groups · assistants · assistant activity (audit log) · submissions ·
recordings + upload + detail · announcements · student homework and its four attempt states ·
materials · classmates (names only — an exact match) · marks/report period + PDF · marketing
homepage · sign in.

### Designed, but no backend
| Screen | Why |
|---|---|
| **Quizzes + runner** | Quiz engine unbuilt — `Question`, `QuestionOption`, `QuizAttempt`, `Answer` do not exist |
| Staff **Reports** / ReportViewer | No `ReportRun`; §11's "can a TA generate reports" is still open |
| **Draft tasks** / **Draft timetable** | No draft status on `AuthoredAssessment` or `LiveSession` |
| **MarkingView** (PDF annotation) | `annotatedFileUrl` is read-only; nothing writes it (§5.5 unbuilt both sides) |
| **Registration approval** | The console designs accept/reject; the app has §7.2 open self-enrollment |
| Staff **Live sessions** week grid | Backend routes exist; `lib/api.ts` has no admin live-session methods |
| Settings → **Google** tab | Migration 009 exists; no client API |
| Student **profile photo** | `avatarUrl` exists; the upload endpoint is staff-only |
| Student **Help** | Frontend + a config link only |

### Built here, never designed
`/catalog` (§7.2 self-enrollment) · `/achievements` ×2 · `/notifications` (the design makes it a
bell + `Menu`, not a page) · `/manage/blog` ×2 · marketing about / contact / courses / blog ·
register / forgot / reset password.

Derivations the handoff supplies for these: blog → marketing scale; auth → the sign-in card with
different fields; notifications → `Menu` + `MenuSection` + `NotificationCounter`; blog authoring →
the `TaskAuthoring` single-panel shape.

## Decisions taken (2026-09-18)

1. **Student IA** — adopt the design's flat sidebar and add the console's course switcher.
   `/learn/[id]/*` collapses into top-level routes scoped by the selected course.
2. **Quizzes** — drive the design's four featured-quiz states from the existing
   `work_type: 'google_form'` + `external_results` + `SyncStatus` feature rather than building a
   quiz engine. The design's *Being marked* / *Completed* / "figures are understated" states map
   onto mirrored-form data almost exactly, and §5.8 already forbids in-platform submission of
   form work — which is the same boundary the design draws.
3. **Attendance** — migrate `attended: boolean` to a three-state enum now, while there is still
   one read-side. §11 warns the cost only rises; the design settles the question it was waiting on.
4. **Modals** — promote the kit's proposed `Modal` / `SlideOver` / `ConfirmDialog` / `Toast` into
   `components/feedback/`. The console needs six and the alternative is redesigning those flows.

## Still open

5. **Registration model.** The console designs an approval queue; §7.2 ships open
   self-enrollment and calls itself "a testing posture, not the business model", with payment
   expected to become the precondition. An approval queue is a third model. Client's call.
6. **Mobile.** One breakpoint (768px) is declared and **no screen is drawn at it.** The handoff
   names this "the largest open risk in the spec" and students are phone-first.
7. **Dark mode.** The design is light-first and ships dark only as `[data-theme="dark"]` with no
   `prefers-color-scheme` fallback, so a device set to dark gets light unless the reader toggles.
   Every measurement in SCREENS.md is light-mode, and `Button` primary uses `--fg-invert` for its
   label unconditionally — which is white on indigo in light and **dark on indigo in dark**.
   Either commission a dark pass or ship light-only; the toggle currently keeps working.
8. **Destructive confirmation copy** — decision 4 gives us the primitive, not the wording.

## Build order

0. **Tokens + assets** — one commit, nothing else until it lands ✅ *(tokens done; assets pending)*
1. Primitives — ~26 of 67, on demand
2. Console: shell → students → task results → tasks → mark book
3. Student: shell → overview → lessons + detail → homework + 4 states → quizzes → marks →
   timetable → classmates
4. Settings → reports → timetable
5. Marketing + sign in
6. Adherence audit after each screen — the eight questions in the handoff's
   `IMPLEMENTATION-STEPS.md` §7, which is where this system gets broken in practice
