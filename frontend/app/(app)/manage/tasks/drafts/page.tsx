'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AssessmentType, AttachmentInput, TaskDraft } from '@/lib/types';
import {
  Button,
  ButtonLink,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Table,
  TableToolbar,
  Tag,
  TextArea,
  TextInput,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { AttachmentsEditor } from '../task-form';

const TYPE_OPTIONS = [
  { value: 'homework', label: 'Homework' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
];

/**
 * `/manage/tasks/drafts` (`TASK-7`): the draft library.
 *
 * Scoped by the server to courses the caller reaches through a held group. Any
 * staff member in scope may edit or delete any draft (no own-only rule,
 * `AUTHORIZATION_MODEL.md` §3). "Used" is a plain count - how many tasks were
 * authored from the draft - not a meter and not a score.
 */
export default function DraftLibraryPage() {
  const [courseId, setCourseId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token } = useSession();

  const { data: courses } = useApi((t) => api.staff.courses(t), []);
  const { data, error: loadError, loading, reload } = useApi(
    (t) => api.staff.taskDrafts(t, { courseId: courseId || undefined }),
    [courseId],
  );
  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));

  async function remove(draft: TaskDraft) {
    if (!token) return;
    setError(null);
    try {
      await api.staff.deleteTaskDraft(token, draft.id);
      setConfirmingId(null);
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete that draft.');
    }
  }

  const columns: Column<TaskDraft>[] = [
    { label: 'Title', render: (d) => d.title },
    { label: 'Type', render: (d) => <Tag tone="gray">{d.type}</Tag> },
    { label: 'Course', render: (d) => <span className="text-fg-2">{courseTitle.get(d.courseId) ?? '—'}</span> },
    { label: 'Used', render: (d) => <span className="text-fg-2">{d.usedCount === 1 ? 'Once' : `${d.usedCount} times`}</span> },
    { label: 'Edited', render: (d) => <span className="text-fg-2">{formatDate(d.updatedAt)}</span> },
    {
      label: '',
      align: 'end',
      render: (d) =>
        confirmingId === d.id ? (
          <span className="inline-flex items-center gap-2">
            <Button size="small" variant="primary" accent="danger" onClick={() => remove(d)}>
              Delete permanently
            </Button>
            <Button size="small" variant="tertiary" onClick={() => setConfirmingId(null)}>
              Keep it
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <ButtonLink size="small" variant="primary" href={`/manage/tasks/new?course=${d.courseId}&draft=${d.id}`}>
              Use
            </ButtonLink>
            <Button size="small" onClick={() => setEditingId(d.id)}>
              Edit
            </Button>
            <Button size="small" variant="tertiary" onClick={() => setConfirmingId(d.id)}>
              Delete
            </Button>
          </span>
        ),
    },
  ];

  const editing = data?.find((d) => d.id === editingId) ?? null;

  return (
    <>
      <PageTitle title="Draft tasks" backHref="/manage/tasks" />
      <div className="flex flex-col gap-4 p-6">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        {editing && (
          <DraftEditor
            key={editing.id}
            draft={editing}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              reload();
            }}
          />
        )}
        <Panel padded={false}>
          <TableToolbar
            filters={
              <Select
                aria-label="Course"
                className="w-[220px]"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                options={[{ value: '', label: 'All courses' }, ...(courses ?? []).map((c) => ({ value: c.id, label: c.title }))]}
              />
            }
            actions={
              <ButtonLink size="small" href="/manage/tasks/new" icon="Plus">
                Write a task
              </ButtonLink>
            }
          />
          {loading && !data && (
            <div className="flex justify-center p-8">
              <Loader label="Loading drafts" />
            </div>
          )}
          {loadError && (
            <EmptyState icon="AlertTriangle" title={loadError.message} action={<Button onClick={reload}>Try again</Button>} />
          )}
          {data && (
            <Table
              columns={columns}
              rows={data}
              rowKey={(d) => d.id}
              empty={
                <EmptyState
                  icon="FileText"
                  title="No drafts yet"
                  description="Use Save as draft on the task form to keep a task for reuse."
                />
              }
            />
          )}
        </Panel>
      </div>
    </>
  );
}

/**
 * Edits a draft's content. The course is fixed once created (A-1). Editing a
 * draft never changes a task already authored from it - those were copied.
 * Drawn as a flat form above the table, not a Panel inside the table's Panel.
 */
function DraftEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: TaskDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const { data: uploadConfig } = useApi((t) => api.staff.uploadConfig(t), []);
  const [title, setTitle] = useState(draft.title);
  const [type, setType] = useState<AssessmentType>(draft.type);
  const [description, setDescription] = useState(draft.description);
  const [instructions, setInstructions] = useState(draft.instructions);
  const [attachments, setAttachments] = useState<AttachmentInput[]>(draft.attachments.map((a) => ({ ...a })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.updateTaskDraft(token, draft.id, {
        title: title.trim(),
        type,
        description,
        instructions,
        attachments: attachments
          .filter((a) => a.url.trim() && a.name.trim())
          .map((a) => ({ ...a, url: a.url.trim(), name: a.name.trim() })),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save this draft.');
      setBusy(false);
    }
  }

  return (
    <Panel title="Edit draft" action={<Button size="small" variant="tertiary" onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-4">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        <div className="flex flex-wrap items-end gap-3">
          <TextInput label="Title" className="min-w-[280px] flex-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <Select label="Type" className="w-[180px]" value={type} onChange={(e) => setType(e.target.value as AssessmentType)} options={TYPE_OPTIONS} />
        </div>
        <TextArea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        <TextArea label="Instructions" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} />
        <AttachmentsEditor
          attachments={attachments}
          onChange={setAttachments}
          uploadsEnabled={uploadConfig?.enabled ?? false}
          acceptTypes={uploadConfig?.allowedMimeTypes ?? []}
        />
        <Button variant="primary" className="self-start" disabled={busy || !title.trim()} onClick={save}>
          {busy ? <Loader size={3} label="Saving" /> : 'Save draft'}
        </Button>
      </div>
    </Panel>
  );
}
