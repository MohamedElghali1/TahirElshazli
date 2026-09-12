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
    <header className="sticky top-0 z-40 border-b border-[var(--border-light)] bg-[var(--bg-scrim)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[var(--maxw-site)] items-center gap-[var(--sp-8)] px-[var(--sp-6)]">
        <Link href="/" className="shrink-0" aria-label="Dr. Tahir Elshazli, home">
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-[var(--sp-6)] lg:flex">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'text-[var(--fs-md)] transition-colors duration-[var(--dur-fast)]',
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

        <div className="ms-auto flex items-center gap-[var(--sp-2)] lg:ms-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden text-[var(--fs-md)] text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg sm:block"
          >
            Sign in
          </Link>
          <ButtonLink href="/courses" variant="primary" size="md" className="hidden sm:inline-flex">
            Browse courses
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-[var(--h-md)] w-[var(--h-md)] items-center justify-center rounded-[var(--r-md)] text-fg-2 hover:bg-[var(--bg-wash)] lg:hidden"
          >
            {open ? <XIcon size={20} /> : <ListIcon size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--border-light)] bg-[var(--bg-primary)] lg:hidden">
          <nav className="mx-auto flex max-w-[var(--maxw-site)] flex-col px-[var(--sp-6)] py-[var(--sp-4)]">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-[var(--sp-3)] text-[var(--fs-lead)] text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="py-[var(--sp-3)] text-[var(--fs-lead)] text-fg-2"
            >
              Sign in
            </Link>
            <ButtonLink href="/courses" variant="primary" size="lg" className="mt-[var(--sp-3)]">
              Browse courses
            </ButtonLink>
          </nav>
        </div>
      )}
    </header>
  );
}
