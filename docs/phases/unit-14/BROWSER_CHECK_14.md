# Unit 14 — `GAUTH-C1` browser check

**Date** 2026-09-25 · **Branch** `redesign` at `af98363` · driven by the coordinator, presented to
the user for confirmation.

Not performed, and not a condition: a live Google round trip. It needs the client's Google Cloud
client (`docs/google-forms-setup.md` §A5a). What is checked here is every state
`components/account/google-sign-in-panel.tsx` can reach, in both directions and both themes.

## How it was driven

Ports 3000/3001/3101 were already held by other sessions, so a separate pair was started rather
than killed:

```
backend   PORT=3111  PERSISTENCE_DRIVER=postgres  DATABASE_URL=…/tahirelshazli
          GOOGLE_DRIVER=google  GOOGLE_SIGN_IN_REDIRECT_URI=http://localhost:3110/google/callback
          STAFF_GOOGLE_DOMAINS=tahirelshazli.com   (and again with it empty, for D-51)
frontend  NEXT_PUBLIC_API_URL=http://localhost:3111  next dev -p 3110
```

Against **real Postgres**, not the memory driver, so the linked state is a real
`user_google_identities` row rather than a stubbed response. Two rows were inserted for
`teacher-1` and `student-1` and **both were deleted afterwards** — `google_sub LIKE 'gauth-c1-%'`
returns 0. The tree under test was confirmed by curling `GET /auth/google/link` and reading the
`available`/`linked` shape before any screenshot was trusted. Both servers were killed at the end.

Sessions were seeded the way unit 13's check did it — `POST /auth/login` from the page context,
then `te.token` / `te.user` into `sessionStorage` — because the sign-in form does not respond to
synthesised events.

## What was checked

| Panel | State | LTR light | LTR dark | RTL light | RTL dark |
|---|---|---|---|---|---|
| Staff `/manage/account` | unlinked, available | ✓ | ✓ | ✓ | ✓ |
| Staff `/manage/account` | linked (+ `?google=connected` banner) | ✓ | — | ✓ | ✓ |
| Staff `/manage/account` | unavailable (`STAFF_GOOGLE_DOMAINS=`) | ✓ | — | — | ✓ |
| Student `/profile` | linked | ✓ | — | ✓ | ✓ |
| Student `/profile` | unlinked, available | ✓ | — | — | ✓ |

The loading and error branches were not forced; they are `Loader` and `InlineBanner`, both already
exercised elsewhere on these two pages.

## Result — no defect in either panel

- **The staff-only sentence appears only for staff.** "Staff accounts need an address on an approved
  domain" renders on `/manage/account` and not on `/profile`, which is `isStaffRole` doing its job.
- **`D-51` is visible, not just true in config.** With `STAFF_GOOGLE_DOMAINS` empty the API answers
  `available:false` for the teacher and `available:true` for the student, and the staff panel
  switches to the dimmer "not available for your account on this server" copy with no button. The
  copy names no reason, as its comment promises.
- **RTL does not reverse the linked line.** This was the specific risk — unit 8's defect was a
  fraction rendering backwards under `dir="rtl"`. Measured, not eyeballed: in RTL the email span sits
  at `x=199` and the `· connected Sep 25, 2026` span at `x=277`, so the reading order survives. The
  Latin email is not mirrored and the date is not transposed.
- **A linked account whose server has since turned staff sign-in off still shows Disconnect.** The
  panel tests `linked` before `available`, which is the right order: a stale link must remain
  removable.
- Trailing full stops appear at the start of a line under RTL ("`.Your password still works`"). That
  is bidi resolving an English sentence inside an RTL paragraph, it affects the pre-existing
  neighbouring panels identically, and it disappears with Arabic copy. Not a defect.

Two things that looked wrong and were not:

- The dark circle overlapping the rail footer is `NEXTJS-PORTAL`, the dev-tools indicator
  (`document.elementsFromPoint` confirms it). Dev-only chrome.
- A screenshot taken immediately after flipping `dir` live showed the grid unmirrored and clipped
  under the sidebar. It settles correctly on reload; it is a transition artifact of the flip, not a
  layout bug. **Re-check anything surprising on a settled render before reporting it.**

## One defect found, outside this unit — `F14-1`

Recorded, not fixed (CLAUDE.md §12: no unrelated refactors). See `docs/IMPLEMENTATION_PLAN.md`.

`frontend/components/theme-toggle.tsx` resolves the current theme from the OS when `data-theme` is
unset (`getSnapshot` → `systemTheme()`), but `app/tokens/fig-tokens.css` carries **no**
`prefers-color-scheme` block at all — `app/layout.tsx` says so deliberately: light is the default and
dark is an explicit opt-in. So on a machine set to dark with no stored choice, the page paints
**light** while the toggle reports **dark**: its label reads "Switch to light theme", and the first
click sets `data-theme="light"`, changing nothing the reader can see. Reproduced on this machine,
where `matchMedia('(prefers-color-scheme: dark)').matches` is `true`.

It is shell code from unit 4/5, not `GAUTH-1`, and nothing in this unit touches it.
