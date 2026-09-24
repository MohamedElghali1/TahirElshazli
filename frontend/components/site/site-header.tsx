'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ListIcon, XIcon } from '@phosphor-icons/react';
import { ThemeToggle } from '@/components/theme-toggle';
import { ButtonLink, cx } from '@/components/ui';
import { Wordmark } from './wordmark';

const NAV = [
  { href: '/courses', label: 'Courses' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-light)] bg-surface/72 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-8 px-6">
        <Link href="/" className="shrink-0" aria-label="Dr. Tahir Elshazli, home">
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-6 lg:flex">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'text-m-lead transition-colors duration-[var(--dur-fast)]',
                  active
                    ? 'text-fg'
                    : 'text-fg-3 hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden text-m-lead text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg sm:block"
          >
            Sign in
          </Link>
          <ButtonLink href="/courses" variant="primary" size="medium" className="hidden sm:inline-flex">
            Browse courses
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-2 hover:bg-wash-hover lg:hidden"
          >
            {open ? <XIcon size={20} /> : <ListIcon size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--border-light)] bg-surface lg:hidden">
          <nav className="mx-auto flex max-w-[1200px] flex-col px-6 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-3 text-m-lead text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="py-3 text-m-lead text-fg-2"
            >
              Sign in
            </Link>
            <ButtonLink href="/courses" variant="primary" size="medium" className="mt-3">
              Browse courses
            </ButtonLink>
          </nav>
        </div>
      )}
    </header>
  );
}
