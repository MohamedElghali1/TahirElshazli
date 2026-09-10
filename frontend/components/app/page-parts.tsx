'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretRightIcon } from '@phosphor-icons/react';
import { cx } from '@/components/ui';

/** Every app screen opens with this. Title, optional subtitle, optional action. */
export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <header className="border-b border-[var(--border-light)] px-[var(--sp-6)] py-[var(--sp-6)]">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-[var(--sp-3)] flex items-center gap-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]"
        >
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-[var(--sp-1)]">
              {i > 0 && <CaretRightIcon size={10} className="text-[var(--fg-muted)]" />}
              <Link
                href={crumb.href}
                className="transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-[var(--sp-4)]">
        <div className="min-w-0">
          <h1 className="text-[var(--fs-xl)] font-semibold leading-[var(--lh-tight)] tracking-[-0.01em] text-[var(--fg-primary)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('p-[var(--sp-6)]', className)}>{children}</div>
  );
}

/**
 * Course-level tabs. The course is the unit a student works inside, so its
 * sections are tabs on the course rather than entries in the global rail.
 */
export function CourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/learn/${courseId}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/assessments`, label: 'Work' },
    { href: `${base}/recordings`, label: 'Recordings' },
    { href: `${base}/sessions`, label: 'Timetable' },
    { href: `${base}/materials`, label: 'Materials' },
    { href: `${base}/report`, label: 'Report' },
  ];

  return (
    <nav
      aria-label="Course sections"
      className="flex gap-[var(--sp-1)] overflow-x-auto border-b border-[var(--border-light)] px-[var(--sp-6)]"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'relative whitespace-nowrap px-[var(--sp-3)] py-[var(--sp-3)] text-[var(--fs-base)]',
              'transition-colors duration-[var(--dur-fast)]',
              active
                ? 'font-medium text-[var(--fg-primary)]'
                : 'text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]',
            )}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-[var(--sp-3)] -bottom-px h-[2px] rounded-[var(--r-full)] bg-[var(--accent)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Course tabs for the management console.
 *
 * `staff` and `recordings` are omitted for a teaching assistant: §2.2 gives a
 * TA no account management and no recording writes. That is presentation only -
 * `/admin/*` is `@Roles(Role.Teacher)` on the server, and hiding a tab has
 * never been what stops anyone (CLAUDE.md §8).
 */
export function ManageCourseTabs({
  courseId,
  admin,
}: {
  courseId: string;
  admin: boolean;
}) {
  const pathname = usePathname();
  const base = `/manage/courses/${courseId}`;
  const tabs = [
    { href: base, label: 'Roster' },
    // Groups and Work are both TA-reachable: the client granted placement
    // (CLAUDE.md §5.16) and authoring (§5.18, answered 2026-09-10) to
    // assistants explicitly, so neither is gated on `admin` here.
    { href: `${base}/groups`, label: 'Groups' },
    { href: `${base}/assessments`, label: 'Work' },
    { href: `${base}/grading`, label: 'Grading' },
    { href: `${base}/recordings`, label: 'Recordings' },
    ...(admin ? [{ href: `${base}/staff`, label: 'Assistants' }] : []),
  ];

  return (
    <nav
      aria-label="Course management sections"
      className="flex gap-[var(--sp-1)] overflow-x-auto border-b border-[var(--border-light)] px-[var(--sp-6)]"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'relative whitespace-nowrap px-[var(--sp-3)] py-[var(--sp-3)] text-[var(--fs-base)]',
              'transition-colors duration-[var(--dur-fast)]',
              active
                ? 'font-medium text-[var(--fg-primary)]'
                : 'text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]',
            )}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-[var(--sp-3)] -bottom-px h-[2px] rounded-[var(--r-full)] bg-[var(--accent)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Progress and performance side by side but never merged (CLAUDE.md §5.1).
 * Completion gets a meter, grades get numerals, and the labels say which is
 * which so the two cannot be read as one score.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-[var(--sp-4)] sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}
