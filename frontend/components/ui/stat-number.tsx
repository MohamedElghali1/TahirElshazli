import * as React from 'react';
import { cx } from './cx';

/**
 * A single headline figure: an 11/600 upper-case label over a 24px mono number.
 *
 * **Never a money figure.** The design system's first non-negotiable and
 * CLAUDE.md §1 say the same thing: no total-earnings number and no income chart
 * on any dashboard, for any role. The counts this is for are operational —
 * tasks set, submissions to mark, active students, unmatched responses. A
 * Payments *page* may show a transaction amount, because you cannot operate a
 * refund without seeing one; a dashboard total may not.
 *
 * The label is the system's only upper-case tier, and that is typography rather
 * than writing: everything else, including every button and menu item, is
 * sentence case.
 */
export function StatNumber({
  label,
  value,
  caption,
  className,
  ...rest
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A sentence of context. Where a figure is understated, say so here. */
  caption?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('flex flex-col gap-1', className)}>
      <span className="text-xxs font-semibold uppercase leading-none tracking-[0.04em] text-fg-4">
        {label}
      </span>
      <span className="num text-[24px] leading-[1.2] text-fg">{value}</span>
      {caption && (
        <span className="text-xs leading-body text-fg-4">{caption}</span>
      )}
    </div>
  );
}
