'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type {
  AssessmentTargetInput,
  AssessmentType,
  AttachmentAudience,
  AttachmentInput,
  StaffTask,
  StaffTaskTarget,
  SubmissionMode,
  TaskDraft,
  TaskVisibility,
  WorkType,
} from '@/lib/types';
import {
  Button,
  Checkbox,
  InlineBanner,
  Loader,
  Panel,
  SectionTitle,
  Select,
  Tag,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/ui';

/**
 * The single-panel authoring form (`TASK-7`), shared by `/manage/tasks/new` and
 * `/manage/tasks/[id]`. Built to the `TaskAuthoring` single-panel shape
 * `redesign-mapping.md` names; the Claude Design handoff is not reachable from
 * this repository (recorded in `docs/phases/unit-6/EXECUTION_NOTES.md`).
 *
 * **Every control posts a field the API accepts, and nothing else.** Status,
 * `scheduled` and marker drift are server-derived and only ever displayed.
 * Hiding a control is courtesy: the server refuses regardless (an assistant
 * naming a marker is a 403, adding an unheld group a 404, hiding a task with
 * submissions a 409), and each refusal is shown as the API worded it.
 */

const TYPE_OPTIONS = [
  { value: 'homework', label: 'Homework' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
];

const WORK_OPTIONS = [
  { value: 'file_upload', label: 'Document (students upload)' },
  { value: 'link', label: 'Link' },
  { value: 'google_form', label: 'Google Form' },
];

const VISIBILITY_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'hidden', label: 'Hidden from students' },
];

/**
 * No pre-selected audience (review F-4, `D-29`): a mark scheme defaulted to
 * *Students* is the exact mistake the field exists to prevent. The author must
 * choose, and saving waits until every row has.
 */
const AUDIENCE_OPTIONS = [
  { value: '', label: 'Choose…' },
  { value: 'students', label: 'Students' },
  { value: 'staff', label: 'Staff only' },
];

/** An attachment row as the form holds it: `audience` may still be unchosen. */
export type AttachmentRow = Omit<AttachmentInput, 'audience'> & {
  audience: AttachmentAudience | '';
};

/** A row counts once it has any content; an untouched blank row is dropped. */
const hasContent = (a: AttachmentRow) => Boolean(a.url.trim() || a.name.trim());

/** True when every row with content has chosen who it is for. */
export function audiencesChosen(rows: readonly AttachmentRow[]): boolean {
  return rows.filter(hasContent).every((a) => a.audience !== '');
}

/** The rows the API receives: complete ones only, audience known. */
export function toAttachmentInputs(rows: readonly AttachmentRow[]): AttachmentInput[] {
  return rows
    .filter((a) => a.url.trim() && a.name.trim() && a.audience !== '')
    .map((a) => ({
      url: a.url.trim(),
      name: a.name.trim(),
      mimeType: a.mimeType ?? null,
      sizeBytes: a.sizeBytes ?? null,
      audience: a.audience as AttachmentAudience,
    }));
}

/** A retained group's own window, if it overrides the task's (review F-2). */
function overrideOf(target: StaffTaskTarget | undefined): Omit<AssessmentTargetInput, 'groupId'> {
  if (!target) return {};
  return {
    ...(target.availableFrom ? { availableFrom: target.availableFrom } : {}),
    ...(target.availableTo ? { availableTo: target.availableTo } : {}),
    ...(target.dueAt ? { dueAt: target.dueAt } : {}),
  };
}

/** "Opens …, due …" for a group whose window differs from the task's. */
function describeOverride(target: StaffTaskTarget | undefined): string | null {
  if (!target) return null;
  const parts = [
    target.availableFrom && `opens ${formatDateTime(target.availableFrom)}`,
    target.dueAt && `due ${formatDateTime(target.dueAt)}`,
    target.availableTo && `closes ${formatDateTime(target.availableTo)}`,
  ].filter(Boolean);
  return parts.length > 0 ? `Own window: ${parts.join(', ')}` : null;
}

const MODES: { value: SubmissionMode; label: string }[] = [
  { value: 'pdf_upload', label: 'PDF upload' },
  { value: 'doc_link', label: 'Google Doc link' },
  { value: 'photo_upload', label: 'Photo of written work' },
];

/** ISO → the value a `datetime-local` input shows, in the viewer's own time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (viewer's time) → UTC ISO for the API. */
function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

interface FormState {
  courseId: string;
  title: string;
  type: AssessmentType;
  workType: WorkType;
  externalUrl: string;
  googleForm: string;
  description: string;
  instructions: string;
  attachments: AttachmentRow[];
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: string;
  allowedFileTypes: string;
  maxFileSizeMb: string;
  groupIds: string[];
  visibility: TaskVisibility;
  allowResubmission: boolean;
  submissionModes: SubmissionMode[];
  /** '' is "whoever opens it first". */
  markerId: string;
  draftId: string | null;
}

function initialState(task: StaffTask | null, courseId: string): FormState {
  if (task) {
    return {
      courseId: task.courseId,
      title: task.title,
      type: task.type,
      workType: task.workType,
      externalUrl: task.externalUrl ?? '',
      googleForm: '',
      description: task.description,
      instructions: task.instructions,
      attachments: task.attachments.map((a) => ({ ...a })),
      availableFrom: toLocalInput(task.availableFrom),
      availableTo: toLocalInput(task.availableTo),
      dueAt: toLocalInput(task.dueAt),
      maxScore: String(task.maxScore),
      allowedFileTypes: task.allowedFileTypes.join(', '),
      maxFileSizeMb: String(Math.round(task.maxFileSizeBytes / (1024 * 1024))),
      groupIds: task.targets.map((t) => t.groupId),
      visibility: task.visibility,
      allowResubmission: task.allowResubmission,
      submissionModes: [...task.submissionModes],
      markerId: task.markerId ?? '',
      draftId: task.draftId,
    };
  }
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  return {
    courseId,
    title: '',
    type: 'homework',
    workType: 'file_upload',
    externalUrl: '',
    googleForm: '',
    description: '',
    instructions: '',
    attachments: [],
    availableFrom: toLocalInput(now.toISOString()),
    availableTo: toLocalInput(twoWeeks.toISOString()),
    dueAt: toLocalInput(week.toISOString()),
    maxScore: '20',
    allowedFileTypes: 'application/pdf',
    maxFileSizeMb: '10',
    groupIds: [],
    visibility: 'published',
    allowResubmission: true,
    submissionModes: [],
    markerId: '',
    draftId: null,
  };
}

export function TaskForm({
  task,
  initialCourseId = '',
  initialDraftId = null,
}: {
  /** Null for a new task. */
  task: StaffTask | null;
  initialCourseId?: string;
  initialDraftId?: string | null;
}) {
  const { token, user } = useSession();
  const router = useRouter();
  const canChooseMarker = isAdminRole(user?.role);
  // A scoped caller editing a task gets no audience editor: `setTargets`
  // replaces the whole set, and they cannot see - so would drop - the groups
  // they do not hold. The server refuses that with 403 (`D-33`); this is the
  // courtesy half.
  const canEditAudience = task === null || isAdminRole(user?.role);

  const [form, setForm] = useState<FormState>(() => initialState(task, initialCourseId));
  const [busy, setBusy] = useState<null | 'save' | 'draft'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const appliedDraft = useRef<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { data: courses } = useApi((t) => api.staff.courses(t), []);
  // Held groups only, since `D-33` narrowed this route.
  const { data: groups } = useApi(
    (t) => (form.courseId ? api.staff.courseGroups(t, form.courseId) : Promise.resolve([])),
    [form.courseId],
  );
  const { data: drafts } = useApi(
    (t) =>
      form.courseId && !task
        ? api.staff.taskDrafts(t, { courseId: form.courseId })
        : Promise.resolve([] as TaskDraft[]),
    [form.courseId, task?.id],
  );
  const { data: uploadConfig } = useApi((t) => api.staff.uploadConfig(t), []);
  // Marker candidates: only the teacher and admins choose (`D-32`), and
  // `/admin/assistants` is theirs.
  const { data: staff } = useApi(
    (t) => (canChooseMarker ? api.admin.assistants(t) : Promise.resolve([])),
    [canChooseMarker],
  );

  // "Start from a draft" prefills the form and carries `draftId` (A-2): the
  // body is what gets saved; the draft is provenance.
  const applyDraft = (draft: TaskDraft) => {
    appliedDraft.current = draft.id;
    setForm((f) => ({
      ...f,
      draftId: draft.id,
      title: draft.title,
      type: draft.type,
      workType: draft.workType,
      description: draft.description,
      instructions: draft.instructions,
      attachments: draft.attachments.map((a) => ({ ...a })),
    }));
  };
  // `?draft=` from the library's "Use" action: applied once, when the course's
  // drafts have loaded. Synchronising with data that arrived from the API.
  useEffect(() => {
    if (!initialDraftId || !drafts || appliedDraft.current !== null) return;
    const match = drafts.find((d) => d.id === initialDraftId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) applyDraft(match);
  }, [drafts, initialDraftId]);

  const markerOptions = useMemo(() => {
    const options = [{ value: '', label: 'Whoever opens it first' }];
    if (user && isAdminRole(user.role)) options.push({ value: user.id, label: `${user.name} (you)` });
    for (const person of staff ?? []) {
      if (person.status !== 'active' || person.id === user?.id) continue;
      options.push({ value: person.id, label: `${person.name} · ${person.role}` });
    }
    // A marker already on the task who is not in the list (the teacher, seen
    // by an admin) must still render as selected rather than silently change.
    if (task?.markerId && !options.some((o) => o.value === task.markerId)) {
      options.push({ value: task.markerId, label: task.markerName ?? task.markerId });
    }
    return options;
  }, [staff, user, task]);

  const cleanAttachments = toAttachmentInputs(form.attachments);
  const attachmentsReady = audiencesChosen(form.attachments);
  const targetOf = (groupId: string) => task?.targets.find((t) => t.groupId === groupId);

  async function save() {
    if (!token) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    const common = {
      title: form.title.trim(),
      description: form.description,
      instructions: form.instructions,
      availableFrom: fromLocalInput(form.availableFrom),
      availableTo: fromLocalInput(form.availableTo),
      dueAt: fromLocalInput(form.dueAt),
      maxScore: Number(form.maxScore),
      allowedFileTypes: form.allowedFileTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      maxFileSizeBytes: Math.round(Number(form.maxFileSizeMb) * 1024 * 1024),
      workType: form.workType,
      ...(form.workType === 'link' ? { externalUrl: form.externalUrl.trim() } : {}),
      ...(form.workType === 'google_form' && form.googleForm.trim()
        ? { googleForm: form.googleForm.trim() }
        : {}),
      attachments: cleanAttachments,
      allowResubmission: form.allowResubmission,
      visibility: form.visibility,
      submissionModes: form.submissionModes,
      // Only sent by someone allowed to send it (`D-32`), and only when it
      // changed (review F-1; the server also skips an unchanged value).
      ...(canChooseMarker && (form.markerId || null) !== (task?.markerId ?? null)
        ? { markerId: form.markerId || null }
        : {}),
    };
    try {
      if (task) {
        await api.staff.updateAssessment(token, task.id, common);
        const before = task.targets.map((t) => t.groupId).sort().join(',');
        const after = [...form.groupIds].sort().join(',');
        if (canEditAudience && before !== after) {
          // Replace-the-whole-set, so every retained group carries its own
          // window override back (review F-2); only added groups go bare.
          await api.staff.setAssessmentTargets(
            token,
            task.id,
            form.groupIds.map((groupId) => ({ groupId, ...overrideOf(targetOf(groupId)) })),
          );
        }
        setNotice('Saved.');
      } else {
        const created = await api.staff.createAssessment(token, form.courseId, {
          ...common,
          type: form.type,
          targets: form.groupIds.map((groupId) => ({ groupId })),
          ...(form.draftId ? { draftId: form.draftId } : {}),
        });
        router.push(`/manage/tasks/${created.id}`);
        return;
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save this task.');
    }
    setBusy(null);
  }

  async function saveAsDraft() {
    if (!token) return;
    setBusy('draft');
    setError(null);
    setNotice(null);
    try {
      await api.staff.createTaskDraft(token, {
        courseId: form.courseId,
        type: form.type,
        workType: form.workType,
        title: form.title.trim(),
        description: form.description,
        instructions: form.instructions,
        attachments: cleanAttachments,
      });
      setNotice('Saved to the draft library.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the draft.');
    }
    setBusy(null);
  }

  const courseOptions = [
    ...(task ? [] : [{ value: '', label: 'Choose a course' }]),
    ...(courses ?? []).map((c) => ({ value: c.id, label: c.title })),
  ];
  const heldGroupIds = new Set((groups ?? []).map((g) => g.id));

  return (
    <Panel title={task ? 'Edit task' : 'New task'}>
      <div className="flex flex-col gap-6">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        {notice && <InlineBanner tone="green">{notice}</InlineBanner>}

        {/* --- What it is ------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <SectionTitle title="The task" />
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Course"
              className="min-w-[220px]"
              value={form.courseId}
              disabled={task !== null}
              onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value, groupIds: [], draftId: null }))}
              options={courseOptions}
            />
            {!task && form.courseId && (
              <Select
                label="Start from a draft"
                className="min-w-[220px]"
                value={form.draftId ?? ''}
                onChange={(e) => {
                  const draft = drafts?.find((d) => d.id === e.target.value);
                  if (draft) applyDraft(draft);
                  else set('draftId', null);
                }}
                options={[
                  { value: '', label: drafts && drafts.length === 0 ? 'No drafts on this course' : 'Blank task' },
                  ...(drafts ?? []).map((d) => ({ value: d.id, label: d.title })),
                ]}
              />
            )}
          </div>
          <TextInput label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Type"
              className="w-[180px]"
              value={form.type}
              disabled={task !== null}
              hint={task ? 'Fixed once created' : undefined}
              onChange={(e) => set('type', e.target.value as AssessmentType)}
              options={TYPE_OPTIONS}
            />
            <Select
              label="How it is handed in"
              className="w-[240px]"
              value={form.workType}
              onChange={(e) => set('workType', e.target.value as WorkType)}
              options={WORK_OPTIONS}
            />
          </div>
          {form.workType === 'link' && (
            <TextInput label="Link students open" value={form.externalUrl} onChange={(e) => set('externalUrl', e.target.value)} placeholder="https://" />
          )}
          {form.workType === 'google_form' && (
            <TextInput
              label="Google Form editing link"
              value={form.googleForm}
              onChange={(e) => set('googleForm', e.target.value)}
              hint={task?.workType === 'google_form' ? 'Leave empty to keep the form already attached.' : undefined}
            />
          )}
          <TextArea label="Description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
          <TextArea label="Instructions" rows={5} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={5000} />
        </div>

        {/* --- Attachments --------------------------------------------- */}
        <AttachmentsEditor
          attachments={form.attachments}
          onChange={(next) => set('attachments', next)}
          uploadsEnabled={uploadConfig?.enabled ?? false}
          acceptTypes={uploadConfig?.allowedMimeTypes ?? []}
        />

        {/* --- When ---------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <SectionTitle title="Window" description="Times are shown in your own time zone." />
          <div className="flex flex-wrap items-end gap-3">
            <TextInput type="datetime-local" label="Opens" value={form.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
            <TextInput type="datetime-local" label="Due" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
            <TextInput type="datetime-local" label="Closes" value={form.availableTo} onChange={(e) => set('availableTo', e.target.value)} />
          </div>
        </div>

        {/* --- Who it is for -------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <SectionTitle title="Set for" description="One or more groups studying this course." />
          {canEditAudience ? (
            groups && groups.length > 0 ? (
              <div className="flex flex-col gap-1">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Checkbox
                      label={g.name}
                      checked={form.groupIds.includes(g.id)}
                      onChange={(checked) =>
                        set('groupIds', checked ? [...form.groupIds, g.id] : form.groupIds.filter((id) => id !== g.id))
                      }
                    />
                    <span className="text-base text-fg">{g.name}</span>
                    <span className="text-base text-fg-4">{g.memberCount} students</span>
                    {form.groupIds.includes(g.id) && describeOverride(targetOf(g.id)) && (
                      <span className="text-base text-fg-3">{describeOverride(targetOf(g.id))}</span>
                    )}
                  </div>
                ))}
                {/* A target outside the picker (an admin sees every group, so
                    this is a stale id): shown, never silently dropped. */}
                {form.groupIds.filter((id) => !heldGroupIds.has(id)).map((id) => (
                  <span key={id} className="text-base text-fg-3">{task?.targets.find((t) => t.groupId === id)?.groupName ?? id}</span>
                ))}
              </div>
            ) : (
              <p className="text-base text-fg-3">{form.courseId ? 'No groups on this course that you hold.' : 'Choose a course first.'}</p>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {task?.targets.map((t) => <Tag key={t.groupId} tone="gray">{t.groupName}</Tag>)}
              </div>
              {task?.targets.map((t) =>
                describeOverride(t) ? (
                  <p key={t.groupId} className="text-base text-fg-3">
                    {t.groupName}: {describeOverride(t)}
                  </p>
                ) : null,
              )}
              <p className="text-base text-fg-3">Only the teacher can change who this is set for.</p>
            </div>
          )}
        </div>

        {/* --- Settings ------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <SectionTitle title="Settings" />
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Visibility"
              className="w-[220px]"
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value as TaskVisibility)}
              options={VISIBILITY_OPTIONS}
              hint={task?.visibilityState === 'scheduled' ? 'Scheduled: students see it locked until it opens.' : undefined}
            />
            <TextInput label="Out of" type="number" min={1} max={1000} className="w-[120px]" value={form.maxScore} onChange={(e) => set('maxScore', e.target.value)} />
            {/* `D-47`: with modes chosen the server derives the types from them,
                so the field would only be a promise the server overrides. */}
            {form.submissionModes.length === 0 && (
              <TextInput label="Accepted file types" className="min-w-[220px]" value={form.allowedFileTypes} onChange={(e) => set('allowedFileTypes', e.target.value)} hint="MIME types, comma separated" />
            )}
            <TextInput label="Largest file (MB)" type="number" min={1} max={100} className="w-[140px]" value={form.maxFileSizeMb} onChange={(e) => set('maxFileSizeMb', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base text-fg-2">Students may hand in</p>
            {MODES.map((m) => {
              // `D-48` (b): an upload mode needs file storage on this server.
              // The server refuses it regardless; this avoids offering it. A mode
              // already on the task stays shown and can be unticked.
              const needsStorage = m.value !== 'doc_link';
              const blocked = needsStorage && !(uploadConfig?.enabled ?? false) && !form.submissionModes.includes(m.value);
              return (
                <div key={m.value} className="flex items-center gap-2">
                  <Checkbox
                    label={m.label}
                    disabled={blocked}
                    checked={form.submissionModes.includes(m.value)}
                    onChange={(checked) =>
                      set('submissionModes', checked ? [...form.submissionModes, m.value] : form.submissionModes.filter((x) => x !== m.value))
                    }
                  />
                  <span className={blocked ? 'text-base text-fg-4' : 'text-base text-fg'}>{m.label}</span>
                  {blocked && <span className="text-xs text-fg-4">Needs file storage on this server</span>}
                </div>
              );
            })}
            {form.submissionModes.length === 0 && (
              <p className="text-xs text-fg-4">None ticked: students hand in a link and/or a typed answer, as before.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Toggle label="Allow resubmission" checked={form.allowResubmission} onChange={(v) => set('allowResubmission', v)} />
            <span className="text-base text-fg">Allow resubmission until the window closes</span>
          </div>
          {canChooseMarker ? (
            <Select
              label="Marked by"
              className="w-[280px]"
              value={form.markerId}
              onChange={(e) => set('markerId', e.target.value)}
              options={markerOptions}
              error={task?.markerDrift ? 'This marker no longer reaches every group the task is set for.' : null}
            />
          ) : (
            <p className="text-base text-fg-3">
              Marked by {task?.markerName ?? 'whoever opens it first'}
              {task?.markerDrift && <Tag tone="amber" className="ms-2">Marker no longer reaches every group</Tag>}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={busy !== null || !form.title.trim() || !form.courseId || form.groupIds.length === 0 || !attachmentsReady}
            onClick={save}
          >
            {busy === 'save' ? <Loader size={3} label="Saving" /> : task ? 'Save changes' : 'Create task'}
          </Button>
          {!task && (
            <Button disabled={busy !== null || !form.title.trim() || !form.courseId || !attachmentsReady} onClick={saveAsDraft}>
              {busy === 'draft' ? <Loader size={3} label="Saving" /> : 'Save as draft'}
            </Button>
          )}
          {form.draftId && !task && <Tag tone="blue">Started from a draft</Tag>}
          {!attachmentsReady && (
            <span className="text-base text-status-amber-text">Choose who each attachment is for before saving.</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Attachments: a passage, a recording, a mark scheme. `audience` is chosen per
 * row with no default the author did not see (`D-29`) - a mark scheme is
 * `Staff only`. With `STORAGE_DRIVER=none` (production) only the URL field is
 * offered, the honest fallback to an upload that would 503.
 */
export function AttachmentsEditor({
  attachments,
  onChange,
  uploadsEnabled,
  acceptTypes,
}: {
  attachments: AttachmentRow[];
  onChange: (next: AttachmentRow[]) => void;
  uploadsEnabled: boolean;
  acceptTypes: readonly string[];
}) {
  const { token } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<AttachmentRow>) =>
    onChange(attachments.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.staff.upload(token, file);
      onChange([
        ...attachments,
        { url: result.url, name: file.name, mimeType: result.mimeType, sizeBytes: result.sizeBytes, audience: '' },
      ]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That upload failed.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle title="Attachments" description="Staff-only attachments never reach a student's task page." />
      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      {attachments.length === 0 && <p className="text-base text-fg-3">None.</p>}
      {attachments.map((a, index) => (
        <div key={index} className="flex flex-wrap items-end gap-3">
          <TextInput label="Name" className="min-w-[180px]" value={a.name} onChange={(e) => update(index, { name: e.target.value })} />
          <TextInput label="Link" className="min-w-[260px] flex-1" value={a.url} onChange={(e) => update(index, { url: e.target.value })} placeholder="https://" />
          <Select
            label="Visible to"
            className="w-[150px]"
            value={a.audience}
            onChange={(e) => update(index, { audience: e.target.value as AttachmentAudience | '' })}
            options={AUDIENCE_OPTIONS}
            error={a.audience === '' && hasContent(a) ? 'Choose one' : null}
          />
          <Button variant="tertiary" icon="Trash" onClick={() => onChange(attachments.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon="Plus"
          disabled={attachments.length >= 10}
          onClick={() => onChange([...attachments, { url: '', name: '', audience: '' }])}
        >
          Add a link
        </Button>
        {uploadsEnabled && (
          <>
            <input ref={input} type="file" className="sr-only" id="attachment-upload" accept={acceptTypes.join(',')} onChange={pick} />
            <Button icon="Upload" disabled={uploading || attachments.length >= 10} onClick={() => input.current?.click()}>
              {uploading ? <Loader size={3} label="Uploading" /> : 'Upload a file'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
