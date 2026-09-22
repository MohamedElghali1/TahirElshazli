import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import { NotificationCounter } from './feedback';

/**
 * Sidebar navigation.
 *
 * Two sizes, and the distinction is load-bearing: `md` is the system's 32px
 * control row, used for in-panel lists and sub-navigation; **`lg` is the
 * application shell** — 36px, 14/500, an 18px icon and more air between items,
 * "because a product's single global sidebar is navigation, not a dense list of
 * fields". Both consoles use `lg`.
 *
 * Two departures from the reference, both because this is a router and not a
 * prototype:
 *
 *  1. **It renders a `<Link>` when given an `href`.** The reference is a
 *     `<button onClick>`, which in a real app loses prefetch, middle-click,
 *     open-in-new-tab and the address bar. A button is still available for the
 *     cases that genuinely are not navigation (a collapse toggle, a filter).
 *  2. **`appearance="pill"` is a named variant** rather than a `style` override.
 *     The student surface inverts the console's grounds — gray sidebar, white
 *     page — and the console's `--wash-hover` active state is invisible on gray,
 *     so that surface marks the active item with a white pill instead. The
 *     design says exactly this; naming it keeps it from being re-derived by
 *     hand on each screen.
 */

type NavSize = 'md' | 'lg';
type NavAppearance = 'wash' | 'pill';

function navClasses(
  size: NavSize,
  active: boolean,
  appearance: NavAppearance,
): string {
  const lg = size === 'lg';
  return cx(
    'flex w-full items-center border-0 text-start cursor-pointer',
    'transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease)]',
    lg ? 'h-9 gap-2.5 rounded-md' : 'h-8 gap-2 rounded-sm',
    lg
      ? cx('text-[14px] leading-[1.4]', active ? 'font-semibold' : 'font-medium')
      : 'text-base font-medium leading-body',
    active ? 'text-fg' : 'text-fg-2 hover:bg-wash-hover',
    active &&
      (appearance === 'pill'
        ? // The student surface: a white pill on the gray rail.
          'bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
        : 'bg-wash-hover'),
  );
}

interface NavItemOwnProps {
  icon?: IconName;
  label: React.ReactNode;
  active?: boolean;
  /** An unread or pending count, rendered as a `NotificationCounter`. */
  count?: number | null;
  /** Nesting depth. The console uses 1 for "Draft tasks" under "Tasks". */
  indent?: number;
  size?: NavSize;
  appearance?: NavAppearance;
}

function NavInner({
  icon,
  label,
  active,
  count,
  size,
}: Required<Pick<NavItemOwnProps, 'label' | 'size'>> &
  Pick<NavItemOwnProps, 'icon' | 'active' | 'count'>) {
  return (
    <>
      {icon && (
        <Icon
          name={icon}
          size={size === 'lg' ? 18 : 16}
          className={cx('shrink-0', active ? 'text-accent' : 'text-fg-3')}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {count != null && <NotificationCounter count={count} />}
    </>
  );
}

/** Left inset grows with depth: 18px a level at `lg`, 16px at `md`. */
function insetFor(size: NavSize, indent: number): React.CSSProperties {
  const base = size === 'lg' ? 8 : 4;
  const step = size === 'lg' ? 18 : 16;
  return { paddingInlineStart: base + indent * step, paddingInlineEnd: base };
}

/**
 * `href` present means a link, absent means a button. A union rather than two
 * components, because every call site wants the same geometry and only a
 * handful of them are not navigation.
 */
type NavItemProps = NavItemOwnProps &
  ({ href: string; onClick?: never } | { href?: never; onClick?: () => void }) & {
    className?: string;
  };

export function NavItem({
  icon,
  label,
  active = false,
  count,
  indent = 0,
  size = 'lg',
  appearance = 'wash',
  href,
  className,
  ...rest
}: NavItemProps) {
  const classes = cx(navClasses(size, active, appearance), className);
  const style = insetFor(size, indent);
  const inner = (
    <NavInner icon={icon} label={label} active={active} count={count} size={size} />
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={classes}
        style={style}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      {...rest}
      type="button"
      aria-current={active ? 'page' : undefined}
      className={classes}
      style={style}
    >
      {inner}
    </button>
  );
}

/**
 * An 11/600 tertiary label above a run of `NavItem`s. The title is optional —
 * the first section in both shells has none, because a heading above the very
 * first group only repeats what the sidebar already is.
 */
export function NavSection({
  title,
  className,
  children,
  ...rest
}: {
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <nav {...rest} className={cx('flex flex-col gap-0.5', className)}>
      {title && (
        <span className="px-1 pb-1 pt-2 text-xxs font-semibold leading-none tracking-[0.02em] text-fg-4">
          {title}
        </span>
      )}
      {children}
    </nav>
  );
}
