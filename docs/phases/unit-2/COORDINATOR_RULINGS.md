# Coordinator rulings — unit 2

**Date:** 2026-09-20 · **Base:** `26b9ccb` · Input: `docs/phases/unit-2/PHASE_PLAN.md`

The planner raised three items (§8 B-1, B-2, B-3) and one size finding (§10). All four are ruled on
here. The plan is otherwise **approved unmodified**.

---

## R-1 — The unit is split. **2a / 2b, at the planner's recommended boundary (§10).**

| Slice | Tasks | Migrations | Exit |
|---|---|---|---|
| **2a** | `DOM-0`, `DOM-1`, `DOM-2`, seeds for those | `012`, `013` | Integration suite green from an empty schema; `lib/` at 0 errors; `group_courses` referenced nowhere |
| **2b** | `DOM-3`, `DOM-4`, `AUTH-2`, `DOM-5`, final `DOM-6` | `014`, `015` | Integration suite green; `course_staff_assignments` referenced nowhere |

**Reason.** Measured, not estimated: four migrations, three destructive, one of them one-way; 46
source files carrying `learning_mode` logic; two new tables (four repository implementations); five
frontend-visible response shapes; 22 `StaffScopeService` call sites. Roughly units 1, 3 and 5
combined, containing the highest-risk change in the project.

The boundary is chosen because it **is** a verified migration gate: `015`'s backfill joins
`groups.course_id`, and `DATABASE_PLAN.md:255-259` requires `013` landed and verified first. A unit
boundary is the strongest available form of "verified first". It also puts the two irreversible
`DROP TABLE`s in different reviews, and they share no code.

**The alternative boundary (`2a = DOM-0/1/2 + AUTH-2`) was considered and declined.** The
`CHANGELOG.md:367-370` argument for co-locating `AUTH-2` with `DOM-2` — that `groups.assistant_id`
and `assistant_group_assignments` record the same fact twice — is satisfied by the plan rather than
by the unit boundary, on one condition, which is now binding:

> **Binding on 2a:** `groups.assistant_id` is the **display** field (who runs this group).
> `assistant_group_assignments` (2b) is the **authorization** field. **Nothing may read
> `groups.assistant_id` for an access decision, ever.** The executor states this in a comment on the
> column in `013`, on the interface field, and in `EXECUTION_NOTES.md`.

**2b begins in a new conversation** (`CLAUDE.md` §14). `PHASE_ROADMAP.md` records both slices.

## R-2 — `B-1`, `students.mode`: **not built. `D-4` stands.** Reading A.

`CHANGELOG.md:488-499` (`D-4`, CLOSED 2026-09-20) states `students.mode` is not built and *"`DOM-3`
shrinks accordingly"*; `D-9` reinforces zero mode axes. `CLAUDE.md` §2.2 gives `CHANGELOG.md`
ownership of decisions, and the five documents on the other side all predate it and were simply
never amended. `014` gets three columns and no conditional CHECK.

**The executor amends all five as part of `DOM-3`** — `IMPLEMENTATION_PLAN.md:112`,
`DOMAIN_MODEL.md:33,36`, `DATABASE_PLAN.md` §6, `PRODUCT_SPEC.md:117`, and `API_SPEC.yaml:157,169,199`
where `mode` is currently **required** on `StudentSummary` and `StudentWrite`. A contract that
requires a field nothing emits is drift, not ambition — the same finding unit 1 closed for
`Assistant`.

**This is a 2b item.** Recorded here so it is not re-litigated.

**Accepted cost, restated from `D-4`:** the roster cannot show one student as Online inside a School
group, and a live group cannot hold a single online session. `students.mode` is additive and cheap
if it comes back.

## R-3 — `B-2`, `groups.room`: **kept.** The planner's assumption is ratified.

`D-9`'s "no `mode` and no `room`" sentence sits under a **Sessions** heading and resolves
`PRODUCT_SPEC.md` §4.1's "a room or a meeting link" to the link. `groups.room` comes from
`PRODUCT_SPEC.md:140` and `DOMAIN_MODEL.md:84`, neither amended by `D-9`. Nullable `TEXT` in `013`,
optional on `GroupWrite`.

## R-4 — `B-3`, `StaffCourseSummary.assignedAt`: **`MIN(assigned_at)` over the groups that reach the course.**

The field's documented purpose (`staff.service.ts:25-30`) is that the admin and assistant paths are
**visibly different** in the response rather than silently identical; `null` for everyone destroys
that. One join is the right price. **This is a 2b item** (`AUTH-2`).

---

## Scope approved for slice 2a

`DOM-0` → `DOM-1` + `DOM-2` → seeds, per `PHASE_PLAN.md` §6 steps 1–3, plus the renumber and doc
amendment (§4.1) which is step 1 and has no code.

**Out of 2a, explicitly:** `DOM-3`, `DOM-4`, `DOM-5`, `AUTH-2`, the final `DOM-6` pass, and every
route they add or retire. `014` and `015` are **not authored in 2a** — not even as empty files.
`course_staff_assignments`, `admin-staff.controller.ts` and `CourseStaffRepository` are **untouched**
in 2a; `StaffScopeService` keeps its current course-scoped internals.

**`staff-scope.service.spec.ts` is not edited in 2a at all.**

---

# Rulings on slice 2b — 2026-09-20

Input: `docs/phases/unit-2/PHASE_PLAN_2B.md`. The plan is **approved unmodified** but for the split.

## R-5 — 2b splits again. **2b-i / 2b-ii, at the planner's boundary (§10).**

| Slice | Tasks | Migration |
|---|---|---|
| **2b-i — people and courses** | `DOM-3`, `DOM-4`, `DOM-5`, seeds `001`/`002` | `014`, additive |
| **2b-ii — scope** | `AUTH-2` + `D-10`, final `DOM-6` | `015`, destructive |

Same reasoning that produced the 2a/2b split, and that split worked: the only irreversible drop gets
its own review, and `AUTH-2` is the only item carrying an **authorization contract** — seven spec
cases that must pass unmodified, two byte-identical messages, 21 call sites, and `D-10`'s
both-directions refusal tests. That deserves a reviewer's whole attention, not attention divided
with registration plumbing. The two share four files, all additive on one side, and neither needs
anything from the other's migration.

2b measured the same size as 2a, and 2a was tractable **and still returned nine findings.**

## R-6 — `B-1`: **register returns no token.** Reading A. And the `JwtStrategy` gate is built regardless.

`POST /auth/register` returns `{ status: 'waiting' }` (201), no `accessToken`, no `user`.
`DOMAIN_MODEL.md:23` says only `active` may authenticate; handing back a credential in the same
response that records the account as unable to authenticate contradicts the model in the API's own
body, and it is the kind of thing someone later "fixes" by removing the gate.

**The security fix is not that, and does not depend on it.** `JwtStrategy.validate`
(`jwt.strategy.ts:34-51`) already re-reads the user from the database on every request — for
existence and role, on the stated principle that *"a deleted or demoted user keeps their old access
until the token expires"*. **`status` has exactly that property, so it belongs in that same query**:
one condition on a read that already happens, at the chokepoint every route passes through, rather
than a guard at `login` that leaves every already-issued token working. It also covers a token
minted **before** a rejection, which a login-only gate cannot.

The frontend mirror change is one line; the sign-up screen's "waiting for approval" state is unit
4's problem and is recorded, not built here.

## R-7 — `B-2`: **`all_groups` reads as `unscoped: true`.** Reading A, ratified.

No authorization difference under either reading — `all_groups` means all groups either way. The
delta is a label and a nullable timestamp on two staff screens unit 5 rebuilds. Add the comment at
the union saying `unscoped` means **unrestricted**, not **admin**.

## R-8 — `B-3`: **the four `assign`/`unassign` cases in `staff-scope.service.spec.ts` may be deleted. That deletion and no other.**

The *extend, never edit* rule exists to stop a contract being weakened to fit new internals — a case
whose assertion is changed to make a rewrite pass is the failure it prevents. It is not a rule that
tests outlive the methods they test: those four exercise `assign`/`unassign`, which this unit's
approved plan deletes along with `/admin/courses/:id/staff`. Keeping them would mean keeping two
methods and three routes the plan retires.

**Binding:** delete exactly those four, name each in `EXECUTION_NOTES.md` with the method it tested,
and land the §4.4.1 replacements in the same commit. **The seven contract cases pass unmodified or
the work stops** — that is unchanged, and substituting the repository token in `beforeEach` remains
a fixture change, the only permitted edit.

## Scope approved for 2b-i

`PHASE_PLAN_2B.md` §6 steps 1 and 2 (`DOM-3`, `DOM-4`, `DOM-5`), plus `014` and its seeds.

**Out of 2b-i:** `AUTH-2`, `D-10`, migration `015`, the final `DOM-6` pass, `backend/src/staff/**`
(including `staff-scope.service.spec.ts`), and `admin-staff.controller.ts`. **`015` is not authored
in 2b-i, not even as an empty file.**
