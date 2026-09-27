# Frontend Audit — Dr. Tahir LMS (Agent B)

Read-only source audit. Status legend: IMPLEMENTED BUT UNVERIFIED (calls real lib/api.ts, not run in browser here) | MOCKED (fake data presented as real) | FRONTEND ONLY (no backend call at all, e.g. static/dead) | BROKEN (evident bug/crash path) | PARTIALLY IMPLEMENTED (some paths missing: no error/empty state, dead button, etc).

Known/out of scope per lead: recordings are just links (Bunny out of scope) — recording-player.tsx Bunny branch and manage/courses/[id]/recordings/page.tsx:291 "signed per request" hint already reported, not repeated here.

## 0. Global/shell findings (checked first)

- No `app/not-found.tsx`, `app/error.tsx`, or `app/global-error.tsx` anywhere in `frontend/app/`. A thrown render error or unmatched route falls through to Next's default boundary, not a themed page.
- `frontend/app/layout.tsx`: `<html lang="en" dir="ltr" ...>` is hardcoded. No locale/RTL toggle exists anywhere in the app (grepped for `te.lang`, `locale`, `toggleLang`, `dir={` state — none found). Several components already carry RTL-specific bug fixes (`console-shell.tsx:178-180`, `student-shell.tsx:91-93`, `semantic.css:197`) implying `dir="rtl"` is meant to be settable, but nothing ever sets it. CLAUDE.md §11 "nothing may assume Latin metrics or survive only in LTR" — currently the whole app is LTR-only by construction, RTL readiness is untestable because there is no way to reach it outside devtools.
- `(app)/layout.tsx` (`components/shell/*`) client-side role redirect: courtesy only per its own comment, correctly deferring real enforcement to the backend — sound.

## 2. Findings (filed as found; numbered FE-01..)

### FE-06 — P1 — Assistant group-scope checkboxes render with no visible label at all
**File:** `frontend/app/(app)/manage/assistants/page.tsx:186-203` (`ReachFields`, used by both `InvitePanel` and `EditPanel`).
**Evidence:**
```tsx
<div className="flex flex-wrap gap-3">
  {groups.map((g) => (
    <Checkbox key={g.id} label={g.name} checked={groupIds.includes(g.id)} onChange={...} />
  ))}
</div>
```
`components/ui/form.tsx:274-320` — `Checkbox`'s `label` prop is used **only** as the hidden input's `aria-label` (`aria-label={label}` on a `sr-only` input); the component renders no visible text of its own, only an icon box.
**Impact:** On both "Invite assistant" and "Edit assistant" panels, when Reach is set to "Assigned groups only," the group picker renders as a row of blank checkboxes with no name next to any of them. A sighted admin cannot tell which checkbox is which group — the exact screen CLAUDE.md §7 calls the authorization chokepoint config (assistant scope) is unusable by inspection. Every other caller of `Checkbox` in the codebase (`manage/courses/[id]/groups/page.tsx:382-399`, `manage/courses/[id]/assessments/page.tsx:274-282`, `manage/tasks/task-form.tsx:499-511,569-579`) pairs it with an adjacent visible `<span>`/text — this is the one caller that doesn't, confirming it's a one-off omission rather than a documented convention.
**Confidence:** High (read `Checkbox`'s implementation directly; confirmed the convention from 4 other call sites in the same codebase).
**Minimal fix:** In `ReachFields` (`manage/assistants/page.tsx`), wrap each `Checkbox` with a visible `<span className="text-base text-fg">{g.name}</span>` sibling, same as `task-form.tsx:499-506`. No new component needed.
**Acceptance check:** Open "Invite assistant", set Reach to "Assigned groups only" — each checkbox must show its group's name next to it.

### FE-01 — P2 — Quizzes page N+1 client-side fan-out
**File:** `frontend/app/(app)/quizzes/page.tsx:58-69`.
**Evidence:** `list.filter(...)` then `Promise.all(quizItems.map((item) => api.assessments.get(token, item.id)))` — one list call plus one detail call per quiz item, run from the browser on every page load/course switch.
**Impact:** Bounded by §1's scale (a student holds a handful of quizzes at a time) so not correctness-breaking, but it's an N+1 pattern that will not degrade gracefully if quiz counts grow, and it's slower than necessary (waterfall: list, then N parallel detail calls, all client-triggered).
**Confidence:** High (read directly).
**Minimal fix:** Out of scope for a frontend-only fix — the list endpoint (`GET /assessments`) would need to include `work` detail (score/completed/formUrl) per item so this page can skip the per-item `get`. Flag for backend agent; no frontend-only fix exists that doesn't also touch the API contract.

### FE-02 — P3 — Stale doc comment on `/profile` avatar upload
**File:** `frontend/app/(app)/profile/page.tsx:14-19`.
**Evidence:** Comment says "the upload route is staff-only today," but `POST /students/me/avatar` exists and is wired end-to-end (`backend/src/students/students.controller.ts:70`, called from `AvatarPanel` at `profile/page.tsx:69`).
**Impact:** None functional — the feature works. Just a misleading comment for the next reader.
**Confidence:** High.
**Minimal fix:** Delete or correct the stale sentence in the docblock.

### FE-04 — P2 — Dead `border-border` / `bg-bg-2` classes in announcement student preview
**File:** `frontend/app/(app)/manage/announcements/page.tsx:745,784,791,798,818`.
**Evidence:** `className="... border border-border bg-surface p-5"`, `"... border border-border object-cover"` (×3), `"... border border-border bg-bg-2 p-3"`. Neither `--color-border` nor `--color-bg-2` is defined anywhere in `app/tokens/*.css` or the `@theme inline` block in `app/globals.css` (only `--color-border-light/-medium/-strong/-danger/-accent` and `--surface`/`--surface-2..4` exist). Tailwind v4 silently generates no rule for an unknown color name, so these classes are inert — exactly the class of defect CLAUDE.md §11 describes repeatedly (passes lint/build, wrong in the browser).
**Impact:** The "Student preview" card in the announcement composer, and its inline image/video/file previews, render with no visible border and no background tint where one is intended — a cosmetic miss on a screen staff use to check media before publishing, not a data-loss bug.
**Confidence:** High (grepped every token file for the exact custom-property names; confirmed absent).
**Minimal fix:** Replace `border-border` → `border-border-light` (or `-medium`, matching the rest of the app's card borders) and `bg-bg-2` → `bg-surface-2`, at all 5 occurrences in this file.
**Acceptance check:** `npm run lint` (which runs `check-tokens.mjs`) should be re-run once fixed — note `check-tokens.mjs` resolves `var(--…)` usages, not plain missing-utility class names like these, so it currently does **not** catch this class of bug; worth flagging to whoever owns OPS-2 as a gap, not a fix to make in this pass.

### FE-05 — P2 — Card-inside-card in announcement composer's student preview
**File:** `frontend/app/(app)/manage/announcements/page.tsx:299-337` (the `<Panel>` around `ComposeAnnouncementForm`) and `:745` (the hand-rolled preview card inside it).
**Evidence:** `AnnouncementsPage` renders `ComposeAnnouncementForm` inside a `<Panel title="New announcement">`; inside that form's own render, the right column is a raw `<div className="rounded-xl border ... bg-surface p-5">` — a second, hand-built container nested inside the Panel.
**Impact:** Violates CLAUDE.md §11 rule 3, "No card inside a card. `Panel` is the application's one container" — visually this reads as a card floating inside another card, and it's also the one place in this file using `rounded-xl` where the rest of the app's cards use `rounded-md` (Panel's own radius), so it looks like a different design system stitched in.
**Confidence:** High.
**Minimal fix:** Either drop the outer border/background and let the preview sit as plain content inside the parent Panel (it doesn't need its own frame — it's clearly demarcated by the "Student preview" label already), or extract it as its own sibling `<Panel title="Student preview">` next to the compose form's Panel instead of nesting. Prefer the former (fewer elements).

### FE-01b — P2 — Dead `text-14` utility class
**Files:** `frontend/app/(app)/manage/settings/page.tsx:74,77,80,83`; `frontend/app/(app)/manage/courses/page.tsx:162,165,245,248` (8 occurrences total, all on checkbox `<label>`s).
**Evidence:** `className="flex items-center gap-2 text-14 font-medium text-fg"`. Tailwind v4's default scale has no numeric `text-14` utility (the scale is `text-xs/sm/base/lg/...`, and this codebase's own custom scale is `text-xxs/xs/base/md/lg/xl` per `app/tokens/semantic.css` — never a bare number). No `--text-14` token exists either. This compiles and lints clean (it isn't a `var(...)`-based class, so `check-tokens.mjs` doesn't catch it) but generates no CSS rule at all, so these 8 labels fall back to inherited/browser-default font size instead of the intended size.
**Impact:** Cosmetic only — checkbox labels on Settings > Notifications (4 labels) and the course create/edit forms' "Sequential Lock"/"Published" toggles (4 labels) render at whatever size they inherit rather than the size the author intended.
**Confidence:** High (grepped the whole frontend tree; confirmed no matching token/utility exists).
**Minimal fix:** Replace `text-14` with `text-base` (matches the surrounding form labels' sizing elsewhere in the same files, e.g. `TextInput` labels) at all 8 occurrences.

### FE-03 — P3 — Inconsistent destructive-action confirmation
**Files:** `frontend/app/(app)/manage/settings/page.tsx:125` (native `confirm()` for Google disconnect) vs. `frontend/app/(app)/manage/assistants/page.tsx:361-372` (`cancel()` on a pending invitation — no confirmation at all) vs. `frontend/app/(app)/manage/blog/[id]/page.tsx:594-641` (`DangerZone`, a proper two-step in-panel confirm).
**Impact:** Three different confirmation patterns for destructive actions across the same console: a browser-native `confirm()` dialog (unstyled, blocks the render thread, untestable in the design system), a fully worked two-step in-panel pattern, and no confirmation at all before cancelling an assistant's invitation. Not a security issue (server still needs the same auth either way) but an inconsistent, occasionally-missing safety net for accidental clicks.
**Confidence:** Medium (there's no `Dialog`/`Modal` primitive confirmed in `components/ui` from this pass — the blog `DangerZone` in-panel pattern may be the intended "how we do this," in which case settings.tsx and assistants.tsx are both the outliers).
**Minimal fix:** Adopt the blog `DangerZone` two-step in-panel pattern (already built, already in the codebase) for both the Google-disconnect action and the assistant-invitation-cancel action, removing the one `confirm()` call.

### FE-07 — P2 — Literal `text-[20px]` where the token `text-lg` already expresses it
**File:** `frontend/app/(app)/manage/groups/[id]/report/page.tsx:74,84`.
**Evidence:** `<h1 className="text-[20px] font-semibold text-fg">` (both the on-screen header and its `print:block` duplicate). `app/tokens/semantic.css:22` defines `--fs-lg: 20px; /* console section lead */` and `app/globals.css:102` maps it to the Tailwind utility `--text-lg`.
**Impact:** Cosmetic/consistency only right now (20px is 20px either way), but it's exactly the class of literal CLAUDE.md §11 forbids ("do not add a literal hex, rgb or px font-size that a token already expresses") — if `--fs-lg` is ever retuned, this heading silently stops matching every other "console section lead" heading in the app.
**Confidence:** High.
**Minimal fix:** Replace `text-[20px]` with `text-lg` at both occurrences.

### FE-08 — P3 — Off-scale `text-sm` in two manage screens
**Files:** `frontend/app/(app)/manage/tasks/[id]/results/page.tsx` (3×, e.g. lines 139,161,165), `frontend/app/(app)/manage/settings/page.tsx` (2×).
**Evidence:** `app/globals.css:90-94` documents the console's scale explicitly: "Six sizes, and that is the whole console scale... Tailwind's other steps (text-sm, text-2xl…) still exist but are not part of this system — reach for a tint instead." These two files are the only places under `app/(app)` using `text-sm`.
**Impact:** Not broken CSS (Tailwind's default `text-sm` = 14px still renders), just off the documented 6-step console scale (`xxs/xs/base/md/lg/xl`) — inconsistent with every other manage screen audited in this pass, all of which use `text-xs`/`text-base`.
**Confidence:** High.
**Minimal fix:** Replace `text-sm` with `text-xs` or `text-base` per the surrounding context (both files already mix `text-xs`/`text-base` elsewhere) at the 5 occurrences.

### FE-09 — P1 — "Assistants" course tab links to a deleted page (broken nav for admins)
**File:** `frontend/app/(app)/manage/courses/[id]/layout.tsx:54` — `...(admin ? [{ href: \`${base}/staff\`, label: 'Assistants' }] : [])`.
**Evidence:** `frontend/app/(app)/manage/courses/[id]/staff/` does not exist (confirmed with `find`/`ls` — only `page.tsx`, `layout.tsx`, `assessments/`, `grading/`, `groups/`, `recordings/` are present under `[id]/`). CLAUDE.md §4.1 itself records: *"`manage/courses/[id]/staff/page.tsx` was deleted outright — confirmed orphaned (**no nav item**, no other page linked to it) before deletion."* That claim is now false: this tab was added back (or never removed) after/around that deletion and is rendered to every admin viewing any course.
**Impact:** Every admin who opens a course workspace sees an "Assistants" tab. Clicking it navigates to `/manage/courses/:id/staff`, which has no matching route — Next.js renders its default not-found (compounded by FE-00's missing `app/not-found.tsx` — see §0 Global findings), so the admin lands on an unbranded 404 with no way back except browser Back or the other tabs. This is on the primary admin course workspace, reachable in two clicks from `/manage/courses`.
**Confidence:** High (verified both the source and the filesystem directly).
**Minimal fix:** Delete the `...(admin ? [...] : [])` spread at `layout.tsx:53-54` — drop the "Assistants" tab entirely, matching the CLAUDE.md record of that page's removal. (If an assistants-per-course screen is actually still wanted, that's a product decision/blocker to raise, not a frontend-only fix — CLAUDE.md §13 "never invent business behaviour.")
**Acceptance check:** As an admin, open any course in `/manage/courses/:id` — the tab list must be Roster / Groups / Work / Grading / Recordings only, no "Assistants" tab.

### FE-10 — P2 — Undefined `--fs-h2` token, and a gap in `check-tokens.mjs` that let it through
**File:** `frontend/app/(auth)/google/callback/page.tsx:104` — `<h1 className="text-(length:--fs-h2) font-semibold ...">`.
**Evidence:** No `--fs-h2` custom property is defined anywhere in `app/tokens/fig-tokens.css`, `app/tokens/semantic.css`, or `app/globals.css` (grepped all three) — only `--fs-marketing-h2: 32px` and the console's `--fs-xl: 24px` exist, and neither is named `--fs-h2`. Every sibling auth page (`login`, `register`, `forgot-password`, `reset-password`, `accept-invitation`) uses `text-m-h2` for this exact heading role. `text-(length:--fs-base)` two lines below it (and in `login/page.tsx:113`) is the same shorthand used correctly, so this is a one-off typo, not a pattern.
**Impact:** This `<h1>` — the only heading shown on the Google sign-in error screen (`'Google was not connected'` / `'Google sign-in did not finish'`) — renders with no explicit font-size (`--fs-h2` resolves to nothing, so the property is dropped and the element falls back to the browser/ancestor default), instead of matching the large heading every other auth screen uses.
**Confidence:** High.
**Minimal fix:** Replace `text-(length:--fs-h2)` with `text-m-h2` at `page.tsx:104`, matching every sibling auth page.
**Secondary finding — tooling gap:** `frontend/scripts/check-tokens.mjs` (OPS-2) only regex-matches the literal substring `var(` (`check-tokens.mjs:92`); Tailwind v4's `text-(length:--x)` shorthand compiles to a `var()` but is never spelled with the text `var(` in source, so this exact defect class is invisible to the gate that exists specifically to catch undefined-token bugs. Worth a follow-up ticket for whoever owns OPS-2: extend the same undefined-property scan to also match `\((?:length|color):(--[A-Za-z0-9_-]+)\)`.

### FE-11 — P0 — "Reports" nav item in the persistent staff sidebar links to a page that has never existed
**File:** `frontend/components/shell/console-shell.tsx:96` — `{ href: '/manage/reports', label: 'Reports', icon: 'ChartPie' }`, inside the "Teaching" nav section rendered on **every** `/manage/*` screen for every staff role.
**Evidence:** No `frontend/app/(app)/manage/reports/` directory exists (confirmed against the full directory listing of `manage/*` — `account, activity, announcements, assistants, blog, courses, groups, live-sessions, marks, recordings, settings, students, tasks` are the only ones). No backend route exists either (`grep -rn "manage/reports\|staff/reports"` across `backend/src` returns nothing) — this isn't a page that's merely unbuilt on the frontend, the whole feature does not exist anywhere in the stack.
**Impact:** Every teacher and assistant sees a permanently visible "Reports" link in the main sidebar (not a page-specific dead end like FE-09 — this is in the persistent nav chrome). Clicking it 404s (compounded by the missing `not-found.tsx`, §0). Raising this to P0 over FE-09 because it's unconditional (every staff role, every page) rather than admin-only on one workspace.
**Confidence:** High (verified both the frontend directory tree and a backend-wide grep).
**Minimal fix:** Remove the `{ href: '/manage/reports', ... }` line from `sectionsFor` at `console-shell.tsx:96`. If a staff-facing reports/analytics screen is actually wanted, that's a product decision to raise (name what it would show — course-wide analytics already exist scattered across `/manage/courses/[id]/grading`'s averages and `/manage/marks`), not a frontend-only fix.
**Acceptance check:** Sign in as teacher or assistant, open `/manage` — the "Teaching" nav section must read Tasks / Draft tasks / Marks only, no "Reports".

### FE-12 — P2 — `GradeDialog` claims `role="dialog"`/`aria-modal` but has no focus trap or Escape handling
**File:** `frontend/app/(app)/manage/courses/[id]/grading/page.tsx:301-386` (`GradeDialog`).
**Evidence:** The dialog markup (`role="dialog" aria-modal="true" aria-labelledby="grade-title"`, a fixed-position overlay) has no `useEffect`, no keydown listener, and no ref-based focus management at all — contrast with `CurriculumDrawer` in `frontend/app/(app)/lessons/page.tsx:430-468`, which is the same shape of overlay (fixed, `role="dialog"`, `aria-modal="true"`) and implements a real focus trap, Escape-to-close, initial focus, and focus restoration on close.
**Impact:** `aria-modal="true"` is a promise to assistive tech that focus is contained inside the dialog; here it is not — Tab can walk focus out to the page behind it, Escape does nothing, and closing (via the Cancel button only) does not restore focus to whatever opened it. A screen reader or keyboard-only marker grading submissions can tab out of the score/feedback form into the page behind the overlay without realizing it. This is the grading flow — CLAUDE.md §5.4/§10 treats grading as security/audit-sensitive, and a11y basics are explicitly "never simplify away" territory.
**Confidence:** High (read both implementations directly; the working pattern already exists one directory over).
**Minimal fix:** Reuse `CurriculumDrawer`'s pattern (or extract it into `components/ui/` as a real `Dialog` primitive, which multiple manage screens now independently reinvent — `GradeDialog` here, the inline `DecisionPanel`/`CreatePanel` panels in `manage/students/page.tsx` note explicitly "No `Modal` primitive exists yet"). At minimum, add the same `useEffect` block from `CurriculumDrawer` (lines 434-468) to `GradeDialog`.

## 3. What is sound (evidence, not a vibe check)

- **Every page audited has real loading/error/empty states wired to real `lib/api.ts` calls.** No mocked data, no hardcoded fake lists, no `Math.random`, no "coming soon" placeholders, no dead `onClick={() => {}}` found anywhere across all ~50 pages read in full.
- **§11.1 non-negotiables held everywhere checked**: no earnings widget; progress (`Meter`, completion) and performance (`Score`, marks) are never merged into one figure or bar (`dashboard/page.tsx`'s `CourseCard`, `marks/page.tsx`'s `ProgressSummary`, `manage/marks/page.tsx`'s markbook, `manage/groups/[id]/report`); a missing mark renders as an em-dash, never `0` (`homework/page.tsx:232`, `attendance/page.tsx:98`, `manage/marks/page.tsx:107`); no emoji found; status colour (amber/red/green/blue) is consistently kept distinct from the indigo accent used for the one primary action.
- **Server-derived status is respected as a hard rule.** Every assessment/submission/session status (`available/locked/submitted/corrected`, `not_submitted/submitted/marked/returned`, live-session phase) is read from the API response and never recomputed client-side; several code comments explicitly call this out as the reason a particular branch was removed (`dashboard/page.tsx` `CourseCard`, `marks/page.tsx` `ProgressSummary` both dropped a dead `learningMode` branch after migration `012` retired the column).
- **Anti-enumeration and scope-narrowing patterns are carried into the frontend correctly**: `homework/[assessmentId]` and `lessons/[recordingId]` both render the identical "not available to you" copy for both a genuine 404 and an out-of-scope resource, and `lessons/[recordingId]`'s `FindInOtherCourses` component is a careful, bounded (§1-scale) fix for a real UX bug without widening any access check.
- **Forms are consistently well-built**: client-side validation before submit, `disabled={busy}` prevents double-submit on every form audited, server errors surfaced via `ApiError` message extraction with a sensible fallback, success feedback (`role="status"`, "Saved" text) on every save-in-place form.
- **Bilingual/RTL groundwork is real, not decorative**: `dir="auto"` used correctly on user-authored free text (student names, feedback, notes) throughout the manage console; the `.num` CSS class enforces `direction: ltr; unicode-bidi: isolate` so scores never reverse under RTL, and `check-tokens.mjs` has a standing assertion that this rule cannot regress silently.
- **The one real modal dialog that's a11y-complete** (`CurriculumDrawer` in `lessons/page.tsx`) is a genuine focus trap with Escape-to-close and focus restoration — the standard the codebase should hold every overlay to (see FE-12 for where it doesn't yet).
- **Marketing site (`app/(site)/*`)**: all Server Components, per-page `Metadata` with OpenGraph on the blog post page, real 5-minute-revalidated catalog data (never build-time-frozen fake slugs), a considered plain-`<img>`-vs-`next/image` decision for author-supplied media hosts, honest "could not load" vs. "nothing published" empty-state distinction everywhere a public fetch can fail.
- **Token discipline (CLAUDE.md §11 rule 1) mostly holds**: zero `text-[var(...)]` instances anywhere in `app/`, `components/`, or `lib/` (verified by direct grep, matching what `check-tokens.mjs` would report clean). The violations found (FE-01b, FE-04, FE-07, FE-08, FE-10) are all a different, currently-unchecked shape of the same class of bug — plain nonexistent utility names or shorthand-`var()` syntax the lint script's regex doesn't parse — not a return of the old `text-[var(...)]` mistake.

## 4. Page inventory

(filling in below by section)

### Student console (`app/(app)/*`, `@Roles(Role.Student)`)

| route | API calls | states | status | notes |
|---|---|---|---|---|
| /dashboard | `api.dashboard.home` (composed) | loading/error/empty all present | IMPLEMENTED BUT UNVERIFIED | Careful §11.1 compliance (no mark on page, Meter=completion only, em-dash for 0 expected attendance). Sound. |
| /homework | `api.assessments.list` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Locked rows correctly inert, not links. Sound. |
| /homework/[id] | `api.assessments.get/submit/uploadFile` | loading/error(404 message)/empty | IMPLEMENTED BUT UNVERIFIED | Real file upload with per-file error, revision history. Sound. |
| /lessons | `api.recordings.list/saveProgress` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Modal drawer is a real focus-trapped dialog. Sound. |
| /lessons/[id] | `api.recordings.list`,`assessments.list`,`materials.list` | loading/error/empty, cross-course fallback search | IMPLEMENTED BUT UNVERIFIED | Sound; fetches 3 endpoints unconditionally (materials/assessments not gated behind recordings existing) — minor waste, not a bug. |
| /marks | `api.reports.summary/documents` | loading/error/empty (2 independent panels) | IMPLEMENTED BUT UNVERIFIED | Performance/Progress correctly separated (§11.1.2). |
| /materials | `api.materials.list` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /quizzes | `api.assessments.list`+`get` per item (N+1 client-side fan-out) | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | See FE-01 (N+1). Otherwise correct 4-state logic. |
| /timetable | `api.students.timetable` | loading/error, per-day em-dash empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /attendance | `api.students.attendance` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | `late` kept as separate stat, not merged — correct per §11.1. |
| /classmates | `api.students.classmates` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Names only, no avatar/mark — matches spec ruling. |
| /notifications | `api.notifications.list/markRead/markAllRead` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /profile | `api.students.profile/updateProfile/changePassword/uploadAvatar` | loading/error, per-form busy+error+success | IMPLEMENTED BUT UNVERIFIED | Comment at line 15-19 says avatar upload "has no backend yet" but `POST /students/me/avatar` exists (`backend/src/students/students.controller.ts:70`) and is wired — stale comment, not a bug (see FE-02, P3 doc note). |
| /help | none (static WhatsApp link) | n/a | FRONTEND ONLY (by design, documented) | Sound, matches spec "frontend + config only". |

### Manage/staff console (`app/(app)/manage/*`)

| route | API calls | states | status | notes |
|---|---|---|---|---|
| /manage | `api.staff.overview` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | No earnings widget — correct. Scope note rendered from server (`platform` vs assigned). |
| /manage/account | `api.staff.profile/updateProfile` | loading/error, form busy/success | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/settings | `api.staff.notificationPreferences`, `api.admin.googleIntegration.*` | loading/error per tab | PARTIALLY IMPLEMENTED | See FE-01b (`text-14` dead class on 4 checkbox labels) and FE-03 (native `confirm()` instead of the `Dialog` primitive for disconnect). |
| /manage/activity | `api.admin.auditLog` (keyset) | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Exhaustive `Record<AuditAction,...>` maps — matches CLAUDE.md §6/§9 discipline. Sound. |
| /manage/announcements | `api.admin.*`/`api.staff.*` announcements, groups, courses, upload | loading/error/empty, per-action busy+error | PARTIALLY IMPLEMENTED | See FE-04 (dead `border-border`/`bg-bg-2` classes) and FE-05 (card-inside-card in student preview). Otherwise thorough: draft/publish/delete flows, YouTube embed allowlisted to youtube.com/youtu.be, reach estimate. |
| /manage/assistants | `api.admin.assistants/groups/inviteAssistant/updateAssistant/resendAssistantInvitation/removeAssistant` | loading/error/empty, per-panel busy+error | PARTIALLY IMPLEMENTED | See FE-06 (P1: group checkboxes render with no visible label at all). Also no confirm before destructive "Cancel invitation" — see FE-03 pattern. |
| /manage/courses | `api.staff.overview`, `api.admin.createCourse/updateCourse/course` | loading/error/empty, form busy/error | PARTIALLY IMPLEMENTED | `text-14` dead class again (FE-01b, 4 more occurrences). |
| /manage/courses/[id] (roster tab) | `api.staff.roster` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. Correctly drops the retired `learningMode` column rather than reading a field no longer on the wire. |
| /manage/courses/[id]/groups | `api.staff.courseGroups/roster/groupMembers`, `api.staff.addGroupMember/removeGroupMember`, `api.admin.bulkMoveMembers` | loading/error per section | IMPLEMENTED BUT UNVERIFIED | N groups → N `groupMembers` calls fan-out (bounded by §1's ~10 groups, acceptable). "Unplaced" loud-first pattern is a good defensive-UX touch. |
| /manage/courses/[id]/assessments | `api.staff.assessments/courseGroups`, `createAssessment/deleteAssessment` | loading/error/empty, per-row busy | PARTIALLY IMPLEMENTED | Redundant control per group in "Set for" fieldset: a `Checkbox` (visually blank icon, see FE-06) plus a separate `<button>` carrying the visible name, both independently call `toggle()` — two tab stops/announcements for one boolean. State stays in sync so it is not broken, just clumsy; the `Checkbox` primitive's real defect (FE-06) is what forces this workaround here. |
| /manage/courses/[id] layout (tabs) | `api.staff.roster` | loading/error | PARTIALLY IMPLEMENTED | See FE-09: dead "Assistants" tab for admins, pointing to a route CLAUDE.md §4.1 records as deleted. |
| /manage/groups | `api.admin.groups/staff.courses/admin.assistants`, `createGroup/updateGroup` | loading/error/empty, form busy | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/groups/[id]/report | `api.staff.groupReport` | loading/error | IMPLEMENTED BUT UNVERIFIED | See FE-07 (`text-[20px]` literal). Print-to-PDF via `window.print()` with `print:hidden`/`print:block` twins — sensible given "no server PDF lib" constraint (CLAUDE.md §5). |
| /manage/tasks | `api.staff.tasks/courses` | loading/error/empty, debounced search | IMPLEMENTED BUT UNVERIFIED | Sound, server-derived status throughout. |
| /manage/tasks/new, /manage/tasks/[id] | `task-form.tsx` shared component; `api.staff.createAssessment/updateAssessment/courseGroups/uploadConfig` | loading/error/empty, per-field validation | IMPLEMENTED BUT UNVERIFIED | Checkbox+span pairing done correctly here (contrast with FE-06). |
| /manage/tasks/drafts | `api.staff.taskDrafts/deleteTaskDraft/updateTaskDraft` | loading/error/empty, two-step delete confirm | IMPLEMENTED BUT UNVERIFIED | Sound — this is the "good" confirm pattern FE-03 references. |
| /manage/tasks/[id]/submissions | `api.staff.taskSubmissions` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/tasks/[id]/submissions/[submissionId] (marking) | `api.staff.taskSubmissions/annotations.*/grade/returnSubmission` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Careful two-operation save/return semantics; hover-only (no focus) sync between the marks list and the paper highlight is a minor keyboard-nav gap, not filed as a numbered finding given severity. |
| /manage/tasks/[id]/results | `api.staff.workAnalytics/workResults/workUnmatched/workSync/roster/attachResult` | loading/error/empty | PARTIALLY IMPLEMENTED | See FE-08 (`text-sm` off-scale, 3 occurrences). |
| /manage/live-sessions | `api.staff.courses/courseGroups/sessions.list/cancel` | loading/error/empty, two-step cancel confirm | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/live-sessions/drafts | `api.staff.sessions.planned/publish` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/live-sessions/[id]/attendance | `api.staff.sessions.attendance/markAttendance`, `staff.groupMembers` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound; untouched student stays `null` server-side rather than defaulting to absent. |
| /manage/recordings | `api.staff.overview` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/courses/[id]/recordings | `api.staff.recordings/outline`, `admin.createRecording/deleteRecording` | loading/error/empty, two-step delete confirm | PARTIALLY IMPLEMENTED | Known issue already reported to lead (Bunny "signed per request" hint) — not re-filed. |
| /manage/courses/[id]/grading | `api.staff.submissions/grade/returnSubmission` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | In-page dialog (`role="dialog" aria-modal`) but **no focus trap and no Escape handler**, unlike the properly-built `CurriculumDrawer` on `/lessons` — see FE-12. |
| /manage/students | `api.admin.students/groups/acceptRegistration/rejectRegistration/createStudent` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/students/[id] | `api.admin.studentDetail/updateStudent` | loading/error | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /manage/marks | `api.staff.courses/courseGroups/markbook/markbookCsv` | loading/error/empty | IMPLEMENTED BUT UNVERIFIED | Careful §11.1 compliance: em-dash for unmarked, mirrored Google Form scores excluded from the average and labelled. |





### Auth (`app/(auth)/*`)

| route | API calls | states | status | notes |
|---|---|---|---|---|
| /login | `api.auth.googleStart`, `signIn` | error, per-button busy | IMPLEMENTED BUT UNVERIFIED | Identical error message for unknown-email vs wrong-password (anti-enumeration), by design comment. |
| /register | `signIn`/`register` | field errors, error, busy | IMPLEMENTED BUT UNVERIFIED | `waiting` state driven only by the 201 body, never inferred — matches documented `SHELL-5` rule. |
| /forgot-password | `api.auth.requestPasswordReset` | error, busy, "sent" state | IMPLEMENTED BUT UNVERIFIED | Same-response-either-way anti-enumeration copy. |
| /reset-password | `api.auth.confirmPasswordReset` | missing-token state, field error, error, busy | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /accept-invitation | `acceptInvitation` | missing-token state, field error, error, busy | IMPLEMENTED BUT UNVERIFIED | Sound. |
| /google/callback | `signInWithGoogle`, `api.auth.googleLink` | loading, distinct error+back-link per mode | PARTIALLY IMPLEMENTED | See FE-10 (`--fs-h2` undefined token on the one heading this page renders). |

### Marketing (`app/(site)/*`, Server Components)

| route | data source | states | status | notes |
|---|---|---|---|---|
| / (home) | `fetchCatalog()` | catalog null (unavailable) vs empty vs populated, all distinct copy | IMPLEMENTED BUT UNVERIFIED | Per-page `Metadata` via root layout template; counted facts derived from the same catalog read that renders below them (can't disagree). |
| /about | static content + `photo()` helper | n/a | FRONTEND ONLY (by design — no backend for this content) | Has its own `Metadata` export. Sound. |
| /contact | static + `ContactForm` client island | form validation/busy/error (in `ContactForm`, not re-read this pass) | IMPLEMENTED BUT UNVERIFIED | Has `Metadata`. |
| /courses | `fetchCatalog()` | unavailable/empty/no-match(filtered)/populated | IMPLEMENTED BUT UNVERIFIED | URL-driven filter (`?q=`), server-rendered, crawlable. Has `Metadata`. |
| /courses/[slug] | `api.publicCourses.get` | `notFound()` on missing/unpublished (same for both) | IMPLEMENTED BUT UNVERIFIED | `generateMetadata` per course; lesson rows deliberately non-interactive (no href) while locked — correct "gate is the absence of a link" pattern. |
| /blog | `api.publicBlog.list` | unavailable (Callout) vs empty vs populated | IMPLEMENTED BUT UNVERIFIED | Has `Metadata`. Considered plain-`<img>` decision documented for author-supplied hosts. |
| /blog/[slug] | `api.publicBlog.get` | `notFound()` on missing/draft/future-scheduled (same for all three) | IMPLEMENTED BUT UNVERIFIED | `generateMetadata` with OpenGraph image from the gallery's first image. |

## 5. SEO / error-boundary / global checks

- **No `app/error.tsx`, `app/global-error.tsx`, or `app/not-found.tsx` anywhere** (§0). A thrown render error in any Server or Client Component falls through to Next's unstyled default. Given FE-09 and FE-11 both route staff into a 404 today, this compounds directly: the moment either nav bug is clicked, the visitor lands on a page with none of the product's chrome, no way back except Back/other-nav.
- **Metadata**: every `(site)` page checked has its own `title`/`description`; the two dynamic ones (`courses/[slug]`, `blog/[slug]`) correctly implement `generateMetadata` and fall back to a named "not found" title. Root layout sets `metadataBase`, a title template, and default OpenGraph — sound.
- **robots.txt / sitemap.xml**: not found under `frontend/app/` (`app/robots.ts` / `app/sitemap.ts` — Next's file-convention routes — do not exist). Not verified against `frontend/public/` static files in this pass; worth a follow-up grep if SEO is in scope for this phase.
- **Favicon/OG image**: not verified in this pass (would need to check `frontend/app/icon.*`, `app/opengraph-image.*`, or `frontend/public/`).
- **pdfjs-dist / heavy client bundles**: no `pdfjs-dist` import found via inspection of the pages read; the marking surface (`components/marking/marking-surface.tsx`) was not opened in this pass (out of scope — only `page.tsx` files and named shell/layout/guard components per the brief) and is the most likely place a PDF renderer would live — flagging as unverified rather than clean.

## 6. Summary for the lead

Read all 57 `page.tsx` files plus the 6 layout files and the two console/student shell nav components. No mocked data, no dead buttons, no missing loading/error/empty states found anywhere — the implementation is unusually disciplined about CLAUDE.md §11.1 (progress/performance separation, em-dash for missing marks, no earnings widget) and about server-derived status. The real defects are:

- **Two dead nav links** (FE-09, FE-11) — one admin-only tab, one unconditional sidebar item for every staff role — both pointing at routes with no page and no backend route, both landing on Next's default (unstyled, no brand) 404 because there's no `not-found.tsx` anywhere in the app.
- **One functionally broken screen for sighted users**: FE-06, the assistant-scope group checkboxes render with zero visible label, on the one screen that configures who an assistant can reach (CLAUDE.md's own authorization chokepoint).
- **A handful of silent-CSS-miss token bugs** (FE-01b, FE-04, FE-07, FE-08, FE-10) — all real, all cosmetic-only, all a variant of the exact defect class CLAUDE.md §11 has flagged four times before, but none of them the `text-[var(...)]` shape the existing `check-tokens.mjs` gate catches; FE-10 specifically demonstrates a gap in that gate's own regex.
- **Minor a11y/consistency gaps**: FE-12 (one dialog missing the focus-trap pattern a sibling component already has), FE-03 (three different confirm-before-destructive-action patterns coexisting), FE-05 (one card-inside-card).
