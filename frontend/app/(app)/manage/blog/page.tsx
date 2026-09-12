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
import { NewspaperIcon } from '@phosphor-icons/react';
import { PageBody } from '@/components/app/page-parts';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';
import { PageTitle } from '@/components/app/page-chrome';

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
      <PageTitle icon={NewspaperIcon} title="Blog" />
      <PageBody dense className="flex flex-col gap-[var(--sp-2)]">
        <CreatePost onCreated={reload} />

        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && data.length === 0 && (
          <EmptyState
            title="No posts yet"
            body="Write one above. It starts as a draft, so nothing is public until you publish it."
          />
        )}

        {data && data.length > 0 && (
          <>
            <div className="flex h-[var(--topbar-h)] items-center justify-between px-[var(--sp-2)]">
              <span className="inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)] bg-[var(--bg-primary)] py-[var(--sp-1)] ps-[var(--sp-1)] pe-[var(--sp-2)] text-[var(--fs-base)] font-medium text-fg-2">
                All posts
                {' · '}
                <span className="num">{data.length}</span>
              </span>
              <span className="text-[var(--fs-base)] text-fg-3">
                Students and visitors read the published ones
              </span>
            </div>

            <TableScroll minWidth={760}>
              <thead>
                <tr className="border-b border-[var(--border-medium)]">
                  <Th>Post</Th>
                  <Th>Status</Th>
                  <Th>Category</Th>
                  <Th>Author</Th>
                  <Th align="end">Media</Th>
                  <Th align="end">Publishes</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </tbody>
            </TableScroll>
          </>
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

  // The record chip: the first column's title, carrying the link where there
  // is one. A row a TA may not edit renders the same chip without the anchor
  // and says why on hover, rather than vanishing - a TA seeing eleven posts on
  // the public site and four here would reasonably think the console broke.
  const chipClass =
    'inline-flex h-[var(--h-tag)] max-w-full items-center gap-[var(--sp-1)] ' +
    'rounded-[var(--r-sm)] bg-[var(--bg-wash-nav)] px-[var(--sp-1)] ' +
    'text-[var(--fs-base)] font-medium text-fg';

  return (
    <Tr>
      <Td>
        {mayEdit ? (
          <Link
            href={`/manage/blog/${post.id}`}
            className={`${chipClass} transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)]`}
          >
            <span className="truncate">{post.title}</span>
          </Link>
        ) : (
          <span
            className={`${chipClass} text-fg-2`}
            title="Only Dr. Tahir can edit a post written by someone else"
          >
            <span className="truncate">{post.title}</span>
          </span>
        )}
      </Td>
      <Td>
        <StatusChip post={post} />
      </Td>
      <Td>
        <Chip tone={post.category === 'achievement' ? 'amber' : 'neutral'}>
          {post.category}
        </Chip>
      </Td>
      <Td>
        <span className="block max-w-[20ch] truncate">{post.authorName}</span>
      </Td>
      <Td align="end">
        <span className="num">{post.media.length}</span>
      </Td>
      <Td align="end">
        <span className="whitespace-nowrap text-fg-3">
          {post.status === 'draft' ? '--' : formatDateTime(post.publishAt)}
        </span>
      </Td>
    </Tr>
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
              className="text-[var(--fs-base)] text-fg underline underline-offset-4"
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
