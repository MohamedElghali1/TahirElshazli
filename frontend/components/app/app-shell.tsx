'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BellIcon,
  BooksIcon,
  ListIcon,
  SignOutIcon,
  SquaresFourIcon,
  UserIcon,
  XIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useSession, useApi } from '@/lib/session';
import { initials } from '@/lib/format';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/site/wordmark';
import { cx } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'My courses', Icon: SquaresFourIcon },
  { href: '/catalog', label: 'Browse courses', Icon: BooksIcon },
  { href: '/notifications', label: 'Notifications', Icon: BellIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
] as const;

/**
 * The product shell: a fixed rail at --sp-* widths, a 32px top bar, and the
 * page in between. Everything here is the dense token scale - the marketing
 * site's rhythm has no business inside the app.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);

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
  const { data: notifications } = useApi(
    (token) => api.notifications.list(token),
    [],
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
        <div className="flex h-[56px] items-center px-[var(--sp-4)]">
          <Link href="/dashboard" aria-label="Dashboard">
            <Wordmark />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-[var(--sp-1)] px-[var(--sp-2)] py-[var(--sp-2)]">
          {NAV.map(({ href, label, Icon }) => {
            // /dashboard also owns every /learn/* screen - they are the same
            // section of the product, reached through the course list.
            const active =
              href === '/dashboard'
                ? pathname === '/dashboard' || pathname.startsWith('/learn')
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
