# Phase plan — unit 5: People and groups

**Planner:** Claude (orchestrator, custom units-3-5 pipeline — `D-24`) · **Date:** 2026-09-21 ·
**Branch:** `redesign` · **Base:** `372c659`
**Input read:** `PHASE_ROADMAP.md` §4 (unit 5), `IMPLEMENTATION_PLAN.md:195-222` (Phase 5/6),
`CLAUDE.md` §7 (`AUTHORIZATION_MODEL`), current `backend/src/{students,staff,groups,manage}/**`,
`backend/src/auth/staff.module.ts`'s own comment on `AdminStaffController`'s removal,
`frontend/app/(app)/manage/{students,groups,courses/[id]/{groups,staff}}/page.tsx` (unit 4's port,
currently carrying the 22 disclosed `AUTH-2` errors this unit exists to close).

---

## 0. Headline — corrected after a first, wrong survey

**A first pass at this plan claimed `PEOPLE-1` and `GET /admin/assistants` were unbuilt. Both
claims were wrong**, caught before any implementation started (Antigravity's slice-5a dispatch
failed on quota before touching a file, which is the only reason this was caught early rather than
mid-build). The correction, verified by reading the actual files rather than grepping for a stale
comment:

- **`PEOPLE-1`'s entire backend already exists and is fully tested**:
  `backend/src/manage/{directory.service.ts,registration-approval.service.ts,
  registration-approval.service.spec.ts}` + `admin-manage.controller.ts` give
  `GET /admin/students` (search + status filter), `POST /admin/students/:id/accept` (one
  transaction: activate, enrol on the group's course, place in the group, audit), and
  `POST /admin/students/:id/reject` (audit, anti-enumeration 404, `registration.reject`
  capability check). **The frontend `lib/` mirror is also already complete** —
  `frontend/lib/api.ts`'s `admin.students`/`acceptRegistration`/`rejectRegistration` and
  `lib/types.ts`'s `StudentDirectoryEntry` (with `status`) already match the backend exactly.
  **The only real gap is `frontend/app/(app)/manage/students/page.tsx` itself** — unit 4's port
  left it a flat list with no status column, no queue view, no accept/reject UI. `PEOPLE-1` is a
  frontend-only slice.
- **`GET /admin/assistants` already exists too** (`directory.service.ts`'s `assistants()` +
  `admin-manage.controller.ts`, also mirrored in `lib/api.ts`), just without the `scope`/`status`/
  `groupIds`/`lastSeenAt` fields `PEOPLE-4` needs to add — `directory.service.ts`'s own comment
  says so explicitly. The `AdminStaffController` that comment in `staff.module.ts` describes as
  "gone" was the *course-staff-assignment* controller `AUTH-2` retired; a different, current
  controller (`AdminManageController`) already re-covers the directory read. **What's genuinely
  new for `PEOPLE-4`/`AUTH-4`**: the response-shape extension, invite + accept-invite + scope-edit
  routes, and the two new audited actions — plus the `manage/assistants` screen itself (the nav
  item exists since slice 4a; no page file does).
- `PEOPLE-2` (detail + edit) and `PEOPLE-3` (create directly) — **genuinely not built**, backend or
  frontend. No `GET/PATCH /admin/students/:id`, no `POST /admin/students`.
- `PEOPLE-5` (activity screen) — needs only a query over the existing `AuditService`/audit log, no
  new write path.
- `PEOPLE-6` (`lastSeenAt` = `MAX(created_at)` from the audit log for that actor) — small, rides
  along with `PEOPLE-4`'s response shape.
- `GROUP-1` (course/assistant/meets/room on `Group`) — **built** in unit 2
  (`admin-groups.controller.ts`: `GET/POST/PATCH groups`; `CreateGroupDto` carries `courseId`,
  `assistantId`, verified fields present).
- `GROUP-2` (detail + membership) — **built** (`staff-groups.controller.ts`:
  `GET groups/:id`, `GET/POST/DELETE groups/:id/members`). The add-not-remove asymmetry for
  assistants needs a verified refusal test, not assumed correct because the route exists.
- `GROUP-3` (bulk move), `GROUP-4` (group report + PDF) — **not built**.

**Lesson carried forward for the rest of this unit and beyond**: verify a "not built" claim by
reading the actual current files (controller route lists, `lib/api.ts`, the live frontend page),
not by grepping for one comment about a *different*, retired controller. The stale-note pattern
that misled the first pass here is exactly what `PHASE_ROADMAP.md`'s own "Inherited from unit 1"
line already was — a note that was true when written and silently stopped being checked.

---

## 1. Scope

**IN**: `PEOPLE-1` … `PEOPLE-6`, `GROUP-1` … `GROUP-4`, `AUTH-4`.
**OUT**: everything already covered by prior units; any task/marking/session/report screen (units
6-11); full marketing polish (unit 13).

**Security, restated from `PHASE_ROADMAP.md` because it's load-bearing for this unit specifically:**
the waiting queue is a new admin surface over *unapproved* accounts — accept/reject are teacher/admin
only, audited. Assistants may **add** a student to a group but **never remove** one — a real
asymmetry to test, not just implement. New audited actions (`assistant.invitation_accepted`,
`assistant.invitation_resent`, plus whatever `PEOPLE-1`'s accept/reject and `GROUP-3`'s bulk move
need) go in the `AuditAction` union **and** the query DTO's exhaustive `Record<AuditAction, true>` —
a missing one is a compile error, which is the point (`CLAUDE.md` §9).

---

## 2. Slices — corrected against actual current state

**5a — `PEOPLE-1` finish, frontend only.** No backend change. Rewrite
`manage/students/page.tsx` to show `status`, split into a waiting queue + the active/rejected
directory (or a status filter, implementer's call, record which), wire the already-existing
`api.admin.acceptRegistration`/`rejectRegistration`. Accept needs a group picker (the group decides
the course, per `registration-approval.service.ts`'s own design) — reuse `api.admin.groups` or
whatever the existing group-list call is, don't add a new backend endpoint for it.

**5b — `PEOPLE-2` + `PEOPLE-3`, backend + frontend.** New: `GET/PATCH /admin/students/:id` (detail +
edit — extend `DirectoryService`/a new admin-students service, mirror the field set
`students/dto/update-profile.dto.ts` already validates for self-service, staff edit can be a
superset), `POST /admin/students` (create directly). `PEOPLE-3`'s sign-in-link mechanism needs a
real decision — likely reusing the existing password-reset-token flow (`userRepo.
createPasswordResetToken` + the existing confirm-password-reset route) rather than inventing new
auth, but read `auth.service.ts`'s reset flow fully before committing to it, and record the
reasoning. New migration only if a field is genuinely missing from `student_profiles`.

**5c — `PEOPLE-4`/`PEOPLE-5`/`PEOPLE-6`/`AUTH-4`, backend + frontend.** The largest slice.
Extend `DirectoryService.assistants()`'s response with `scope`, `status`, `groupIds`, `lastSeenAt`
(`MAX(created_at)` from the audit log per actor — `PEOPLE-6`). Build the invitation flow
(`AUTH-4`): an invite route (creates a `waiting`-equivalent assistant account or a standalone
invitation record — check `AUTHORIZATION_MODEL.md` and `DATABASE_PLAN.md` for whether this repo
already has an invitation-token shape to reuse before inventing one), email via `MailService`
`template: 'invitation'` (unit 3), an accept-invite endpoint, a scope/`groupIds` edit route. Two new
audited actions (`assistant.invitation_accepted`, `assistant.invitation_resent`, per
`PHASE_ROADMAP.md`'s own note) in both the `AuditAction` union and the exhaustive `Record`. Build
`manage/assistants/page.tsx` (new — the nav item exists since slice 4a, no page does) and the
activity screen (`PEOPLE-5`, a read over `AuditService.find` scoped to one actor).

**5d — `GROUP-3`/`GROUP-4` + fixing the two `AUTH-2`-broken pages.** Bulk move (`POST` moving N
students to a group — reuse `GroupRepository.addMember`, don't add a new repository method for
what's just N calls to the existing one inside one transaction), group report (stats + per-student
table + PDF via the **rendered-overlay pattern `D-2` already settled**, no server-side PDF library).
Then fix `manage/courses/[id]/groups` and `manage/courses/[id]/staff` — the 22 `tsc` errors these
two files (plus `manage/groups`) carry since unit 4 are exactly the retired `CourseStaffMember`/
`LearningMode`/`group_courses`-era types this slice's group-grain work replaces; closing them here,
not patching around them, is what finally clears the count `CLAUDE.md` §4.1 has been carrying.

Each slice: its own review and commit. Antigravity primary while its quota allows
(`--dangerously-skip-permissions`, `claude-opus-4-6-thinking`, ponytail restated in every brief);
the orchestrator implements directly, as one agent, when it doesn't — per the user's explicit
instruction not to spawn further subagents once Antigravity is unavailable.

---

## 3. Definition of done

Universal criteria (`PHASE_ROADMAP.md` §3) plus: the two new audited actions exist in both the
union and the exhaustive `Record`, with a spec asserting each entry written; a refusal test for the
add-not-remove group-membership asymmetry; the waiting-queue accept/reject refusal test (non-staff,
non-admin); `npx tsc --noEmit`/`npx eslint .` clean in `frontend/` (the 22 `AUTH-2` errors this unit
inherits must reach 0, not just not-increase); a real live-browser check of the new screens, per the
standard this whole pipeline has held since unit 4 slice 4c found a bug no static check could have.

## 4. Open items, disclosed rather than guessed

- **B-8**: `PEOPLE-4`'s exact response-shape closure (declare `createdAt` in `API_SPEC.yaml` vs.
  drop it from the response) is a real API-contract decision, not implementation detail — the ticket
  text names both options and doesn't pick one. Default to **declaring it** (additive, doesn't break
  an existing consumer, and `createdAt` is generically useful) unless slice 5b's implementer finds a
  reason not to; record whichever is chosen and why.
- **B-9**: whether `GROUP-4`'s PDF report needs anything beyond the rendered-overlay pattern
  `D-2` already settled is unconfirmed until 5c actually builds it — flag if a real gap surfaces.
