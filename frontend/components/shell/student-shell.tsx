'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { cx, Avatar, IconButton, NavItem, NavSection, type IconName } from '@/components/ui';
import { PageChromeProvider } from '@/components/app/page-chrome';
import { ShellHeader } from './shell-header';
import { CourseSwitcher } from './course-switcher';
import { activeHrefFor } from './nav-active';

/**
 * The student shell (`docs/redesign-mapping.md` "Student" section). 248px
 * `--surface-3` rail, no right border, white-pill active item, the course
 * switcher, 1080px content cap, 96px reserved for a future WhatsApp FAB.
 *
 * `docs/phases/unit-4/PHASE_PLAN.md` §2 gives the *flat* IA (Overview / My
 * lessons / Quizzes / Homework / Marks / Timetable / Attendance) to `SHELL-3`
 * specifically, which is slice 4b, not this one — `/learn/[id]/*` has not
 * been collapsed yet, and this rail links to today's working routes instead
 * of a set of pages that don't exist until 4b lands. What's here is the
 * legacy shell's own nav array (`STUDENT_NAV`), unchanged in substance, one
 * NavItem row per link rather than a hand-rolled anchor.
 */

interface NavLeaf {
  href: string;
  label: string;
  icon: IconName;
}

const STUDENT_NAV: NavLeaf[] = [
  { href: '/dashboard', label: 'My courses', icon: 'Home' },
  { href: '/catalog', label: 'Browse courses', icon: 'Book' },
  { href: '/achievements', label: 'Achievements', icon: 'Star' },
  { href: '/notifications', label: 'Notifications', icon: 'Bell' },
  { href: '/profile', label: 'Profile', icon: 'UserCircle' },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <PageChromeProvider>
      <StudentShellInner>{children}</StudentShellInner>
    </PageChromeProvider>
  );
}

function StudentShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [open, setOpen] = React.useState(false);

  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const { data: courseList } = useApi((token) => api.courses.list(token), []);
  const courses = React.useMemo(
    () => courseList?.map((c) => ({ id: c.id, title: c.title })) ?? null,
    [courseList],
  );
  // Local UI state only — the flat, course-scoped routes that would read
  // this selection are SHELL-3's job (slice 4b), not this one.
  const [selectedCourseId, setSelectedCourseId] = React.useState<string | null>(null);
  const effectiveSelected = selectedCourseId ?? courses?.[0]?.id ?? null;

  // Preserved from the legacy shell verbatim: a student-only read (this
  // route is `@Roles(Role.Student)`), so a badge, not a page.
  const { data: notifications } = useApi((token) => api.notifications.list(token), []);
  const unread = notifications?.unreadCount ?? 0;

  // `/dashboard` owns every `/learn/*` route, same as the legacy shell —
  // `/learn/[id]/*` is where a course's content lives and there is no
  // top-level nav item that names it directly yet.
  const activeHref =
    activeHrefFor(
      pathname,
      STUDENT_NAV.map((i) => i.href),
    ) ?? (pathname.startsWith('/learn') ? '/dashboard' : null);

  return (
    <div className="flex min-h-[100dvh] bg-surface">
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-[248px] flex-col bg-surface-3',
          'transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex h-[52px] shrink-0 items-center px-2">
          <CourseSwitcher
            courses={courses}
            selectedId={effectiveSelected}
            onSelect={setSelectedCourseId}
            loading={!courseList}
            className="flex-1"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          <NavSection>
            {STUDENT_NAV.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                count={item.href === '/notifications' && unread > 0 ? unread : null}
                appearance="pill"
                active={item.href === activeHref}
              />
            ))}
          </NavSection>
        </nav>

        <div className="flex items-center justify-between gap-2 p-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={user?.name ?? ''} size={20} />
            <span className="min-w-0 truncate text-base font-medium text-fg">{user?.name}</span>
          </div>
          <IconButton icon="Logout" label="Sign out" onClick={() => void signOut()} />
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-surface-overlay md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col md:ms-[248px]">
        <ShellHeader open={open} onToggle={() => setOpen((v) => !v)} />
        <main id="main" className="min-w-0 flex-1">
          {/* 1080px cap, 96px (pb-24, on the 4px grid) reserved for the
              WhatsApp FAB — not built here, per SHELL-2's own scope. */}
          <div className="mx-auto w-full max-w-[1080px] px-4 pb-24">{children}</div>
        </main>
      </div>
    </div>
  );
}
