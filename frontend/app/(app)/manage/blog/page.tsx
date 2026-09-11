'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { BlogCategory, StaffBlogPost } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Panel,
  RowsSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

/**
 * The blog console (CLAUDE.md §5.19).
 *
 * **Reachable by an assistant as well as the teacher**, which is a change to
 * §2.2's preset made on the client's own instruction on 2026-09-10: *"a blog
 * page where the teacher, or ta can upload data (images, videos..etc) with
 * description."* The preset had said a TA cannot touch the CMS; the client
 * named both actors and per §0 the user wins.
 *
 * Where the two differ is *editing*: the API lets an assistant change only
 * posts they wrote themselves, and this screen marks the rows they cannot
 * touch rather than hiding them. Hiding would be worse - a TA seeing eleven
 * posts on the public site and four in their console would reasonably think
 * the console was broken. The refusal is enforced server-side either way (§8);
 * the greyed row is courtesy.
 *
 * Creation is deliberately minimal here - a title, the description and a
 * status. The gallery is the editor's job, because uploading five certificates
 * is not something to do inside a create form that might fail validation and
 * lose them.
 */
export default function ManageBlogPage() {
  const { data, error, loading, reload } = useApi((t) => api.staff.blog(t), []);

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="Achievements, results and articles. Students and visitors read the published ones."
      />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        <CreatePost onCreated={reload} />

        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && data.length === 0 && (
          <Panel bodyClassName="">
            <EmptyState
              title="No posts yet"
              body="Write one above. It starts as a draft, so nothing is public until you publish it."
            />
          </Panel>
        )}

        {data && data.length > 0 && (
          <Panel title={`${data.length} ${data.length === 1 ? 'post' : 'posts'}`} bodyClassName="">
            <ul>
              {data.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </ul>
          </Panel>
        )}
      </PageBody>
    </>
  );
}

/**
 * The status chip, and the one piece of UI that earns its keep.
 *
 * `status` and `isLive` are two different facts and the console has to show
 * both, because nothing rewrites a row when its scheduled time passes: a post
 * can say `scheduled` and be live, which is accurate history and completely
 * confusing without a label that names the *current* state. So a scheduled post
 * reads "Scheduled" before its time and "Live" after it.
 */
function StatusChip({ post }: { post: StaffBlogPost }) {
  if (post.status === 'draft') return <Chip tone="neutral">Draft</Chip>;
  if (post.isLive) return <Chip tone="green">Live</Chip>;
  return <Chip tone="amber">Scheduled</Chip>;
}

function PostRow({ post }: { post: StaffBlogPost }) {
  const { user } = useSession();
  // Mirrors `BlogService.assertMayMutate`. The server is what enforces it -
  // this only decides whether to offer the link.
  const mayEdit = user?.role === 'teacher' || post.authorId === user?.id;

  const meta = (
    <>
      <span>{post.authorName}</span>
      <span aria-hidden>·</span>
      <span>
        {post.isLive ? 'Published ' : 'Goes live '}
        {post.status === 'draft' ? '—' : formatDateTime(post.publishAt)}
      </span>
      {post.media.length > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            {post.media.length}{' '}
            {post.media.length === 1 ? 'attachment' : 'attachments'}
          </span>
        </>
      )}
    </>
  );

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--sp-2)]">
          <StatusChip post={post} />
          <Chip tone={post.category === 'achievement' ? 'amber' : 'neutral'}>
            {post.category}
          </Chip>
        </div>
        <p className="mt-[var(--sp-2)] truncate text-[var(--fs-body)] font-medium text-[var(--fg-primary)]">
          {post.title}
        </p>
        <p className="mt-[var(--sp-1)] flex flex-wrap items-center gap-[var(--sp-2)] text-[var(--fs-xxs)] text-[var(--fg-tertiary)]">
          {meta}
        </p>
      </div>

      {/* The public address, offered only once there is one to visit. A link
          to a draft's slug would 404, which looks like a broken console
          rather than the correct answer. */}
      {post.isLive && (
        <span className="shrink-0 text-[var(--fs-xxs)] text-[var(--fg-tertiary)]">
          /blog/{post.slug}
        </span>
      )}
    </>
  );

  return (
    <li className="border-b border-[var(--border-light)] last:border-b-0">
      {mayEdit ? (
        <Link
          href={`/manage/blog/${post.id}`}
          className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)]"
        >
          {inner}
        </Link>
      ) : (
        <div
          className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)]"
          // Said out loud rather than left as a missing link, so a TA knows why
          // this row does not open.
          title="Only Dr. Tahir can edit a post written by someone else"
        >
          {inner}
        </div>
      )}
    </li>
  );
}

const CATEGORIES: { value: BlogCategory; label: string }[] = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'article', label: 'Article' },
  { value: 'resource', label: 'Resource' },
];

function CreatePost({ onCreated }: { onCreated: () => void }) {
  const { token } = useSession();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<BlogCategory>('achievement');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !title.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const post = await api.staff.createBlogPost(token, {
        title: title.trim(),
        body: body.trim(),
        category,
        // Always a draft from here. Publishing is a deliberate act taken in the
        // editor, once the pictures are attached and it has been read back -
        // and the server defaults to draft anyway, so this is the form agreeing
        // with it rather than relying on it.
        status: 'draft',
      });
      setTitle('');
      setBody('');
      setCreated(post.id);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that post.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New post">
      <form onSubmit={submit} className="flex flex-col gap-[var(--sp-4)]">
        <div className="flex flex-wrap gap-[var(--sp-4)]">
          <div className="min-w-[280px] flex-1">
            <Field
              label="Title"
              htmlFor="post-title"
              hint="This becomes the public address, and it does not change if you edit the title later."
            >
              <Input
                id="post-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="June 2026: 34 A* grades across the Chemistry cohorts"
                maxLength={200}
                required
              />
            </Field>
          </div>
          <div className="w-[180px]">
            <Field label="Category" htmlFor="post-category">
              <Select
                id="post-category"
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
        </div>

        <Field
          label="Description"
          htmlFor="post-body"
          hint="Plain text. Leave a blank line between paragraphs."
        >
          <Textarea
            id="post-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={20000}
            placeholder="What happened, and what made the difference."
            required
          />
        </Field>

        <div className="flex items-center gap-[var(--sp-3)]">
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!title.trim() || !body.trim()}
          >
            Save as draft
          </Button>
          {created && (
            <Link
              href={`/manage/blog/${created}`}
              className="text-[var(--fs-base)] text-[var(--fg-primary)] underline underline-offset-4"
            >
              Add pictures and publish it
            </Link>
          )}
        </div>
      </form>
      {error && <FormError>{error}</FormError>}
    </Panel>
  );
}
