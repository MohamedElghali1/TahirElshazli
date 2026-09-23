'use client';

import { Icon, cx } from '@/components/ui';
import type { AnnotationKind, AnnotationPoint } from '@/lib/types';

/** The part of a mark the layer needs - staff and student shapes both fit. */
export interface DrawnMark {
  id: string;
  kind: AnnotationKind;
  xPercent: number;
  yPercent: number;
  text: string;
  path: AnnotationPoint[] | null;
}

/**
 * Ink per kind, from the token palette only. Indigo is "the one action here"
 * and red is failure (CLAUDE.md §11.1), so the pen is violet - a teacher's
 * ink that is neither. A cross marks a wrong answer, so it takes red text.
 * Recorded for the reviewer as a design choice, not a token decision.
 */
const STROKE: Record<'pen' | 'highlight', string> = {
  pen: 'stroke-status-violet',
  highlight: 'stroke-status-amber',
};

/**
 * Marks drawn over one page. **Coordinates are physical:** `x%` is measured
 * from the paper's LEFT edge and `y%` from its top, whatever the interface
 * direction - so the whole layer is `dir="ltr"` and uses `left`/`top`, never
 * `start-*`. Under `dir="rtl"` a logical position would mirror every tick onto
 * the wrong answer (CLAUDE.md §11: a layout-critical position needs an RTL
 * browser check).
 *
 * Text renders as React text nodes - never HTML (`SECURITY.md` §2.5).
 */
export function AnnotationLayer({
  marks,
  pending = [],
  highlightId,
  numberOf,
}: {
  marks: readonly DrawnMark[];
  /** Strokes still being saved, or whose save failed - drawn dashed. */
  pending?: readonly { id: string; kind: 'pen' | 'highlight'; path: AnnotationPoint[] }[];
  highlightId?: string | null;
  /** The comment's number in the side list, so pin and note can be matched. */
  numberOf?: (id: string) => number | undefined;
}) {
  const strokes = marks.filter((m) => m.path && (m.kind === 'pen' || m.kind === 'highlight'));
  const pins = marks.filter((m) => m.kind === 'tick' || m.kind === 'cross' || m.kind === 'comment');

  return (
    <div dir="ltr" className="pointer-events-none absolute inset-0">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {strokes.map((m) => (
          <polyline
            key={m.id}
            points={m.path!.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={m.kind === 'highlight' ? 14 : 2.5}
            className={cx(
              STROKE[m.kind as 'pen' | 'highlight'],
              // One opacity utility per element: a highlighter is translucent
              // unless it is the mark being pointed at in the list.
              m.kind === 'highlight' && highlightId !== m.id && 'opacity-40',
            )}
          />
        ))}
        {pending.map((p) => (
          <polyline
            key={p.id}
            points={p.path.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={p.kind === 'highlight' ? 14 : 2.5}
            strokeDasharray="4 3"
            className={cx(STROKE[p.kind], 'opacity-60')}
          />
        ))}
      </svg>
      {pins.map((m) => (
        <span
          key={m.id}
          title={m.kind === 'comment' ? m.text : undefined}
          style={{ left: `${m.xPercent}%`, top: `${m.yPercent}%` }}
          className={cx(
            'absolute flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1',
            'text-xs font-semibold leading-none',
            // One shadow utility per element (CLAUDE.md §11, rule 2).
            highlightId === m.id
              ? 'shadow-[0_0_0_2px_var(--border-strong)]'
              : 'shadow-[0_0_0_2px_var(--surface)]',
            m.kind === 'tick' && 'bg-status-green-wash text-status-green-text',
            m.kind === 'cross' && 'bg-status-red-wash text-status-red-text',
            m.kind === 'comment' && 'bg-status-violet-wash text-status-violet-text',
          )}
        >
          {m.kind === 'tick' && <Icon name="Check" size={12} />}
          {m.kind === 'cross' && <Icon name="X" size={12} />}
          {m.kind === 'comment' && <span className="num">{numberOf?.(m.id) ?? '•'}</span>}
          <span className="sr-only">
            {m.kind === 'tick' ? 'Tick' : m.kind === 'cross' ? 'Cross' : `Comment: ${m.text}`}
          </span>
        </span>
      ))}
    </div>
  );
}
