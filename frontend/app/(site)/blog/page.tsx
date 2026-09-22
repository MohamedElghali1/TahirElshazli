import type { Metadata } from 'next';
import Link from 'next/link';
import { ImagesIcon, PlayCircleIcon, PaperclipIcon } from '@phosphor-icons/react/dist/ssr';
import { EmptyState, ButtonLink, Callout, Tag } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { PublicBlogPost } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Results, achievements and notes on IGCSE English and IELTS preparation ' +
    'from Dr. Tahir Elshazli.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

/**
 * The blog index (CLAUDE.md §5.19).
 *
 * Until 2026-09-10 this page was a hardcoded empty state, because `BlogPost`
 * existed in the data model and nothing served it. It now reads the real feed.
 *
 * Two audiences read the same API: this page and the student console's
 * `/achievements`. That is deliberate - an achievement post is marketing material, and
 * a second endpoint would be a second place for the publication predicate to
 * go wrong. What differs is the rhythm: this is the editorial surface, on the
 * marketing site's loose spacing and display type.
 *
 * A Server Component, so the feed is crawlable (§4 wants the public pages
 * SEO-friendly) and cached on the five-minute window `api.publicBlog` sets.
 */
async function loadPosts(): Promise<PublicBlogPost[] | null> {
  try {
    return await api.publicBlog.list();
  } catch (cause) {
    // An outage must not render as "nothing published yet" - that tells a
    // visitor the site is empty when it is in fact broken, and the two want
    // completely different copy. The same distinction the course pages draw.
    if (cause instanceof ApiError) return null;
    throw cause;
  }
}

const CATEGORY_LABEL = {
  achievement: 'Achievement',
  article: 'Article',
  resource: 'Resource',
} as const;

export default async function BlogPage() {
  const posts = await loadPosts();

  return (
    <section className={`${shell} py-[var(--sp-16)] lg:py-[var(--sp-24)]`}>
      <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
        Results, and how they happened.
      </h1>
      <p className="mt-[var(--sp-6)] max-w-[54ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-fg-2">
        What the cohorts have achieved, worked examples from the papers, and
        what examiners are actually looking for.
      </p>

      {posts === null && (
        <div className="mt-[var(--sp-16)]">
          <Callout tone="danger" title="The blog could not be loaded just now">
            Please try again shortly.
          </Callout>
        </div>
      )}

      {posts?.length === 0 && (
        <div className="mt-[var(--sp-16)] rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-secondary)]">
          <EmptyState
            title="Nothing published yet"
            description="The first posts go up before the next intake. Until then, the course pages cover what each paper involves."
            action={
              <ButtonLink href="/courses" variant="primary" size="medium">
                Browse courses
              </ButtonLink>
            }
          />
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="mt-[var(--sp-16)] grid gap-[var(--sp-8)] sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.id} delay={i * 0.06}>
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

function PostCard({ post }: { post: PublicBlogPost }) {
  // The cover is the first image in the gallery, not a `featured_image_url`
  // column - one source of truth, so a cover cannot disagree with the gallery
  // beside it (CLAUDE.md §5.19).
  const cover = post.media.find((m) => m.kind === 'image');
  const videos = post.media.filter((m) => m.kind === 'video').length;
  const files = post.media.filter((m) => m.kind === 'file').length;
  const images = post.media.filter((m) => m.kind === 'image').length;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
    >
      {/* A plain <img>, not next/image, and that is a considered choice: media
          URLs are author-supplied and can point at any host, while
          `images.remotePatterns` in next.config.ts is an allowlist that has to
          enumerate hosts at build time. next/image would 400 on anything not
          listed - a broken gallery whenever Dr. Tahir uses a new CDN. The cost
          is no automatic resizing, which is why sizes are constrained by CSS
          and loading is lazy. */}
      {cover ? (
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-tertiary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.url}
            alt={cover.caption ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[var(--dur-slow)] ease-[var(--ease)] group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="aspect-[16/10] border-b border-[var(--border-light)] bg-[var(--bg-tertiary)]"
        />
      )}

      <div className="flex flex-1 flex-col p-[var(--sp-6)]">
        <div className="flex items-center gap-[var(--sp-3)]">
          <Tag tone={post.category === 'achievement' ? 'amber' : 'gray'}>
            {CATEGORY_LABEL[post.category]}
          </Tag>
          <time
            dateTime={post.publishAt}
            className="text-[var(--fs-base)] text-fg-3"
          >
            {formatDate(post.publishAt)}
          </time>
        </div>

        <h2 className="mt-[var(--sp-4)] text-[var(--fs-h3)] font-semibold leading-[1.2] tracking-[-0.01em] text-fg">
          {post.title}
        </h2>
        <p className="mt-[var(--sp-3)] flex-1 text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
          {post.summary}
        </p>

        <div className="mt-[var(--sp-6)] flex items-center gap-[var(--sp-4)] text-[var(--fs-base)] text-fg-3">
          <span className="text-fg-2">{post.authorName}</span>
          {/* Counted, not just implied by the cover: "and a video" is the
              reason to open a post, and a single cover image hides it. */}
          {images > 1 && <MediaCount Icon={ImagesIcon} n={images} label="images" />}
          {videos > 0 && <MediaCount Icon={PlayCircleIcon} n={videos} label="videos" />}
          {files > 0 && <MediaCount Icon={PaperclipIcon} n={files} label="files" />}
        </div>
      </div>
    </Link>
  );
}

function MediaCount({
  Icon,
  n,
  label,
}: {
  Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  n: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-[var(--sp-1)]">
      <Icon size={14} aria-hidden />
      <span className="font-[family-name:var(--font-mono)] tabular-nums">{n}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
