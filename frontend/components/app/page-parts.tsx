'use client';

import Link from 'next/link';
import { CaretRightIcon } from '@phosphor-icons/react';
import { Tabs, cx, type TabItem } from '@/components/ui';

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
              {i > 0 && (
                <CaretRightIcon size={10} className="text-[var(--fg-muted)] rtl:rotate-180" />
              )}
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
          {/* Title 1: semibold at --fs-xl. The reference system's largest
              in-app size - anything above it belongs to the marketing site. */}
          <h1 className="text-[var(--fs-xl)] font-semibold leading-[var(--lh-tight)] tracking-[-0.01em] text-[var(--fg-primary)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

/**
 * A section heading *inside* a page that already has a `PageHeader`.
 *
 * The course-management screens sit under a layout that owns the page's `<h1>`
 * and its tab bar, so a tab's own body needs a heading that is subordinate to
 * both. Using `PageHeader` there put a second `<h1>` on the page and - because
 * the layout renders the tabs too - a second tab bar under it.
 */
export function SectionIntro({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-[var(--sp-4)]">
      <div className="min-w-0">
        <h2 className="text-[var(--fs-md)] font-semibold leading-[var(--lh-tight)] text-[var(--fg-primary)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageBody({
  children,
  className,
  dense,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * The reference system's own list-screen padding is 8px, not the app's
   * usual 24 - measured off Twenty's object table (TASK 4 of the 2026-09-12
   * visual-parity pass). Opt-in rather than the new default: a screen still
   * built from `Panel`s and forms (the groups and blog consoles, for one)
   * wants the room a card needs to read as a card, and blanket-shrinking
   * every `/(app)` route's gutter was more than this pass asked for.
   */
  dense?: boolean;
}) {
  // The padding is merged with the caller's classes, never replaced by them:
  // every caller that passes a className is passing layout (`flex`, a gap),
  // and swapping the two would silently strip the page's own gutter.
  return (
    <div className={cx(dense ? 'p-[var(--sp-2)]' : 'p-[var(--sp-6)]', className)}>
      {children}
    </div>
  );
}

/**
 * Course-level tabs. The course is the unit a student works inside, so its
 * sections are tabs on the course rather than entries in the global rail.
 */
export function CourseTabs({ courseId }: { courseId: string }) {
  const base = `/learn/${courseId}`;
  const items: TabItem[] = [
    { href: base, label: 'Overview' },
    { href: `${base}/assessments`, label: 'Work' },
    { href: `${base}/recordings`, label: 'Recordings' },
    { href: `${base}/sessions`, label: 'Timetable' },
    { href: `${base}/materials`, label: 'Materials' },
    { href: `${base}/report`, label: 'Report' },
  ];
  return <Tabs items={items} base={base} label="Course sections" />;
}

/**
 * Course tabs for the management console.
 *
 * `staff` and `recordings` are omitted for a teaching assistant: CLAUDE.md
 * section 2.2 gives a TA no account management and no recording writes. That
 * is presentation only - `/admin/*` is `@Roles(Role.Teacher)` on the server,
 * and hiding a tab has never been what stops anyone (section 8).
 */
export function ManageCourseTabs({
  courseId,
  admin,
}: {
  courseId: string;
  admin: boolean;
}) {
  const base = `/manage/courses/${courseId}`;
  const items: TabItem[] = [
    { href: base, label: 'Roster' },
    // Groups and Work are both TA-reachable: the client granted placement
    // (CLAUDE.md section 5.16) and authoring (section 5.18, answered
    // 2026-09-10) to assistants explicitly, so neither is gated on `admin`.
    { href: `${base}/groups`, label: 'Groups' },
    { href: `${base}/assessments`, label: 'Work' },
    { href: `${base}/grading`, label: 'Grading' },
    { href: `${base}/recordings`, label: 'Recordings' },
    ...(admin ? [{ href: `${base}/staff`, label: 'Assistants' }] : []),
  ];
  return <Tabs items={items} base={base} label="Course management sections" />;
}

/**
 * Progress and performance side by side but never merged (CLAUDE.md 5.1).
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
