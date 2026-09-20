# Authorization model

Six roles, one of them new. The rule that governs everything here is the design's fifth
non-negotiable and `CLAUDE.md` §8, which say the same thing:

> **Hiding a control is courtesy, never security.** Permissions are enforced server-side on every
> request. Never design a flow whose safety depends on a button being absent.

The frontend's rail, tabs and disabled buttons decide *where to send someone*, never *what they may
read*.

---

## 1. Roles

| Role | Enum | Meaning |
|---|---|---|
| Visitor | `visitor` | Not signed in. Marketing, catalog, blog only. |
| Student | `student` | Their own work, their own groups' classmates. |
| Parent | `parent` | **Reserved. No login.** Parents receive emailed reports. |
| Assistant | `assistant` | Teaching support, scoped. Cannot remove people. |
| Full admin | `admin` | **New.** Everything the teacher can do, under their own name. |
| Teacher | `teacher` | Dr. Tahir. Everything. |

`teacher` and `admin` are **identical in permission and distinct in identity**. The design says so:
*"Two people share this console. Dr. Tahir and the full admin have identical access. If you need to
know who did what, the assistant activity log records every action by name."* That is the whole
reason `admin` exists as a role rather than as a second teacher account — attribution.

**Implementation note.** Because the pair is always allowed together, define it once:

```ts
export const STAFF_ADMIN = [Role.Teacher, Role.Admin] as const;   // the /admin/* surface
export const STAFF_ALL = [Role.Assistant, Role.Teacher, Role.Admin] as const;  // /staff/*
```

and use `@Roles(...STAFF_ADMIN)` / `@Roles(...STAFF_ALL)` everywhere. Writing a set out by hand is how
one of them silently drifts. Two constants, not one, because
`@Roles(Role.Assistant, ...STAFF_ADMIN)` hand-written at seven sites is the same argument one level
up. **`STAFF_ADMIN` must never contain `Role.Assistant`** — that is the `/admin/*` boundary, and
unlike a missed widening it is silent when broken.

**The real size of the change, corrected 2026-09-19 on building `AUTH-1`.** Not "~30 call sites":
`@Roles` is applied at **class level throughout**, so the work is **14 decorator sites covering 63
routes** — 6 `/admin/*` controllers (25 routes) → `STAFF_ADMIN`, 7 `/staff/*` controllers (35 routes)
→ `STAFF_ALL`, and `NotificationsController` (3 routes) → `Role.Student, ...STAFF_ALL`. Eleven
student-only sites and four public controllers are untouched. The figure matters operationally: an
executor planning against "~30" stops at roughly half the boundary.

**Adding a `Role` member produces zero compile errors** — there is no `Record<Role, …>` and no `switch`
on a role value anywhere in either workspace — so none of this is found by the compiler.
`backend/src/auth/role-guards.spec.ts` reflects `@Roles` off all 25 controllers and asserts the table,
that no `admin/`-mounted controller admits an assistant, and that every route handler reaches an
explicit verdict rather than relying on `RolesGuard`'s fail-closed 403 to hide it.

---

## 2. Assistant scope

An assistant carries a **scope**, stored explicitly:

| Scope | Reach |
|---|---|
| `all_groups` | Every group, every course |
| `assigned_groups` | Only the groups named in `AssistantGroupAssignment` |

Scope is a column, not an inference from row count. *"No assignment rows"* must never be ambiguous
between "sees everything" and "not set up yet" — that ambiguity is how an unconfigured account
silently becomes a superuser.

**This replaces course scoping.** `CourseStaffAssignment` is migrated to group assignments and
dropped. Group is the finer grain and the one the design actually assigns; course reach becomes
*derived* — the courses of the groups you hold.

### Scope is a query filter, never a UI filter
`CLAUDE.md` §5.11 is unchanged in spirit and must survive the rewrite:

- Every assistant-facing read **joins through the assignment** before returning anything.
- There is no "fetch everything and let the client hide some of it".
- An out-of-scope resource answers **404, not 403**, with a message **byte-identical** to a
  genuinely missing one. A 403 confirms the thing exists, which lets an assistant enumerate the
  platform one id at a time. `staff-scope.service.spec.ts` asserts this today and must keep doing so.

---

## 3. Capability matrix

`✓` allowed · `—` refused · `own` own records only

| Capability | Student | Assistant | Admin | Teacher |
|---|---|---|---|---|
| **Accounts** |
| Register (self) | ✓ | — | — | — |
| Accept a pending registration | — | — | ✓ | ✓ |
| **Reject** a pending registration | — | **—** | ✓ | ✓ |
| Create a student account | — | — | ✓ | ✓ |
| **Delete/deactivate an account** | — | **—** | ✓ | ✓ |
| Edit own profile / password | own | own | own | own |
| Invite or edit an assistant | — | — | ✓ | ✓ |
| Change an assistant's scope | — | — | ✓ | ✓ |
| **Enrolment** |
| Enrol a student on a course | — | — | ✓ | ✓ |
| **Unenrol a student** | — | **—** | ✓ | ✓ |
| **Groups** |
| View groups | own | in scope | ✓ | ✓ |
| Create / rename / delete a group | — | — | ✓ | ✓ |
| Set a group's course, assistant, room | — | — | ✓ | ✓ |
| **Add** a student to a group | — | **✓** | ✓ | ✓ |
| **Remove** a student from a group | — | **—** | ✓ | ✓ |
| View classmates | own group | in scope | ✓ | ✓ |
| **Tasks** |
| View tasks | targeted | in scope | ✓ | ✓ |
| Create / edit / re-target a task | — | ✓ | ✓ | ✓ |
| Delete a task | — | ✓ (none submitted) | ✓ | ✓ |
| Manage the draft library | — | ✓ | ✓ | ✓ |
| Submit work | own | — | — | — |
| **Marking** |
| View submissions | own | in scope | ✓ | ✓ |
| Grade, annotate, return | — | ✓ | ✓ | ✓ |
| View the mark book | own marks | in scope | ✓ | ✓ |
| **Reports** |
| View a weekly report | own | in scope | ✓ | ✓ |
| Write the assistant note | — | ✓ | ✓ | ✓ |
| Mark reviewed | — | ✓ | ✓ | ✓ |
| **Send to parent** | — | **—** | ✓ | ✓ |
| Regenerate a week | — | — | ✓ | ✓ |
| **Sessions** |
| View the timetable | own groups | in scope | ✓ | ✓ |
| Create / edit / cancel a session | — | `[UNCERTAIN]` | ✓ | ✓ |
| Mark attendance | — | ✓ | ✓ | ✓ |
| Publish the draft timetable | — | — | ✓ | ✓ |
| **Content** |
| Upload / edit a recording | — | — | ✓ | ✓ |
| Upload material | — | ✓ | ✓ | ✓ |
| Author a blog post | — | ✓ (own only) | ✓ | ✓ |
| **Communication** |
| Announce to one group | — | ✓ in scope | ✓ | ✓ |
| Announce to a course / all students | — | — | ✓ | ✓ |
| **Platform** |
| Read the audit log | — | — | ✓ | ✓ |
| Course CRUD | — | — | ✓ | ✓ |
| Google connection | — | — | ✓ | ✓ |
| Notification preferences | own | own | own | own |

### The four withheld verbs
The client's rule was *"one type of assistant can see and alter all the groups, but his difference
from the teacher is he can't remove students"*. Concretely, an assistant may never:

1. delete or deactivate an account,
2. unenrol a student from a course,
3. remove a student from a group,
4. reject a pending registration.

Note (3) narrowed shipped behaviour: `DELETE /staff/groups/:groupId/members/:studentId` **was**
TA-reachable. **Add stays, remove moves to teacher/admin** — which preserves the client's 2026-09-10
grant that "a student is assigned to a group by the assistant or the teacher" while honouring the new
rule.

**Built 2026-09-19 (`AUTH-3`).** `backend/src/auth/capabilities.ts` — a **single capability preset**,
not `if (role === 'assistant')` scattered through services, which `CLAUDE.md` §7 has required from the
start and which is what makes the next permission question a data change rather than an audit. It is a
**pure module, not a provider**: it holds no state and reads no repository, so a fourth `@Global()` or
even a plain `@Injectable()` would buy only ceremony.

Three properties worth knowing before changing it:

- The preset is an **exhaustive `Record<Capability, boolean>`**, so adding a capability without
  deciding whether an assistant holds it is a **compile error**, not an oversight. Same device as
  `ListAuditLogQueryDto`'s `Record<AuditAction, true>`.
- **Default-deny for every other role.** The teacher and the admin hold everything; an assistant holds
  what the `Record` says; a student, a parent, a visitor, `''` or a mis-cased `'ADMIN'` hold nothing.
- **One refusal message for all four**, capability-independent, so a caller probing the API cannot
  learn which of four rules they tripped. Asserted identical across all four in
  `capabilities.spec.ts`.

The one routed verb is refused **twice**: at a method-level `@Roles(...STAFF_ADMIN)` on
`StaffGroupsController.removeMember` (which `RolesGuard` honours over the class's because it reads
`getAllAndOverride(ROLES_KEY, [handler, class])`), and again as the **first statement** of
`GroupsService.removeMember`, before the group or the membership is read — so a refused assistant
cannot use the difference between a 403 and a 404 as an existence oracle. Over HTTP the guard wins and
the body reads `'Forbidden resource'`; the service message appears only on a direct service call,
which is why both layers have their own test. **403, not 404**: this is *capability*, not scope — the
assistant is looking at the roster, so a 404 would make the UI lie about a row it is rendering.

The other three verbs have no route yet (`DOM-4`, `PEOPLE-1`) and each already has its refusal test.

---

## 4. Resource-level rules

Role alone is never sufficient. Every handler must also answer an ownership or membership question.

| Resource | Gate |
|---|---|
| Any student-facing course read | `EnrollmentsService.assertEnrolled(courseId, jwt.sub)` → 404 |
| Assessment (student) | enrolled **and** targeted at one of their groups — enrolment alone is not enough, or an id would be enough to read and submit against another cohort's task |
| Submission (student) | `submission.studentId === jwt.sub`; updates are predicated on `studentId` in SQL so a cross-student overwrite is impossible even if the id leaks |
| Notification | `userId === jwt.sub`, enforced in the repository predicate, not by role |
| Classmates | caller's own membership of that group; unplaced students get an **empty list, not a 403**, and never another group's roster |
| Report document | resolved through `document.courseId` then `assertEnrolled` |
| Any assistant-facing read/write | group scope → 404 |
| Blog post (assistant) | authorship — `BlogService.assertMayMutate`. **403 here, not 404**, because the post is listed on the caller's own console and pretending it does not exist would make the UI lie |
| Weekly report | student sees own; assistant sees in-scope; only teacher/admin may send |

The student id **always** comes from the verified JWT. No route may take a student id that names
someone else — `POST /courses/:id/enroll` and the notification routes are already built this way and
must stay so.

---

## 5. Enforcement mechanics (already correct — preserve)

- **Three global guards, in order:** `RateLimitGuard` → `JwtAuthGuard` → `RolesGuard`. Rate limiting
  runs before authentication deliberately.
- **`RolesGuard` is fail-closed.** A route with no `@Roles()`, `@Public()` or `@AnyRole()` throws
  403 with an explanatory message rather than admitting any signed-in account. This closes the
  "remembered `@UseGuards`, forgot `@Roles`" half-mistake and must not be relaxed.
- **`JwtStrategy` re-reads the user on every request** — denylisted `jti`, password-change cutoff,
  account still exists — and **overwrites `role` from the database**. A tampered role claim dies at
  signature verification; a demoted account loses access immediately, not at token expiry.
- **Exactly 7 `@Public()` routes** today: health, register, login, the two password-reset routes, the
  Google OAuth callback, and the two public controllers. Any addition to this list is a security
  review, not a routine change.

---

## 6. Gaps in the current backend

| Gap | Severity | Fix |
|---|---|---|
| ~~No `admin` role~~ — **closed 2026-09-19 by `AUTH-1`.** `Role.Admin` exists, migration `011` widens both role CHECKs, 63 routes admit it, and one exhaustive `actorRoleOf` replaced fourteen `actorRole` derivations so the audit log attributes an admin's action to the admin. **Migration `011` has not yet run against real PostgreSQL** (`SPEC-12`), so the task is held at `[~]`. | High | `AUTH-1` |
| Scoping is per course, the product is per group | High | `AUTH-2` |
| ~~Assistant capability is implicit in which controller a route sits on~~ — **closed 2026-09-19 by `AUTH-3`.** `backend/src/auth/capabilities.ts` declares the four withheld verbs as an exhaustive `Record<Capability, boolean>`, so adding a capability without deciding whether an assistant holds it is a compile error. `DELETE /staff/groups/:groupId/members/:studentId` is now teacher/admin with a **403**, refused both at a method-level `@Roles` and again in `GroupsService.removeMember` before any repository read. | Medium | `AUTH-3` |
| Token denylist and rate limiter are **per-process** — logout and lockout do not cross replicas | Medium (High once a second replica exists) | Redis; `CLAUDE.md` §7.3's named trigger |
| No object-level gate yet exists for reports, annotations, drafts, attendance — they do not exist | — | Build with the feature, never after |
| `forbidNonWhitelisted` is off — unknown body fields are dropped silently | Low | Considered: dropping is currently load-bearing (the TA announcement DTO relies on it) |

---

## 7. Testing requirement

Non-negotiable, from the brief: **every permission rule has two tests — authorized access succeeds,
unauthorized access is rejected.** Manual UI testing never counts for a security rule.

The existing suites are the template and already do this well:

- `test/staff.e2e-spec.ts` — `it.each` blocks for student-on-admin (403), TA-on-admin (403), and
  **TA-on-unheld-course (404, not 403)**. The 403/404 distinction is itself asserted.
- `test/app.e2e-spec.ts` — cross-course and cross-role isolation, plus identical-body oracle tests
  proving a real-but-out-of-scope id is indistinguishable from an imaginary one.
- `src/auth/roles.guard.spec.ts` — the fail-closed default.

Every new role, scope and capability added by this redesign extends those `it.each` tables. A new
capability without a refusal test is not done.
