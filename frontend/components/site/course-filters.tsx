'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { cx } from '@/components/ui';

const MODES = [
  { value: undefined, label: 'All courses' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'live', label: 'Live' },
] as const;

/**
 * The only client component on the public course index. Everything else -
 * the cards, the counts, the filtering itself - renders on the server from the
 * URL, so this exists purely to *write* the URL.
 *
 * Search is a real form. Submitting navigates, which means it works with
 * JavaScript disabled and the result is a shareable address; the debounce below
 * is a convenience on top of that, not the mechanism.
 */
export function CourseFilters({
  mode,
  query,
  total,
  shown,
}: {
  mode?: string;
  query?: string;
  total: number;
  shown: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(query ?? '');

  // The URL is the source of truth. A back/forward navigation changes it
  // without touching this component's state, and without this the input would
  // keep showing the query the reader just navigated away from.
  //
  // Adjusted during render from a state variable rather than a ref - the same
  // pattern `SiteHeader` uses for `pathname`, and the one React documents for
  // deriving state from a changed prop. A ref cannot be read or written during
  // render at all.
  const [lastQuery, setLastQuery] = useState(query ?? '');
  if (lastQuery !== (query ?? '')) {
    setLastQuery(query ?? '');
    setValue(query ?? '');
  }

  useEffect(() => {
    if (value === (query ?? '')) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      router.replace(next.size ? `/courses?${next}` : '/courses', {
        scroll: false,
      });
    }, 250);
    return () => clearTimeout(id);
  }, [value, query, params, router]);

  const hrefFor = (nextMode?: string) => {
    const next = new URLSearchParams(params.toString());
    if (nextMode) next.set('mode', nextMode);
    else next.delete('mode');
    return next.size ? `/courses?${next}` : '/courses';
  };

  const filtered = Boolean(mode) || Boolean(query);

  return (
    <div className="flex flex-col gap-[var(--sp-6)] border-y border-[var(--border-light)] py-[var(--sp-6)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
        {MODES.map((option) => {
          const active = (mode ?? undefined) === option.value;
          return (
            <Link
              key={option.label}
              href={hrefFor(option.value)}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={cx(
                'inline-flex h-[var(--h-xl)] items-center rounded-[var(--r-full)] px-[var(--sp-4)]',
                'text-[var(--fs-base)] font-medium transition-colors duration-[var(--dur-fast)]',
                active
                  ? 'bg-[var(--accent-wash)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent-line)]'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-wash)] hover:text-[var(--fg-primary)]',
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-[var(--sp-4)]">
        <p
          aria-live="polite"
          className="hidden whitespace-nowrap text-[var(--fs-base)] text-[var(--fg-tertiary)] sm:block"
        >
          {filtered ? (
            <>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-primary)]">
                {shown}
              </span>{' '}
              of {total}
            </>
          ) : (
            <>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-primary)]">
                {total}
              </span>{' '}
              {total === 1 ? 'course' : 'courses'}
            </>
          )}
        </p>

        <form
          action="/courses"
          className="relative flex items-center"
          role="search"
        >
          {/* Preserved so submitting the search does not silently drop the
              mode the reader already chose. */}
          {mode && <input type="hidden" name="mode" value={mode} />}
          <MagnifyingGlassIcon
            size={16}
            aria-hidden
            className="pointer-events-none absolute start-[var(--sp-3)] text-[var(--fg-tertiary)]"
          />
          <input
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className={cx(
              'h-[var(--h-xl)] w-full min-w-[220px] rounded-[var(--r-md)] border border-[var(--border-medium)]',
              'bg-[var(--bg-primary)] ps-[var(--sp-8)] pe-[var(--sp-8)] text-[var(--fs-base)] text-[var(--fg-primary)]',
              'placeholder:text-[var(--fg-muted)] focus:border-[var(--border-strong)] focus:outline-none',
              'focus-visible:shadow-[var(--focus-ring)]',
            )}
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              aria-label="Clear search"
              className="absolute end-[var(--sp-2)] inline-flex h-[var(--h-md)] w-[var(--h-md)] items-center justify-center rounded-[var(--r-md)] text-[var(--fg-tertiary)] hover:bg-[var(--bg-wash)] hover:text-[var(--fg-primary)]"
            >
              <XIcon size={14} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
