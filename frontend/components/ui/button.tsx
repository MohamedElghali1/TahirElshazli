import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';

/* --- Button --------------------------------------------------------------
   Geometry is the reference system's, token for token: height 24 (small) or
   32 (medium), radius md, 1px border on every variant so the filled and
   outlined sizes agree to the pixel, font-size base at weight 500, and 8px
   of inline padding.

   That padding looks tight written down and is correct in place - these are
   toolbar controls sitting next to each other, not isolated web buttons. The
   two larger sizes below are ours, for the marketing site, which has the
   opposite problem.

   `data-variant` and `data-size` are emitted alongside the classes. They
   style nothing; they make the rendered DOM say what it is, which is how the
   reference implementation is inspected and tested. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-[var(--sp-1)] whitespace-nowrap ' +
  'rounded-[var(--r-md)] border font-medium select-none ' +
  'transition-[background-color,border-color,color] duration-[var(--dur-fast)] ' +
  'ease-[var(--ease)] disabled:pointer-events-none disabled:opacity-45';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-[var(--h-sm)] px-[var(--sp-2)] text-[var(--fs-base)]',
  md: 'h-[var(--h-md)] px-[var(--sp-2)] text-[var(--fs-base)]',
  // Ours, not the reference's: the marketing site and the auth forms.
  lg: 'h-[var(--h-lg)] px-[var(--sp-4)] text-[var(--fs-base)]',
  xl: 'h-[var(--h-xl)] px-[var(--sp-6)] text-[var(--fs-md)]',
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // primary/blue: the one filled action on a screen.
  primary:
    'border-transparent bg-[var(--accent)] text-[var(--accent-fg)] ' +
    'hover:bg-[var(--accent-hover)] active:bg-[var(--accent-press)]',
  // secondary/default: transparent body, visible edge.
  secondary:
    'border-[var(--border-medium)] bg-transparent text-[var(--fg-secondary)] ' +
    'hover:bg-[var(--bg-wash-subtle)] hover:text-[var(--fg-primary)] ' +
    'active:bg-[var(--bg-wash)]',
  // tertiary: no edge at all, for dense rows of controls.
  ghost:
    'border-transparent bg-transparent text-[var(--fg-secondary)] ' +
    'hover:bg-[var(--bg-wash-subtle)] hover:text-[var(--fg-primary)] ' +
    'active:bg-[var(--bg-wash)]',
  danger:
    'border-transparent bg-[var(--danger)] text-[var(--fg-inverted)] ' +
    'hover:opacity-90 active:opacity-80',
};

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonOwnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  href,
  ...rest
}: ButtonOwnProps &
  Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  return (
    <Link
      href={href}
      {...rest}
      data-variant={variant}
      data-size={size}
      className={cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
    >
      {children}
    </Link>
  );
}

/**
 * A square button carrying only an icon.
 *
 * It exists because twelve raw `<button>` elements had grown their own
 * approximations of it. `label` is required and becomes the accessible name -
 * an icon-only control with no name is invisible to a screen reader, and
 * making it a required prop is cheaper than remembering.
 */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: {
  label: string;
  variant?: ButtonVariant;
  size?: Extract<ButtonSize, 'sm' | 'md'>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button
      {...rest}
      aria-label={label}
      data-variant={variant}
      data-size={size}
      className={cx(
        BUTTON_BASE,
        size === 'sm'
          ? 'h-[var(--h-sm)] w-[var(--h-sm)]'
          : 'h-[var(--h-md)] w-[var(--h-md)]',
        BUTTON_VARIANT[variant],
        'shrink-0 p-0',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-[10px] w-[10px] shrink-0 animate-spin rounded-[var(--r-full)] border-[1.5px] border-current border-r-transparent"
    />
  );
}
