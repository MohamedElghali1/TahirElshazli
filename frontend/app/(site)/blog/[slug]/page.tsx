import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/ssr';
import { ButtonLink, Chip } from '@/components/ui';
import { MediaGallery, PostBody } from '@/components/blog/media-gallery';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { PublicBlogPost } from '@/lib/types';

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

const CATEGORY_LABEL = {
  achievement: 'Achievement',
  article: 'Article',
  resource: 'Resource',
} as const;

/**
 * Not statically generated, and for the same reason the course pages are not:
 * the real slug list lives in the database and changes when Dr. Tahir
 * publishes, which is exactly what a build-time list cannot know.
 * `api.publicBlog.get` revalidates on a five-minute window instead.
 */
async function loadPost(slug: string): Promise<PublicBlogPost | null> {
  try {
    return await api.publicBlog.get(slug);
  } catch (cause) {
    // A 404 is a real answer, and it covers three cases the server
    // deliberately makes indistinguishable: a draft, a post scheduled for the
    // future, and a slug that never existed. All three render the same
    // not-found page. Anything else is our outage and must not be reported to
    // a visitor as a dead bookmark.
    if (cause instanceof ApiError && cause.isNotFound) return null;
    throw cause;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: post.title,
    description: post.summary.slice(0, 160),
    openGraph: {
      title: post.title,
      description: post.summary.slice(0, 160),
      type: 'article',
      publishedTime: post.publishAt,
      // The first image in the gallery, which is also what the index uses as
      // the card cover - one source of truth rather than a separate
      // `featured_image_url` that could disagree with it.
      images: post.media
        .filter((m) => m.kind === 'image')
        .slice(0, 1)
        .map((m) => ({ url: m.url })),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  return (
    <article className={`${shell} py-[var(--sp-16)] lg:py-[var(--sp-24)]`}>
      <Link
        href="/blog"
        className="inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-body)] text-fg-3 transition-colors duration-[var(--dur-fast)] hover:text-fg"
      >
        <ArrowLeftIcon size={16} aria-hidden />
        All posts
      </Link>

      <header className="mt-[var(--sp-8)] max-w-[var(--maxw-prose)]">
        <div className="flex items-center gap-[var(--sp-3)]">
          <Chip tone={post.category === 'achievement' ? 'amber' : 'neutral'}>
            {CATEGORY_LABEL[post.category]}
          </Chip>
          <time
            dateTime={post.publishAt}
            className="text-[var(--fs-base)] text-fg-3"
          >
            {formatDate(post.publishAt)}
          </time>
        </div>

        <h1 className="mt-[var(--sp-4)] text-[clamp(2rem,4.5vw,var(--fs-h1))] font-semibold leading-[1.08] tracking-[-0.03em] text-fg">
          {post.title}
        </h1>

        {/* Only when it was written, never the computed fallback: repeating the
            opening of the body as a standfirst directly above that same body
            reads as a duplication bug. `summary` still backs the card and the
            meta description, where there is nothing to repeat it against. */}
        {post.excerpt && (
          <p className="mt-[var(--sp-6)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-fg-2">
            {post.excerpt}
          </p>
        )}

        <p className="mt-[var(--sp-6)] border-t border-[var(--border-light)] pt-[var(--sp-4)] text-[var(--fs-body)] text-fg-3">
          Posted by{' '}
          <span className="text-fg">{post.authorName}</span>
        </p>
      </header>

      <PostBody
        body={post.body}
        className="mt-[var(--sp-12)] flex max-w-[var(--maxw-prose)] flex-col gap-[var(--sp-6)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-fg-2"
      />

      {/* Wider than the prose column: a certificate or a results board is worth
          seeing at size, and a photo cropped to a reading measure is a photo
          nobody looks at. */}
      <MediaGallery
        media={post.media}
        className="mt-[var(--sp-16)] grid gap-[var(--sp-8)] sm:grid-cols-2"
      />

      {post.tags.length > 0 && (
        <ul className="mt-[var(--sp-16)] flex flex-wrap gap-[var(--sp-2)] border-t border-[var(--border-light)] pt-[var(--sp-8)]">
          {post.tags.map((tag) => (
            <li key={tag}>
              {/* Not links. There is no tag archive route, and a chip that
                  looks clickable and is not is worse than one that plainly
                  is not. */}
              <Chip tone="neutral">{tag}</Chip>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-[var(--sp-16)] rounded-[var(--r-lg)] border border-[var(--accent-line)] bg-[var(--accent-wash)] p-[var(--sp-8)]">
        <h2 className="text-[var(--fs-h3)] font-semibold tracking-[-0.01em] text-fg">
          Want results like these?
        </h2>
        <p className="mt-[var(--sp-3)] max-w-[var(--maxw-prose)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
          The IGCSE and IELTS courses run in small groups with marked work
          returned inside a week.
        </p>
        <ButtonLink
          href="/courses"
          variant="primary"
          size="lg"
          className="mt-[var(--sp-6)]"
        >
          Browse courses
        </ButtonLink>
      </div>
    </article>
  );
}
