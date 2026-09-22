'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate, formatDuration } from '@/lib/format';
import type { OutlineModule, StaffRecording } from '@/lib/types';
import {
  Button,
  EmptyState,
  Icon,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Tag,
  TextInput,
} from '@/components/ui';

/**
 * The course recording library.
 *
 * Both roles read it; only Dr. Tahir writes to it. CLAUDE.md §2.2 grants a TA
 * materials but never recordings, and the client's instruction was specifically
 * that *the teacher* uploads them. The forms below are hidden for an assistant,
 * and `/admin/*` refuses them server-side regardless (§8) - the hiding is
 * courtesy, the 403 is the control.
 *
 * "Upload" is a URL today, not a file picker. The video lives in Bunny Stream
 * (§3) and playback must go through a signed, expiring URL (§8); neither the
 * Bunny integration nor R2 exists yet, so this records the reference the
 * student player already reads rather than pretending to host the file.
 */
export default function CourseRecordingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const [adding, setAdding] = useState(false);

  const { data, error, loading, reload } = useApi((token) => api.staff.recordings(token, id), [id]);

  // Only the teacher can publish, so only the teacher needs the lesson pickers.
  const { data: outline } = useApi(
    (token) => (admin ? api.staff.outline(token, id) : Promise.resolve(null)),
    [id, admin],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {adding && admin && outline && (
        <NewRecordingForm
          courseId={id}
          outline={outline}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}

      <Panel
        title="Recorded lessons"
        action={
          admin && !adding ? (
            <Button
              size="small"
              variant="primary"
              icon="Plus"
              onClick={() => setAdding(true)}
              disabled={!outline || outline.length === 0}
            >
              Upload recording
            </Button>
          ) : (
            data && <span className="num text-xs text-fg-3">{data.length}</span>
          )
        }
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading recordings" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            action={error.isNotFound ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.length === 0 && (
          <EmptyState
            icon="PlayerPlay"
            title="No recordings yet"
            description={
              admin
                ? 'Upload a recording and it appears in every enrolled student’s course straight away.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        )}
        {data && data.length > 0 && (
          <ul className="divide-y divide-border-light">
            {data.map((recording) => (
              <li key={recording.id}>
                <RecordingRow recording={recording} admin={admin} onDeleted={reload} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function RecordingRow({
  recording,
  admin,
  onDeleted,
}: {
  recording: StaffRecording;
  admin: boolean;
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

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-wash-hover text-fg-3"
      >
        <Icon name="PlayerPlay" size={16} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-fg">{recording.title}</span>
        <span className="mt-1 block truncate text-xs text-fg-3">
          {recording.chapter} · {formatDate(recording.lessonDate)}
        </span>
        {error && <span className="mt-1 block text-xs text-status-red-text">{error}</span>}
      </span>

      {recording.topics.slice(0, 2).map((topic) => (
        <Tag key={topic} tone="blue">
          {topic}
        </Tag>
      ))}

      <span className="num shrink-0 text-xs text-fg-3">{formatDuration(recording.durationSeconds)}</span>

      {admin &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            {/* Deleting also destroys every student's watch progress for this
                recording through the database cascade - a real loss of
                history, which is why it asks first. */}
            <span className="text-xs text-fg-3">Delete for everyone?</span>
            <Button size="small" variant="tertiary" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button size="small" variant="primary" accent="danger" disabled={busy} onClick={() => void remove()}>
              {busy ? <Loader size={3} label="Deleting" /> : 'Delete'}
            </Button>
          </span>
        ) : (
          <Button
            size="small"
            variant="tertiary"
            icon="Trash"
            aria-label={`Delete ${recording.title}`}
            onClick={() => setConfirming(true)}
          />
        ))}
    </div>
  );
}

function NewRecordingForm({
  courseId,
  outline,
  onCancel,
  onCreated,
}: {
  courseId: string;
  outline: OutlineModule[];
  onCancel: () => void;
  onCreated: () => void;
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
      await api.admin.createRecording(token, courseId, {
        moduleId: String(form.get('moduleId')),
        lessonId: String(form.get('lessonId')),
        title: String(form.get('title')).trim(),
        chapter: String(form.get('chapter') ?? '').trim() || undefined,
        // Comma-separated, because the student recordings page filters by a
        // single topic and a tag editor is not what this MVP is for.
        topics: String(form.get('topics') ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        videoUrl: String(form.get('videoUrl')).trim(),
        durationSeconds: Math.round(Number(form.get('durationMinutes')) * 60),
        lessonDate: String(form.get('lessonDate') || '')
          ? new Date(String(form.get('lessonDate'))).toISOString()
          : undefined,
      });
      onCreated();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not publish that recording. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <Panel title="Upload a recording">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Chapter / module"
            id="moduleId"
            name="moduleId"
            required
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            options={outline.map((module) => ({ value: module.id, label: `${module.chapter} — ${module.title}` }))}
          />

          <Select
            label="Lesson"
            id="lessonId"
            name="lessonId"
            required
            hint="Every recording hangs off a lesson in the course outline."
            options={(selectedModule?.lessons ?? []).map((lesson) => ({ value: lesson.id, label: lesson.title }))}
          />
        </div>

        <TextInput label="Title" id="title" name="title" required maxLength={200} autoFocus />

        <TextInput
          label="Video URL"
          id="videoUrl"
          name="videoUrl"
          type="url"
          inputMode="url"
          required
          placeholder="https://"
          hint="The Bunny Stream link. Playback is signed per request, so this is never handed to a student directly."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Length (minutes)"
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={1}
            max={720}
            step={1}
            required
            defaultValue={45}
          />

          <TextInput label="Taught on" id="lessonDate" name="lessonDate" type="date" />

          <TextInput
            label="Chapter label"
            id="chapter"
            name="chapter"
            maxLength={120}
            hint="Defaults to the module's."
          />
        </div>

        <TextInput
          label="Topics"
          id="topics"
          name="topics"
          placeholder="Atomic Structure, Moles"
          hint="Comma separated. These become the student's topic filter."
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader size={3} label="Publishing" /> : 'Publish recording'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
