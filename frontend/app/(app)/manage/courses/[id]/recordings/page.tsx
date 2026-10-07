'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate, formatDuration } from '@/lib/format';
import type { OutlineModule, StaffRecording } from '@/lib/types';
import { ClIcon } from '@/components/shell/classroom';
import { ClChips, ClEmpty, ClError, ClModal, ClSkeleton, PanelHead } from '@/components/classroom/ui';

/**
 * The course recording library.
 *
 * Both roles read it; only Dr. Tahir writes to it. CLAUDE.md §2.2 grants a TA
 * materials but never recordings, and the client's instruction was specifically
 * that *the teacher* uploads them. The forms below are hidden for an assistant,
 * and `/admin/*` refuses them server-side regardless (§8) - the hiding is
 * courtesy, the 403 is the control.
 *
 * "Upload" is a URL, not a file picker — recordings are plain links (D-57):
 * a YouTube, Vimeo or shared-file URL the student opens directly. There is
 * no video hosting integration to go through.
 *
 * Redesign V2: the artifact's recording rows. A recording has no published /
 * draft state (it is visible to enrolled students as soon as it exists), so the
 * artifact's Publish / Unpublish toggle and status dot are not drawn; Edit
 * (`PATCH /admin/recordings/:id`) and Delete are.
 */
export default function CourseRecordingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffRecording | null>(null);
  const [lessonFilter, setLessonFilter] = useState('');

  const { data, error, loading, reload } = useApi((token) => api.staff.recordings(token, id), [id]);

  // The outline gives lesson titles for labels and the filter (every staff role
  // may read it), and the module/lesson pickers for the teacher's add form.
  const { data: outline } = useApi((token) => api.staff.outline(token, id), [id]);
  const lessonTitles = new Map<string, string>();
  for (const m of outline ?? []) for (const l of m.lessons) lessonTitles.set(l.id, l.title);
  const lessonOptions = [...new Set((data ?? []).map((r) => r.lessonId))]
    .filter((lid) => lessonTitles.has(lid))
    .map((lid) => ({ value: lid, label: lessonTitles.get(lid) ?? '' }));
  const shown = lessonFilter ? (data ?? []).filter((r) => r.lessonId === lessonFilter) : (data ?? []);

  return (
    <>
      <section aria-labelledby="rec-h" className="cl-panel pb-4">
        <PanelHead id="rec-h" title="Recorded lessons">
          {data && <span className="cl-muted text-[13px]">{data.length}</span>}
          {admin && (
            <button
              type="button"
              className="cl-btnp"
              onClick={() => setAdding(true)}
              disabled={!outline || outline.length === 0}
            >
              <ClIcon name="plus" small />
              Add recording
            </button>
          )}
        </PanelHead>
        {lessonOptions.length > 0 && (
          <div className="mb-3">
            <ClChips
              label="Filter by lesson"
              value={lessonFilter}
              onChange={setLessonFilter}
              options={[{ value: '', label: 'All lessons' }, ...lessonOptions]}
            />
          </div>
        )}
        {loading && !data && <ClSkeleton rows={3} label="Loading recordings" />}
        {error && (
          <ClError
            message={error.isNotFound ? 'This course does not exist, or it is not assigned to you.' : error.message}
            onRetry={error.isNotFound ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <ClEmpty
            icon="play"
            tone="cl-tone-blue"
            title="No recordings yet"
            hint={
              admin
                ? 'Add a recording and it appears in every enrolled student’s course straight away.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        )}
        {data && data.length > 0 && shown.length === 0 && (
          <ClEmpty icon="play" tone="cl-tone-blue" title="No recordings for that lesson" hint="Clear the filter to see everything." />
        )}
        {shown.map((recording) => (
          <RecordingRow
            key={recording.id}
            recording={recording}
            lesson={lessonTitles.get(recording.lessonId) ?? ''}
            admin={admin}
            onEdit={() => setEditing(recording)}
            onDeleted={reload}
          />
        ))}
      </section>

      {adding && admin && outline && (
        <RecordingForm
          courseId={id}
          outline={outline}
          recording={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {editing && admin && (
        <RecordingForm
          courseId={id}
          outline={[]}
          recording={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function RecordingRow({
  recording,
  lesson,
  admin,
  onEdit,
  onDeleted,
}: {
  recording: StaffRecording;
  lesson: string;
  admin: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.deleteRecording(token, recording.id);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete that.');
      setBusy(false);
      setConfirming(false);
    }
  }

  const playable = /^https?:\/\//i.test(recording.videoUrl);

  return (
    <div className="cl-grow flex-wrap" style={{ cursor: 'default' }}>
      <a
        href={playable ? recording.videoUrl : undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${recording.title}`}
        className="flex h-[52px] w-[88px] flex-none flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] no-underline hover:no-underline"
        style={{ background: 'var(--cl-blue)', color: 'var(--cl-on-blue)' }}
      >
        <ClIcon name="play" small />
        {formatDuration(recording.durationSeconds)}
      </a>

      <span className="cl-grow-main">
        <span className="block truncate">{recording.title}</span>
        <span className="cl-sub">
          {[lesson, formatDate(recording.lessonDate)].filter(Boolean).join(' · ')}
        </span>
        {error && (
          <span role="alert" className="mt-1 block text-[13px]" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </span>
        )}
      </span>

      {admin &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            {/* Deleting also destroys every student's watch progress for this
                recording through the database cascade - a real loss of
                history, which is why it asks first. */}
            <span className="cl-muted text-[13px]">Delete for everyone?</span>
            <button type="button" className="cl-btns" onClick={() => setConfirming(false)}>
              Keep
            </button>
            <button type="button" className="cl-btnp" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="cl-btns" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="cl-glink cl-glink--danger"
              aria-label={`Delete ${recording.title}`}
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          </span>
        ))}
    </div>
  );
}

/** Add (`recording` null) or edit one recording. Links only (D-57) - no upload. */
function RecordingForm({
  courseId,
  outline,
  recording,
  onClose,
  onSaved,
}: {
  courseId: string;
  outline: OutlineModule[];
  recording: StaffRecording | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [moduleId, setModuleId] = useState(outline[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedModule = outline.find((m) => m.id === moduleId) ?? outline[0];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);
    try {
      const common = {
        title: String(form.get('title')).trim(),
        // chapter and topics are optional in the DTOs (chapter defaults to the
        // module's); omitted, so an edit leaves any existing values untouched.
        videoUrl: String(form.get('videoUrl')).trim(),
        durationSeconds: Math.round(Number(form.get('durationMinutes')) * 60),
        lessonDate: String(form.get('lessonDate') || '')
          ? new Date(String(form.get('lessonDate'))).toISOString()
          : undefined,
      };
      const thumbnailUrl = String(form.get('thumbnailUrl') ?? '').trim();
      if (recording) {
        await api.admin.updateRecording(token, recording.id, { ...common, thumbnailUrl: thumbnailUrl || null });
      } else {
        await api.admin.createRecording(token, courseId, {
          ...common,
          moduleId: String(form.get('moduleId')),
          lessonId: String(form.get('lessonId')),
          thumbnailUrl: thumbnailUrl || undefined,
        });
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not save that recording. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <ClModal
      open
      wide
      title={recording ? 'Edit recording' : 'Add a recording'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="recording-form" className="cl-btnp" disabled={busy}>
            {busy ? 'Saving…' : recording ? 'Save changes' : 'Publish recording'}
          </button>
        </>
      }
    >
      <form id="recording-form" onSubmit={submit} noValidate className="cl-fgrid">
        {!recording && (
          <div className="cl-f2">
            <label className="cl-fl">
              Chapter / module
              <select
                className="cl-inp"
                id="moduleId"
                name="moduleId"
                required
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
              >
                {outline.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.chapter} — {module.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="cl-fl">
              Lesson (every recording hangs off a lesson in the outline)
              <select className="cl-inp" id="lessonId" name="lessonId" required>
                {(selectedModule?.lessons ?? []).map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="cl-fl">
          Title
          <input className="cl-inp" id="title" name="title" required maxLength={200} defaultValue={recording?.title} autoFocus />
        </label>

        <label className="cl-fl">
          Video link (YouTube, Vimeo or a shared file — students open this link)
          <input
            className="cl-inp"
            id="videoUrl"
            name="videoUrl"
            type="url"
            inputMode="url"
            required
            placeholder="https://"
            defaultValue={recording?.videoUrl}
          />
        </label>

        <div className="cl-f2">
          <label className="cl-fl">
            Length (minutes)
            <input
              className="cl-inp"
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={1}
              max={720}
              step={1}
              required
              defaultValue={recording ? Math.max(1, Math.round(recording.durationSeconds / 60)) : 45}
            />
          </label>
          <label className="cl-fl">
            Taught on
            <input
              className="cl-inp"
              id="lessonDate"
              name="lessonDate"
              type="date"
              defaultValue={recording ? recording.lessonDate.slice(0, 10) : undefined}
            />
          </label>
        </div>

        <label className="cl-fl">
          Thumbnail link (optional)
          <input
            className="cl-inp"
            id="thumbnailUrl"
            name="thumbnailUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            defaultValue={recording?.thumbnailUrl ?? ''}
          />
        </label>

        {error && (
          <div role="alert" className="cl-soft" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
      </form>
    </ClModal>
  );
}
