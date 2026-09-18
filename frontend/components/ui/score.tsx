import * as React from 'react';
import { cx } from './cx';

/**
 * `Score` and `Meter` live in one file on purpose.
 *
 * They are the two halves of the design system's second non-negotiable, and of
 * CLAUDE.md §5.1, which is the same rule arrived at independently:
 *
 *   **Progress and performance never merge.** Progress is completion - videos
 *   watched, lessons done - and it gets a `Meter`. Performance is achievement -
 *   marks, averages - and it gets a `Score`. Never averaged into one
 *   percentage, never sharing a bar, never the same table column.
 *
 * `Score` has no counterpart in the Figma file; it was added to the system
 * precisely so that this rule is enforceable in code rather than remembered.
 * The legacy implementation had only a meter and relied on discipline, and the
 * client has already had to correct this once.
 *
 * So: if you are about to draw a mark, you want `Score`. If you are about to
 * put a percentage in a bar, check it is completion first.
 */

/* --- Score: a mark ------------------------------------------------------- */

export type ScoreTone = 'good' | 'poor';

export function Score({
  value,
  of,
  tone,
  className,
  ...rest
}: {
  /** `null` renders an em-dash. A missing mark is never a zero. */
  value: number | null | undefined;
  /** The denominator. Numbers here always carry one: `8/10`, not `80%`. */
  of?: number | null;
  tone?: ScoreTone;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  // An em-dash, never `0`. The distinction is the whole point: a zero is a mark
  // the student earned, an em-dash is work that has not been marked yet, and
  // every screen that shows these says so once in a footnote.
  if (value == null) {
    return (
      <span
        {...rest}
        className={cx('font-mono text-fg-4', className)}
        // A screen reader would otherwise announce the dash as "dash", which is
        // not what it means here.
        aria-label="Not marked"
      >
        —
      </span>
    );
  }

  return (
    <span
      {...rest}
      className={cx(
        'num text-base',
        tone === 'good'
          ? 'text-status-green-text'
          : tone === 'poor'
            ? 'text-status-red-text'
            : 'text-fg',
        className,
      )}
    >
      {value}
      {of != null && <span className="text-fg-4">/{of}</span>}
    </span>
  );
}

/* --- Meter: completion --------------------------------------------------- */

export type MeterTone = 'accent' | 'green' | 'amber';

const METER_FILL: Record<MeterTone, string> = {
  accent: 'bg-accent',
  green: 'bg-status-green',
  amber: 'bg-status-amber',
};

export function Meter({
  value = 0,
  width = 96,
  tone = 'accent',
  label = true,
  /** Required: what completion this is. Becomes the progressbar's name. */
  name,
  className,
  ...rest
}: {
  value?: number;
  width?: number;
  tone?: MeterTone;
  /** `false` hides the trailing percentage when the caller prints its own n/m. */
  label?: boolean;
  name: string;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'role'>) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span {...rest} className={cx('inline-flex items-center gap-2', className)}>
      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={name}
        className="h-1 shrink-0 overflow-hidden rounded-full bg-wash-track"
        style={{ width }}
      >
        <span
          className={cx(
            'block h-full rounded-full transition-[width] duration-[var(--dur)] ease-[var(--ease)]',
            METER_FILL[tone],
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      {label !== false && (
        <span className="num text-xs text-fg-3">{pct}%</span>
      )}
    </span>
  );
}
