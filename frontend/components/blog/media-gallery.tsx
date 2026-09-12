import { FileArrowDownIcon } from '@phosphor-icons/react/dist/ssr';
import { formatFileSize } from '@/lib/format';
import type { BlogMedia } from '@/lib/types';
import { mediaSrc } from '@/lib/api';

/**
 * A blog post's gallery: the *"images, videos..etc with description"* the
 * client asked for (CLAUDE.md §5.19).
 *
 * Shared by the marketing post page (`/blog/[slug]`) and the student console's
 * (`/achievements/[slug]`), which is the one
 * place the two-surface boundary is worth crossing. The rendering rules here are
 * not styling - they are what `kind` *means*, plus a set of security and
 * accessibility decisions that must not be made twice and differently. Spacing
 * and type come from the caller through `className`, so each surface keeps its
 * own rhythm.
 *
 * Three branches, matching the three kinds exactly. There is no fallback
 * branch, because `BlogMediaKind` is a closed union and a fourth kind should be
 * a type error here rather than an item that silently renders as nothing.
 */
export function MediaGallery({
  media,
  className,
}: {
  media: BlogMedia[];
  className?: string;
}) {
  if (media.length === 0) return null;

  return (
    <ul className={className}>
      {media.map((item) => (
        <li key={item.id}>
          <figure>
            {item.kind === 'image' && <MediaImage item={item} />}
            {item.kind === 'video' && <MediaVideo item={item} />}
            {item.kind === 'file' && <MediaFile item={item} />}

            {item.caption && (
              /* The per-item description. Rendered as a real <figcaption> and
                 not as alt text, because a caption is content everyone reads
                 while alt text is a replacement for the image - conflating
                 them means sighted readers lose the caption and screen-reader
                 users hear it twice. */
              <figcaption className="mt-[var(--sp-2)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-fg-3">
                {item.caption}
              </figcaption>
            )}
          </figure>
        </li>
      ))}
    </ul>
  );
}

/**
 * A plain `<img>`, not `next/image`, and deliberately.
 *
 * `images.remotePatterns` in next.config.ts is a build-time allowlist of hosts.
 * Media URLs here are author-supplied and may point anywhere, so `next/image`
 * would 400 the first time Dr. Tahir pasted a link from a new CDN - a gallery
 * that breaks on correct input. The cost is no automatic resizing, which is why
 * every dimension is CSS-constrained and loading is lazy.
 */
function MediaImage({ item }: { item: BlogMedia }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaSrc(item.url)}
      // An empty alt when there is no caption, which is correct rather than
      // lazy: an image with no description is decorative as far as assistive
      // technology can tell, and inventing "image" or repeating the filename
      // is noise. When there *is* a caption it is already announced by the
      // figcaption, so this stays empty either way.
      alt=""
      loading="lazy"
      decoding="async"
      className="w-full rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] object-cover"
    />
  );
}

function MediaVideo({ item }: { item: BlogMedia }) {
  return (
    <video
      src={mediaSrc(item.url)}
      controls
      // No autoplay and no loop: this is a post someone is reading, and a
      // video that starts itself is the thing every reader immediately looks
      // for a way to stop.
      preload="metadata"
      className="w-full rounded-[var(--r-md)] border border-[var(--border-light)] bg-black"
    >
      {/* Reached only by a browser with no <video> support at all. A bare
          player element with nothing in it would render as blank space. */}
      <a href={mediaSrc(item.url)}>Download the video</a>
    </video>
  );
}

function MediaFile({ item }: { item: BlogMedia }) {
  return (
    <a
      href={mediaSrc(item.url)}
      // `noopener`/`noreferrer` because the URL is author-supplied and may be
      // off-origin; a new tab keeps the reader's place in the post.
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-[var(--sp-3)] rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
    >
      <FileArrowDownIcon
        size={20}
        aria-hidden
        className="shrink-0 text-fg-3"
      />
      <span className="min-w-0 flex-1 truncate text-[var(--fs-body)] text-fg">
        {item.caption ?? 'Attached file'}
      </span>
      {item.sizeBytes !== null && (
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-[var(--fs-base)] tabular-nums text-fg-3">
          {formatFileSize(item.sizeBytes)}
        </span>
      )}
    </a>
  );
}

/**
 * A post's body, as paragraphs.
 *
 * The body is **plain text**, stored and rendered as such - split on blank
 * lines, never `dangerouslySetInnerHTML`. That is the security decision worth
 * stating: the authors are trusted staff, but a stored-XSS hole against every
 * reader of the public blog is not a risk worth taking for italics, and the
 * moment rich text is genuinely wanted it needs a sanitiser and a schema rather
 * than a raw HTML sink (CLAUDE.md §8).
 */
export function PostBody({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  return (
    <div className={className}>
      {paragraphs.map((paragraph, i) => (
        // Index keys: paragraphs have no id and the list is never reordered or
        // filtered, which is the case where an index key is correct.
        <p key={i} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
