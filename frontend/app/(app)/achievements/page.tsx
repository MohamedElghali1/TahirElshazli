'use client';

import Link from 'next/link';
import { ImagesIcon, PlayCircleIcon, PaperclipIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { PublicBlogPost } from '@/lib/types';
import { Chip, EmptyState, ErrorState, Panel, RowsSkeleton } from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

const CATEGORY_LABEL = {
  achievement: 'Achievement',
  article: 'Article',
  resource: 'Resource',
} as const;

/**
 * Achievements, inside the student console (CLAUDE.md §5.19).
 *
 * The client asked for a blog "the students can view", and this is the student
 * half of it: the same feed the marketing site shows, in the product's own
 * dense styling and inside the app shell, so a student does not have to leave
 * their console to read it.
 *
 * It reads `api.publicBlog`, the anonymous endpoint, and that is deliberate
 * rather than lazy - the content is identical for both readers, so a
 * student-scoped route would only be a second place for the publication
 * predicate to be got wrong. Nothing here is per-student, so there is nothing a
 * token could scope.
 *
 * Not reachable by staff: `app/(app)/layout.tsx` redirects a teacher or
 * assistant into `/manage`, where their own console has an authoring screen.
 */
export default function AchievementsPage() {
  // `live: true`: this is a Client Component, where Next's `next.revalidate`
  // does nothing. Better to say so than to appear to be caching.
  const { data, error, loading, reload } = useApi(
    () => api.publicBlog.list({ live: true }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Achievements"
        subtitle="Results, worked examples and notes from Dr. Tahir and the team."
      />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && data.length === 0 && (
          <Panel bodyClassName="">
            <EmptyState
              title="Nothing posted yet"
              body="When Dr. Tahir posts results or a worked example, it appears here."
            />
          </Panel>
        )}

        {data?.map((post) => <PostRow key={post.id} post={post} />)}
      </PageBody>
    </>
  );
}

function PostRow({ post }: { post: PublicBlogPost }) {
  const cover = post.media.find((m) => m.kind === 'image');
  const images = post.media.filter((m) => m.kind === 'image').length;
  const videos = post.media.filter((m) => m.kind === 'video').length;
  const files = post.media.filter((m) => m.kind === 'file').length;

  return (
    <Link
      href={`/achievements/${post.slug}`}
      className="group flex gap-[var(--sp-5)] rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
    >
      {cover && (
        /* Fixed thumbnail rather than the marketing site's wide crop: this is a
           scannable list, and a hero image per row would make four posts fill
           the viewport. A plain <img> for the reason `MediaGallery` documents -
           author-supplied hosts cannot be enumerated in next.config.ts. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="hidden h-[84px] w-[124px] shrink-0 rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] object-cover sm:block"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--sp-2)]">
          <Chip tone={post.category === 'achievement' ? 'amber' : 'neutral'}>
            {CATEGORY_LABEL[post.category]}
          </Chip>
          <time
            dateTime={post.publishAt}
            className="text-[var(--fs-xxs)] text-[var(--fg-tertiary)]"
          >
            {formatDate(post.publishAt)}
          </time>
        </div>

        <h2 className="mt-[var(--sp-2)] text-[var(--fs-body)] font-medium leading-[1.3] text-[var(--fg-primary)]">
          {post.title}
        </h2>
        <p className="mt-[var(--sp-1)] line-clamp-2 text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          {post.summary}
        </p>

        <div className="mt-[var(--sp-3)] flex items-center gap-[var(--sp-4)] text-[var(--fs-xxs)] text-[var(--fg-tertiary)]">
          <span>{post.authorName}</span>
          {images > 0 && <Count Icon={ImagesIcon} n={images} label="images" />}
          {videos > 0 && <Count Icon={PlayCircleIcon} n={videos} label="videos" />}
          {files > 0 && <Count Icon={PaperclipIcon} n={files} label="files" />}
        </div>
      </div>
    </Link>
  );
}

function Count({
  Icon,
  n,
  label,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  n: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-[var(--sp-1)]">
      <Icon size={13} />
      <span className="font-[family-name:var(--font-mono)] tabular-nums">{n}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
