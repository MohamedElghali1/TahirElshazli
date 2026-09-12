'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  BellIcon,
  BooksIcon,
  CaretUpDownIcon,
  ClockCounterClockwiseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  SidebarSimpleIcon,
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
import { ThemeToggle } from '@/components/theme-toggle';
import { cx, Chip, Avatar, IconButton } from '@/components/ui';
import { PageChromeProvider, usePageChrome } from '@/components/app/page-chrome';
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
 * The product shell, rebuilt to Twenty's own three-layer chrome (2026-09-12
 * visual-parity pass, `docs/frontend-design-system.md`):
 *
 *   1. An outer `--shell-bg` layer that is neither the rail's colour nor the
 *      page's - the rail sits transparent on top of it.
 *   2. The rail itself: 220px, no border, the shell colour showing through.
 *   3. The main panel: `--bg-primary`, rounded on its top-left corner only
 *      (`--r-panel`) with a 1px ring drawn as a box-shadow rather than a
 *      border, so the corner and the ring never fight each other's radius.
 *
 * One shell for every signed-in role. The student LMS and the TA/admin
 * console are the same application wearing a different rail, which is what
 * keeps the teacher from having to sign in somewhere else to do their job.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PageChromeProvider>
      <AppShellInner>{children}</AppShellInner>
    </PageChromeProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();
  const { chrome, actions } = usePageChrome();
  const [open, setOpen] = useState(false);
  // Desktop-only icon rail (TASK 3's collapse toggle). Mobile ignores this -
  // the off-canvas sheet always opens at full width, because a collapsed
  // *overlay* has nothing left to click.
  const [collapsed, setCollapsed] = useState(false);
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

  const ChromeIcon = chrome?.icon;

  return (
    <div className="flex min-h-[100dvh] bg-[var(--shell-bg)]">
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-[var(--rail-w)] flex-col',
          'bg-transparent transition-transform duration-[var(--dur-fast)] ease-[var(--ease)]',
          'lg:translate-x-0 rtl:lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          collapsed ? 'lg:w-[var(--rail-w-collapsed)]' : 'lg:w-[var(--rail-w)]',
        )}
      >
        <div className="flex flex-1 flex-col gap-[var(--sp-1)] pt-[var(--sp-1)] pb-[var(--sp-4)] pe-0 ps-[var(--sp-2)]">
          {/* The workspace chip - Twenty's own top-of-rail control. There is
              one workspace here, so it never opens anything; it still carries
              the account identity that used to sit in the footer, which is
              why sign-out is what remains down there. */}
          <Link
            href={staff ? '/manage' : '/dashboard'}
            className={cx(
              'flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-sm)]',
              'px-[var(--sp-1)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-nav)]',
            )}
          >
            <Avatar name={user?.name ?? ''} size="xs" className="shrink-0" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
                  {user?.name}
                </span>
                <CaretUpDownIcon size={12} className="shrink-0 text-[var(--fg-muted)]" />
              </>
            )}
          </Link>

          {/* The collapse toggle is deliberately OUTSIDE the `!collapsed`
              guard that hides the search button: it is the only control that
              can undo a collapse, so hiding it with the rest of the row left
              the rail stuck narrow until a reload. */}
          <div className="flex items-center gap-[var(--sp-1)] px-[var(--sp-1)]">
            {/* Nothing exists to search yet - an honest disabled control
                rather than a text field that goes nowhere. */}
            {!collapsed && (
              <IconButton
                label="Search (coming soon)"
                size="sm"
                disabled
              >
                <MagnifyingGlassIcon size={16} />
              </IconButton>
            )}
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
            >
              <SidebarSimpleIcon size={16} />
            </IconButton>
          </div>

          {!collapsed && (
            <p className="mb-[var(--sp-1)] mt-[var(--sp-3)] ps-[var(--sp-3)] text-[var(--fs-xxs)] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Workspace
            </p>
          )}

          <nav className={cx('flex flex-col gap-[var(--gap-siblings)]', collapsed ? 'mt-[var(--sp-3)]' : '')}>
            {NAV.map(({ href, label, Icon }) => {
              // Two exact-match cases, because both own deeper routes that
              // belong to a *different* entry: /dashboard owns /learn/*, and
              // /manage is the parent of every other staff link in this rail.
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
                  title={collapsed ? label : undefined}
                  className={cx(
                    'flex h-[var(--h-nav)] items-center gap-[var(--sp-1)] rounded-[var(--r-sm)]',
                    'px-[var(--sp-nav-x)] text-[var(--fs-base)] transition-colors duration-[var(--dur-fast)]',
                    active
                      ? 'bg-[var(--bg-wash-nav)] font-medium text-[var(--fg-primary)]'
                      : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-wash-nav)] hover:text-[var(--fg-primary)]',
                  )}
                >
                  <Icon size={16} weight={active ? 'fill' : 'regular'} />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && href === '/notifications' && unread > 0 && (
                    <span className="num rounded-[var(--r-full)] bg-[var(--accent)] px-[var(--sp-2)] text-[var(--fs-xxs)] font-semibold leading-[var(--h-tag)] text-[var(--accent-fg)]">
                      {unread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-[var(--sp-2)]">
          <div
            className={cx(
              'flex items-center gap-[var(--sp-1)] rounded-[var(--r-sm)] px-[var(--sp-1)]',
              collapsed ? 'flex-col' : '',
            )}
          >
            {/* Which console this is. A TA and the teacher share the shell, so
                the rail says which set of powers is in play rather than
                leaving it to be inferred from which links happen to be
                present. */}
            {staff && !collapsed && (
              <Chip tone={user?.role === 'teacher' ? 'amber' : 'teal'} className="flex-1">
                {user?.role === 'teacher' ? 'Teacher' : 'Assistant'}
              </Chip>
            )}
            <IconButton
              label="Sign out"
              size="sm"
              onClick={() => void signOut()}
            >
              <SignOutIcon size={16} />
            </IconButton>
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

      <div
        className={cx(
          'flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]',
          // `rounded-ss` (start-start), not `rounded-tl`: the rail is on the
          // right in Arabic, so the panel's cut corner has to follow it
          // (CLAUDE.md §4). The cast shadow has to flip with it - a box-shadow
          // offset cannot be expressed logically, so it is a second token
          // behind the `rtl:` variant rather than a mirrored sign inline.
          'lg:rounded-ss-[var(--r-panel)] lg:shadow-[var(--shadow-panel)]',
          'rtl:lg:shadow-[var(--shadow-panel-rtl)]',
          collapsed ? 'lg:ms-[var(--rail-w-collapsed)]' : 'lg:ms-[var(--rail-w)]',
        )}
      >
        <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center justify-between gap-[var(--sp-2)] border-b border-[var(--border-light)] bg-[var(--bg-primary)] px-[var(--sp-3)]">
          <div className="flex min-w-0 items-center gap-[var(--sp-2)]">
            <IconButton
              label={open ? 'Close navigation' : 'Open navigation'}
              size="sm"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden"
            >
              {open ? <XIcon size={16} /> : <ListIcon size={16} />}
            </IconButton>
            {chrome?.backHref && (
              <IconButton
                label="Back"
                size="sm"
                onClick={() => router.push(chrome.backHref as string)}
              >
                <ArrowLeftIcon size={16} />
              </IconButton>
            )}
            {ChromeIcon && (
              <ChromeIcon size={16} className="shrink-0 text-[var(--fg-tertiary)]" />
            )}
            {/* Nothing here for a route that hasn't registered a chrome title
                (the student pages, still on their own `PageHeader` below) -
                an empty `<h1>` is a worse landmark than none, and that page
                already has its own real one. */}
            {chrome?.title && (
              <h1 className="truncate text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]">
                {chrome.title}
              </h1>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-[var(--sp-2)]">
            {actions}
            <ThemeToggle size="sm" />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
