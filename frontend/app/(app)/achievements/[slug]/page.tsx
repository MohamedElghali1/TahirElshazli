'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { Chip, ErrorState, Panel, RowsSkeleton } from '@/components/ui';
import { MediaGallery, PostBody } from '@/components/blog/media-gallery';
import { PageBody, PageHeader } from '@/components/app/page-parts';

const CATEGORY_LABEL = {
  achievement: 'Achievement',
  article: 'Article',
  resource: 'Resource',
} as const;

/**
 * One achievement post, read inside the student console.
 *
 * The marketing site has its own page for the same post at the same slug; this
 * one keeps the reader in the app shell, with the rail and their notifications
 * still to hand. Both read `api.publicBlog` - one endpoint, two surfaces
 * (CLAUDE.md §5.19).
 *
 * `params` is a Promise in this version of Next, unwrapped with `use()` since
 * this is a Client Component rather than an async Server one.
 */
export default function AchievementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data, error, loading, reload } = useApi(
    () => api.publicBlog.get(slug, { live: true }),
    [slug],
  );

  return (
    <>
      <PageHeader
        title={data?.title ?? 'Achievements'}
        subtitle={data ? `Posted by ${data.authorName}` : undefined}
      />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        <Link
          href="/achievements"
          className="inline-flex items-center gap-[var(--sp-2)] self-start text-[var(--fs-base)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
        >
          <ArrowLeftIcon size={14} />
          All posts
        </Link>

        {loading && <RowsSkeleton rows={5} />}
        {/* A 404 here is a real answer covering three cases the server keeps
            indistinguishable - a draft, a post scheduled for later, and a slug
            that never existed - so the copy says what the reader can act on
            rather than guessing which. */}
        {error && (
          <ErrorState
            message={
              error.isNotFound
                ? 'That post is not available.'
                : error.message
            }
            onRetry={error.isNotFound ? undefined : reload}
          />
        )}

        {data && (
          <Panel>
            <div className="flex items-center gap-[var(--sp-2)]">
              <Chip tone={data.category === 'achievement' ? 'amber' : 'neutral'}>
                {CATEGORY_LABEL[data.category]}
              </Chip>
              <time
                dateTime={data.publishAt}
                className="text-[var(--fs-xxs)] text-[var(--fg-tertiary)]"
              >
                {formatDate(data.publishAt)}
              </time>
            </div>

            {/* Only the written standfirst, never the computed fallback -
                repeating the opening of the body immediately above that body
                reads as a duplication bug. */}
            {data.excerpt && (
              <p className="mt-[var(--sp-4)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                {data.excerpt}
              </p>
            )}

            <PostBody
              body={data.body}
              className="mt-[var(--sp-4)] flex flex-col gap-[var(--sp-4)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]"
            />

            <MediaGallery
              media={data.media}
              className="mt-[var(--sp-6)] grid gap-[var(--sp-5)] sm:grid-cols-2"
            />

            {data.tags.length > 0 && (
              <ul className="mt-[var(--sp-6)] flex flex-wrap gap-[var(--sp-2)] border-t border-[var(--border-light)] pt-[var(--sp-4)]">
                {data.tags.map((tag) => (
                  <li key={tag}>
                    <Chip tone="neutral">{tag}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </PageBody>
    </>
  );
}
