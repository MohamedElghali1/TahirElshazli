'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { BlogCategory, StaffBlogPost } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Table,
  Tag,
  TextArea,
  TextInput,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

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
  const { user } = useSession();
  const { data, error, loading, reload } = useApi((t) => api.staff.blog(t), []);

  // Mirrors `BlogService.assertMayMutate`. The server is what enforces it -
  // this only decides whether the title renders as a link to the editor.
  const mayEdit = (post: StaffBlogPost) => user?.role === 'teacher' || post.authorId === user?.id;

  const columns: Column<StaffBlogPost>[] = [
    {
      label: 'Post',
      render: (post) =>
        mayEdit(post) ? (
          <Link href={`/manage/blog/${post.id}`} className="text-fg hover:underline">
            {post.title}
          </Link>
        ) : (
          <span className="text-fg-2" title="Only Dr. Tahir can edit a post written by someone else">
            {post.title}
          </span>
        ),
    },
    { label: 'Status', render: (post) => <StatusTag post={post} /> },
    {
      label: 'Category',
      render: (post) => <Tag tone={post.category === 'achievement' ? 'amber' : 'gray'}>{post.category}</Tag>,
    },
    { label: 'Author', render: (post) => <span className="block max-w-[20ch] truncate">{post.authorName}</span> },
    { label: 'Media', align: 'end', render: (post) => <span className="num">{post.media.length}</span> },
    {
      label: 'Publishes',
      align: 'end',
      render: (post) => (
        <span className="whitespace-nowrap text-fg-3">
          {post.status === 'draft' ? '—' : formatDateTime(post.publishAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageTitle title="Blog" />
      <div className="flex flex-col gap-4 p-6">
        <CreatePost onCreated={reload} />

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading posts" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}

        {data && data.length === 0 && (
          <EmptyState
            icon="Notes"
            title="No posts yet"
            description="Write one above. It starts as a draft, so nothing is public until you publish it."
          />
        )}

        {data && data.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-fg-2">
                All posts · <span className="num">{data.length}</span>
              </span>
              <span className="text-base text-fg-3">Students and visitors read the published ones</span>
            </div>

            <Table columns={columns} rows={data} rowKey={(post) => post.id} />
          </>
        )}
      </div>
    </>
  );
}

/**
 * `status` and `isLive` are two different facts and the console has to show
 * both, because nothing rewrites a row when its scheduled time passes: a post
 * can say `scheduled` and be live, which is accurate history and completely
 * confusing without a label that names the *current* state. So a scheduled post
 * reads "Scheduled" before its time and "Live" after it.
 */
function StatusTag({ post }: { post: StaffBlogPost }) {
  if (post.status === 'draft') return <Tag tone="gray">Draft</Tag>;
  if (post.isLive) return <Tag tone="green">Live</Tag>;
  return <Tag tone="amber">Scheduled</Tag>;
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
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <TextInput
            label="Title"
            id="post-title"
            className="min-w-[280px] flex-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="June 2026: 34 A* grades across the Chemistry cohorts"
            hint="This becomes the public address, and it does not change if you edit the title later."
            maxLength={200}
            required
          />
          <Select
            label="Category"
            id="post-category"
            className="w-[180px]"
            value={category}
            onChange={(e) => setCategory(e.target.value as BlogCategory)}
            options={CATEGORIES}
          />
        </div>

        <TextArea
          label="Description"
          id="post-body"
          hint="Plain text. Leave a blank line between paragraphs."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={20000}
          placeholder="What happened, and what made the difference."
          required
        />

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || !title.trim() || !body.trim()}>
            {busy ? <Loader size={3} label="Saving" /> : 'Save as draft'}
          </Button>
          {created && (
            <Link href={`/manage/blog/${created}`} className="text-base text-fg underline underline-offset-4">
              Add pictures and publish it
            </Link>
          )}
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      </form>
    </Panel>
  );
}
