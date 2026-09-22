'use client';

import * as React from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

/**
 * Fields.
 *
 * Client components: `useId` pairs each label with its control and each error
 * with `aria-describedby`, and `Checkbox` needs an effect to set `indeterminate`,
 * which has no HTML attribute. Every form in this app already sits inside a
 * client component, so nothing is lost.
 *
 * All 32px, 8px radius, a 2%-black fill and a 1px inset ring that thickens to
 * 2px and turns accent on focus, or danger on error. Labels are the 11/600
 * upper-case tier; hints and errors are 12px underneath.
 *
 * **Focus is CSS here, not state.** The reference components track focus with
 * `useState` and swap an inline `boxShadow`. `focus-within` and `peer-*` do the
 * same job with no re-render and no hydration, which matters because several of
 * these render inside Server Components.
 *
 * Note what that means for the rule CLAUDE.md records the hard way — *"anything
 * still pairing `outline-none` with a removed ring has no focus indicator at
 * all"*. The inner control does carry `outline-none`, but the ring it is paired
 * with is a real, visible, keyboard-reachable `focus-within` indicator on the
 * wrapper. Never remove one without the other.
 *
 * The password pair in Settings is the system's form-validation reference:
 * error text under the field at 12px in `--status-red`, the ring turns red, and
 * **the submit stays enabled** — a disabled submit hides why it is disabled.
 */

const LABEL = 'text-xxs font-semibold leading-none text-fg-4';
const HINT = 'text-xs leading-body';

/** The shared field shell: ground, ring, focus and error behaviour. */
function fieldShell(error: boolean, disabled: boolean): string {
  return cx(
    'flex items-center gap-1.5 rounded-md bg-wash-field',
    'transition-[box-shadow] duration-[var(--dur-fast)] ease-[var(--ease)]',
    error
      ? 'shadow-[inset_0_0_0_2px_var(--border-danger)]'
      : 'shadow-[inset_0_0_0_1px_var(--border-light)] focus-within:shadow-[inset_0_0_0_2px_var(--accent)]',
    disabled && 'opacity-40',
  );
}

const CONTROL =
  'min-w-0 flex-1 border-0 bg-transparent outline-none ' +
  'font-sans text-base leading-body text-fg placeholder:text-fg-4';

/* --- TextInput ------------------------------------------------------------ */

export function TextInput({
  label,
  hint,
  error,
  icon,
  suffix,
  disabled = false,
  className,
  id,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** A string turns the ring red and prints under the field. */
  error?: string | null;
  icon?: IconName;
  suffix?: React.ReactNode;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  const generated = React.useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  const message = error || hint;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={inputId} className={LABEL}>
          {label}
        </label>
      )}
      <div className={cx(fieldShell(Boolean(error), disabled), 'h-8 px-2')}>
        {icon && <Icon name={icon} size={16} className="shrink-0 text-fg-4" />}
        <input
          {...rest}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={CONTROL}
        />
        {suffix}
      </div>
      {message && (
        <span
          id={messageId}
          className={cx(HINT, error ? 'text-status-red' : 'text-fg-4')}
        >
          {message}
        </span>
      )}
    </div>
  );
}

/* --- TextArea ------------------------------------------------------------- */

export function TextArea({
  label,
  hint,
  error,
  rows = 4,
  disabled = false,
  className,
  id,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  const messageId = `${fieldId}-message`;
  const message = error || hint;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={fieldId} className={LABEL}>
          {label}
        </label>
      )}
      <div className={cx(fieldShell(Boolean(error), disabled), 'p-2')}>
        <textarea
          {...rest}
          id={fieldId}
          rows={rows}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cx(CONTROL, 'resize-y')}
        />
      </div>
      {message && (
        <span
          id={messageId}
          className={cx(HINT, error ? 'text-status-red' : 'text-fg-4')}
        >
          {message}
        </span>
      )}
    </div>
  );
}

/* --- Select --------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  hint,
  error,
  options,
  disabled = false,
  className,
  id,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  options: ReadonlyArray<SelectOption | string>;
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'>) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  const messageId = `${fieldId}-message`;
  const message = error || hint;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={fieldId} className={LABEL}>
          {label}
        </label>
      )}
      <div className={cx(fieldShell(Boolean(error), disabled), 'h-8 px-2')}>
        <select
          {...rest}
          id={fieldId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cx(CONTROL, 'cursor-pointer appearance-none')}
        >
          {options.map((option) =>
            typeof option === 'string' ? (
              <option key={option} value={option}>
                {option}
              </option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </select>
        <Icon
          name="ChevronDown"
          size={14}
          className="pointer-events-none shrink-0 text-fg-4"
        />
      </div>
      {message && (
        <span
          id={messageId}
          className={cx(HINT, error ? 'text-status-red' : 'text-fg-4')}
        >
          {message}
        </span>
      )}
    </div>
  );
}

/* --- SearchInput ---------------------------------------------------------- */

/** The search row that heads a Menu or a table toolbar. */
export function SearchInput({
  label = 'Search',
  className,
  ...rest
}: {
  /** Accessible name. Visible placeholder comes from `placeholder`. */
  label?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>) {
  return (
    <div className={cx(fieldShell(false, false), 'h-8 px-2', className)}>
      <Icon name="Search" size={16} className="shrink-0 text-fg-4" />
      <input
        type="search"
        placeholder="Search"
        aria-label={label}
        {...rest}
        className={CONTROL}
      />
    </div>
  );
}

/* --- Checkbox ------------------------------------------------------------- */

/**
 * A real `<input type="checkbox">` behind a drawn box, rather than the
 * reference's `<span role="checkbox">`. The span version is not form-associated,
 * does not participate in a `<form>` submission, and reimplements keyboard
 * handling that the platform already gets right.
 *
 * `hoverable` puts the 14px box inside a 24px accent-wash target, which is what
 * the table's selection column uses.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  size = 14,
  hoverable = true,
  disabled = false,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name. Required — an unlabelled checkbox is unusable by voice or screen reader. */
  label: string;
  size?: 14 | 20;
  hoverable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const on = checked || indeterminate;

  return (
    <label
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        hoverable && 'h-6 w-6 hover:bg-accent-wash',
        disabled ? 'opacity-40' : 'cursor-pointer',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cx(
          'flex items-center justify-center rounded-xs',
          'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
          on ? 'bg-accent' : 'shadow-[inset_0_0_0_1px_var(--fg)]',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent',
        )}
        style={{ width: size, height: size }}
      >
        {indeterminate ? (
          <span
            className="rounded-[1px] bg-fg-invert"
            style={{ width: size * 0.5, height: 1.6 }}
          />
        ) : checked ? (
          <svg
            width={size * 0.58}
            height={size * 0.44}
            viewBox="0 0 8 6"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 3l2 2 4-4"
              stroke="var(--fg-invert)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </label>
  );
}

/* --- Toggle --------------------------------------------------------------- */

/**
 * A pill switch — one of only two places a pill radius is allowed in this
 * system (the other is a progress-bar cap).
 *
 * For a setting that takes effect immediately. Anything that needs a save
 * button is a checkbox.
 */
export function Toggle({
  checked,
  onChange,
  label,
  size = 20,
  disabled = false,
  className,
  ...rest
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name. */
  label: string;
  size?: 16 | 20;
  disabled?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'className'>) {
  const width = size === 16 ? 26 : 32;
  const knob = size - 4;
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex shrink-0 items-center rounded-full border-0 p-0.5',
        'transition-colors duration-[var(--dur)] ease-[var(--ease)]',
        checked ? 'justify-end bg-accent' : 'justify-start bg-wash-track',
        disabled ? 'opacity-40' : 'cursor-pointer',
        className,
      )}
      style={{ width, height: size }}
    >
      <span
        aria-hidden="true"
        className="rounded-full bg-white"
        style={{ width: knob, height: knob }}
      />
    </button>
  );
}
