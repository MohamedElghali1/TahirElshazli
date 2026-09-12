'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './cx';

/**
 * Link tabs.
 *
 * One component replacing two near-identical copies - `CourseTabs` and
 * `ManageCourseTabs` differed only in their array and in which entries a role
 * may see. Both now pass an array.
 *
 * The anatomy is the reference system's Tabs: the hairline belongs to the
 * *list* and runs its whole width, while each tab is a 40px-tall target whose
 * inner content takes the hover fill and an md radius. The active tab is
 * marked by weight and colour, with a 2px accent rule sitting on the list's
 * hairline.
 *
 * Matching is exact for the base href and prefix for the rest, because the
 * base route is a parent of every sibling and would otherwise light up on all
 * of them.
 */
export interface TabItem {
  href: string;
  label: string;
}

export function Tabs({
  items,
  base,
  label,
}: {
  items: TabItem[];
  /** The href that must match exactly rather than by prefix. */
  base: string;
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="relative flex gap-[var(--sp-1)] overflow-x-auto px-[var(--sp-6)] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--border-light)]"
    >
      {items.map((tab) => {
        const active =
          tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className={cx(
              'relative flex min-h-[var(--h-lg)] shrink-0 items-center whitespace-nowrap',
              'text-[var(--fs-base)] font-medium transition-colors duration-[var(--dur-fast)]',
              active
                ? 'text-fg'
                : 'text-fg-2 hover:text-fg',
            )}
          >
            <span
              className={cx(
                'rounded-[var(--r-md)] px-[var(--sp-2)] py-[var(--sp-1)]',
                'transition-colors duration-[var(--dur-fast)]',
                !active && 'hover:bg-[var(--bg-tertiary)]',
              )}
            >
              {tab.label}
            </span>
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 z-10 h-[2px] rounded-[var(--r-full)] bg-[var(--accent)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
