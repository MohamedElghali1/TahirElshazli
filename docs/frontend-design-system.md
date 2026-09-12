# Frontend design system

The contract between the reference design and this codebase. When a component
and this document disagree, one of them is a bug — say which.

Everything below is implemented in `frontend/app/tokens.css` and consumed
through `frontend/components/ui/`. No component in the tree contains a raw hex
value or an off-grid pixel.

---

## 0. Where the values come from, and what could not be read

**The reference** is the Twenty design system:
`figma.com/design/xt8O9mFeLl46C5InWwoMrN`, node `114219-670481`. That node is a
frame named **"Settings Cards"** inside section *08 · Settings* on the
**Components** page — the file is a component library, not a set of screens. Its
sections are `01 · Foundations` through `09 · Examples & source assets`, plus
separate **Standard App** and **Views** pages.

**The Figma MCP server could not be used.** The authenticated account
(`whoami`: handle `mm`, plan *"Mohamed AL Ghali's team"*) holds a **View** seat,
and every MCP call returns *"Looks like you don't have edit access to this
file."* The Dev Mode MCP requires an edit seat. The file was instead opened in a
browser, where a View seat renders it and the canvas itself confirms the
constraint: *"You can only view and comment on this file."*

**So numeric values are transcribed from the generated token source** in
`twentyhq/twenty@main`, `packages/twenty-ui/src/theme/constants/*`. Those files
carry the header *"Generated from design-tokens by
scripts/generateThemeTokens.ts"* — they are the compiled Figma variables, not a
second-hand copy. Where both sources could be read, they agree: the Foundations
→ Typography frame reads `Title 1 – SB 24px / Title 2 – SB 20px / Title 3 – SB
16px / Big – Medium 16px / Base 13px / Small 12px`, which is exactly the rem
scale in the source resolved against its 13px root.

**Colour space.** Twenty authors in `color(display-p3 …)`. Converting those to
sRGB reproduces the Radix Colors scales they were built from — `#3E63DD` is
Radix Blue 9, `#30A46C` is Green 9 — which is itself a check on the conversion.
sRGB is the base value here so nothing depends on wide-gamut support; the P3
originals are layered back on under `@supports` for displays that can show them.

**If someone later gets an edit seat**, re-run the MCP against `01 · Foundations`
and diff it against this file. Nothing here should move, but it would close the
one gap.

---

## 1. Typography

Family is **Inter** — the reference system's own `font.family`, loaded through
`next/font/google` in `app/layout.tsx`. It is not a substitution; the scale below
was measured against it. Arabic falls through to Noto Sans Arabic (CLAUDE.md §4
warns content may be bilingual, so nothing assumes Latin metrics).

Geist Mono is kept for **numerals only** — marks, percentages, durations, dates —
via the `.num` class. Columns of scores need tabular figures. Twenty uses DM Mono
but only inside code blocks, which this product does not have.

| Token | Value | Reference role | Used for |
|---|---|---|---|
| `--fs-xl` | 24px / 600 | Title 1 | `PageHeader` — the page `<h1>` |
| `--fs-lg` | 20px / 600 | Title 2 | rare; reserved |
| `--fs-md` | 16px / 600 \| 500 | Title 3 / Big | `SectionIntro`, `EmptyState` title |
| `--fs-base` | 13px / 400 | Base | **the workhorse** — body, buttons, tabs, cells, tags |
| `--fs-xs` | 12px / 500 | Small | field labels, table headers, hints |
| `--fs-xxs` | 11px | Label | the smallest thing that ships |

Line heights: `--lh-tight` 1.1 (`text.lineHeight.md`), `--lh-base` 1.5
(`text.lineHeight.lg`). Weights: 400 / 500 / 600.

**Deviation — px, not rem.** Twenty sets `html { font-size: 13px }` and expresses
sizes in rem. The computed pixels here are identical, but px avoids re-basing
every rem-valued Tailwind utility in the app. Documented rather than silent.

**Ours — the marketing scale.** `--fs-body` 17 · `--fs-lead` 20 · `--fs-h3` 24 ·
`--fs-h2` 34 · `--fs-h1` 48 · `--fs-display` 68. Twenty has no marketing design,
so this is an extension, not a deviation. It is scoped to `[data-surface="site"]`.
**The LMS never touches it; the marketing site never touches `--fs-base`.**

---

## 2. Colour

Semantic names, never appearance names. Both themes define every token; the
`@media (prefers-color-scheme: light)` block covers the no-attribute default.

### Surfaces and text

| Token | Dark | Light | Reference |
|---|---|---|---|
| `--bg-primary` | `#171717` | `#FFFFFF` | `background.primary` |
| `--bg-secondary` | `#1B1B1B` | `#FCFCFC` | `background.secondary` — cards |
| `--bg-tertiary` | `#1D1D1D` | `#F1F1F1` | `background.tertiary` — hover |
| `--bg-quaternary` | `#222222` | `#EBEBEB` | `background.quaternary` — pressed |
| `--border-light` | `#1D1D1D` | `#F1F1F1` | row hairlines |
| `--border-medium` | `#222222` | `#EBEBEB` | card and control edges |
| `--border-strong` | `#484848` | `#D6D6D6` | hovered / editable outline |
| `--fg-primary` | `#EBEBEB` | `#333333` | `font.color.primary` |
| `--fg-secondary` | `#B3B3B3` | `#666666` | `font.color.secondary` |
| `--fg-tertiary` | `#818181` | `#999999` | `font.color.tertiary` |
| `--fg-muted` | `#666666` | `#B3B3B3` | `font.color.light` |
| `--fg-faint` | `#4C4C4C` | `#CCCCCC` | `font.color.extraLight` |

The four-tint text ramp carries hierarchy **instead of font size**. That is the
single most load-bearing idea in this system: almost everything is 13px, and what
separates a heading from a caption is which tint it is.

### Accent

`--accent` is `#3E63DD` in **both** themes — that is what a Radix 9-step is for:
the one value that holds either way. Hover, press and the text-on-dark variant
differ per theme (`--accent-hover`, `--accent-press`, `--accent-text`).

> **This overrides CLAUDE.md §4's gold.** The client brief fixed the brand at
> black / white / dark grey / gold. The instruction on 2026-09-12 was to take
> the reference system's accent as well — "go full indigo" — so §4 has been
> amended rather than left contradicting the code. Reverting is one block of
> `--accent-*` values; nothing else in the system depends on the hue.

### Status tags

`--chip-{tone}-bg` / `--chip-{tone}-fg` for `neutral · blue · green · red ·
amber · violet · teal`, taken from the reference's `tag.background` / `tag.text`.

**Status colour is not the accent.** Indigo means *"the one action here"*; a tag
means *"this is the state of that thing"*. Blue exists in both lists because the
reference's own tag scale includes it — a blue tag is accent-*coloured*, never
accent-*meaning*. Confusing the two is how a screen ends up with four blues.

---

## 3. Spacing

`spacingMultiplicator` is 4 and every value is a multiple of it: `--sp-1` 4 →
`--sp-32` 128. `--gap-siblings` is 2px (`betweenSiblingsGap`), the separation
between adjacent dense rows that must not read as a border.

Page gutter `--sp-6` (24px). Panel padding `--sp-4` (16px). Table cells `--sp-2`
(8px) inside an `--sp-2` scroll-container margin — that split is deliberate: the
cell padding is the click target, the container margin is the optical alignment
that lines the first column up with a Panel's own 16px edge.

## 4. Radius

`--r-xs` 2 · `--r-sm` 4 · `--r-md` 8 · `--r-lg` 16 · `--r-xl` 20 · `--r-xxl` 40 ·
`--r-full` 999. Exactly `border.radius`.

Buttons, inputs, cards and nav items are all **`--r-md` (8px)**; tags are
`--r-sm` (4px). The previous implementation ran one step large throughout —
16px buttons reading as pills — and correcting that is the single most visible
change in this rebuild.

**Two exceptions, added in the 2026-09-12 shell pass.** `Button`
`variant="primary"` at `size="sm"` - the reference's own small filled button,
e.g. `+ Live Session` - carries `--r-lg` (16px) instead, with a 1px
`--accent-edge` border replacing the transparent one every other size and
variant keeps; every other primary size is unchanged. And the main panel's own
top-left corner uses a radius with no step in the scale above it: `--r-panel`
(32px), set once on the shell in `AppShell` and nowhere else.

## 5. Shadows

`--shadow-sm` = `boxShadow.light`, `--shadow-lg` = `boxShadow.strong`. Used
sparingly; the system separates surfaces with borders, not elevation.

## 6. Breakpoints

The reference ships **one**: `MOBILE_VIEWPORT = 768`, exposed as
`--breakpoint-mobile`. Tailwind's defaults remain available, but design decisions
are made at that one line.

**Not adopted:** Twenty scales the whole UI on phones with `html { zoom: 14/13 }`.
That is a CRM-desktop decision; this product's marketing site must not be scaled
by a viewport rule.

## 7. Control sizes

| Token | Value | Applies to |
|---|---|---|
| `--h-tag` | 20px | `Chip` |
| `--h-sm` | 24px | small `Button`, `IconButton size="sm"` |
| `--h-md` | 32px | **the default control** — `Button`, `Input`, `Select`, `Avatar`, table row |
| `--h-lg` | 40px | `Tabs`, marketing `Button`, marketing control (`uiSize="lg"`) |
| `--h-xl` | 48px | marketing hero button |

Icons: `--icon-sm` 14 · `--icon-md` 16 · `--icon-lg` 20 · `--icon-xl` 24.

Chrome (ours), rebuilt to Twenty's own measurements in the 2026-09-12 shell
pass: `--rail-w` 220px (was 248), `--topbar-h` 40px (was 56 - now the single
page-header bar for `/manage/*`, via `components/app/page-chrome.tsx`),
`--rail-w-collapsed` 56px (the rail's own icon-only state), `--h-nav` 28px (a
nav row is shorter than the app's default 32px control and gets its own token
rather than repurposing `--h-md`).

`--sp-nav-x` (6px) is the **one value in the file off the 4px grid**, and it is
measured rather than chosen: it is the nav item's inline padding in the
reference's sidebar. It is named so that the exception lives in one place
instead of as a `px-[6px]` somewhere in the shell.

`Avatar` gained a third size in the same pass: `xs`, 16px, and the only one
drawn as a rounded **square** (`--r-sm`) rather than a circle. It is the
workspace mark in the rail's top chip — a circle there reads as a person, and
what it stands for is an organisation.

---

## 8. Interaction states

- **Focus** — `outline: 2px solid var(--accent); outline-offset: 1px` on
  `:focus-visible`, applied globally in `globals.css`. An outline follows the
  element's own radius and is never clipped by an ancestor's `overflow: hidden`,
  which a box-shadow ring is. **Never `outline: none`** without moving the
  indicator somewhere visible — `CourseCard`'s stretched link moves it to the
  `::after` box that covers the card.
- **Hover** — every hover paint sits inside `@media (hover: hover)`. A tap leaves
  `:hover` stuck until the next tap lands elsewhere, so a phone would otherwise
  keep a row highlighted after a tap.
- **Active** — one step further into the surface ramp (`--bg-quaternary`).
- **Disabled** — `opacity: .45` plus `pointer-events: none`.
- **Reduced motion** — all animation and transition collapsed to 0.01ms.

## 9. Accessibility

- Every control reaches 4.5:1 against its own surface in both themes.
- `IconButton` takes a **required** `label` — an icon-only control with no
  accessible name is invisible to a screen reader, and a required prop is
  cheaper than remembering.
- One `<h1>` per page. On the student LMS the page's own `PageHeader` still
  owns it; on `/manage/*` (2026-09-12 shell pass) it moved into `AppShell`'s
  single 40px header, set by the page via `<PageTitle>`
  (`components/app/page-chrome.tsx`) rather than drawn in the page body - the
  two consoles share one shell and only one of its headers, so the `<h1>`
  cannot live in both places at once. A tab's own body uses `SectionIntro`
  (`<h2>`) either way.
- Rosters and grading queues are real `<table>`s, so a screen reader announces
  "row 4, Average, 82%" rather than a wall of divs.
- Hiding a nav entry is **courtesy, never access control** (CLAUDE.md §8).

## 10. Figma component → project component

| Reference | This project | Notes |
|---|---|---|
| Button (primary / blue) | `<Button variant="primary">` | filled accent; one per screen |
| Button (secondary) | `<Button variant="secondary">` | transparent body, visible edge |
| Button (tertiary) | `<Button variant="ghost">` | no edge, dense toolbars |
| Button (danger) | `<Button variant="danger">` | |
| IconButton | `<IconButton label="…">` | required accessible name |
| MainButton | `<Button variant="primary" size="md">` | auth screens; also 32px |
| Input / Textarea / Select | `<Input> <Textarea> <Select>` | `uiSize="lg"` for marketing |
| Tag | `<Chip tone="…">` | status only, never the accent |
| Card | `<Panel>` | the app's one container — no card inside a card |
| Tabs | `<Tabs items base label>` | one component; replaced two near-copies |
| Avatar | `<Avatar name size>` | initials until photography exists |
| ProgressBar | `<Meter>` | **completion only, never a grade** (CLAUDE.md §5.1) |
| Section | `<SectionIntro>` | `<h2>` under a layout-owned `<h1>` |
| HorizontalSeparator | `<Separator>` | |
| EmptyPlaceholder / ErrorPlaceholder | `<EmptyState> <ErrorState>` | |
| — | `<Metric>` | ours: one number read at a glance |
| — | `<RowsSkeleton>` | ours: rows shaped like the table they stand in for |

**Deliberately not built**, though the reference has them: Tooltip, Dropdown,
Dialog, Popover, Switch, Radio, Command-K. This application does not use them,
and CLAUDE.md §9 is explicit that a listed feature is not a requested one.

---

## 11. Architecture

```
app/tokens.css            values only
      ↓
components/ui/*           primitives — no business logic, no API types
      ↓
components/app|site|blog  domain components
      ↓
app/(site|app|auth)/**    pages
      ↓
lib/api.ts, lib/session   data
```

A primitive that knows what an `Enrollment` is has stopped being a primitive.
`components/ui/index.ts` is a barrel so `@/components/ui` keeps resolving after
the single 423-line file it replaced was split one component per file.

**Two surfaces, one token file.** The LMS uses the 13px product scale; the
marketing site opts out via `[data-surface="site"]`. Auth sits between the two —
marketing typography, product-density controls — and says so in its layout.
