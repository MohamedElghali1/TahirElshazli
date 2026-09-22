import * as React from 'react';
import { cx } from './cx';

/**
 * A status label. 20px tall, 4px radius, regular weight.
 *
 * **A tag colour is a STATE, never the accent action.** That is the design
 * system's third non-negotiable and CLAUDE.md §4.1 both. Indigo means "the one
 * action on this screen"; a coloured tag means "this is the state of that
 * thing". Blue exists in both palettes, so a blue tag is accent-*coloured* but
 * never accent-*meaning* — which is why `blue` here resolves to the blue scale
 * and not to `--accent`, and why its ink is the 12-step rather than the 11:
 * blue-11 sits close enough to the accent to blur exactly the distinction the
 * rule is protecting.
 *
 * Weight is regular by default, deliberately. A status label competing with the
 * row it annotates is the commonest way a dense table turns into noise.
 */
export type TagTone = 'gray' | 'green' | 'amber' | 'red' | 'violet' | 'blue';

const TONE: Record<TagTone, string> = {
  gray: 'bg-wash-hover text-fg-2',
  green: 'bg-status-green-wash text-status-green-text',
  amber: 'bg-status-amber-wash text-status-amber-text',
  red: 'bg-status-red-wash text-status-red-text',
  violet: 'bg-status-violet-wash text-status-violet-text',
  blue: 'bg-status-blue-wash text-status-blue-text',
};

export function Tag({
  tone = 'gray',
  weight = 'normal',
  onRemove,
  removeLabel,
  className,
  children,
  ...rest
}: {
  tone?: TagTone;
  weight?: 'normal' | 'medium';
  /** Supplying this renders the remove control. */
  onRemove?: () => void;
  /** The remove button's accessible name — say what is being removed. */
  removeLabel?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'onCopy'>) {
  return (
    <span
      {...rest}
      data-tone={tone}
      className={cx(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1 py-[3px]',
        'text-base leading-body',
        weight === 'medium' ? 'font-medium' : 'font-normal',
        TONE[tone],
        className,
      )}
    >
      {children}
      {onRemove && (
        // A real <button>, not the reference's `<span role="button">`: a span
        // with a role is not focusable, does not fire on Enter, and cannot be
        // disabled. Same 10px glyph, same 0.6 opacity.
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="inline-flex shrink-0 cursor-pointer opacity-60 transition-opacity duration-[var(--dur-fast)] hover:opacity-100"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 2l6 6M8 2l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
