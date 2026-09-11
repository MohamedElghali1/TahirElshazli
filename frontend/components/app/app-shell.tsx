'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BellIcon,
  BooksIcon,
  ClockCounterClockwiseIcon,
  ListIcon,
  NewspaperIcon,
  SignOutIcon,
  SquaresFourIcon,
  UserIcon,
  UsersFourIcon,
  UsersThreeIcon,
  VideoIcon,
  XIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useSession, useApi } from '@/lib/session';
import { initials } from '@/lib/format';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/site/wordmark';
import { cx, Chip } from '@/components/ui';
import { isStaffRole } from '@/lib/roles';
import type { Role } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; weight?: 'fill' | 'regular' }>;
}

const STUDENT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'My courses', Icon: SquaresFourIcon },
  { href: '/catalog', label: 'Browse courses', Icon: BooksIcon },
  // The blog, read side (CLAUDE.md §5.19). Labelled for what the client asked
  // for - "a place of teacher achievements the students can view" - rather
  // than "Blog", which reads as marketing copy inside a student's console.
  { href: '/achievements', label: 'Achievements', Icon: NewspaperIcon },
  { href: '/notifications', label: 'Notifications', Icon: BellIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
];

/**
 * The teacher and the assistant share one rail, and the difference between
 * them is three entries (CLAUDE.md §2.2: the directory, the recording library
 * and the activity log are admin, never TA).
 *
 * Hiding them is courtesy, not access control - `/admin/*` is
 * `@Roles(Role.Teacher)` server-side and a TA who types the URL gets 403 from
 * the API regardless of what this array says (§8).
 */
const STAFF_NAV: NavItem[] = [
  { href: '/manage', label: 'Overview', Icon: SquaresFourIcon },
  { href: '/manage/courses', label: 'Courses', Icon: BooksIcon },
  // Authoring the blog, and shared rather than admin-only: the client's
  // instruction on 2026-09-10 named the assistant as an author too, which
  // overrides §2.2's "a TA cannot touch the CMS" preset. An assistant may edit
  // only their own posts, enforced server-side.
  { href: '/manage/blog', label: 'Blog', Icon: NewspaperIcon },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/manage/students', label: 'Students', Icon: UsersThreeIcon },
  // Creating a group and deciding what it studies is teacher-only; *placing*
  // students is not, and a TA reaches that through the course's Groups tab
  // (CLAUDE.md §5.16, §2.2).
  { href: '/manage/groups', label: 'Groups', Icon: UsersFourIcon },
  { href: '/manage/recordings', label: 'Recordings', Icon: VideoIcon },
  { href: '/manage/activity', label: 'Activity log', Icon: ClockCounterClockwiseIcon },
];

function navFor(role: Role | undefined): NavItem[] {
  if (role === 'teacher') return [...STAFF_NAV, ...ADMIN_NAV];
  if (role === 'assistant') return STAFF_NAV;
  return STUDENT_NAV;
}

/**
 * The product shell: a fixed rail at --sp-* widths, a 56px top bar, and the
 * page in between. Everything here is the dense token scale - the marketing
 * site's rhythm has no business inside the app.
 *
 * One shell for every signed-in role. The student LMS and the TA/admin console
 * are the same application wearing a different rail, which is what keeps the
 * teacher from having to sign in somewhere else to do their job.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const staff = isStaffRole(user?.role);
  const NAV = navFor(user?.role);

  // A route change with the sheet still open leaves the page unscrollable.
  // Adjusted during render rather than in an effect: an effect would paint one
  // frame with the sheet still over the new page, and React's own guidance is
  // to derive state from a changed prop this way.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // The badge is the one number in the shell, so it gets its own read rather
  // than being threaded down from whichever page happens to be mounted.
  //
  // Students only: `/notifications` is `@Roles(Role.Student)`, so calling it as
  // a teacher is a guaranteed 403 - and `useApi` treats nothing but 401 as a
  // sign-out, so it would surface as a permanent error rather than a redirect
  // loop. Returning null skips the request instead of failing it.
  const { data: notifications } = useApi(
    (token) => (staff ? Promise.resolve(null) : api.notifications.list(token)),
    [staff],
  );
  const unread = notifications?.unreadCount ?? 0;

  return (
    <div className="flex min-h-[100dvh] bg-[var(--bg-primary)]">
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-[248px] flex-col border-e border-[var(--border-light)]',
          'bg-[var(--bg-primary)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease)]',
          'lg:translate-x-0 rtl:lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex h-[56px] items-center gap-[var(--sp-2)] px-[var(--sp-4)]">
          <Link href={staff ? '/manage' : '/dashboard'} aria-label="Home">
            <Wordmark />
          </Link>
          {/* Which console this is. A TA and the teacher share the shell, so
              the rail says which set of powers is in play rather than leaving
              it to be inferred from which links happen to be present. */}
          {staff && (
            <Chip tone={user?.role === 'teacher' ? 'amber' : 'teal'}>
              {user?.role === 'teacher' ? 'Teacher' : 'Assistant'}
            </Chip>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-[var(--sp-1)] px-[var(--sp-2)] py-[var(--sp-2)]">
          {NAV.map(({ href, label, Icon }) => {
            // Two exact-match cases, because both own deeper routes that belong
            // to a *different* entry: /dashboard owns /learn/*, and /manage is
            // the parent of every other staff link in this rail.
            const active =
              href === '/dashboard'
                ? pathname === '/dashboard' || pathname.startsWith('/learn')
                : href === '/manage'
                  ? pathname === '/manage'
                  : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-[var(--h-md)] items-center gap-[var(--sp-3)] rounded-[var(--r-md)]',
                  'px-[var(--sp-3)] text-[var(--fs-base)] transition-colors duration-[var(--dur-fast)]',
                  active
                    ? 'bg-[var(--bg-wash)] font-medium text-[var(--fg-primary)]'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-wash-subtle)] hover:text-[var(--fg-primary)]',
                )}
              >
                <Icon size={16} weight={active ? 'fill' : 'regular'} />
                <span className="flex-1">{label}</span>
                {href === '/notifications' && unread > 0 && (
                  <span className="num rounded-[var(--r-full)] bg-[var(--accent)] px-[var(--sp-2)] text-[var(--fs-xxs)] font-semibold leading-[var(--h-xs)] text-[var(--accent-fg)]">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border-light)] p-[var(--sp-2)]">
          <div className="flex items-center gap-[var(--sp-3)] rounded-[var(--r-md)] px-[var(--sp-3)] py-[var(--sp-2)]">
            <span
              aria-hidden
              className="num flex h-[var(--h-lg)] w-[var(--h-lg)] shrink-0 items-center justify-center rounded-[var(--r-full)] bg-[var(--bg-tertiary)] text-[var(--fs-xs)] font-semibold text-[var(--fg-secondary)]"
            >
              {user ? initials(user.name) : ''}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[var(--fs-base)] text-[var(--fg-primary)]">
                {user?.name}
              </span>
              <span className="block truncate text-[var(--fs-xxs)] text-[var(--fg-muted)]">
                {user?.email}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="shrink-0 rounded-[var(--r-xs)] p-[var(--sp-1)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)] hover:text-[var(--fg-primary)]"
            >
              <SignOutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--bg-scrim)] lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:ms-[248px]">
        <header className="sticky top-0 z-20 flex h-[56px] items-center gap-[var(--sp-2)] border-b border-[var(--border-light)] bg-[var(--bg-primary)] px-[var(--sp-4)]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            className="inline-flex h-[var(--h-lg)] w-[var(--h-lg)] items-center justify-center rounded-[var(--r-md)] text-[var(--fg-secondary)] hover:bg-[var(--bg-wash)] lg:hidden"
          >
            {open ? <XIcon size={18} /> : <ListIcon size={18} />}
          </button>
          <div className="ms-auto flex items-center gap-[var(--sp-1)]">
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
