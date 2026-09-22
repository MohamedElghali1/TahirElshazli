'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, IconButton } from '@/components/ui';

/**
 * The only client component on the public course index. Everything else -
 * the cards, the counts, the filtering itself - renders on the server from the
 * URL, so this exists purely to *write* the URL.
 *
 * Search is a real form. Submitting navigates, which means it works with
 * JavaScript disabled and the result is a shareable address; the debounce below
 * is a convenience on top of that, not the mechanism.
 *
 * No Recorded/Live filter: `PublicCourseSummary` carries no learning-mode
 * field for an anonymous visitor (retired by migration `012`) - see
 * `app/(site)/courses/page.tsx`'s `applyFilters`.
 */
export function CourseFilters({
  query,
  total,
  shown,
}: {
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

  const filtered = Boolean(query);

  return (
    <div className="flex items-center justify-end gap-[var(--sp-6)] border-y border-[var(--border-light)] py-[var(--sp-6)]">
      <div className="flex items-center gap-[var(--sp-4)]">
        <p
          aria-live="polite"
          className="hidden whitespace-nowrap text-[var(--fs-base)] text-fg-3 sm:block"
        >
          {filtered ? (
            <>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
                {shown}
              </span>{' '}
              of {total}
            </>
          ) : (
            <>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
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
          <Icon
            name="Search"
            size={16}
            aria-hidden
            className="pointer-events-none absolute start-[var(--sp-3)] text-fg-3"
          />
          {/* A plain input styled to match the system — the surrounding wrapper
              already provides the search icon and clear button, so using
              SearchInput would double the icon. */}
          <input
            type="search"
            name="q"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="min-w-[220px] rounded-md border-0 bg-wash-field py-1.5 ps-[var(--sp-8)] pe-[var(--sp-8)] font-sans text-base leading-body text-fg shadow-[inset_0_0_0_1px_var(--border-light)] outline-none placeholder:text-fg-4 focus:shadow-[inset_0_0_0_2px_var(--accent)]"
          />
          {value && (
            <IconButton
              icon="X"
              label="Clear search"
              size={24}
              onClick={() => setValue('')}
              className="absolute end-[var(--sp-2)]"
            />
          )}
        </form>
      </div>
    </div>
  );
}
