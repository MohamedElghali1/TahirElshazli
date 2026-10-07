'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AssessmentType, TaskDraft } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { AttachmentsEditor, audiencesChosen, toAttachmentInputs, type AttachmentRow } from '../task-form';

/** New drafts are assignment or quiz; an existing homework draft keeps its label. */
const TYPE_OPTIONS = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
];

/**
 * `/manage/tasks/drafts` (`TASK-7`): the draft library. Redesign V2: the
 * artifact's "DRAFT TASKS" rows with Discard / Edit / Use.
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

  const editing = data?.find((d) => d.id === editingId) ?? null;

  return (
    <>
      <PageTitle title="Draft tasks" backHref="/manage/tasks" />
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
      <section aria-labelledby="dr-h" className="cl-panel pb-4">
        <PanelHead id="dr-h" title="Draft tasks">
          <select aria-label="Course" className="cl-inp" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Link href="/manage/tasks/new" className="cl-btnp">
            <ClIcon name="plus" small />
            Write a task
          </Link>
        </PanelHead>

        {error && (
          <p role="alert" className="m-0 mb-3 px-2 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        {loading && !data && <ClSkeleton rows={3} label="Loading drafts" />}
        {loadError && <ClError message={loadError.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <ClEmpty icon="drafts" title="No drafts yet" hint="Use Save as draft on the task form to keep a task for reuse." />
        )}
        {data?.map((d) => (
          <div key={d.id} className="cl-grow flex-wrap">
            <span className="cl-ic40 cl-tone-sand">
              <ClIcon name="doc" small />
            </span>
            <span className="cl-grow-main">
              <span className="block truncate">{d.title}</span>
              <span className="cl-sub truncate">
                {d.type} · {courseTitle.get(d.courseId) ?? '—'} · used {d.usedCount === 1 ? 'once' : `${d.usedCount} times`} ·
                edited {formatDate(d.updatedAt)}
              </span>
            </span>
            {confirmingId === d.id ? (
              <>
                <button type="button" className="cl-btnp" style={{ background: 'var(--cl-bad)' }} onClick={() => remove(d)}>
                  Delete permanently
                </button>
                <button type="button" className="cl-btns" onClick={() => setConfirmingId(null)}>
                  Keep it
                </button>
              </>
            ) : (
              <>
                <button type="button" className="cl-glink cl-glink--danger" onClick={() => setConfirmingId(d.id)}>
                  Discard
                </button>
                <button type="button" className="cl-btns" onClick={() => setEditingId(d.id)}>
                  Edit
                </button>
                <Link href={`/manage/tasks/new?course=${d.courseId}&draft=${d.id}`} className="cl-btnp">
                  Use
                </Link>
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

/**
 * Edits a draft's content. The course is fixed once created (A-1). Editing a
 * draft never changes a task already authored from it - those were copied.
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
  const [attachments, setAttachments] = useState<AttachmentRow[]>(draft.attachments.map((a) => ({ ...a })));
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
        attachments: toAttachmentInputs(attachments),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save this draft.');
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="de-h" className="cl-panel">
      <PanelHead id="de-h" title="Edit draft">
        <button type="button" className="cl-btns" onClick={onClose}>
          Close
        </button>
      </PanelHead>
      <div className="cl-fgrid">
        {error && (
          <p role="alert" className="m-0 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        <div className="cl-f2">
          <label className="cl-fl">
            Title
            <input className="cl-inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="cl-fl">
            Type
            <select className="cl-inp" value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>
              {(draft.type === 'homework' ? [{ value: 'homework', label: 'Homework' }, ...TYPE_OPTIONS] : TYPE_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="cl-fl">
          Description
          <textarea className="cl-inp" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </label>
        <label className="cl-fl">
          Instructions
          <textarea className="cl-inp" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} />
        </label>
        <AttachmentsEditor
          attachments={attachments}
          onChange={setAttachments}
          uploadsEnabled={uploadConfig?.enabled ?? false}
          acceptTypes={uploadConfig?.allowedMimeTypes ?? []}
        />
        <div>
          <button type="button" className="cl-btnp" disabled={busy || !title.trim() || !audiencesChosen(attachments)} onClick={save}>
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>
    </section>
  );
}
