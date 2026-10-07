'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { PageChromeProvider, usePageChrome } from '@/components/shell/page-chrome';
import { ThemeToggle } from '@/components/theme-toggle';
import { activeHrefFor } from './nav-active';
import {
  Brand,
  ClIcon,
  NavFolder,
  NavPill,
  RailButton,
  ShellFrame,
  TEACHER_AVATAR,
  initialsOf,
  useDismiss,
  useShellFrame,
  type IconKey,
} from './classroom';

/**
 * The staff console (teacher, admin, assistant) — Redesign V2, the "Teacher
 * Dashboard" artifact: a top bar with the page crumb, a course switcher and
 * the account menu; a sidebar with the New menu, search, and the artifact's
 * nav including its two folders (People, Progress).
 *
 * Every route the old rail reached is still reachable, except the blog,
 * which the client removed from the console. The artifact has no Courses or
 * Submissions entry; Courses sits with the communication items, and the artifact's "To review" IS the submissions
 * queue. Draft tasks and the draft timetable are reached from their parent
 * screens, exactly as the artifact draws them, and light their parent here.
 *
 * Admin-only items stay admin-only — courtesy, not access control (CLAUDE.md
 * §7): `/admin/*` refuses an assistant server-side regardless of this nav.
 */

interface Leaf {
  href: string;
  label: string;
  icon: IconKey;
  badge?: number | null;
  badgeTone?: 'peach' | 'blue';
}

interface Folder {
  id: 'people' | 'progress';
  label: string;
  icon: IconKey;
  kids: Leaf[];
}

function navFor(admin: boolean, toReview: number, waiting: number) {
  const top: Leaf[] = [
    { href: '/manage', label: 'Overview', icon: 'home' },
    { href: '/manage/submissions', label: 'To review', icon: 'review', badge: toReview, badgeTone: 'peach' },
    { href: '/manage/tasks', label: 'Tasks', icon: 'tasks' },
  ];
  const teaching: Leaf[] = [
    { href: '/manage/live-sessions', label: 'Live sessions', icon: 'schedule' },
    { href: '/manage/recordings', label: 'Recordings', icon: 'live' },
  ];
  const folders: Folder[] = [];
  if (admin) {
    folders.push({
      id: 'people',
      label: 'People',
      icon: 'people',
      kids: [
        { href: '/manage/students', label: 'Students', icon: 'people', badge: waiting, badgeTone: 'blue' },
        { href: '/manage/groups', label: 'Groups', icon: 'groups' },
        { href: '/manage/assistants', label: 'Assistants', icon: 'assistants' },
        { href: '/manage/activity', label: 'Assistant activity', icon: 'activity' },
      ],
    });
  }
  folders.push({
    id: 'progress',
    label: 'Progress',
    icon: 'marks',
    kids: [
      { href: '/manage/marks', label: 'Marks', icon: 'marks' },
      // Weekly reports are admin-only (`D-66`).
      ...(admin ? [{ href: '/manage/reports', label: 'Reports', icon: 'chart' as IconKey }] : []),
    ],
  });
  const comms: Leaf[] = [
    { href: '/manage/announcements', label: 'Announcements', icon: 'announce' },
    { href: '/manage/courses', label: 'Courses', icon: 'book' },
  ];
  const system: Leaf[] = [
    { href: '/manage/settings', label: 'Settings', icon: 'settings' },
    { href: '/manage/account', label: 'Account', icon: 'account' },
  ];
  return { top, teaching, folders, comms, system };
}

function roleLabel(role: Role | undefined): string {
  if (role === 'admin') return 'Admin';
  if (role === 'assistant') return 'Assistant';
  return 'Teacher';
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <PageChromeProvider>
      <ConsoleShellInner>{children}</ConsoleShellInner>
    </PageChromeProvider>
  );
}

function ConsoleShellInner({ children }: { children: React.ReactNode }) {
  const { pathname, navOpen, drawer, setDrawer, toggle } = useShellFrame();
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { chrome, actions } = usePageChrome();
  const router = useRouter();

  const { data: overview } = useApi((token) => api.staff.overview(token), [pathname]);
  const { data: waitingList } = useApi(
    (token) => (admin ? api.admin.students(token, undefined, 'waiting') : Promise.resolve(null)),
    [admin],
  );
  const toReview = overview?.awaitingGrading ?? 0;
  const waiting = waitingList?.length ?? 0;

  const nav = navFor(admin, toReview, waiting);
  const all = [...nav.top, ...nav.teaching, ...nav.folders.flatMap((f) => f.kids), ...nav.comms, ...nav.system];
  const activeHref = activeHrefFor(pathname, all.map((l) => l.href));

  const [folders, setFolders] = React.useState<Record<string, boolean>>({});
  const folderOpen = (f: Folder) => folders[f.id] ?? f.kids.some((k) => k.href === activeHref);

  const pill = (l: Leaf, sub = false) => (
    <NavPill
      key={l.href}
      href={l.href}
      label={l.label}
      icon={l.icon}
      sub={sub}
      badge={l.badge || null}
      badgeTone={l.badgeTone}
      active={l.href === activeHref}
    />
  );

  const side = (
    <nav aria-label="Main" className="cl-side cl-side--staff">
      <div className="flex flex-col gap-2.5 pb-2.5 ps-4">
        <NewMenu />
        <NavSearch admin={admin} />
      </div>
      {nav.top.map((l) => pill(l))}
      <div className="cl-nav-div" />
      {nav.teaching.map((l) => pill(l))}
      {nav.folders.map((f) => {
        const open = folderOpen(f);
        const hasActive = f.kids.some((k) => k.href === activeHref);
        const badge = f.kids.reduce((n, k) => n + (k.badge ?? 0), 0);
        return (
          <React.Fragment key={f.id}>
            <NavFolder
              label={f.label}
              icon={f.icon}
              open={open}
              hasActive={hasActive}
              badge={badge || null}
              onToggle={() => setFolders((s) => ({ ...s, [f.id]: !open }))}
            />
            {open && f.kids.map((k) => pill(k, true))}
          </React.Fragment>
        );
      })}
      {nav.comms.map((l) => pill(l))}
      <div className="cl-nav-div" />
      {nav.system.map((l) => pill(l))}
    </nav>
  );

  const rail = (
    <nav aria-label="Main (collapsed)" className="cl-rail">
      <Link href="/manage/tasks/new" aria-label="New task" title="New task" className="cl-newbtn mb-2 w-12 justify-center p-0">
        <ClIcon name="plus" size={20} />
      </Link>
      {all.map((l) => (
        <RailButton key={l.href} href={l.href} label={l.label} icon={l.icon} active={l.href === activeHref} />
      ))}
    </nav>
  );

  const top = (
    <header className="cl-top flex-wrap print:hidden">
      <button type="button" className="cl-ibtn" aria-label="Toggle menu" onClick={toggle}>
        <ClIcon name="menu" />
      </button>
      <Brand href="/manage" />
      {chrome?.backHref && (
        <button type="button" className="cl-ibtn" aria-label="Back" onClick={() => router.push(chrome.backHref as string)}>
          <ClIcon name="back" className="rtl:rotate-180" />
        </button>
      )}
      {chrome?.title && (
        <>
          <span className="cl-crumb-sep cl-hide-sm" aria-hidden>
            /
          </span>
          <h1 className="cl-crumb cl-hide-sm m-0">{chrome.title}</h1>
        </>
      )}
      <div className="flex-1" />
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      <CourseMenu />
      <Link
        href="/manage/submissions"
        className="cl-ibtn"
        aria-label={toReview > 0 ? `To review, ${toReview} waiting` : 'To review'}
      >
        <ClIcon name="bell" />
        {toReview > 0 && <span className="cl-countbadge">{toReview > 99 ? '99+' : toReview}</span>}
      </Link>
      <AccountMenu />
    </header>
  );

  return (
    <ShellFrame top={top} side={side} rail={rail} navOpen={navOpen} drawer={drawer} onCloseDrawer={() => setDrawer(false)} wide>
      {children}
    </ShellFrame>
  );
}

/** The artifact's "New" button. Only creators with a screen behind them. */
function NewMenu() {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const items: { href: string; label: string; sub: string; icon: IconKey; tone: string }[] = [
    { href: '/manage/tasks/new', label: 'New task', sub: 'Homework, assignment or quiz', icon: 'tasks', tone: 'cl-tone-peach' },
    { href: '/manage/live-sessions?new=1', label: 'New session', sub: 'Schedule a live class', icon: 'schedule', tone: 'cl-tone-blue' },
    { href: '/manage/recordings', label: 'Add recording', sub: 'Add a session video link', icon: 'live', tone: 'cl-tone-sky' },
    { href: '/manage/announcements', label: 'New announcement', sub: 'Post to a course or group', icon: 'announce', tone: 'cl-tone-sand' },
  ];
  return (
    <div ref={ref} className="relative">
      <button type="button" className="cl-newbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ClIcon name="plus" size={20} />
        New
      </button>
      {open && (
        <div className="cl-newmenu" role="menu">
          {items.map((n) => (
            <Link key={n.href} href={n.href} role="menuitem" className="cl-aopt" onClick={close}>
              <span className={`cl-ic40 ${n.tone}`} style={{ width: 32, height: 32 }}>
                <ClIcon name={n.icon} small size={16} />
              </span>
              <span>
                <span className="block">{n.label}</span>
                <span className="cl-muted block text-[12px]">{n.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavSearch({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  return (
    <form
      role="search"
      className="cl-navsearch"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        const base = admin ? '/manage/students' : '/manage/tasks';
        router.push(term ? `${base}?search=${encodeURIComponent(term)}` : base);
      }}
    >
      <ClIcon name="search" small />
      <input
        type="search"
        aria-label={admin ? 'Search students' : 'Search tasks'}
        placeholder={admin ? 'Search students…' : 'Search tasks…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

/**
 * "Showing <course>". The old rail's switcher selected a course that nothing
 * read; here picking one opens that course, which is what the artifact's
 * "Showing" implies a teacher wants.
 */
function CourseMenu() {
  const router = useRouter();
  const { data: courses } = useApi((token) => api.staff.courses(token), []);
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  if (!courses || courses.length === 0) return null;
  const label = courses.length === 1 ? courses[0].title : 'All courses';
  return (
    <div ref={ref} className="relative cl-hide-sm">
      <button type="button" className="cl-cbtn" aria-haspopup="menu" aria-expanded={open} aria-label="Change course" onClick={() => setOpen((v) => !v)}>
        <span>Showing</span>
        <b>{label}</b>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--cl-blue-deep)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="cl-cdrop" role="menu">
          <div className="cl-menu-h">Courses</div>
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              className="cl-copt"
              onClick={() => {
                close();
                router.push(`/manage/courses/${c.id}`);
              }}
            >
              <span className="cl-ic40 cl-tone-blue" style={{ width: 32, height: 32, fontSize: 12, fontWeight: 700 }}>
                {initialsOf(c.title)}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
            </button>
          ))}
          <div className="cl-menu-sep" />
          <Link href="/manage/courses" role="menuitem" className="cl-copt" onClick={close}>
            All courses
          </Link>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const isTeacher = user?.role === 'teacher';

  return (
    <div ref={ref} className="relative">
      <button type="button" className="cl-acct" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {isTeacher ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={TEACHER_AVATAR} alt="" className="h-[34px] w-[34px] rounded-full object-cover" />
        ) : (
          <span className="cl-av" style={{ width: 34, height: 34 }}>
            {initialsOf(user?.name ?? '')}
          </span>
        )}
        <span className="cl-hide-sm">{roleLabel(user?.role)}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--cl-label)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="cl-menu" role="menu">
          <div className="px-3 pb-2 pt-1.5">
            <div className="truncate text-[15px] text-fg">{user?.name}</div>
            <div className="cl-label truncate text-[12.5px]">
              {roleLabel(user?.role)} · {user?.email}
            </div>
          </div>
          <div className="cl-menu-sep" />
          <Link href="/manage/account" role="menuitem" className="cl-mi" onClick={close}>
            Account
          </Link>
          <Link href="/manage/settings" role="menuitem" className="cl-mi" onClick={close}>
            Settings
          </Link>
          <div className="flex items-center justify-between px-3 py-1.5 text-[14px] font-semibold text-fg">
            Theme
            <ThemeToggle size="sm" />
          </div>
          <div className="cl-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="cl-mi"
            style={{ color: 'var(--cl-bad)' }}
            onClick={() => {
              close();
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
