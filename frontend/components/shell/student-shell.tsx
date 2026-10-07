'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { CONTACT } from '@/lib/site-content';
import { PageChromeProvider, usePageChrome } from '@/components/shell/page-chrome';
import { ThemeToggle } from '@/components/theme-toggle';
import { CourseProvider, useSelectedCourse } from './course-context';
import { activeHrefFor } from './nav-active';
import {
  Brand,
  ClIcon,
  NavPill,
  RailButton,
  ShellFrame,
  initialsOf,
  useDismiss,
  useShellFrame,
  type IconKey,
} from './classroom';

/**
 * The student console — Redesign V2 (the "Student Dashboard" artifact).
 *
 * The artifact's nav, mapped onto the routes that already exist so nothing a
 * student could reach before becomes unreachable:
 *
 *   Home → /dashboard · Schedule → /timetable
 *   Learning: Live sessions → /attendance · Recordings → /lessons ·
 *             Marks & reports → /marks · Announcements → /notifications
 *   My course: one pill per enrolled course → its stream (/homework, with
 *             /quizzes, /materials and /classmates as the course's own tabs)
 *   My account → /profile. Help (/help) stays reachable from the account
 *   menu and the WhatsApp button.
 */

interface Leaf {
  href: string;
  label: string;
  icon: IconKey;
}

const TOP: Leaf[] = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/timetable', label: 'Schedule', icon: 'schedule' },
];

const LEARNING: Leaf[] = [
  { href: '/attendance', label: 'Live sessions', icon: 'live' },
  { href: '/lessons', label: 'Recordings', icon: 'play' },
  { href: '/marks', label: 'Marks & reports', icon: 'chart' },
  { href: '/notifications', label: 'Announcements', icon: 'announce' },
];

const BOTTOM: Leaf[] = [{ href: '/profile', label: 'My account', icon: 'account' }];

/** The routes that make up one course's page (the artifact's Stream / Classwork / People). */
export const COURSE_ROUTES = ['/homework', '/quizzes', '/materials', '/classmates'] as const;

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
  const { pathname, navOpen, drawer, setDrawer, toggle } = useShellFrame();
  const { courses, selectedId, selectCourse } = useSelectedCourse();
  const { chrome, actions } = usePageChrome();
  const router = useRouter();

  const { data: unread } = useApi((token) => api.notifications.list(token, true), [pathname]);
  const unreadCount = unread?.unreadCount ?? 0;

  const flat = [...TOP, ...LEARNING, ...BOTTOM];
  const activeHref = activeHrefFor(pathname, flat.map((l) => l.href));
  const inCourse = COURSE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  const pill = (l: Leaf) => (
    <NavPill key={l.href} href={l.href} label={l.label} icon={l.icon} active={l.href === activeHref} />
  );

  const side = (
    <nav aria-label="Main" className="cl-side">
      {TOP.map(pill)}
      <div className="cl-nav-div" />
      <div className="cl-nav-h">Learning</div>
      {LEARNING.map(pill)}
      {courses && courses.length > 0 && (
        <>
          <div className="cl-nav-div" />
          <div className="cl-nav-h">{courses.length === 1 ? 'My course' : 'My courses'}</div>
          {courses.map((c) => (
            <NavPill
              key={c.id}
              href="/homework"
              label={c.title}
              onClick={() => selectCourse(c.id)}
              active={inCourse && c.id === selectedId}
              lead={<span className="cl-letter">{c.title.trim()[0]?.toUpperCase() ?? '•'}</span>}
            />
          ))}
        </>
      )}
      <div className="cl-nav-div" />
      {BOTTOM.map(pill)}
    </nav>
  );

  const rail = (
    <nav aria-label="Main (collapsed)" className="cl-rail">
      {[...TOP, ...LEARNING].map((l) => (
        <RailButton key={l.href} href={l.href} label={l.label} icon={l.icon} active={l.href === activeHref} />
      ))}
      <RailButton href="/homework" label="My course" icon="book" active={inCourse} />
      {BOTTOM.map((l) => (
        <RailButton key={l.href} href={l.href} label={l.label} icon={l.icon} active={l.href === activeHref} />
      ))}
    </nav>
  );

  const top = (
    <header className="cl-top print:hidden">
      <button type="button" className="cl-ibtn" aria-label="Toggle menu" onClick={toggle}>
        <ClIcon name="menu" />
      </button>
      <Brand href="/dashboard" />
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
      <Link
        href="/notifications"
        className="cl-ibtn"
        aria-label={unreadCount > 0 ? `Announcements, ${unreadCount} new` : 'Announcements'}
      >
        <ClIcon name="bell" />
        {unreadCount > 0 && <span className="cl-dotbadge" />}
      </Link>
      <AccountMenu />
    </header>
  );

  return (
    <ShellFrame
      top={top}
      side={side}
      rail={rail}
      navOpen={navOpen}
      drawer={drawer}
      onCloseDrawer={() => setDrawer(false)}
      after={<WhatsAppContact />}
    >
      {children}
    </ShellFrame>
  );
}

function AccountMenu() {
  const { user, signOut } = useSession();
  // The session carries no photo; the profile does. Refetched per route so a
  // photo changed on /profile shows here on the next navigation.
  const { pathname } = useShellFrame();
  const { data: profile } = useApi((token) => api.students.profile(token), [pathname]);
  const photo = profile?.avatarUrl ? mediaSrc(profile.avatarUrl) : null;
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const name = user?.name ?? '';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="cl-avatar-btn"
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(name)
        )}
      </button>
      {open && (
        <div className="cl-menu" role="menu">
          <div className="px-3 pb-2 pt-1.5">
            <div className="truncate text-[15px] text-fg">{name}</div>
            <div className="cl-label truncate text-[12.5px]">{user?.email}</div>
          </div>
          <div className="cl-menu-sep" />
          <Link href="/profile" role="menuitem" className="cl-mi" onClick={close}>
            Account &amp; settings
          </Link>
          <Link href="/help" role="menuitem" className="cl-mi" onClick={close}>
            Help
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

/**
 * The artifact's floating WhatsApp contact. It names a personal assistant;
 * there is no per-student assistant contact in the API, so this points at the
 * team's one number (`CONTACT.whatsappUrl`) — the same one `/help` uses.
 */
function WhatsAppContact() {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  return (
    <div ref={ref} className="cl-wa-wrap print:hidden">
      {open && (
        <div className="cl-wa-pop" role="dialog" aria-label="Contact the team">
          <div className="flex items-center gap-3">
            <span className="cl-ic40 cl-tone-peach">
              <ClIcon name="help" small />
            </span>
            <div>
              <div className="text-[15px]">Dr. Tahir&apos;s team</div>
              <div className="cl-muted text-[12.5px]">Usually replies within a few hours</div>
            </div>
          </div>
          <a
            className="cl-btnp mt-3.5 w-full"
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open WhatsApp chat
          </a>
        </div>
      )}
      <button
        type="button"
        className="cl-wa-fab"
        aria-label="Message the team on WhatsApp"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="var(--cl-whatsapp)" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.1 7.8c-.3 0-.7.1-.9.5-.4.6-.6 1.3-.4 2.1.5 2.1 2.6 4.3 4.8 5 .8.3 1.6.1 2.2-.4.3-.3.4-.7.3-1l-.2-.5-1.7-.8c-.3-.1-.6 0-.8.2l-.5.6c-1-.4-1.9-1.3-2.4-2.3l.6-.5c.2-.2.3-.5.2-.8l-.7-1.7c-.1-.3-.3-.4-.5-.4z" fill="var(--cl-whatsapp)" />
        </svg>
      </button>
    </div>
  );
}
