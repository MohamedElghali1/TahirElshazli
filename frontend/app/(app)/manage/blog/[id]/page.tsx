'use client';

import { use, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileArrowUpIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDateTime, formatFileSize } from '@/lib/format';
import type {
  BlogCategory,
  BlogMediaInput,
  BlogMediaKind,
  BlogPostStatus,
  StaffBlogPost,
} from '@/lib/types';
import {
  Button,
  Chip,
  ErrorState,
  Field,
  FormError,
  Input,
  Panel,
  RowsSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';

const CATEGORIES: { value: BlogCategory; label: string }[] = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'article', label: 'Article' },
  { value: 'resource', label: 'Resource' },
];

const KINDS: { value: BlogMediaKind; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'file', label: 'File' },
];

/**
 * Editing one post: the words, the gallery, and when it goes live
 * (CLAUDE.md §5.19).
 *
 * Split into two independently-saved panels, which is the whole reason the
 * gallery is not part of the post's PATCH. Uploading five certificates and
 * then losing them to a validation error on the title is the failure this
 * shape rules out - and the API agrees: `PATCH /staff/blog/:id` takes no
 * `media` key at all, because an omitted one would have to mean either "leave
 * it alone" or "delete it all" and the wrong reading eventually deletes
 * somebody's gallery.
 *
 * An assistant may edit only their own posts. The API enforces that with a
 * 403; this screen never reaches here for a post they cannot touch, because
 * `/manage/blog` does not link it.
 */
export default function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (t) => api.staff.blogPost(t, id),
    [id],
  );

  return (
    <>
      <PageTitle title={data?.title ?? 'Post'} backHref="/manage/blog" />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        {data && (
          <div className="flex items-center gap-[var(--sp-2)] text-[var(--fs-xs)] text-fg-3">
            <span>Posted by {data.authorName}</span>
            <StatusChip post={data} />
          </div>
        )}
        {loading && <RowsSkeleton rows={6} />}
        {error && (
          <ErrorState
            message={
              error.isNotFound
                ? 'That post no longer exists.'
                : error.isAuth
                  ? 'Only Dr. Tahir can edit a post written by someone else.'
                  : error.message
            }
            onRetry={error.isNotFound || error.isAuth ? undefined : reload}
          />
        )}

        {data && (
          <>
            <PostForm post={data} onSaved={reload} />
            <GalleryForm post={data} onSaved={reload} />
            <DangerZone post={data} />
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * `status` and `isLive` are different facts, and both matter here.
 *
 * Nothing rewrites a row when its scheduled moment passes, so a post can say
 * `scheduled` and be live. The chip names the state a reader would actually
 * observe.
 */
function StatusChip({ post }: { post: StaffBlogPost }) {
  if (post.status === 'draft') return <Chip tone="neutral">Draft</Chip>;
  if (post.isLive) return <Chip tone="green">Live</Chip>;
  return <Chip tone="amber">Scheduled</Chip>;
}

/**
 * Stored media to the editable form shape.
 *
 * `null` becomes `undefined` throughout: the API treats an absent key as "no
 * value", and sending an explicit `null` through a DTO whose fields are
 * `@IsOptional()` strings would be rejected rather than read as empty.
 */
function toInputs(media: StaffBlogPost['media']): BlogMediaInput[] {
  return media.map((m) => ({
    kind: m.kind,
    url: m.url,
    caption: m.caption ?? undefined,
    mimeType: m.mimeType ?? undefined,
    sizeBytes: m.sizeBytes ?? undefined,
  }));
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in *local* time, not a UTC ISO. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function PostForm({
  post,
  onSaved,
}: {
  post: StaffBlogPost;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [title, setTitle] = useState(post.title);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? '');
  const [body, setBody] = useState(post.body);
  const [category, setCategory] = useState<BlogCategory>(post.category);
  const [tags, setTags] = useState(post.tags.join(', '));
  const [status, setStatus] = useState<BlogPostStatus>(post.status);
  const [publishAt, setPublishAt] = useState(toLocalInput(post.publishAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.staff.updateBlogPost(token, post.id, {
        title: title.trim(),
        // An emptied field means "no standfirst". The server nullifies a blank
        // one rather than storing `''`, so the summary falls back to the
        // opening of the body - sending the empty string is the right way to
        // clear it.
        excerpt: excerpt.trim(),
        body: body.trim(),
        category,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status,
        // Only sent for a scheduled post. Sending it otherwise would let a
        // published post carry a future date - invisible while claiming to be
        // published, which is the confusing kind of correct.
        ...(status === 'scheduled'
          ? { publishAt: new Date(publishAt).toISOString() }
          : {}),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="The post">
      <form onSubmit={submit} className="flex flex-col gap-[var(--sp-4)]">
        <Field
          label="Title"
          htmlFor="title"
          hint={`The public address stays /blog/${post.slug} whatever you retitle it to — every link already shared keeps working.`}
        >
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </Field>

        <Field
          label="Standfirst"
          htmlFor="excerpt"
          hint="Optional. Left empty, the cards and the search description use the opening of the description instead."
        >
          <Input
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={400}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="body"
          hint="Plain text. Leave a blank line between paragraphs."
        >
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            maxLength={20000}
            required
          />
        </Field>

        <div className="flex flex-wrap gap-[var(--sp-4)]">
          <div className="w-[180px]">
            <Field label="Category" htmlFor="category">
              <Select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BlogCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-[240px] flex-1">
            <Field label="Tags" htmlFor="tags" hint="Comma separated. Up to twelve.">
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="IGCSE, Chemistry, Results"
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-[var(--sp-4)] border-t border-[var(--border-light)] pt-[var(--sp-4)]">
          <div className="w-[180px]">
            <Field label="Visibility" htmlFor="status">
              <Select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
              >
                <option value="draft">Draft — nobody sees it</option>
                <option value="published">Published — live now</option>
                <option value="scheduled">Scheduled — live at a time</option>
              </Select>
            </Field>
          </div>

          {status === 'scheduled' && (
            <div className="w-[240px]">
              <Field
                label="Goes live"
                htmlFor="publishAt"
                hint="Your local time. It appears on its own — nothing has to be running."
              >
                <Input
                  id="publishAt"
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  required
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center gap-[var(--sp-3)]">
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
          {saved && (
            <span
              role="status"
              className="text-[var(--fs-base)] text-fg-3"
            >
              Saved.
            </span>
          )}
          {post.isLive && (
            <a
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--fs-base)] text-fg underline underline-offset-4"
            >
              View it live
            </a>
          )}
        </div>
      </form>
      {error && <FormError>{error}</FormError>}
    </Panel>
  );
}

/**
 * The gallery: the *"images, videos..etc with description"* half of the ask.
 *
 * Edited as a local list and saved as a set, matching the API. Two ways in,
 * and which one is offered depends on the server: a file picker when uploads
 * are configured, a URL field otherwise. `STORAGE_DRIVER=none` is the
 * production default until Cloudflare R2 is provisioned (CLAUDE.md §3), so the
 * URL field is not a fallback for a broken feature - it is the path that always
 * works, and the picker is the convenience on top.
 */
function GalleryForm({
  post,
  onSaved,
}: {
  post: StaffBlogPost;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const config = useApi((t) => api.staff.uploadConfig(t), []);

  const [items, setItems] = useState<BlogMediaInput[]>(() => toInputs(post.media));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved post is the source of truth: saving the post form above reloads
  // `post`, and without this the panel would keep showing a list built from the
  // version before that reload. Unsaved edits win, so a reload triggered by the
  // other panel cannot discard a gallery someone is still arranging.
  //
  // Adjusted during render rather than in an effect, matching
  // `components/site/site-header.tsx`: an effect would paint one frame with the
  // stale list, and React's own guidance for deriving state from a changed prop
  // is this shape.
  const [syncedTo, setSyncedTo] = useState(post.media);
  if (!dirty && syncedTo !== post.media) {
    setSyncedTo(post.media);
    setItems(toInputs(post.media));
  }

  const change = (next: BlogMediaInput[]) => {
    setItems(next);
    setDirty(true);
  };

  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(to, 0, moved);
    change(next);
  };

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      // Order is the array's own - the server assigns `position` from it, so
      // the list as it reads on screen is the list as it will render.
      await api.staff.setBlogMedia(token, post.id, items);
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save the gallery.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Pictures, video and files"
      action={
        dirty ? (
          <Button size="sm" variant="primary" loading={busy} onClick={save}>
            Save gallery
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-[var(--sp-4)]">
        {items.length === 0 && (
          <p className="text-[var(--fs-base)] text-fg-3">
            Nothing attached yet. A post with only words is fine — add a
            certificate, a photo of the results board or a clip below.
          </p>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-[var(--sp-2)]">
            {items.map((item, i) => (
              <li
                // `url` is unique within a gallery in practice and stable across
                // a reorder, which an index key would not be - a reorder with
                // index keys re-binds every caption input to the wrong row.
                key={`${item.url}-${i}`}
                className="flex flex-wrap items-center gap-[var(--sp-3)] rounded-[var(--r-sm)] border border-[var(--border-light)] bg-[var(--bg-primary)] p-[var(--sp-3)]"
              >
                <Chip tone="neutral">{item.kind}</Chip>

                <span className="min-w-[160px] flex-1 truncate font-[family-name:var(--font-mono)] text-[var(--fs-xxs)] text-fg-3">
                  {item.url}
                </span>

                <label className="sr-only" htmlFor={`caption-${i}`}>
                  Caption for attachment {i + 1}
                </label>
                <Input
                  id={`caption-${i}`}
                  className="w-[240px]"
                  placeholder="Describe this one"
                  value={item.caption ?? ''}
                  maxLength={500}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...item, caption: e.target.value };
                    change(next);
                  }}
                />

                {item.sizeBytes !== undefined && (
                  <span className="font-[family-name:var(--font-mono)] text-[var(--fs-xxs)] tabular-nums text-fg-3">
                    {formatFileSize(item.sizeBytes)}
                  </span>
                )}

                <div className="flex items-center gap-[var(--sp-1)]">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move attachment ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpIcon size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move attachment ${i + 1} down`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownIcon size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove attachment ${i + 1}`}
                    onClick={() => change(items.filter((_, j) => j !== i))}
                  >
                    <TrashIcon size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-[var(--border-light)] pt-[var(--sp-4)]">
          {config.data?.enabled ? (
            <UploadField
              config={config.data}
              onUploaded={(item) => change([...items, item])}
            />
          ) : (
            <UrlField onAdded={(item) => change([...items, item])} />
          )}
        </div>

        {dirty && (
          <p className="text-[var(--fs-xs)] text-fg-3">
            Unsaved changes to the gallery.
          </p>
        )}
      </div>
      {error && <FormError>{error}</FormError>}
    </Panel>
  );
}

function UploadField({
  config,
  onUploaded,
}: {
  config: { maxBytes: number; allowedMimeTypes: string[] };
  onUploaded: (item: BlogMediaInput) => void;
}) {
  const { token } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.staff.upload(token, file);
      // `kind` comes back from the server, decided from the MIME type it
      // validated - not guessed here from the extension.
      onUploaded({
        kind: result.kind,
        url: result.url,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That upload failed.');
    } finally {
      setBusy(false);
      // Cleared so picking the same file twice fires a change event again.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-[var(--sp-2)]">
      <label
        htmlFor="upload"
        className="text-[var(--fs-xs)] font-medium text-fg-2"
      >
        Add a picture, a video or a file
      </label>
      <div className="flex items-center gap-[var(--sp-3)]">
        <input
          ref={input}
          id="upload"
          type="file"
          // A convenience only. The server validates the type against its own
          // whitelist regardless, because `accept` is a file-dialog filter and
          // not a control (CLAUDE.md §8).
          accept={config.allowedMimeTypes.join(',')}
          onChange={pick}
          disabled={busy}
          className="text-[var(--fs-base)] text-fg-2 file:me-[var(--sp-3)] file:rounded-[var(--r-md)] file:border file:border-[var(--border-medium)] file:bg-[var(--bg-tertiary)] file:px-[var(--sp-3)] file:py-[var(--sp-2)] file:text-[var(--fs-xs)] file:text-fg"
        />
        {busy && (
          <span
            role="status"
            className="inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] text-fg-3"
          >
            <FileArrowUpIcon size={14} />
            Uploading…
          </span>
        )}
      </div>
      <p className="text-[var(--fs-xs)] text-fg-3">
        Up to {formatFileSize(config.maxBytes)}. Uploading adds it to the list;
        it is only attached once you save the gallery.
      </p>
      {error && <FormError>{error}</FormError>}
    </div>
  );
}

/**
 * The always-available path: paste a URL.
 *
 * Shown when the server accepts no uploads, which is the production default
 * until R2 exists. It is not a degraded mode - media hosted on a CDN or Bunny
 * Stream is the intended long-term shape, and the server accepts both.
 */
function UrlField({ onAdded }: { onAdded: (item: BlogMediaInput) => void }) {
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<BlogMediaKind>('image');

  const add = () => {
    if (!url.trim()) return;
    onAdded({ kind, url: url.trim() });
    setUrl('');
  };

  return (
    <div className="flex flex-wrap items-end gap-[var(--sp-3)]">
      <div className="w-[140px]">
        <Field label="Kind" htmlFor="media-kind">
          <Select
            id="media-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as BlogMediaKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="min-w-[280px] flex-1">
        <Field
          label="Link"
          htmlFor="media-url"
          hint="An https:// address on a public host. File uploads are not configured on this server."
        >
          <Input
            id="media-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://cdn.example.com/results-board.jpg"
            maxLength={2048}
          />
        </Field>
      </div>
      <Button onClick={add} disabled={!url.trim()}>
        Add
      </Button>
    </div>
  );
}

/**
 * Deleting.
 *
 * Unlike an assessment - which refuses deletion once anything has been
 * submitted, because a submission is a student's work - a blog post has no
 * dependent student data, so a hard delete loses only what the author chose to
 * lose and the audit entry keeps the record that it existed.
 *
 * Two-step, because it is irreversible and the button sits under a form
 * somebody is already clicking Save in.
 */
function DangerZone({ post }: { post: StaffBlogPost }) {
  const { token } = useSession();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.deleteBlogPost(token, post.id);
      router.push('/manage/blog');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.');
      setBusy(false);
    }
  };

  return (
    <Panel title="Delete this post">
      {confirming ? (
        <div className="flex flex-col gap-[var(--sp-3)]">
          <p className="text-[var(--fs-base)] text-fg-2">
            This removes the post and its gallery for good.
            {post.isLive && ' It is live right now, so the public link will stop working.'}
          </p>
          <div className="flex items-center gap-[var(--sp-2)]">
            <Button variant="danger" loading={busy} onClick={remove}>
              Delete permanently
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-[var(--sp-3)]">
          <p className="text-[var(--fs-base)] text-fg-3">
            Last edited {formatDateTime(post.updatedAt)}.
          </p>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      )}
      {error && <FormError>{error}</FormError>}
    </Panel>
  );
}
