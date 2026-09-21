'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import {
  cx,
  Avatar,
  IconButton,
  NavItem,
  NavSection,
  SearchInput,
  Tag,
  type IconName,
  type TagTone,
} from '@/components/ui';
import { PageChromeProvider } from '@/components/shell/page-chrome';
import { ShellHeader } from './shell-header';
import { CourseSwitcher } from './course-switcher';
import { activeHrefFor } from './nav-active';

/**
 * The console shell — teacher, admin and assistant (`docs/redesign-mapping.md`
 * "Console" section). 244px `--surface-2` rail with a right border, the
 * course switcher, a (currently inert) search field, and the six nav
 * sections in the exact order the handoff draws them.
 */

interface NavLeaf {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  indent?: number;
}

interface NavGroup {
  title?: string;
  items: NavLeaf[];
}

/**
 * `admin` gates the three items the handoff marks `*` — teacher-only
 * courtesy, not access control (CLAUDE.md §7: "hiding a control is courtesy,
 * never security"; the server-side `@Roles` guard on `/admin/*` is what
 * actually enforces this).
 *
 * `admin` here means `isAdminRole` — teacher *or* admin (AUTH-1) — not a
 * literal `role === 'teacher'` check. The legacy `app-shell.tsx` this
 * replaces used the literal check, which meant an `admin` account fell
 * through `navFor`'s `if/else` chain to the *student* nav while still being
 * routed into `/manage` by the layout guard — a real bug, fixed here as part
 * of reproducing "the same role-gating logic" correctly rather than
 * literally, since `isAdminRole` exists in `lib/roles.ts` for exactly this.
 *
 * `Courses` and `Blog` aren't in `docs/redesign-mapping.md`'s own nav list
 * (139-147) at all — the shell being additive-only (nothing deleted, SHELL-4
 * lands later) means dropping them would leave real, working screens
 * (`/manage/courses/*`, `/manage/blog/*`) unreachable from the rail with no
 * replacement navigation yet. Placed in Main and Communication respectively
 * as the closest fit until a later unit's own IA work resolves this for real.
 */
function sectionsFor(admin: boolean, studentCount: number | null): NavGroup[] {
  const people: NavLeaf[] = [
    { href: '/manage/students', label: 'Students', icon: 'Users', count: studentCount ?? undefined },
    { href: '/manage/groups', label: 'Groups', icon: 'Hierarchy2' },
  ];
  if (admin) {
    people.push(
      { href: '/manage/assistants', label: 'Assistants', icon: 'Briefcase' },
      { href: '/manage/activity', label: 'Assistant activity', icon: 'History' },
    );
  }

  const system: NavLeaf[] = [];
  if (admin) system.push({ href: '/manage/settings', label: 'Settings', icon: 'Settings' });
  system.push({ href: '/manage/account', label: 'Account', icon: 'UserCircle' });

  return [
    {
      items: [
        { href: '/manage', label: 'Overview', icon: 'Home' },
        { href: '/manage/courses', label: 'Courses', icon: 'Book' },
      ],
    },
    { title: 'People', items: people },
    {
      title: 'Teaching',
      items: [
        { href: '/manage/tasks', label: 'Tasks', icon: 'ListDetails' },
        { href: '/manage/tasks/drafts', label: 'Draft tasks', icon: 'FileText', indent: 1 },
        { href: '/manage/marks', label: 'Marks', icon: 'ListNumbers' },
        { href: '/manage/reports', label: 'Reports', icon: 'ChartPie' },
      ],
    },
    {
      title: 'Sessions',
      items: [
        { href: '/manage/live-sessions', label: 'Live sessions', icon: 'Video' },
        { href: '/manage/live-sessions/drafts', label: 'Draft timetable', icon: 'CalendarClock', indent: 1 },
        { href: '/manage/recordings', label: 'Recordings', icon: 'PlayerPlay' },
      ],
    },
    {
      title: 'Communication',
      items: [
        { href: '/manage/announcements', label: 'Announcements', icon: 'Message' },
        { href: '/manage/blog', label: 'Blog', icon: 'Notes' },
      ],
    },
    { title: 'System', items: system },
  ];
}

function roleLabel(role: Role | undefined): string {
  if (role === 'admin') return 'Admin';
  if (role === 'assistant') return 'Assistant';
  return 'Teacher';
}

function roleTone(role: Role | undefined): TagTone {
  if (role === 'admin') return 'green';
  if (role === 'assistant') return 'blue';
  return 'amber';
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <PageChromeProvider>
      <ConsoleShellInner>{children}</ConsoleShellInner>
    </PageChromeProvider>
  );
}

function ConsoleShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const admin = isAdminRole(user?.role);
  const [open, setOpen] = React.useState(false);

  // A route change with the sheet still open leaves the page unscrollable
  // behind it — derived during render, same as the legacy shell, because an
  // effect would paint one frame with the sheet still over the new page.
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const { data: overview } = useApi((token) => api.staff.overview(token), []);
  const { data: courseList } = useApi((token) => api.staff.courses(token), []);
  const courses = React.useMemo(
    () => courseList?.map((c) => ({ id: c.id, title: c.title })) ?? null,
    [courseList],
  );
  // Local UI state only — nothing downstream reads the selected course yet.
  // Scoping the console's own screens by it is a later unit's job; the
  // switcher is built now because SHELL-1 asks for it in the rail.
  const [selectedCourseId, setSelectedCourseId] = React.useState<string | null>(null);
  const effectiveSelected = selectedCourseId ?? courses?.[0]?.id ?? null;

  const groups = sectionsFor(admin, overview?.studentCount ?? null);
  const activeHref = activeHrefFor(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );

  return (
    <div className="flex min-h-[100dvh] bg-surface">
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-[244px] flex-col border-e border-border-light bg-surface-2',
          'transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex h-[52px] shrink-0 items-center border-b border-border-light px-2">
          <CourseSwitcher
            courses={courses}
            selectedId={effectiveSelected}
            onSelect={setSelectedCourseId}
            loading={!courseList}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-1.5 px-2 pt-2">
          {/* No search backend exists yet — honestly inert, same pattern the
              legacy shell used for the same gap. */}
          <SearchInput
            className="flex-1"
            disabled
            label="Search (coming soon)"
            placeholder="Search (coming soon)"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-3">
          {groups.map((group, i) => (
            <NavSection key={group.title ?? i} title={group.title}>
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  count={item.count}
                  indent={item.indent}
                  active={item.href === activeHref}
                />
              ))}
            </NavSection>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-border-light p-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={user?.name ?? ''} size={20} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-medium text-fg">{user?.name}</span>
              <Tag tone={roleTone(user?.role)}>{roleLabel(user?.role)}</Tag>
            </div>
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

      <div className="flex min-w-0 flex-1 flex-col md:ms-[244px]">
        <ShellHeader open={open} onToggle={() => setOpen((v) => !v)} />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
