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
import { ClModal, PanelHead } from '@/components/classroom/ui';
import { ClIcon } from '@/components/shell/classroom';

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

/** New work is an assignment or a quiz; "homework" is retired for new tasks. */
const TYPE_OPTIONS = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
];
/** An existing homework task still shows its type (it is fixed on edit anyway). */
const HOMEWORK_OPTION = { value: 'homework', label: 'Homework' };

/**
 * Tasks no longer auto-close: staff remove them by hand. The API still
 * requires `availableTo` on create, so every new task gets this far-future
 * instant; an edit simply does not send the field.
 */
const NEVER_CLOSES = '2099-12-31T23:59:59.000Z';

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
    ...(target.dueAt ? { dueAt: target.dueAt } : {}),
  };
}

/** "Opens …, due …" for a group whose window differs from the task's. */
function describeOverride(target: StaffTaskTarget | undefined): string | null {
  if (!target) return null;
  const parts = [
    target.availableFrom && `opens ${formatDateTime(target.availableFrom)}`,
    target.dueAt && `due ${formatDateTime(target.dueAt)}`,
  ].filter(Boolean);
  return parts.length > 0 ? `Own window: ${parts.join(', ')}` : null;
}

const MODES: { value: SubmissionMode; label: string }[] = [
  { value: 'pdf_upload', label: 'PDF upload' },
  { value: 'docx_upload', label: 'Word document' },
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
  return {
    courseId,
    title: '',
    type: 'assignment',
    workType: 'file_upload',
    externalUrl: '',
    googleForm: '',
    description: '',
    instructions: '',
    attachments: [],
    availableFrom: toLocalInput(now.toISOString()),
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
  // A new task starts with every upload mode ticked when this server stores
  // files: with none ticked a student gets only a link box and no upload,
  // which is rarely what a teacher meant. Untick to narrow it. Applied once,
  // when the config arrives, and never over a mode already chosen.
  const defaultedModes = useRef(false);
  useEffect(() => {
    if (task || defaultedModes.current || !uploadConfig) return;
    defaultedModes.current = true;
    if (!uploadConfig.enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) =>
      f.submissionModes.length > 0 ? f : { ...f, submissionModes: ['pdf_upload', 'docx_upload', 'photo_upload'] },
    );
  }, [task, uploadConfig]);
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
      type: draft.type === 'homework' ? 'assignment' : draft.type,
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
          availableTo: NEVER_CLOSES,
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
  const retainedOnly = (id: string) => !heldGroupIds.has(id);

  return (
    <div className="flex flex-col gap-6">
      {(error || notice) && (
        <section className="cl-panel" role={error ? 'alert' : 'status'}>
          <p className="m-0 text-[14px]" style={{ color: error ? 'var(--cl-bad)' : 'var(--cl-ok)' }}>
            {error ?? notice}
          </p>
        </section>
      )}

      {/* --- What it is -------------------------------------------------- */}
      <section aria-labelledby="tf-task" className="cl-panel">
        <PanelHead id="tf-task" title={task ? 'Edit task' : 'New task'} />
        <div className="cl-fgrid">
          <div className="cl-f2">
            <label className="cl-fl">
              Course
              <select
                className="cl-inp"
                value={form.courseId}
                disabled={task !== null}
                onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value, groupIds: [], draftId: null }))}
              >
                {courseOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {!task && form.courseId && (
              <label className="cl-fl">
                Start from a draft
                <select
                  className="cl-inp"
                  value={form.draftId ?? ''}
                  onChange={(e) => {
                    const draft = drafts?.find((d) => d.id === e.target.value);
                    if (draft) applyDraft(draft);
                    else set('draftId', null);
                  }}
                >
                  <option value="">{drafts && drafts.length === 0 ? 'No drafts on this course' : 'Blank task'}</option>
                  {(drafts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="cl-fl">
            Title
            <input className="cl-inp" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
          </label>

          <div>
            <div className="cl-flab">Type{task ? ' (fixed once created)' : ''}</div>
            <Seg
              label="Type"
              options={task?.type === 'homework' ? [HOMEWORK_OPTION, ...TYPE_OPTIONS] : TYPE_OPTIONS}
              value={form.type}
              disabled={task !== null}
              onChange={(v) => set('type', v as AssessmentType)}
            />
          </div>

          <div>
            <div className="cl-flab">How it is handed in</div>
            <Seg label="How it is handed in" options={WORK_OPTIONS} value={form.workType} onChange={(v) => set('workType', v as WorkType)} />
          </div>

          {form.workType === 'link' && (
            <label className="cl-fl">
              Link students open
              <input className="cl-inp" value={form.externalUrl} onChange={(e) => set('externalUrl', e.target.value)} placeholder="https://" />
            </label>
          )}
          {form.workType === 'google_form' && (
            <label className="cl-fl">
              Google Form editing link
              <input className="cl-inp" value={form.googleForm} onChange={(e) => set('googleForm', e.target.value)} />
              {task?.workType === 'google_form' && (
                <span className="text-[12.5px]">Leave empty to keep the form already attached.</span>
              )}
            </label>
          )}

          <label className="cl-fl">
            Description
            <textarea className="cl-inp" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
          </label>
          <label className="cl-fl">
            Instructions
            <textarea className="cl-inp" rows={5} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={5000} />
          </label>
        </div>
      </section>

      {/* --- Attachments ------------------------------------------------- */}
      <section aria-labelledby="tf-att" className="cl-panel">
        <AttachmentsEditor
          attachments={form.attachments}
          onChange={(next) => set('attachments', next)}
          uploadsEnabled={uploadConfig?.enabled ?? false}
          acceptTypes={uploadConfig?.allowedMimeTypes ?? []}
          headingId="tf-att"
        />
      </section>

      {/* --- When -------------------------------------------------------- */}
      <section aria-labelledby="tf-win" className="cl-panel">
        <PanelHead id="tf-win" title="Window" />
        <p className="cl-muted -mt-2 mb-4 text-[13.5px]">Times are shown in your own time zone. A task stays open until you remove it.</p>
        <div className="cl-f2">
          <label className="cl-fl">
            Opens
            <input className="cl-inp" type="datetime-local" value={form.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
          </label>
          <label className="cl-fl">
            Due
            <input className="cl-inp" type="datetime-local" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
          </label>
        </div>
      </section>

      {/* --- Who it is for ----------------------------------------------- */}
      <section aria-labelledby="tf-for" className="cl-panel">
        <PanelHead id="tf-for" title="Set for" />
        <p className="cl-muted -mt-2 mb-3 text-[13.5px]">One or more groups studying this course.</p>
        {canEditAudience ? (
          groups && groups.length > 0 ? (
            <div>
              {groups.map((g) => (
                <label key={g.id} className="cl-grow cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={form.groupIds.includes(g.id)}
                    onChange={(e) =>
                      set('groupIds', e.target.checked ? [...form.groupIds, g.id] : form.groupIds.filter((id) => id !== g.id))
                    }
                  />
                  <span className="cl-grow-main">
                    <span className="block truncate">{g.name}</span>
                    <span className="cl-sub">
                      {g.memberCount} students
                      {form.groupIds.includes(g.id) && describeOverride(targetOf(g.id)) && ` · ${describeOverride(targetOf(g.id))}`}
                    </span>
                  </span>
                </label>
              ))}
              {/* A target outside the picker (an admin sees every group, so
                  this is a stale id): shown, never silently dropped. */}
              {form.groupIds.filter(retainedOnly).map((id) => (
                <p key={id} className="cl-muted m-0 px-2 py-1 text-[13.5px]">
                  {task?.targets.find((t) => t.groupId === id)?.groupName ?? id}
                </p>
              ))}
            </div>
          ) : (
            <p className="cl-muted m-0 text-[14px]">{form.courseId ? 'No groups on this course that you hold.' : 'Choose a course first.'}</p>
          )
        ) : (
          <div>
            {task?.targets.map((t) => (
              <div key={t.groupId} className="cl-grow">
                <span className="cl-grow-main">
                  <span className="block truncate">{t.groupName}</span>
                  {describeOverride(t) && <span className="cl-sub">{describeOverride(t)}</span>}
                </span>
              </div>
            ))}
            <p className="cl-muted m-0 mt-2 px-2 text-[13.5px]">Only the teacher can change who this is set for.</p>
          </div>
        )}
      </section>

      {/* --- Settings and publishing -------------------------------------- */}
      <section aria-labelledby="tf-set" className="cl-panel">
        <PanelHead id="tf-set" title="Settings" />
        <div className="cl-fgrid">
          <div>
            <div className="cl-flab">Publishing</div>
            <Seg label="Publishing" options={VISIBILITY_OPTIONS} value={form.visibility} onChange={(v) => set('visibility', v as TaskVisibility)} />
            {task?.visibilityState === 'scheduled' && (
              <p className="cl-muted m-0 mt-2 px-1 text-[12.5px]">Scheduled: students see it locked until it opens.</p>
            )}
          </div>

          <div className="cl-f3">
            <label className="cl-fl">
              Out of
              <input className="cl-inp" type="number" min={1} max={1000} value={form.maxScore} onChange={(e) => set('maxScore', e.target.value)} />
            </label>
            <label className="cl-fl">
              Largest file (MB)
              <input className="cl-inp" type="number" min={1} max={100} value={form.maxFileSizeMb} onChange={(e) => set('maxFileSizeMb', e.target.value)} />
            </label>
            {/* `D-47`: with modes chosen the server derives the types from them,
                so the field would only be a promise the server overrides. */}
            {form.submissionModes.length === 0 && (
              <label className="cl-fl">
                Accepted file types
                <input className="cl-inp" value={form.allowedFileTypes} onChange={(e) => set('allowedFileTypes', e.target.value)} />
                <span className="text-[12.5px]">MIME types, comma separated</span>
              </label>
            )}
          </div>

          <div>
            <div className="cl-flab">Students may hand in</div>
            {MODES.map((m) => {
              // `D-48` (b): an upload mode needs file storage on this server.
              // The server refuses it regardless; this avoids offering it. A mode
              // already on the task stays shown and can be unticked.
              const needsStorage = m.value !== 'doc_link';
              const blocked = needsStorage && !(uploadConfig?.enabled ?? false) && !form.submissionModes.includes(m.value);
              return (
                <label key={m.value} className="cl-grow cursor-pointer py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    disabled={blocked}
                    checked={form.submissionModes.includes(m.value)}
                    onChange={(e) =>
                      set('submissionModes', e.target.checked ? [...form.submissionModes, m.value] : form.submissionModes.filter((x) => x !== m.value))
                    }
                  />
                  <span className="cl-grow-main" style={blocked ? { color: 'var(--cl-muted)' } : undefined}>
                    {m.label}
                    {blocked && <span className="cl-sub">Needs file storage on this server</span>}
                  </span>
                </label>
              );
            })}
            {form.submissionModes.length === 0 && (
              <p className="cl-muted m-0 px-2 text-[12.5px]">None ticked: students hand in a link and/or a typed answer, as before.</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.allowResubmission}
              aria-label="Allow resubmission"
              className="cl-sw"
              onClick={() => set('allowResubmission', !form.allowResubmission)}
            >
              <span />
            </button>
            <span className="text-[14.5px]">Allow resubmission</span>
          </div>

          {canChooseMarker ? (
            <label className="cl-fl">
              Marked by
              <select className="cl-inp" value={form.markerId} onChange={(e) => set('markerId', e.target.value)}>
                {markerOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {task?.markerDrift && (
                <span className="text-[12.5px]" style={{ color: 'var(--cl-warn)' }}>
                  This marker no longer reaches every group the task is set for.
                </span>
              )}
            </label>
          ) : (
            <p className="cl-muted m-0 text-[14px]">
              Marked by {task?.markerName ?? 'whoever opens it first'}
              {task?.markerDrift && <span style={{ color: 'var(--cl-warn)' }}> · marker no longer reaches every group</span>}
            </p>
          )}

          <hr className="cl-hr" />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="cl-btnp cl-btnp--lg"
              disabled={busy !== null || !form.title.trim() || !form.courseId || form.groupIds.length === 0 || !attachmentsReady}
              onClick={save}
            >
              {busy === 'save' ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
            {!task && (
              <button
                type="button"
                className="cl-btns"
                disabled={busy !== null || !form.title.trim() || !form.courseId || !attachmentsReady}
                onClick={saveAsDraft}
              >
                {busy === 'draft' ? 'Saving…' : 'Save as draft'}
              </button>
            )}
            {form.draftId && !task && <span className="cl-muted text-[13px]">Started from a draft</span>}
            {!attachmentsReady && (
              <span className="text-[13.5px]" style={{ color: 'var(--cl-warn)' }}>
                Choose who each attachment is for before saving.
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** The artifact's pill segmented control, with a disabled state the shared one lacks. */
function Seg({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cl-segf" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
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
  headingId,
}: {
  attachments: AttachmentRow[];
  onChange: (next: AttachmentRow[]) => void;
  uploadsEnabled: boolean;
  acceptTypes: readonly string[];
  headingId?: string;
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
    <>
      <PanelHead id={headingId} title="Attachments" small />
      <p className="cl-muted -mt-2 mb-3 text-[13.5px]">Staff-only attachments never reach a student&apos;s task page.</p>
      {error && (
        <p role="alert" className="m-0 mb-3 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
          {error}
        </p>
      )}
      {attachments.length === 0 && <p className="cl-muted m-0 mb-3 text-[14px]">None.</p>}
      {attachments.map((a, index) => (
        <div key={index} className="cl-chip-row flex-wrap">
          <ClIcon name={a.mimeType ? 'file' : 'link'} small />
          <input
            aria-label="Attachment name"
            placeholder="Name"
            className="cl-inp min-w-[140px] flex-1"
            value={a.name}
            onChange={(e) => update(index, { name: e.target.value })}
          />
          <input
            aria-label="Attachment link"
            placeholder="https://"
            className="cl-inp min-w-[200px] flex-[2]"
            value={a.url}
            onChange={(e) => update(index, { url: e.target.value })}
          />
          <select
            aria-label="Visible to"
            className="cl-inp"
            value={a.audience}
            onChange={(e) => update(index, { audience: e.target.value as AttachmentAudience | '' })}
            style={a.audience === '' && hasContent(a) ? { borderColor: 'var(--cl-warn)' } : undefined}
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="cl-glink cl-glink--danger" onClick={() => onChange(attachments.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="cl-btns"
          disabled={attachments.length >= 10}
          onClick={() => onChange([...attachments, { url: '', name: '', audience: '' }])}
        >
          <ClIcon name="plus" small />
          Add a link
        </button>
        {uploadsEnabled && (
          <>
            <input ref={input} type="file" className="sr-only" id="attachment-upload" accept={acceptTypes.join(',')} onChange={pick} />
            <button type="button" className="cl-btns" disabled={uploading || attachments.length >= 10} onClick={() => input.current?.click()}>
              <ClIcon name="upload" small />
              {uploading ? 'Uploading…' : 'Upload a file'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Confirm-and-delete for a task, shared by the list and the detail page.
 * `DELETE /staff/assessments/:id` removes the task for every group it is set
 * for. The server refuses (409) once anything has been handed in or answered
 * on its external form, and its own message is shown when it does.
 */
export function DeleteTaskModal({
  task,
  onClose,
  onDeleted,
}: {
  task: { id: string; title: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.deleteAssessment(token, task.id);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete this task.');
      setBusy(false);
    }
  }

  return (
    <ClModal
      open
      title="Delete this task?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="cl-btnp" style={{ background: 'var(--cl-bad)' }} disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete task'}
          </button>
        </>
      }
    >
      <p className="m-0 text-[14.5px]">
        &ldquo;{task.title}&rdquo; will be removed for every group it is set for, and students will no longer see it.
        A task that already has work handed in cannot be deleted; the server will refuse and say so.
      </p>
      {error && (
        <p role="alert" className="m-0 mt-3 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
          {error}
        </p>
      )}
    </ClModal>
  );
}
