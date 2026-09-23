import type { LiveSession } from './interfaces/live-session-repository.interface.js';

/** Minutes before `scheduledAt` the meeting link is released (`PHASE_PLAN.md` §3.4). */
export const LINK_RELEASE_MINUTES = 30;

/**
 * The session as a student may see it (`PHASE_PLAN.md` §3.5).
 *
 * An **explicit allow-list**, not `LiveSession` minus staff fields: every field
 * here is named, so a column a later migration adds to the row does not reach a
 * student until someone deliberately lists it here. `privateNotes` and
 * `assistantId` (display-only, but staff's business) never appear.
 *
 * `meetingLink` is `?:`, not `| null` - the T-30 rule is enforced by the key's
 * **presence**, not its value (`PHASE_PLAN.md` §3.4: "not `null`, the key is
 * not present at all").
 */
export interface StudentSessionView {
  id: string;
  groupId: string;
  title: string;
  scheduledAt: string;
  endsAt: string;
  description: string | null;
  meetingLink?: string;
}

/**
 * Whether the meeting link is due: `now` is within `[scheduledAt - 30min, endsAt]`.
 *
 * `D-9` collapsed `PRODUCT_SPEC.md` §6's "live and online" to "live" - every
 * session is online, so there is no `mode` test here.
 */
export function isLinkDue(session: LiveSession, now: Date): boolean {
  const releaseAt =
    new Date(session.scheduledAt).getTime() - LINK_RELEASE_MINUTES * 60_000;
  const t = now.getTime();
  return t >= releaseAt && t <= new Date(session.endsAt).getTime();
}

/** Whether a session is one a student is allowed to see at all. */
export function isStudentVisible(session: LiveSession): boolean {
  return session.state === 'published' && session.isVisible;
}

/**
 * The allow-list. Every field is named; nothing is copied by spreading the row.
 *
 * **This is the only sanctioned way a `LiveSession` becomes student-facing
 * JSON.** It lives here, as a plain function rather than a method, precisely so
 * that every service which answers a student can reach it without taking a
 * dependency on `StudentSessionsService`. The original leak this replaces
 * happened because one route serialised a session by spreading the row and a
 * later migration widened it; a second, identical leak survived the first fix
 * because two *other* services called a method that still returned the raw row.
 * A shared function is what makes "students only ever see the allow-list" a
 * property of the code rather than a thing each caller has to remember.
 */
export function toStudentSessionView(
  session: LiveSession,
  now: Date,
): StudentSessionView {
  const view: StudentSessionView = {
    id: session.id,
    groupId: session.groupId,
    title: session.title,
    scheduledAt: session.scheduledAt,
    endsAt: session.endsAt,
    description: session.description,
  };
  // Absent unless due, and absent when due but never set - either way there
  // is nothing to reveal, so the key stays off the object rather than `null`.
  if (session.meetingLink !== null && isLinkDue(session, now)) {
    view.meetingLink = session.meetingLink;
  }
  return view;
}
