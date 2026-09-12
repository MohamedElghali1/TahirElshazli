'use client';

import { use, useState } from 'react';
import { PlusIcon, TrashIcon, VideoIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate, formatDuration } from '@/lib/format';
import type { OutlineModule, StaffRecording } from '@/lib/types';
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
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

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
export default function CourseRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const [adding, setAdding] = useState(false);

  const { data, error, loading, reload } = useApi(
    (token) => api.staff.recordings(token, id),
    [id],
  );

  // Only the teacher can publish, so only the teacher needs the lesson pickers.
  const { data: outline } = useApi(
    (token) => (admin ? api.staff.outline(token, id) : Promise.resolve(null)),
    [id, admin],
  );

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
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
              size="sm"
              variant="primary"
              onClick={() => setAdding(true)}
              disabled={!outline || outline.length === 0}
            >
              <PlusIcon size={14} />
              Upload recording
            </Button>
          ) : (
            data && (
              <span className="num text-[var(--fs-xs)] text-fg-3">
                {data.length}
              </span>
            )
          )
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={5} />}
        {error && (
          <ErrorState
            message={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            onRetry={error.isNotFound ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <EmptyState
            title="No recordings yet"
            body={
              admin
                ? 'Upload a recording and it appears in every enrolled student’s course straight away.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        )}
        {data && data.length > 0 && (
          <ul className="rows">
            {data.map((recording) => (
              <li key={recording.id}>
                <RecordingRow
                  recording={recording}
                  admin={admin}
                  onDeleted={reload}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
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
      setError(
        cause instanceof ApiError ? cause.message : 'Could not delete that.',
      );
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
      <span
        aria-hidden
        className="flex h-[var(--h-md)] w-[var(--h-md)] shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-wash)] text-fg-3"
      >
        <VideoIcon size={16} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[var(--fs-base)] font-medium text-fg">
          {recording.title}
        </span>
        <span className="mt-[var(--sp-1)] block truncate text-[var(--fs-xs)] text-fg-3">
          {recording.chapter} · {formatDate(recording.lessonDate)}
        </span>
        {error && (
          <span className="mt-[var(--sp-1)] block text-[var(--fs-xs)] text-chip-red-fg">
            {error}
          </span>
        )}
      </span>

      {recording.topics.slice(0, 2).map((topic) => (
        <Chip key={topic} tone="teal">
          {topic}
        </Chip>
      ))}

      <span className="num shrink-0 text-[var(--fs-xs)] text-fg-3">
        {formatDuration(recording.durationSeconds)}
      </span>

      {admin &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-[var(--sp-2)]">
            {/* Deleting also destroys every student's watch progress for this
                recording through the database cascade - a real loss of
                history, which is why it asks first. */}
            <span className="text-[var(--fs-xs)] text-fg-3">
              Delete for everyone?
            </span>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Delete ${recording.title}`}
            onClick={() => setConfirming(true)}
          >
            <TrashIcon size={14} />
          </Button>
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
      <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--sp-4)]">
        <div className="grid gap-[var(--sp-4)] sm:grid-cols-2">
          <Field label="Chapter / module" htmlFor="moduleId">
            <Select
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
            </Select>
          </Field>

          <Field
            label="Lesson"
            htmlFor="lessonId"
            hint="Every recording hangs off a lesson in the course outline."
          >
            <Select id="lessonId" name="lessonId" required>
              {(selectedModule?.lessons ?? []).map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" required maxLength={200} autoFocus />
        </Field>

        <Field
          label="Video URL"
          htmlFor="videoUrl"
          hint="The Bunny Stream link. Playback is signed per request, so this is never handed to a student directly."
        >
          <Input
            id="videoUrl"
            name="videoUrl"
            type="url"
            inputMode="url"
            required
            placeholder="https://"
          />
        </Field>

        <div className="grid gap-[var(--sp-4)] sm:grid-cols-3">
          <Field label="Length (minutes)" htmlFor="durationMinutes">
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={1}
              max={720}
              step={1}
              required
              defaultValue={45}
            />
          </Field>

          <Field label="Taught on" htmlFor="lessonDate">
            <Input id="lessonDate" name="lessonDate" type="date" />
          </Field>

          <Field
            label="Chapter label"
            htmlFor="chapter"
            hint="Defaults to the module's."
          >
            <Input id="chapter" name="chapter" maxLength={120} />
          </Field>
        </div>

        <Field
          label="Topics"
          htmlFor="topics"
          hint="Comma separated. These become the student's topic filter."
        >
          <Input id="topics" name="topics" placeholder="Atomic Structure, Moles" />
        </Field>

        {error && <FormError>{error}</FormError>}

        <div className="flex justify-end gap-[var(--sp-2)]">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Publish recording
          </Button>
        </div>
      </form>
    </Panel>
  );
}
