'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Pieces both Redesign V2 consoles share (student + staff): the icon set the
 * two dashboard artifacts draw with, the brand mark, the top-bar / sidebar /
 * rail frame and its open-closed behaviour. Styling is `app/(app)/classroom.css`.
 *
 * The two shells stay separate components (`student-shell.tsx`,
 * `console-shell.tsx`) because their bars and navs genuinely differ; only the
 * frame is shared.
 */

/* --- icons ---------------------------------------------------------------
   The artifacts' own stroke paths (24px box, 1.8 stroke), kept verbatim so the
   consoles match the design rather than approximating it with Tabler. */
export const IC = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  schedule: 'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4M15 3v4',
  live: 'M5 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM16 10l5-3v10l-5-3',
  play: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M10 8.5l5 3.5-5 3.5z',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  announce: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6',
  book: 'M4 5.5C6.5 4.5 9.5 4.6 12 6.5c2.5-1.9 5.5-2 8-1V18c-2.5-1-5.5-.9-8 1-2.5-1.9-5.5-2-8-1zM12 6.5V19',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  account: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1-4 4.5-6 8-6s7 2 8 6',
  pen: 'M4 20l4-1 11-11-3-3L5 16z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 3-3 4 4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  quiz: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  collapse: 'M4 14h6v6M20 10h-6V4',
  expand: 'M14 4h6v6M10 20H4v-6',
  check: 'M5 12.5 9.5 17 19 7.5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  chevDown: 'm6 9 6 6 6-6',
  chevRight: 'm9 6 6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  people: 'M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.3 3.5 5',
  review: 'M10 6h10M10 12h10M10 18h10M4 6h2M4 12h2M4 18h2',
  groups: 'M12 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M5.5 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M18.5 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 8v4M12 12l-5 4M12 12l5 4',
  assistants: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6M6.5 18.5c1.3-2 3.2-3 5.5-3s4.2 1 5.5 3',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  tasks: 'M9 3.5h6v3H9zM9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15M9 11.5h6M9 15.5h4',
  drafts: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 17l.6-2.4 4.2-4.2 1.8 1.8-4.2 4.2z',
  marks: 'M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM3.5 9.5h17M9.5 9.5v11',
  timetable: 'M11 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M4 10h16M9 3v4M15 3v4M14 21l.8-3 4.5-4.5 2.2 2.2-4.5 4.5z',
  blog: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-8h11L20 13v6H4z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  dots: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
} as const;

export type IconKey = keyof typeof IC;

export function ClIcon({
  name,
  small = false,
  size,
  className,
}: {
  name: IconKey;
  small?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={[small ? 'cl-sico' : 'cl-ico', className].filter(Boolean).join(' ')}
      style={size ? { width: size, height: size } : undefined}
    >
      <path d={IC[name]} />
    </svg>
  );
}

/** The logo mark + wordmark from both artifacts' top bars. */
export function Brand({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="Tahir Elshazli — home" className="cl-brand">
      <svg viewBox="0 0 78 79" width="24" height="24" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
        <g fill="var(--cl-blue-deep)">
          <path d="M63.946 47.6286C63.946 48.4 64.6161 49 65.473 49C66.3278 49 67 48.4 67 47.6286V31.3176C67 30.5701 66.345 30 65.473 30C64.5989 30 63.946 30.5701 63.946 31.3176C63.946 35.5991 60.9672 38.0509 55.7828 38.0509H52.527C51.6894 38.0509 51 38.6907 51 39.4681V39.4761C51 40.2634 51.6894 40.8933 52.527 40.8933H55.7828C60.9672 40.8933 63.946 43.347 63.946 47.6286Z" />
          <path d="M54 77.1271C54 78.1605 54.8184 79 55.8287 79H76.2561C77.1013 79 78 78.3407 78 77.1271V57.7452C78 56.7483 77.215 56 76.1691 56C75.1232 56 74.3315 56.7483 74.3315 57.7452C74.3315 65.7297 71.4302 75.2473 57.5793 75.2473H55.8287C54.8184 75.2473 54 76.0936 54 77.1271Z" />
          <path d="M54 1.87294C54 0.839514 54.8184 0 55.8287 0H76.2561C77.1013 0 78 0.659292 78 1.87294V21.2548C78 22.2517 77.215 23 76.1691 23C75.1232 23 74.3315 22.2517 74.3315 21.2548C74.3315 13.2703 71.4302 3.75272 57.5793 3.75272H55.8287C54.8184 3.75272 54 2.91549 54 1.87294Z" />
          <path d="M24 1.87294C24 0.839514 23.1816 0 22.1713 0H1.74391C0.898713 0 0 0.659292 0 1.87294V21.2548C0 22.2517 0.784983 23 1.83089 23C2.87679 23 3.66846 22.2517 3.66846 21.2548C3.66846 13.2703 6.56978 3.75272 20.4207 3.75272H22.1713C23.1816 3.75272 24 2.91549 24 1.87294Z" />
          <path d="M28.2113 74.774C26.9939 74.774 26 75.7167 26 76.8825C26 78.0574 26.9939 79 28.2113 79H47V0H32.9952V74.774H28.2113Z" />
        </g>
      </svg>
      <span className="cl-hide-sm" style={{ display: 'block', lineHeight: '24px', height: 24 }}>
        Tahir Elshazli
      </span>
    </Link>
  );
}

/** The artifacts' card-header colours (groups, courses), cycled by index. */
export const CARD_COLORS = [
  { bg: 'var(--cl-blue)', ring: 'var(--cl-blue-ring)' },
  { bg: 'var(--cl-card-2)', ring: 'var(--cl-card-2-ring)' },
  { bg: 'var(--cl-card-3)', ring: 'var(--cl-card-3-ring)' },
  { bg: 'var(--cl-card-4)', ring: 'var(--cl-card-4-ring)' },
] as const;

/** Dr. Tahir's avatar as the artifacts draw it beside sessions, notes and posts. */
export const TEACHER_AVATAR = '/dashboard/teacher.png';
export const TEACHER_NAME = 'Dr. Tahir Elshazli';

export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w))
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/* --- the frame ------------------------------------------------------------
   Desktop: the menu button collapses the 288px sidebar to a 72px rail and the
   choice is remembered per browser. Under 760px (the artifacts' own
   breakpoint) the sidebar is hidden and the same button opens it as a drawer,
   which the artifacts do not draw but a phone needs. */

const NAV_KEY = 'te.navOpen';

let navListeners: Array<() => void> = [];
function subscribeNav(listener: () => void) {
  navListeners.push(listener);
  return () => {
    navListeners = navListeners.filter((l) => l !== listener);
  };
}
function readNavOpen(): boolean {
  try {
    return window.localStorage.getItem(NAV_KEY) !== '0';
  } catch {
    return true;
  }
}
function writeNavOpen(open: boolean) {
  try {
    window.localStorage.setItem(NAV_KEY, open ? '1' : '0');
  } catch {
    // Not persisted; the in-memory copy below still flips.
  }
  memoryNavOpen = open;
  navListeners.forEach((l) => l());
}
let memoryNavOpen: boolean | null = null;

export function useShellFrame() {
  const pathname = usePathname();
  const navOpen = React.useSyncExternalStore(
    subscribeNav,
    () => memoryNavOpen ?? readNavOpen(),
    () => true,
  );
  const [drawer, setDrawer] = React.useState(false);

  // A route change closes the drawer; derived during render so the new page
  // never paints with the drawer still over it.
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  const toggle = React.useCallback(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      setDrawer((v) => !v);
      return;
    }
    writeNavOpen(!(memoryNavOpen ?? readNavOpen()));
  }, []);

  return { pathname, navOpen, drawer, setDrawer, toggle };
}

export function ShellFrame({
  top,
  side,
  rail,
  navOpen,
  drawer,
  onCloseDrawer,
  wide = false,
  children,
  after,
}: {
  top: React.ReactNode;
  side: React.ReactNode;
  rail: React.ReactNode;
  navOpen: boolean;
  drawer: boolean;
  onCloseDrawer: () => void;
  wide?: boolean;
  children: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <div className="cl-theme min-h-[100dvh]">
      {top}
      <div className="flex items-start">
        <div className="cl-hide-sm sticky top-16 max-h-[calc(100dvh-64px)] shrink-0 overflow-y-auto print:hidden">
          {navOpen ? side : rail}
        </div>
        <main id="main" className="cl-main">
          <div className={wide ? 'cl-stack cl-stack--wide' : 'cl-stack'}>{children}</div>
        </main>
      </div>
      {drawer && (
        <>
          <button type="button" aria-label="Close navigation" className="cl-scrim" onClick={onCloseDrawer} />
          <div className="cl-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            {side}
          </div>
        </>
      )}
      {after}
    </div>
  );
}

/** Close a popover on an outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** A nav pill: a link, or a folder toggle when `onToggle` is given. */
export function NavPill({
  href,
  label,
  icon,
  active = false,
  sub = false,
  badge,
  badgeTone = 'peach',
  lead,
  caption,
  onClick,
}: {
  href: string;
  label: string;
  icon?: IconKey;
  active?: boolean;
  sub?: boolean;
  badge?: string | number | null;
  badgeTone?: 'peach' | 'blue';
  lead?: React.ReactNode;
  caption?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={['cl-nav-a', active && 'on', sub && 'sub'].filter(Boolean).join(' ')}
    >
      {lead ?? (icon && <ClIcon name={icon} />)}
      <span className="flex min-w-0 flex-col leading-[1.2]">
        <span className="truncate">{label}</span>
        {caption && <span className="cl-label truncate text-[12.5px] font-medium">{caption}</span>}
      </span>
      {badge != null && badge !== '' && badge !== 0 && (
        <span className={badgeTone === 'blue' ? 'cl-badge cl-badge--blue' : 'cl-badge'}>{badge}</span>
      )}
    </Link>
  );
}

export function NavFolder({
  label,
  icon,
  open,
  hasActive,
  badge,
  onToggle,
}: {
  label: string;
  icon: IconKey;
  open: boolean;
  hasActive: boolean;
  badge?: number | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={['cl-nav-a', hasActive && !open && 'has'].filter(Boolean).join(' ')}
    >
      <ClIcon name={icon} />
      <span>{label}</span>
      {!open && badge ? <span className="cl-badge cl-badge--blue">{badge}</span> : null}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="chev" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={IC.chevRight} />
      </svg>
    </button>
  );
}

export function RailButton({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconKey;
  active: boolean;
}) {
  return (
    <Link href={href} aria-label={label} title={label} className={active ? 'cl-rail-b on' : 'cl-rail-b'}>
      <ClIcon name={icon} />
    </Link>
  );
}
