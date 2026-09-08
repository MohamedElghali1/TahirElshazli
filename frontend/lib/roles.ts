import type { Role } from './types';

/**
 * Which console a signed-in account belongs in.
 *
 * The app has one shell and two consoles: the student LMS under /dashboard and
 * /learn, and the TA/admin surface under /manage. This is the single place
 * that decides which, so the rail, the post-login redirect and the layout
 * guard cannot disagree with each other.
 *
 * None of this is access control. Every route behind both consoles is guarded
 * server-side by `@Roles` (CLAUDE.md §8), and these helpers only decide where
 * to *send* someone - never what they are allowed to read.
 */
export function isStaffRole(role: Role | undefined): boolean {
  return role === 'teacher' || role === 'assistant';
}

/** Where an account lands after signing in, and where a wrong turn returns to. */
export function homePathFor(role: Role | undefined): string {
  return isStaffRole(role) ? '/manage' : '/dashboard';
}

/**
 * Admin means Dr. Tahir's own account (CLAUDE.md §2.1 - there is no third
 * "admin" role; the teacher *is* the admin). A TA is a strict subset.
 */
export function isAdminRole(role: Role | undefined): boolean {
  return role === 'teacher';
}

/**
 * Resolve where to send an account after it signs in or registers.
 *
 * The public course pages hand over a `?next=` so a visitor who clicked
 * "Create an account to enroll" lands on the catalog rather than on a dashboard
 * with no explanation of why they are there.
 *
 * Two rules, and the first is a security one:
 *
 *  1. `next` is a **same-origin path or nothing**. Anything that could leave
 *     this origin is discarded rather than sanitised - an open redirect on a
 *     login page is a phishing primitive, and "it only ever gets our own URLs"
 *     is a property of today's callers, not of the function.
 *  2. Staff ignore it entirely. `next` is written by a marketing page that only
 *     knows about students; honouring it would drop Dr. Tahir on the student
 *     catalog because he happened to arrive through a course page.
 */
export function resolvePostAuthPath(
  role: Role | undefined,
  next: string | null | undefined,
): string {
  const home = homePathFor(role);
  if (isStaffRole(role)) return home;
  return isSafeInternalPath(next) ? next : home;
}

/**
 * A path we are willing to redirect to: rooted, single-slash, and with nothing
 * in it that a browser could read as an authority or a scheme.
 *
 * `//evil.com` and `/\evil.com` are both protocol-relative URLs to another
 * host, and `/%2f%2fevil.com` becomes one after the browser decodes it - so the
 * check runs against the decoded form too.
 */
function isSafeInternalPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith('/')) return false;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed escape is not something we are going to redirect to.
    return false;
  }
  for (const candidate of [value, decoded]) {
    if (!candidate.startsWith('/')) return false;
    if (candidate.startsWith('//')) return false;
    if (candidate.includes('\\')) return false;
    if (candidate.includes(':')) return false;
  }
  return true;
}
