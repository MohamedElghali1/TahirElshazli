import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

/**
 * Buttons.
 *
 * Geometry is the design system's, exactly: 32px medium and 24px small, 8px
 * radius, 13/500 label, 14px icons, and 8/12 padding (6/4 for tertiary, which
 * carries no ground and so needs no optical inset).
 *
 * **One primary per screen.** Indigo means "the one action here" — that is the
 * third non-negotiable, and a screen with three filled buttons has said nothing
 * about which one matters.
 *
 * Two places this departs from the reference `.jsx`, both because the reference
 * is a prototype and the written system is the spec:
 *
 *  1. **Hover is CSS, not JS.** The reference attaches `onMouseEnter` handlers
 *     that mutate `style.background`. Tailwind variants do the same job without
 *     a render, work before hydration, and cannot leave a button stuck in its
 *     hover colour when the pointer leaves during a re-render.
 *  2. **Secondary and primary get a hover state.** The reference's handlers fire
 *     only for `tertiary`, so the other two are inert under the pointer — but
 *     the system's own text says "hover is a wash, not a colour swap" without
 *     qualification, and `--accent-hover` exists for no other purpose. Primary
 *     moves to `--accent-hover`; secondary takes the wash over its own ground.
 */

type Variant = 'primary' | 'secondary' | 'tertiary';
type Accent = 'default' | 'danger' | 'blue';
type Size = 'small' | 'medium';
/** Position within a ButtonGroup — squares off the shared edges. */
type Position = 'left' | 'middle' | 'right';

const BASE =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap border-0 ' +
  'font-sans text-base font-medium leading-body select-none ' +
  'transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease)] ' +
  // 40% opacity with no colour change, per the system's disabled state.
  'disabled:pointer-events-none disabled:opacity-40';

const SIZE: Record<Size, string> = {
  small: 'h-6 px-2 py-1',
  medium: 'h-8 px-3 py-2',
};

/** Tertiary has no ground, so it needs less inset to look optically aligned. */
const SIZE_TERTIARY: Record<Size, string> = {
  small: 'h-6 px-1.5 py-1',
  medium: 'h-8 px-2 py-2',
};

const POSITION: Record<Position, string> = {
  left: 'rounded-s-md rounded-e-sm',
  middle: 'rounded-sm',
  right: 'rounded-s-sm rounded-e-md',
};

/** The ink a non-filled button takes when it carries an accent. */
function accentInk(accent: Accent): string {
  if (accent === 'danger') return 'text-status-red';
  if (accent === 'blue') return 'text-accent';
  return 'text-fg-2';
}

function skin(variant: Variant, accent: Accent, active: boolean): string {
  if (variant === 'primary') {
    return cx(
      'text-fg-invert shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]',
      accent === 'danger'
        ? 'bg-status-red hover:bg-status-red-text'
        : 'bg-accent hover:bg-accent-hover active:bg-accent-active',
    );
  }
  if (variant === 'secondary') {
    // `--background-primary-2` in the reference; it resolves to the same value
    // as `--surface` in both themes, so this is that token, named the way the
    // rest of the app names it.
    return cx(
      'bg-surface shadow-[inset_0_0_0_1px_var(--border-light)]',
      'hover:bg-wash-hover active:bg-wash-press',
      accentInk(accent),
    );
  }
  return cx(
    active ? 'bg-wash-hover' : 'bg-transparent',
    'hover:bg-wash-hover active:bg-wash-press',
    accentInk(accent),
  );
}

interface ButtonOwnProps {
  variant?: Variant;
  accent?: Accent;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  /** A tertiary button that is currently "on" — a view toggle, a filter. */
  active?: boolean;
  position?: Position;
}

function classesFor({
  variant = 'secondary',
  accent = 'default',
  size = 'medium',
  active = false,
  position,
  className,
}: ButtonOwnProps & { className?: string }) {
  return cx(
    BASE,
    variant === 'tertiary' ? SIZE_TERTIARY[size] : SIZE[size],
    position ? POSITION[position] : 'rounded-md',
    skin(variant, accent, active),
    className,
  );
}

export function Button({
  variant = 'secondary',
  accent = 'default',
  size = 'medium',
  icon,
  iconRight,
  active = false,
  position,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonOwnProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={active || undefined}
      className={classesFor({ variant, accent, size, active, position, className })}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
}

/** The same button as an `<a>`. Navigation is a link, never a button with a handler. */
export function ButtonLink({
  variant = 'secondary',
  accent = 'default',
  size = 'medium',
  icon,
  iconRight,
  position,
  className,
  children,
  href,
  ...rest
}: ButtonOwnProps &
  Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  return (
    <Link
      {...rest}
      href={href}
      className={classesFor({ variant, accent, size, position, className })}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </Link>
  );
}

/**
 * A run of buttons sharing edges. Pass `position` on each child; the group only
 * supplies the flex row and the 2px gap the system draws between them.
 */
export function ButtonGroup({
  className,
  children,
  ...rest
}: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} role="group" className={cx('inline-flex items-center gap-0.5', className)}>
      {children}
    </div>
  );
}

/* --- Icon-only buttons ---------------------------------------------------- */

/**
 * A square icon action. 24px box takes the 4px radius, 32px takes 8px — the
 * system's rule that the small icon button sits on the tag/chip radius step.
 *
 * `label` is required and becomes the accessible name. An icon-only control
 * with no name is invisible to a screen reader, and making it a required prop
 * is cheaper than remembering.
 */
export function IconButton({
  icon,
  label,
  size = 24,
  variant = 'secondary',
  accent = 'default',
  active = false,
  className,
  type = 'button',
  ...rest
}: {
  icon: IconName;
  label: string;
  size?: 24 | 32;
  variant?: Variant;
  accent?: Accent;
  active?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center border-0 px-1',
        'transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease)]',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 32 ? 'h-8 w-8 rounded-md' : 'h-6 w-6 rounded-sm',
        variant === 'primary'
          ? 'bg-accent text-fg-invert hover:bg-accent-hover'
          : cx(
              active ? 'bg-wash-hover' : 'bg-transparent',
              'hover:bg-wash-hover active:bg-wash-press',
              accent === 'danger' ? 'text-status-red' : accent === 'blue' ? 'text-accent' : 'text-fg-3',
              variant === 'tertiary' ? '' : 'shadow-[inset_0_0_0_1px_var(--border-light)]',
            ),
        className,
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/**
 * The borderless icon action — the close button on banners and callouts, the
 * chevron at the end of a row, the overflow control in a table.
 *
 * `accent="inverted"` is for placing one on the accent ground of a `Banner`,
 * where the usual wash would be invisible.
 */
export function LightIconButton({
  icon,
  label,
  size = 24,
  accent = 'default',
  active = false,
  className,
  type = 'button',
  ...rest
}: {
  icon: IconName;
  label: string;
  size?: 24 | 32;
  accent?: 'default' | 'danger' | 'inverted';
  active?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center border-0',
        'transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease)]',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 32 ? 'h-8 w-8 rounded-md' : 'h-6 w-6 rounded-sm',
        active ? 'bg-wash-hover' : 'bg-transparent',
        accent === 'inverted'
          ? 'text-fg-invert hover:bg-[rgba(255,255,255,0.12)]'
          : cx(
              'hover:bg-wash-hover active:bg-wash-press',
              accent === 'danger' ? 'text-status-red' : 'text-fg-3',
            ),
        className,
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
