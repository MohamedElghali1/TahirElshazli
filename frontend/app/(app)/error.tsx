'use client'; // Error boundaries must be Client Components

import Link from 'next/link';
import { ClIcon } from '@/components/shell/classroom';

/**
 * A screen inside the student or staff console failed. Rendered inside the
 * console shell, so the sidebar and top bar stay usable — Redesign V2 style.
 */
export default function ConsoleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="cl-panel" role="alert">
      <div className="cl-empty py-10">
        <span className="cl-ic40 cl-ic56" style={{ background: 'var(--cl-bad-bg)', color: 'var(--cl-bad-deep)' }}>
          <ClIcon name="close" />
        </span>
        <div className="text-[22px] text-fg">Something went wrong</div>
        <div className="max-w-[420px] text-[14px]">
          This screen hit an unexpected error. Try again, or go back to your home page.
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2.5">
          <button type="button" className="cl-btnp" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="cl-btns">
            Go home
          </Link>
        </div>
      </div>
    </section>
  );
}
