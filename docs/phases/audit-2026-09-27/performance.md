# Performance & Data-flow Audit — Dr. Tahir LMS

Scale assumed throughout (CLAUDE.md §1): ~300 students, ~10 groups of ~30, 2 courses, 1 teacher,
2-3 assistants, 1 VPS, 1 replica, `DATABASE_POOL_MAX` default 10.

---

## CONFIRMED BOTTLENECKS

### PERF-01 — Announcement publish holds a DB transaction open across N sequential SMTP sends
**Severity: P1** (real pool-exhaustion / request-timeout risk, on a route every teacher uses routinely)

- `backend/src/announcements/announcements.service.ts:201-243` (`publish()`)
- `backend/src/mail/mail.service.ts:28-48` (`MailService.send`)

**Evidence.** `publish()` runs entirely inside `this.db.runInTransaction(...)`. After resolving
recipients it does:
```ts
const users = await this.userRepo.findByIds(recipientIds);
for (const user of users) {
  if (user.email) {
    await this.mail.send({ ... });   // announcements.service.ts:237
  }
}
```
`MailService.send` (mail.service.ts:34-41) *requires* `this.db.inTransaction` and awaits the real
`sender.send()` (an SMTP round trip) before recording the delivery row — by design, so the delivery
row and the triggering action commit together (documented rationale, mail.service.ts:18-26).

**Impact at stated scale.** A "whole course" or "all students" announcement audience is up to ~300
recipients. Sequential `await` per recipient means the transaction — and the one Postgres connection
out of the pool of 10 it holds — stays open for `N × SMTP round-trip time`. At a conservative
300 ms/send that's 90 s; a slow or rate-limited SMTP provider (Google Forms-adjacent mail limits,
free-tier SMTP throttling) pushes this into minutes. One held connection is 10% of the pool for the
whole run; a second concurrent publish (teacher + assistant, or a retry after a timeout) can starve
the pool for every other staff/student request for that entire window. A reverse-proxy request
timeout (typically 30-60s) will very likely fire client-side before this completes for a full-course
audience, and the transaction keeps running server-side regardless (Node doesn't cancel it), so a
"failed" request may still silently complete minutes later.

**Minimal fix (implementable brief).**
- File: `backend/src/announcements/announcements.service.ts`, the loop at line 235-243.
- Change: replace the sequential `for...of` + `await` with `await Promise.all(users.filter(u => u.email).map(u => this.mail.send({...})))`. This keeps the existing atomicity contract (all sends + delivery rows still commit with the announcement, `MailService.send`'s transaction requirement is untouched) but turns N sequential round-trips into N concurrent ones, cutting wall-clock time by roughly the concurrency factor the mail driver/SMTP connection allows.
- Do **not** move the send outside the transaction — that would break the documented "delivery row and triggering action commit together" invariant (CLAUDE.md §9) and is a bigger change than this finding needs.
- Acceptance check: a test (or manual run) publishing to a 250+ recipient fixture audience completes in roughly `max(single-send latency) + O(1)` instead of `N × single-send latency`; existing `announcements.service.spec.ts` / e2e coverage for `publish` should still pass unchanged since ordering isn't asserted.
- Note the residual ceiling: `Promise.all` still holds one pool connection for `max(latency)` rather than `sum(latency)` — acceptable at 300 recipients, but if the audience model ever grows past low thousands or a slow mail provider is used, batch in chunks of e.g. 50 rather than one unbounded `Promise.all`. (`ponytail:` this is the honest ceiling — chunk if the mail driver's real-world provider turns out to rate-limit concurrent sends.)

---

### PERF-02 — Student notification list has no LIMIT and grows unbounded with account age
**Severity: P2** (named explicitly in scope — "unbounded queries that grow with time" — real, cheap to fix, but softened by an existing supporting index)

- `backend/src/notifications/repositories/postgres-notification.repository.ts:42-52` (`findByUser`)
- Interface: `backend/src/notifications/interfaces/notification-repository.interface.ts:41`
- Caller: `backend/src/notifications/notifications.service.ts:39`

**Evidence.**
```sql
SELECT ... FROM notifications
WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR read = false)
ORDER BY created_at DESC
```
No `LIMIT`. A notification row is created per grade release, new recording, upcoming live session
and assessment-available event (migration `001_student_platform.sql:277-293`) — one of the growing
tables CLAUDE.md §9 names by category (audit log, notifications, submissions). The supporting index
`notifications_user_id_created_at_idx (user_id, created_at DESC)` (same migration, line 292-293)
keeps the *scan* cheap, so this is not a slow query today — it's an unbounded *result set* and
unbounded serialization/transfer cost that grows every term a student stays enrolled across two
courses.

**Impact at stated scale.** Over two IGCSE/IELTS terms a student can accumulate several hundred
notification rows (grade postings alone: ~20 tasks × 2 courses, plus recordings/sessions/announcements
fan-out). Not a crash at 300 users, but a screen with no cap keeps growing indefinitely and is opened
on every bell-icon click — a genuinely "worth fixing cheaply" case per CLAUDE.md §1's own carve-out,
not a false positive.

**Minimal fix.**
- Add a `LIMIT` param to `findByUser(userId, unreadOnly, limit = 50)` in the interface and both
  implementations (`postgres-notification.repository.ts`, the matching `InMemory*` one), and pass a
  fixed constant (e.g. 50) from `notifications.service.ts:39` — no cursor/pagination UI needed at
  this scale (CLAUDE.md §1: "no pagination furniture" — a plain cap, not a paged control, is the
  right rung here).
- Acceptance check: `notifications.service.spec.ts` gets one case asserting a user with 60+
  notifications gets back ≤ 50, newest first; `countUnread` (already `COUNT(*)`, unaffected) still
  reports the true unread count regardless of the cap.

---

### PERF-03 — `expectedStudentIds` fetches group members one group at a time instead of batching
**Severity: P3** (real N+1, but bounded by targeted-group count per assessment, typically 1-3, cap ~10 — not worth more than the trivial fix)

- `backend/src/assessments/work-analytics.service.ts:137-149`
- Callers: `forAssessment` (line 161) and `rosterForAssessment` (line 207) — per-assessment analytics
  screens, invoked once per opened assessment, not in a list fan-out.

**Evidence.**
```ts
private async expectedStudentIds(assessmentId: string): Promise<Set<string>> {
  const targets = await this.assessments.findTargets(assessmentId);
  const ids = new Set<string>();
  for (const target of targets) {
    const members = await this.groupRepo.findMembers(target.groupId); // one query per targeted group
    ...
```
The codebase already has the batched primitive one call away:
`GroupRepository.findMembersForGroups(groupIds)` (`group-repository.interface.ts:122`), used
correctly elsewhere in the same file (`marking.service.ts:269`) and in `groups.service.ts`.

**Impact at stated scale.** A task is typically targeted at 1-3 groups; worst case ~10 (all groups).
That's ≤10 extra round trips per open of one assessment's analytics page — not a bottleneck at this
scale, but it's the one place in this codebase that didn't reach for the batching helper it already
has everywhere else.

**Minimal fix.**
- Replace the loop with: `const members = await this.groupRepo.findMembersForGroups(targets.map(t => t.groupId)); for (const m of members) ids.add(m.studentId);`
- Acceptance check: `work-analytics.service.spec.ts` — assert `expectedStudentIds`/`forAssessment` issue one `findMembersForGroups` call regardless of target-group count (mock/spy count), same returned `Set` contents as before.

---

## POSSIBLE OPTIMIZATIONS — not needed at this scale (recorded, not actioned)

- **Markbook / group report (`groups.service.ts:572-730`)** — already exactly right: single batched
  `Promise.all` reads for members/assessments/users/submissions/results/bindings, one small
  `Promise.all(forms.map(tallyResults))` bounded by the group's Google Form task count (not the
  roster). No change needed; flagging only because it's the pattern the rest of the codebase should
  match (PERF-03 is the one place that didn't).
- **Grading/marking queue (`marking.service.ts:260-330`)** — batched the same way (`findByIds`,
  `findMembersForGroups`, one `countBySubmissionFiles` call). No N+1.
- **Dashboard composition (`dashboard/dashboard.service.ts`)** — pure composition over already-scoped
  service calls via one `Promise.all`; each sub-call is itself O(1) queries. No fan-out.
- **DB pool sizing (`database.module.ts:36-50`)** — `max: 10`, `idleTimeoutMillis: 30s`,
  `connectionTimeoutMillis: 10s`, an `error` listener on the pool (prevents an idle-client error from
  crashing the process). Correctly sized for one VPS + one replica; the code comment already says
  scaling is a config change, not a code change. No `statement_timeout` is set, which is a minor gap
  (a runaway query could hold a connection indefinitely) but not worth adding proactively at this
  scale — add if a slow/unbounded query is ever found in practice, not speculatively.
- **`DatabaseService.transaction`/`runInTransaction` (`database.service.ts`)** — every path releases
  the client in a `finally`; nested transactions correctly join rather than double-`BEGIN`. No leak
  found on any error path.
- **Rate limiter (`in-memory-rate-limit.store.ts`)** and **token denylist
  (`token-denylist.service.ts`)** — both are unbounded-sounding per-process `Map`s but both actively
  prune (rate limiter sweeps expired windows every 60s on next `hit()`; denylist prunes on every
  `revoke`/`revokeAllForUser`). Correctly bounded for one replica. Not a leak.
- **Audit log reads (`postgres-audit-log.repository.ts:125-126`)** — already has `ORDER BY
  created_at DESC, id DESC LIMIT`, the keyset-cursor pattern CLAUDE.md §9 asks for. No caching layer,
  no Redis, no queue anywhere in the mail/notification/audit paths — correctly absent at this scale;
  do not add one.
- **Frontend**: `pdfjs-dist` is dynamically `import()`-ed inside `components/marking/pdf-page.tsx`
  (code-split, not in the main bundle) — correct already. The dashboard's live clock
  (`app/(app)/dashboard/page.tsx:106-116`) ticks every 30s via `setInterval`, not a tight poll — fine.
  No `useEffect` refetch loops or polling found in the `(app)` route group beyond that one 30s clock.
  Did not find `frontend/.next` build output on disk to report bundle sizes (not built at time of
  this audit) — skipped per instructions rather than triggering a build myself.
- **SQL indexing** — spot-checked FK columns filtered in WHERE clauses (group_id, course_id,
  student_id, assessment_id across assessments/groups/live-sessions/notifications) against
  `CREATE INDEX` statements in migrations 001-026; the ones touched during this audit (notifications,
  attendance, groups, assessments) all have supporting composite indexes. Did not exhaustively diff
  all 17 FK'd tables against all 113 `CREATE INDEX` statements — general spot-check found no gap;
  a full FK-vs-index diff was out of scope for the time budget and nothing in the traced hot paths
  suggested a missing one.
