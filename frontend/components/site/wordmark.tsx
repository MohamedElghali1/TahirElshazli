/**
 * The wordmark. A single geometric monogram plus the name, which is the one
 * category of hand-drawn SVG worth owning: a brand mark cannot come from an
 * icon library. The gold sits in the rule under the monogram, not behind it -
 * CLAUDE.md §4 keeps gold as an accent.
 */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 36 : 28;
  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={box}
        height={box}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <rect
          x="0.5"
          y="0.5"
          width="27"
          height="27"
          rx="7.5"
          stroke="var(--border-strong)"
        />
        <path
          d="M8 9.5h12M14 9.5V19"
          stroke="var(--fg)"
          strokeWidth="1.75"
          strokeLinecap="square"
        />
        <path d="M9.5 21.5h9" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="square" />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={
            'font-semibold tracking-[-0.01em] text-fg ' +
            (size === 'lg' ? 'text-m-h2' : 'text-m-lead')
          }
        >
          Dr. Tahir Elshazli
        </span>
        {/* A literal 12px, not a scale step. The marketing scale bottoms out
            at 17px body, and 17px under a 20px wordmark collapses the lockup's
            hierarchy — a lockup is not body copy. The console's 12px token
            would be the right size and the wrong scale: it may not cross onto
            a marketing surface (CLAUDE.md §11, "two type scales that never
            mix"), so the value is written out rather than borrowed. */}
        <span className="mt-[3px] text-[12px] text-fg-3">
          English Team
        </span>
      </span>
    </span>
  );
}
