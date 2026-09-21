'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AuthoredAssessment, GroupSummary } from '@/lib/types';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  SectionTitle,
  Select,
  Tag,
  TextArea,
  TextInput,
} from '@/components/ui';

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

  const list = useApi((t) => api.staff.assessments(t, courseId), [courseId]);
  const groups = useApi((t) => api.staff.courseGroups(t, courseId), [courseId]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <SectionTitle
        title="Work"
        description="Homework, assignments and quizzes — written once, set for the groups you choose."
      />
      {groups.data && groups.data.length === 0 ? (
        <EmptyState
          icon="Hierarchy2"
          title="No groups on this course"
          description={
            'Work is set for a group, so a course with no groups has nobody ' +
            'to set it for. Add a group to this course first.'
          }
        />
      ) : (
        groups.data && <NewAssessment courseId={courseId} groups={groups.data} onCreated={list.reload} />
      )}

      {(list.loading || groups.loading) && (
        <div className="flex justify-center p-8">
          <Loader label="Loading work" />
        </div>
      )}
      {list.error && (
        <EmptyState
          icon="AlertTriangle"
          title={list.error.message}
          action={<Button onClick={list.reload}>Try again</Button>}
        />
      )}

      {list.data && list.data.length === 0 && !list.loading && (
        <EmptyState
          icon="ListDetails"
          title="Nothing set yet"
          description="Tasks you create appear here, with the groups each one was set for."
        />
      )}

      {list.data && list.data.length > 0 && (
        <Panel title="Set so far">
          <ul className="flex flex-col gap-3">
            {list.data.map((assessment) => (
              <AssessmentRow
                key={assessment.id}
                assessment={assessment}
                groups={groups.data ?? []}
                onChanged={list.reload}
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** `datetime-local` gives `2026-09-01T18:00`; the API wants a real instant. */
const toIso = (local: string) => new Date(local).toISOString();

const TYPE_OPTIONS = [
  { value: 'homework', label: 'Homework' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
] as const;

function NewAssessment({
  courseId,
  groups,
  onCreated,
}: {
  courseId: string;
  groups: GroupSummary[];
  onCreated: () => void;
}) {
  const { token } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [type, setType] = useState<'homework' | 'assignment' | 'quiz'>('assignment');
  const [maxScore, setMaxScore] = useState(20);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableTo, setAvailableTo] = useState('');
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
        availableTo: toIso(availableTo),
        dueAt: toIso(dueAt),
        maxScore,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 10 * 1024 * 1024,
        targets: targets.map((groupId) => ({ groupId })),
      });
      setTitle('');
      setDescription('');
      setInstructions('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not set that work. Check the dates and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Set new work
        </Button>
      </div>
    );
  }

  return (
    <Panel
      title="Set new work"
      action={
        <Button variant="tertiary" size="small" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextInput label="Title" id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Type"
            id="a-type"
            hint="A quiz is a submission with a mark today; the question engine is not built yet."
            value={type}
            onChange={(e) => setType(e.target.value as 'homework' | 'assignment' | 'quiz')}
            options={TYPE_OPTIONS}
          />
          <TextInput
            label="Marks available"
            id="a-score"
            type="number"
            min={1}
            max={1000}
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value))}
            required
          />
        </div>

        <TextInput
          label="Short description"
          id="a-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />

        <TextArea
          label="Instructions"
          id="a-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={5000}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Opens"
            id="a-from"
            type="datetime-local"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
            required
          />
          <TextInput
            label="Due"
            id="a-due"
            type="datetime-local"
            hint="Must fall inside the open window."
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            required
          />
          <TextInput
            label="Closes"
            id="a-to"
            type="datetime-local"
            hint="After this, students can no longer submit."
            value={availableTo}
            onChange={(e) => setAvailableTo(e.target.value)}
            required
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-fg-2">Set for</legend>
          <p className="text-xs text-fg-3">
            One task, aimed at the groups you pick. Students in no selected group will not see it at all.
          </p>
          <div className="flex flex-wrap gap-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center gap-2 rounded-md border border-border-light px-3 py-2 text-base text-fg-2"
              >
                <Checkbox checked={targets.includes(group.id)} onChange={() => toggle(group.id)} label={group.name} />
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-inherit"
                >
                  {group.name}
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={targets.length === 0 || !title.trim() || busy}>
            {busy ? <Loader size={3} label="Setting work" /> : 'Set work'}
          </Button>
          {targets.length === 0 && <span className="text-xs text-fg-3">Pick at least one group.</span>}
        </div>
      </form>
    </Panel>
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

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border-light px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base text-fg">{assessment.title}</span>
          <Tag tone={assessment.type === 'quiz' ? 'blue' : 'gray'}>{assessment.type}</Tag>
          <span className="text-xs text-fg-3">
            due {formatDate(assessment.dueAt)} · {assessment.maxScore} marks
          </span>
        </span>
        <Button variant="tertiary" size="small" onClick={remove} disabled={busy}>
          {busy ? <Loader size={3} label="Deleting" /> : 'Delete'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-3">Set for</span>
        {assessment.targets.length === 0 ? (
          <Tag tone="amber">nobody — invisible to students</Tag>
        ) : (
          assessment.targets.map((target) => (
            <Tag key={target.id} tone="blue">
              {nameOf(target.groupId)}
              {target.dueAt ? ` · due ${formatDate(target.dueAt)}` : ''}
            </Tag>
          ))
        )}
      </div>

      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
    </li>
  );
}
