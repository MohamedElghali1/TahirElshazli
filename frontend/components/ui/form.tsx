import * as React from 'react';
import { cx } from './cx';

/* --- Forms ---------------------------------------------------------------
   Label above, helper between, error below. Never a placeholder standing in
   for a label.

   Controls follow the reference system's Input: 32px tall, radius md, a 1px
   medium border that turns accent on focus, a barely-there fill so the field
   reads as recessed against a panel, and 8px of inline padding. The
   placeholder is deliberately lighter *and* medium weight - it has to be
   legible enough to read and distinct enough never to be mistaken for a
   value. */

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
        className="text-[var(--fs-xs)] font-medium text-fg-2"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[var(--fs-xs)] text-fg-3">{hint}</p>
      )}
      {error && (
        <p className="text-[var(--fs-xs)] text-danger">{error}</p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-[var(--r-md)] border border-[var(--border-medium)] ' +
  'bg-[var(--bg-wash-subtle)] px-[var(--sp-2)] text-[var(--fs-base)] ' +
  'text-fg placeholder:font-medium placeholder:text-fg-4 ' +
  'transition-colors duration-[var(--dur-fast)] ' +
  'hover:border-[var(--border-strong)] focus:border-[var(--accent)] ' +
  'aria-[invalid=true]:border-[var(--danger)] ' +
  'disabled:cursor-not-allowed disabled:text-fg-3 disabled:opacity-70';

/**
 * Control height. `md` (32px) is the reference system's Input and is what the
 * whole LMS uses; `lg` (40px) is ours, for the marketing site, where a contact
 * form is the page's main event rather than one control in a toolbar.
 *
 * The prop is `uiSize` rather than `size` because `<input size>` and
 * `<select size>` are real HTML attributes that take a number - shadowing them
 * with a string would either break the typing or silently drop a valid
 * attribute.
 */
type ControlSize = 'md' | 'lg';

const CONTROL_H: Record<ControlSize, string> = {
  md: 'h-[var(--h-md)]',
  lg: 'h-[var(--h-lg)] px-[var(--sp-3)] text-[var(--fs-md)]',
};

export function Input({
  className,
  uiSize = 'md',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { uiSize?: ControlSize }) {
  return <input {...rest} className={cx(CONTROL, CONTROL_H[uiSize], className)} />;
}

export function Textarea({
  className,
  uiSize = 'md',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { uiSize?: ControlSize }) {
  return (
    <textarea
      {...rest}
      className={cx(
        CONTROL,
        'min-h-[120px] py-[var(--sp-2)] leading-[var(--lh-base)]',
        uiSize === 'lg' && 'px-[var(--sp-3)] text-[var(--fs-md)]',
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  uiSize = 'md',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { uiSize?: ControlSize }) {
  return (
    <select
      {...rest}
      className={cx(CONTROL, CONTROL_H[uiSize], 'pe-[var(--sp-6)]', className)}
    >
      {children}
    </select>
  );
}

/** Inline form-level failure. Toasts are for transient things; this is not. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--r-md)] bg-[var(--danger-wash)] px-[var(--sp-3)] py-[var(--sp-2)] text-[var(--fs-xs)] text-chip-red-fg"
    >
      {children}
    </p>
  );
}
