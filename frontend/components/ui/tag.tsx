import * as React from 'react';
import { cx } from './cx';

/* --- Chip ----------------------------------------------------------------
   The reference system's Tag: 20px tall, 4px radius, base font size at
   regular weight, 8px of inline padding and a 4px gap.

   Two details are deliberate rather than incidental. The weight is regular,
   not medium - a status label competing with the row it annotates is the
   commonest way a dense table turns to noise. And the colour pair comes from
   the tag scale, never from the accent: indigo means "the one action here",
   these mean "this is the state of that thing". */

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
      data-tone={tone}
      className={cx(
        'inline-flex h-[var(--h-tag)] items-center gap-[var(--sp-1)]',
        'rounded-[var(--r-sm)] px-[var(--sp-2)] text-[var(--fs-base)]',
        'whitespace-nowrap',
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
