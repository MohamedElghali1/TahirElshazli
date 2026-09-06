import * as React from 'react';
import Link from 'next/link';

/**
 * Shared primitives. Everything here reads its geometry and color from the
 * tokens in `app/tokens.css` - no component below contains a raw hex or an
 * off-grid pixel value.
 */

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

/* --- Button --------------------------------------------------------------
   Gold is the primary and CLAUDE.md §4 makes it an accent, so a screen gets
   exactly one. `secondary` and `ghost` carry everything else. Gold always
   takes dark text; white on gold fails AA at every weight we ship. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-[var(--sp-2)] whitespace-nowrap ' +
  'font-medium select-none transition-[background-color,border-color,color,transform] ' +
  'duration-[var(--dur-fast)] ease-[var(--ease)] active:translate-y-[1px] ' +
  'disabled:pointer-events-none disabled:opacity-45 rounded-[var(--r-md)]';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-[var(--h-sm)] px-[var(--sp-3)] text-[var(--fs-xs)]',
  md: 'h-[var(--h-lg)] px-[var(--sp-4)] text-[var(--fs-base)]',
  lg: 'h-[var(--h-xl)] px-[var(--sp-6)] text-[var(--fs-md)]',
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] ' +
    'active:bg-[var(--accent-press)]',
  secondary:
    'bg-[var(--bg-tertiary)] text-[var(--fg-primary)] border border-[var(--border-medium)] ' +
    'hover:border-[var(--border-strong)] hover:bg-[var(--bg-wash)]',
  ghost:
    'bg-transparent text-[var(--fg-secondary)] hover:bg-[var(--bg-wash)] ' +
    'hover:text-[var(--fg-primary)]',
  danger:
    'bg-[var(--chip-red-bg)] text-[var(--chip-red-fg)] hover:brightness-125',
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
      className={cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
    >
      {children}
    </Link>
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

/* --- Chip ---------------------------------------------------------------- */

export type ChipTone =
  | 'neutral'
  | 'blue'
  | 'green'
  | 'red'
  | 'amber'
  | 'violet'
  | 'teal';

export function Chip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-[var(--h-xs)] items-center rounded-[var(--r-xs)] px-[var(--sp-2)]',
        'text-[var(--fs-xxs)] font-medium tracking-[0.02em] whitespace-nowrap',
        className,
      )}
      style={{
        background: `var(--chip-${tone}-bg)`,
        color: `var(--chip-${tone}-fg)`,
      }}
    >
      {children}
    </span>
  );
}

/* --- Panel: the app's one container. No card inside a card. -------------- */

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-medium)]',
        'bg-[var(--bg-secondary)]',
        className,
      )}
    >
      {title && (
        <header className="flex h-[var(--h-lg)] items-center justify-between gap-[var(--sp-3)] border-b border-[var(--border-light)] px-[var(--sp-4)]">
          <h2 className="text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName ?? 'p-[var(--sp-4)]'}>{children}</div>
    </section>
  );
}

/* --- Metric: a single number, read at a glance --------------------------- */

export function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">{label}</div>
      <div className="num mt-[var(--sp-1)] text-[var(--fs-xl)] leading-none text-[var(--fg-primary)]">
        {value}
      </div>
      {hint && (
        <div className="mt-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-muted)]">
          {hint}
        </div>
      )}
    </>
  );

  const shell =
    'block rounded-[var(--r-sm)] border border-[var(--border-medium)] ' +
    'bg-[var(--bg-secondary)] p-[var(--sp-4)]';

  return href ? (
    <Link
      href={href}
      className={cx(
        shell,
        'transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/* --- Meter: completion only, never a grade ------------------------------
   CLAUDE.md §5.1 keeps progress and performance apart. This renders course
   completion and attendance. Grades get numbers, not bars, so the two can
   never be misread as the same measurement. */

export function Meter({
  value,
  label,
  tone = 'accent',
}: {
  value: number;
  label: string;
  tone?: 'accent' | 'neutral';
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-[var(--sp-1)] w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--bg-wash)]"
    >
      <div
        className="h-full rounded-[var(--r-full)] transition-[width] duration-[var(--dur-normal)] ease-[var(--ease)]"
        style={{
          width: `${pct}%`,
          background: tone === 'accent' ? 'var(--accent)' : 'var(--fg-tertiary)',
        }}
      />
    </div>
  );
}

/* --- The three states every data surface has ----------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        'animate-pulse rounded-[var(--r-xs)] bg-[var(--bg-wash)]',
        className,
      )}
    />
  );
}

/** Rows shaped like the table they are standing in for, not a spinner. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rows" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-[var(--sp-12)] items-center gap-[var(--sp-4)] px-[var(--sp-4)]"
        >
          <Skeleton className="h-[var(--sp-2)] flex-1" />
          <Skeleton className="h-[var(--sp-2)] w-[64px]" />
          <Skeleton className="h-[var(--sp-2)] w-[40px]" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-[var(--sp-6)] py-[var(--sp-12)] text-center">
      <p className="text-[var(--fs-md)] font-medium text-[var(--fg-primary)]">
        {title}
      </p>
      <p className="mt-[var(--sp-2)] max-w-[42ch] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
        {body}
      </p>
      {action && <div className="mt-[var(--sp-4)]">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center px-[var(--sp-6)] py-[var(--sp-12)] text-center"
    >
      <p className="text-[var(--fs-md)] font-medium text-[var(--fg-primary)]">
        That did not load
      </p>
      <p className="mt-[var(--sp-2)] max-w-[42ch] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
        {message}
      </p>
      {onRetry && (
        <Button className="mt-[var(--sp-4)]" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* --- Forms ---------------------------------------------------------------
   Label above, helper between, error below. Never a placeholder standing in
   for a label. */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--sp-2)]">
      <label
        htmlFor={htmlFor}
        className="text-[var(--fs-xs)] font-medium text-[var(--fg-secondary)]"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">{hint}</p>
      )}
      {error && (
        <p className="text-[var(--fs-xs)] text-[var(--chip-red-fg)]">{error}</p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-[var(--r-xs)] border border-[var(--border-medium)] ' +
  'bg-[var(--bg-primary)] px-[var(--sp-3)] text-[var(--fs-base)] ' +
  'text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] ' +
  'transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] ' +
  'disabled:opacity-50';

export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL, 'h-[var(--h-xl)]', className)} />;
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(CONTROL, 'min-h-[120px] py-[var(--sp-3)] leading-[var(--lh-base)]', className)}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(CONTROL, 'h-[var(--h-lg)] pr-[var(--sp-6)]', className)}>
      {children}
    </select>
  );
}

/** Inline form-level failure. Toasts are for transient things; this is not. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--r-xs)] bg-[var(--chip-red-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--chip-red-fg)]"
    >
      {children}
    </p>
  );
}
