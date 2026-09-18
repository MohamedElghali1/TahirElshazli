import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

/**
 * The console page head: an optional breadcrumb, a 24/600 title, a sentence of
 * context, and the actions.
 *
 * 24px is the console's type ceiling — nothing in the product is larger, and
 * anything that wants to be belongs to the marketing site. This component
 * exists in the system (it has no Figma counterpart) specifically so that
 * ceiling is applied by default rather than remembered.
 *
 * Note where it is *not* used: in both shells the page title lives in the 52px
 * crumb header, so top-level screens carry no `PageHeader` at all. It is for
 * the screens that have a breadcrumb of their own — a lesson, a homework
 * attempt, a task's results.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  className,
  ...rest
}: {
  breadcrumb?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <header {...rest} className={cx('flex flex-col gap-2', className)}>
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold leading-[1.2] text-fg">{title}</h1>
          {description && (
            <p className="m-0 text-base leading-body text-fg-3">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Where you are, at 13px. The last crumb is primary ink and is not a link — it
 * is the page you are on; the rest are tertiary and navigate.
 */
export interface Crumb {
  label: React.ReactNode;
  href?: string;
  icon?: IconName;
}

export function Breadcrumb({
  items,
  className,
  ...rest
}: { items: readonly Crumb[]; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      {...rest}
      aria-label="Breadcrumb"
      className={cx(
        'flex items-center gap-1 text-base font-medium leading-body',
        className,
      )}
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const body = (
          <>
            {item.icon && <Icon name={item.icon} size={14} />}
            {item.label}
          </>
        );
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              // Flips in Arabic: the crumb reads right-to-left there, so a
              // chevron that always points right would point backwards.
              <Icon
                name="ChevronRight"
                size={14}
                className="text-fg-4 rtl:rotate-180"
              />
            )}
            {last || !item.href ? (
              <span
                aria-current={last ? 'page' : undefined}
                className={cx(
                  'inline-flex items-center gap-1',
                  last ? 'text-fg' : 'text-fg-3',
                )}
              >
                {body}
              </span>
            ) : (
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 text-fg-3 no-underline transition-colors duration-[var(--dur-fast)] hover:text-fg hover:no-underline"
              >
                {body}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
