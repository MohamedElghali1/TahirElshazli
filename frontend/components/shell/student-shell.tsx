'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { cx, Avatar, IconButton, NavItem, NavSection, type IconName } from '@/components/ui';
import { PageChromeProvider } from '@/components/app/page-chrome';
import { ShellHeader } from './shell-header';
import { CourseSwitcher } from './course-switcher';
import { CourseProvider, useSelectedCourse } from './course-context';
import { activeHrefFor } from './nav-active';

/**
 * The student shell (`docs/redesign-mapping.md` "Student" section). 248px
 * `--surface-3` rail, no right border, white-pill active item, the course
 * switcher, 1080px content cap, 96px reserved for a future WhatsApp FAB.
 *
 * `SHELL-3` (`docs/phases/unit-4/PHASE_PLAN.md`): the flat IA this rail now
 * carries — `/learn/[id]/*` is gone, and every course-scoped item reads its
 * course from `CourseProvider`, the same selection the switcher writes.
 */

interface NavLeaf {
  href: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  title?: string;
  items: NavLeaf[];
}

const NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: 'Home' },
      { href: '/lessons', label: 'My lessons', icon: 'Video' },
      { href: '/quizzes', label: 'Quizzes', icon: 'ListNumbers' },
      { href: '/homework', label: 'Homework', icon: 'Clipboard' },
      { href: '/marks', label: 'Marks', icon: 'ChartPie' },
      { href: '/timetable', label: 'Timetable', icon: 'CalendarEvent' },
      { href: '/attendance', label: 'Attendance', icon: 'CircleCheck' },
    ],
  },
  {
    title: 'More',
    items: [
      { href: '/classmates', label: 'Classmates', icon: 'Users' },
      { href: '/profile', label: 'Settings', icon: 'Settings' },
      { href: '/help', label: 'Help', icon: 'MessageCircle' },
    ],
  },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <PageChromeProvider>
      <CourseProvider>
        <StudentShellInner>{children}</StudentShellInner>
      </CourseProvider>
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

  const { courses, selectedId, selectCourse, loading } = useSelectedCourse();

  const activeHref = activeHrefFor(
    pathname,
    NAV.flatMap((g) => g.items.map((i) => i.href)),
  );

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
            selectedId={selectedId}
            onSelect={selectCourse}
            loading={loading}
            className="flex-1"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
          {NAV.map((group, i) => (
            <NavSection key={group.title ?? i} title={group.title}>
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  appearance="pill"
                  active={item.href === activeHref}
                />
              ))}
            </NavSection>
          ))}
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
