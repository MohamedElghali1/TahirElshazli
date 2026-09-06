/**
 * The wordmark. A single geometric monogram plus the name, which is the one
 * category of hand-drawn SVG worth owning: a brand mark cannot come from an
 * icon library. The gold sits in the rule under the monogram, not behind it -
 * CLAUDE.md §4 keeps gold as an accent.
 */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 36 : 28;
  return (
    <span className="inline-flex items-center gap-[var(--sp-3)]">
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
          stroke="var(--fg-primary)"
          strokeWidth="1.75"
          strokeLinecap="square"
        />
        <path d="M9.5 21.5h9" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="square" />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={
            'font-semibold tracking-[-0.01em] text-[var(--fg-primary)] ' +
            (size === 'lg' ? 'text-[var(--fs-h3)]' : 'text-[var(--fs-md)]')
          }
        >
          Dr. Tahir Elshazli
        </span>
        <span className="mt-[3px] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          English Team
        </span>
      </span>
    </span>
  );
}
