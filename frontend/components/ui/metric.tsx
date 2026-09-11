import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';

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
      <div className="num mt-[var(--sp-1)] text-[var(--fs-xl)] leading-[var(--lh-tight)] text-[var(--fg-primary)]">
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
    'block rounded-[var(--r-md)] border border-[var(--border-medium)] ' +
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
   CLAUDE.md section 5.1 keeps progress and performance apart. This renders
   course completion and attendance. Grades get numbers, not bars, so the two
   can never be misread as the same measurement. */

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
