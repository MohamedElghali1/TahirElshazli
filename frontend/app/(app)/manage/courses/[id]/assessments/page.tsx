'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AuthoredAssessment, GroupSummary } from '@/lib/types';
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
  Textarea,
} from '@/components/ui';
import {
  ManageCourseTabs,
  PageBody,
  PageHeader,
} from '@/components/app/page-parts';

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
export default function CourseAssessmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = use(params);
  const { user } = useSession();
  const admin = user?.role === 'teacher';

  const list = useApi((t) => api.staff.assessments(t, courseId), [courseId]);
  const groups = useApi((t) => api.staff.courseGroups(t, courseId), [courseId]);

  return (
    <>
      <PageHeader
        title="Work"
        subtitle="Homework, assignments and quizzes — written once, set for the groups you choose."
      />
      <ManageCourseTabs courseId={courseId} admin={admin} />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        {groups.data && groups.data.length === 0 ? (
          <Panel bodyClassName="">
            <EmptyState
              title="No groups on this course"
              body={
                'Work is set for a group, so a course with no groups has nobody ' +
                'to set it for. Add a group to this course first.'
              }
            />
          </Panel>
        ) : (
          groups.data && (
            <NewAssessment
              courseId={courseId}
              groups={groups.data}
              onCreated={list.reload}
            />
          )
        )}

        {(list.loading || groups.loading) && <RowsSkeleton rows={4} />}
        {list.error && (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        )}

        {list.data && list.data.length === 0 && !list.loading && (
          <Panel bodyClassName="">
            <EmptyState
              title="Nothing set yet"
              body="Tasks you create appear here, with the groups each one was set for."
            />
          </Panel>
        )}

        {list.data && list.data.length > 0 && (
          <Panel title="Set so far">
            <ul className="flex flex-col gap-[var(--sp-3)]">
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
      </PageBody>
    </>
  );
}

/** `datetime-local` gives `2026-09-01T18:00`; the API wants a real instant. */
const toIso = (local: string) => new Date(local).toISOString();

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
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
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
        err instanceof ApiError
          ? err.message
          : 'Could not set that work. Check the dates and try again.',
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
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-[var(--sp-4)]">
        <Field label="Title" htmlFor="a-title">
          <Input
            id="a-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </Field>

        <div className="grid gap-[var(--sp-4)] sm:grid-cols-2">
          <Field
            label="Type"
            htmlFor="a-type"
            hint="A quiz is a submission with a mark today; the question engine is not built yet."
          >
            <Select
              id="a-type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'homework' | 'assignment' | 'quiz')
              }
            >
              <option value="homework">Homework</option>
              <option value="assignment">Assignment</option>
              <option value="quiz">Quiz</option>
            </Select>
          </Field>
          <Field label="Marks available" htmlFor="a-score">
            <Input
              id="a-score"
              type="number"
              min={1}
              max={1000}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <Field label="Short description" htmlFor="a-desc">
          <Input
            id="a-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </Field>

        <Field label="Instructions" htmlFor="a-instructions">
          <Textarea
            id="a-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={5000}
          />
        </Field>

        <div className="grid gap-[var(--sp-4)] sm:grid-cols-3">
          <Field label="Opens" htmlFor="a-from">
            <Input
              id="a-from"
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Due"
            htmlFor="a-due"
            hint="Must fall inside the open window."
          >
            <Input
              id="a-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Closes"
            htmlFor="a-to"
            hint="After this, students can no longer submit."
          >
            <Input
              id="a-to"
              type="datetime-local"
              value={availableTo}
              onChange={(e) => setAvailableTo(e.target.value)}
              required
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-[var(--sp-2)]">
          <legend className="text-[var(--fs-xs)] font-medium text-[var(--fg-secondary)]">
            Set for
          </legend>
          <p className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            One task, aimed at the groups you pick. Students in no selected
            group will not see it at all.
          </p>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {groups.map((group) => {
              const selected = targets.includes(group.id);
              return (
                <label
                  key={group.id}
                  className={
                    'flex cursor-pointer items-center gap-[var(--sp-2)] rounded-[var(--r-md)] ' +
                    'border px-[var(--sp-3)] py-[var(--sp-2)] text-[var(--fs-base)] ' +
                    (selected
                      ? 'border-[var(--accent)] text-[var(--fg-primary)]'
                      : 'border-[var(--border-light)] text-[var(--fg-secondary)]')
                  }
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(group.id)}
                    className="accent-[var(--accent)]"
                  />
                  {group.name}
                </label>
              );
            })}
          </div>
        </fieldset>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center gap-[var(--sp-3)]">
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={targets.length === 0 || !title.trim()}
          >
            Set work
          </Button>
          {targets.length === 0 && (
            <span className="text-[var(--fs-sm)] text-[var(--fg-tertiary)]">
              Pick at least one group.
            </span>
          )}
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
  const nameOf = (groupId: string) =>
    groups.find((group) => group.id === groupId)?.name ?? groupId;

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
      setError(
        err instanceof ApiError ? err.message : 'Could not delete that task.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--border-light)] px-[var(--sp-3)] py-[var(--sp-3)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-3)]">
        <span className="flex flex-wrap items-center gap-[var(--sp-2)]">
          <span className="text-[var(--fs-base)] text-[var(--fg-primary)]">
            {assessment.title}
          </span>
          <Chip tone={assessment.type === 'quiz' ? 'teal' : 'neutral'}>
            {assessment.type}
          </Chip>
          <span className="text-[var(--fs-sm)] text-[var(--fg-tertiary)]">
            due {formatDate(assessment.dueAt)} · {assessment.maxScore} marks
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
        <span className="text-[var(--fs-sm)] text-[var(--fg-tertiary)]">
          Set for
        </span>
        {assessment.targets.length === 0 ? (
          <Chip tone="amber">nobody — invisible to students</Chip>
        ) : (
          assessment.targets.map((target) => (
            <Chip key={target.id} tone="blue">
              {nameOf(target.groupId)}
              {target.dueAt ? ` · due ${formatDate(target.dueAt)}` : ''}
            </Chip>
          ))
        )}
      </div>

      {error && <FormError>{error}</FormError>}
    </li>
  );
}
