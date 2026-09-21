'use client';

import { use, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Tag,
  TextArea,
  TextInput,
} from '@/components/ui';
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

const STATUS_OPTIONS: { value: BlogPostStatus; label: string }[] = [
  { value: 'draft', label: 'Draft — nobody sees it' },
  { value: 'published', label: 'Published — live now' },
  { value: 'scheduled', label: 'Scheduled — live at a time' },
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
export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi((t) => api.staff.blogPost(t, id), [id]);

  return (
    <>
      <PageTitle title={data?.title ?? 'Post'} backHref="/manage/blog" />
      <div className="flex flex-col gap-5 p-6">
        {data && (
          <div className="flex items-center gap-2 text-xs text-fg-3">
            <span>Posted by {data.authorName}</span>
            <StatusTag post={data} />
          </div>
        )}
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading the post" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'That post no longer exists.'
                : error.isAuth
                  ? 'Only Dr. Tahir can edit a post written by someone else.'
                  : error.message
            }
            action={
              error.isNotFound || error.isAuth ? undefined : <Button onClick={reload}>Try again</Button>
            }
          />
        )}

        {data && (
          <>
            <PostForm post={data} onSaved={reload} />
            <GalleryForm post={data} onSaved={reload} />
            <DangerZone post={data} />
          </>
        )}
      </div>
    </>
  );
}

/**
 * `status` and `isLive` are different facts, and both matter here.
 *
 * Nothing rewrites a row when its scheduled moment passes, so a post can say
 * `scheduled` and be live. The tag names the state a reader would actually
 * observe.
 */
function StatusTag({ post }: { post: StaffBlogPost }) {
  if (post.status === 'draft') return <Tag tone="gray">Draft</Tag>;
  if (post.isLive) return <Tag tone="green">Live</Tag>;
  return <Tag tone="amber">Scheduled</Tag>;
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

function PostForm({ post, onSaved }: { post: StaffBlogPost; onSaved: () => void }) {
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
        ...(status === 'scheduled' ? { publishAt: new Date(publishAt).toISOString() } : {}),
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
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextInput
          label="Title"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          hint={`The public address stays /blog/${post.slug} whatever you retitle it to — every link already shared keeps working.`}
          maxLength={200}
          required
        />

        <TextInput
          label="Standfirst"
          id="excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          hint="Optional. Left empty, the cards and the search description use the opening of the description instead."
          maxLength={400}
        />

        <TextArea
          label="Description"
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          maxLength={20000}
          required
        />

        <div className="flex flex-wrap gap-4">
          <Select
            label="Category"
            id="category"
            className="w-[180px]"
            value={category}
            onChange={(e) => setCategory(e.target.value as BlogCategory)}
            options={CATEGORIES}
          />
          <TextInput
            label="Tags"
            id="tags"
            className="min-w-[240px] flex-1"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            hint="Comma separated. Up to twelve."
            placeholder="IGCSE, Chemistry, Results"
          />
        </div>

        <div className="flex flex-wrap items-start gap-4 border-t border-border-light pt-4">
          <Select
            label="Visibility"
            id="status"
            className="w-[180px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
            options={STATUS_OPTIONS}
          />

          {status === 'scheduled' && (
            <TextInput
              label="Goes live"
              id="publishAt"
              type="datetime-local"
              className="w-[240px]"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              hint="Your local time. It appears on its own — nothing has to be running."
              required
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader size={3} label="Saving" /> : 'Save'}
          </Button>
          {saved && (
            <span role="status" className="text-base text-fg-3">
              Saved.
            </span>
          )}
          {post.isLive && (
            <a
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base text-fg underline underline-offset-4"
            >
              View it live
            </a>
          )}
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      </form>
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
function GalleryForm({ post, onSaved }: { post: StaffBlogPost; onSaved: () => void }) {
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
      setError(err instanceof ApiError ? err.message : 'Could not save the gallery.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Pictures, video and files"
      action={
        dirty ? (
          <Button size="small" variant="primary" disabled={busy} onClick={save}>
            {busy ? <Loader size={3} label="Saving" /> : 'Save gallery'}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {items.length === 0 && (
          <p className="text-base text-fg-3">
            Nothing attached yet. A post with only words is fine — add a certificate, a photo of the
            results board or a clip below.
          </p>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li
                // `url` is unique within a gallery in practice and stable across
                // a reorder, which an index key would not be - a reorder with
                // index keys re-binds every caption input to the wrong row.
                key={`${item.url}-${i}`}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-border-light bg-surface p-3"
              >
                <Tag tone="gray">{item.kind}</Tag>

                <span className="min-w-[160px] flex-1 truncate font-mono text-xxs text-fg-3">
                  {item.url}
                </span>

                <TextInput
                  aria-label={`Caption for attachment ${i + 1}`}
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
                  <span className="num font-mono text-xxs text-fg-3">{formatFileSize(item.sizeBytes)}</span>
                )}

                <div className="flex items-center gap-1">
                  <Button
                    size="small"
                    variant="tertiary"
                    aria-label={`Move attachment ${i + 1} up`}
                    icon="ArrowUp"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <Button
                    size="small"
                    variant="tertiary"
                    aria-label={`Move attachment ${i + 1} down`}
                    icon="ArrowDown"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <Button
                    size="small"
                    variant="tertiary"
                    accent="danger"
                    aria-label={`Remove attachment ${i + 1}`}
                    icon="Trash"
                    onClick={() => change(items.filter((_, j) => j !== i))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border-light pt-4">
          {config.data?.enabled ? (
            <UploadField config={config.data} onUploaded={(item) => change([...items, item])} />
          ) : (
            <UrlField onAdded={(item) => change([...items, item])} />
          )}
        </div>

        {dirty && <p className="text-xs text-fg-3">Unsaved changes to the gallery.</p>}
      </div>
      {error && <InlineBanner tone="danger" className="mt-4">{error}</InlineBanner>}
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
    <div className="flex flex-col gap-2">
      <label htmlFor="upload" className="text-xs font-medium text-fg-2">
        Add a picture, a video or a file
      </label>
      <div className="flex items-center gap-3">
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
          className="text-base text-fg-2 file:me-3 file:rounded-md file:border file:border-border-medium file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:text-fg"
        />
        {busy && (
          <span role="status" className="inline-flex items-center gap-2 text-base text-fg-3">
            <Loader size={3} label="Uploading" />
            Uploading…
          </span>
        )}
      </div>
      <p className="text-xs text-fg-3">
        Up to {formatFileSize(config.maxBytes)}. Uploading adds it to the list; it is only attached once
        you save the gallery.
      </p>
      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
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
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label="Kind"
        id="media-kind"
        className="w-[140px]"
        value={kind}
        onChange={(e) => setKind(e.target.value as BlogMediaKind)}
        options={KINDS}
      />
      <TextInput
        label="Link"
        id="media-url"
        className="min-w-[280px] flex-1"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        hint="An https:// address on a public host. File uploads are not configured on this server."
        placeholder="https://cdn.example.com/results-board.jpg"
        maxLength={2048}
      />
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
        <div className="flex flex-col gap-3">
          <p className="text-base text-fg-2">
            This removes the post and its gallery for good.
            {post.isLive && ' It is live right now, so the public link will stop working.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="primary" accent="danger" disabled={busy} onClick={remove}>
              {busy ? <Loader size={3} label="Deleting" /> : 'Delete permanently'}
            </Button>
            <Button variant="tertiary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-fg-3">Last edited {formatDateTime(post.updatedAt)}.</p>
          <Button variant="tertiary" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      )}
      {error && <InlineBanner tone="danger" className="mt-3">{error}</InlineBanner>}
    </Panel>
  );
}
