'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AuthoredAssessment, GroupSummary } from '@/lib/types';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClSkeleton, PanelHead } from '@/components/classroom/ui';

/**
 * Setting work (CLAUDE.md §5.18) and choosing who it is for (§5.16).
 *
 * **A TA can use this**, which the client settled on 2026-09-10 against the
 * prototype's narrower preset — assignments *and* quizzes, one rule, no
 * branching on the task's type.
 *
 * The idea the form has to carry is that a task is written **once** and aimed
 * at one or more groups. It is not copied per group, which is why "the average
 * for this assignment" stays one number across every student who was set it.
 * Choosing no group is refused by the API and by this form: a task set for
 * nobody is invisible to everybody, and the right time to find that out is now
 * rather than on the due date.
 */
export default function CourseAssessmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const [open, setOpen] = useState(false);

  const list = useApi((t) => api.staff.assessments(t, courseId), [courseId]);
  const groups = useApi((t) => api.staff.courseGroups(t, courseId), [courseId]);

  const noGroups = groups.data && groups.data.length === 0;

  return (
    <>
      <section aria-labelledby="wk-h" className="cl-panel pb-4">
        <PanelHead id="wk-h" title="Work">
          {groups.data && groups.data.length > 0 && (
            <button type="button" className="cl-btnp" onClick={() => setOpen(true)}>
              <ClIcon name="plus" small />
              Set new work
            </button>
          )}
        </PanelHead>
        <p className="cl-muted -mt-2 mb-3 px-2 text-[13.5px]">
          Assignments and quizzes — written once, set for the groups you choose.
        </p>

        {noGroups && (
          <ClEmpty
            icon="groups"
            tone="cl-tone-blue"
            title="No groups on this course"
            hint={
              'Work is set for a group, so a course with no groups has nobody ' +
              'to set it for. Add a group to this course first.'
            }
          />
        )}
        {(list.loading || groups.loading) && !list.data && <ClSkeleton rows={3} label="Loading work" />}
        {list.error && <ClError message={list.error.message} onRetry={list.reload} />}
        {list.data && list.data.length === 0 && !list.loading && !noGroups && (
          <ClEmpty
            icon="tasks"
            tone="cl-tone-blue"
            title="Nothing set yet"
            hint="Tasks you create appear here, with the groups each one was set for."
          />
        )}
        {list.data?.map((assessment) => (
          <AssessmentRow key={assessment.id} assessment={assessment} groups={groups.data ?? []} onChanged={list.reload} />
        ))}
      </section>

      {open && groups.data && (
        <NewAssessment
          courseId={courseId}
          groups={groups.data}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

/** `datetime-local` gives `2026-09-01T18:00`; the API wants a real instant. */
const toIso = (local: string) => new Date(local).toISOString();

// Homework is retired for new work.
const TYPE_OPTIONS = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
] as const;

function NewAssessment({
  courseId,
  groups,
  onClose,
  onCreated,
}: {
  courseId: string;
  groups: GroupSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [type, setType] = useState<'homework' | 'assignment' | 'quiz'>('assignment');
  const [maxScore, setMaxScore] = useState(20);
  const [availableFrom, setAvailableFrom] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [targets, setTargets] = useState<string[]>(
    // One group is the common case, so pre-select it rather than making the
    // teacher discover that an empty selection is refused.
    groups.length === 1 ? [groups[0].id] : [],
  );

  const toggle = (groupId: string) =>
    setTargets((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.createAssessment(token, courseId, {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        type,
        availableFrom: toIso(availableFrom),
        // The API requires it; tasks no longer auto-close, so a far-future instant.
        availableTo: '2099-12-31T23:59:59.000Z',
        dueAt: toIso(dueAt),
        maxScore,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 10 * 1024 * 1024,
        targets: targets.map((groupId) => ({ groupId })),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not set that work. Check the dates and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClModal
      open
      wide
      title="Set new work"
      onClose={onClose}
      footer={
        <>
          {targets.length === 0 && <span className="cl-muted me-auto text-[13px]">Pick at least one group.</span>}
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="assessment-form"
            className="cl-btnp"
            disabled={targets.length === 0 || !title.trim() || busy}
          >
            {busy ? 'Setting work…' : 'Set work'}
          </button>
        </>
      }
    >
      <form id="assessment-form" onSubmit={submit} className="cl-fgrid">
        <label className="cl-fl">
          Title
          <input className="cl-inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </label>
        <div className="cl-f2">
          <label className="cl-fl">
            Type
            <select
              className="cl-inp"
              value={type}
              onChange={(e) => setType(e.target.value as 'homework' | 'assignment' | 'quiz')}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cl-fl">
            Marks available
            <input
              className="cl-inp"
              type="number"
              min={1}
              max={1000}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              required
            />
          </label>
        </div>
        {type === 'quiz' && (
          <p className="cl-muted m-0 text-[13px]">
            A quiz is a submission with a mark today; the question engine is not built yet.
          </p>
        )}
        <label className="cl-fl">
          Short description
          <input className="cl-inp" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </label>
        <label className="cl-fl">
          Instructions
          <textarea
            className="cl-inp"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={5000}
          />
        </label>
        <div className="cl-f2">
          <label className="cl-fl">
            Opens
            <input className="cl-inp" type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} required />
          </label>
          <label className="cl-fl">
            Due (inside the open window)
            <input className="cl-inp" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
          </label>
        </div>
        <fieldset className="m-0 border-0 p-0">
          <legend className="cl-flab">
            Set for — one task, aimed at the groups you pick. Students in no selected group will not see it.
          </legend>
          <div className="cl-chips">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={targets.includes(group.id)}
                className={targets.includes(group.id) ? 'cl-chip on' : 'cl-chip'}
                onClick={() => toggle(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <div role="alert" className="cl-soft" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
      </form>
    </ClModal>
  );
}

function AssessmentRow({
  assessment,
  groups,
  onChanged,
}: {
  assessment: AuthoredAssessment;
  groups: GroupSummary[];
  onChanged: () => void;
}) {
  const { token } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOf = (groupId: string) => groups.find((group) => group.id === groupId)?.name ?? groupId;

  const remove = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.deleteAssessment(token, assessment.id);
      onChanged();
    } catch (err) {
      // The API refuses once anything has been submitted, and its message says
      // why. Surfacing that verbatim is better than inventing a softer one.
      setError(err instanceof ApiError ? err.message : 'Could not delete that task.');
    } finally {
      setBusy(false);
    }
  };

  const quiz = assessment.type === 'quiz';
  const setFor =
    assessment.targets.length === 0
      ? null
      : assessment.targets
          .map((t) => `${nameOf(t.groupId)}${t.dueAt ? ` (due ${formatDate(t.dueAt)})` : ''}`)
          .join(' · ');

  return (
    <div className="cl-grow" style={{ cursor: 'default' }}>
      <span className={quiz ? 'cl-ic40 cl-tone-blue' : 'cl-ic40 cl-tone-peach'}>
        <ClIcon name={quiz ? 'quiz' : 'pen'} small />
      </span>
      <span className="cl-grow-main">
        <span className="block truncate">{assessment.title}</span>
        <span className="cl-sub">
          {assessment.type} · due {formatDate(assessment.dueAt)} · {assessment.maxScore} marks ·{' '}
          {setFor ? (
            <>Set for {setFor}</>
          ) : (
            <span style={{ color: 'var(--cl-warn)' }}>set for nobody — invisible to students</span>
          )}
        </span>
        {error && (
          <span role="alert" className="mt-1 block text-[13px]" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </span>
        )}
      </span>
      <button type="button" className="cl-glink cl-glink--danger" onClick={() => void remove()} disabled={busy}>
        {busy ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
