'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { GroupSummary, LearningMode, StaffCourseSummary } from '@/lib/types';
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
import { UsersFourIcon } from '@phosphor-icons/react';
import { PageBody } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';

/**
 * Groups: create one, name it, and decide what it studies (CLAUDE.md §5.16).
 *
 * **Admin only, and that is a deliberate narrow reading.** The client's
 * instruction covered *placement* explicitly — "the assistants and teachers can
 * add to specific group" — and said nothing about who creates a group, so
 * creation shipped teacher-only, the same call made for live-session
 * scheduling (§11). A TA reaches placement through a course's Groups tab.
 *
 * The mental model this screen has to teach, because it is the thing everyone
 * gets wrong first: **a group is a class of students, not a subdivision of a
 * course.** It has no course until one is added, several groups can study the
 * same course, and adding a course to a group **enrolls nobody** — enrollment
 * stays separate, which is what keeps payment out of this surface entirely.
 */
export default function GroupsPage() {
  const { data, error, loading, reload } = useApi((t) => api.admin.groups(t), []);
  const courses = useApi((t) => api.staff.courses(t), []);

  return (
    <>
      <PageTitle icon={UsersFourIcon} title="Groups" />
      {/* Density, but not the object-table idiom the other console screens
          took (TASK 4). A group here is not a uniform record in a list: each
          one carries an editable set of course pairings with a per-row action
          and an add form, which a flat 32px row cannot hold. Turning this into
          Twenty's shape properly means splitting it into a table at
          `/manage/groups` and a record page at `/manage/groups/[id]` - a
          routing change, not a styling one, so it is not smuggled in here. */}
      <PageBody dense className="flex flex-col gap-[var(--sp-2)]">
        <div className="flex h-[var(--topbar-h)] items-center px-[var(--sp-2)]">
          <span className="text-[var(--fs-base)] text-fg-3">
            A group is a class of students. A course is taught to one or more of them.
          </span>
        </div>
        <CreateGroup onCreated={reload} />

        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && data.length === 0 && (
          <Panel bodyClassName="">
            <EmptyState
              title="No groups yet"
              body={
                'Create one above, then add the courses it studies. Students ' +
                'who enrol but sit in no group are set no work, so a course ' +
                'with no groups shows its students an empty page.'
              }
            />
          </Panel>
        )}

        {data?.map((group) => (
          <GroupPanel
            key={group.id}
            group={group}
            courses={courses.data ?? []}
            onChanged={reload}
          />
        ))}
      </PageBody>
    </>
  );
}

function CreateGroup({ onCreated }: { onCreated: () => void }) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.createGroup(token, name.trim());
      setName('');
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create that group.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New group">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-[var(--sp-3)]">
        <div className="min-w-[260px] flex-1">
          <Field
            label="Name"
            htmlFor="group-name"
            hint="How Dr. Tahir tells one cohort from another — a subject, a day and a time."
          >
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="IGCSE Chemistry — Saturday 18:00"
              maxLength={120}
              required
            />
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
          Create group
        </Button>
      </form>
      {error && <FormError>{error}</FormError>}
    </Panel>
  );
}

function GroupPanel({
  group,
  courses,
  onChanged,
}: {
  group: GroupSummary;
  courses: StaffCourseSummary[];
  onChanged: () => void;
}) {
  const { token } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const studying = new Set(group.courses.map((c) => c.courseId));
  const addable = courses.filter((course) => !studying.has(course.id));

  const [courseId, setCourseId] = useState('');
  const [mode, setMode] = useState<LearningMode>('recorded');

  const addCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.addGroupCourse(token, group.id, {
        courseId,
        learningMode: mode,
      });
      setCourseId('');
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not add that course.',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (id: string) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.removeGroupCourse(token, group.id, id);
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not remove that course.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={group.name}
      action={
        <div className="flex items-center gap-[var(--sp-2)]">
          <Chip>
            {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
          </Chip>
          <span className="text-[var(--fs-xs)] text-fg-3">
            created {formatDate(group.createdAt)}
          </span>
        </div>
      }
    >
      {error && <FormError>{error}</FormError>}

      <h3 className="mb-[var(--sp-2)] text-[var(--fs-xs)] font-medium text-fg-2">
        Studying
      </h3>
      {group.courses.length === 0 ? (
        <p className="mb-[var(--sp-4)] text-[var(--fs-base)] text-fg-3">
          Nothing yet. A group with no course has members but no lessons, no
          timetable and no work.
        </p>
      ) : (
        <ul className="mb-[var(--sp-4)] rows">
          {group.courses.map((pairing) => {
            const course = courses.find((c) => c.id === pairing.courseId);
            return (
              <li
                key={pairing.id}
                className="flex min-h-[var(--h-md)] flex-wrap items-center justify-between gap-[var(--sp-3)] px-[var(--sp-2)]"
              >
                <span className="flex items-center gap-[var(--sp-2)]">
                  <Link
                    href={`/manage/courses/${pairing.courseId}/groups`}
                    className="text-[var(--fs-base)] text-fg underline-offset-2 hover:underline"
                  >
                    {course?.title ?? pairing.courseId}
                  </Link>
                  {/* §5.2 — the mode belongs to this pairing, not to a student. */}
                  <Chip tone={pairing.learningMode === 'live' ? 'violet' : 'neutral'}>
                    {pairing.learningMode === 'live' ? 'Live' : 'Recorded'}
                  </Chip>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => removeCourse(pairing.courseId)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {addable.length > 0 && (
        <form onSubmit={addCourse} className="flex flex-wrap items-end gap-[var(--sp-3)]">
          <div className="min-w-[220px]">
            <Field label="Add a course" htmlFor={`course-${group.id}`}>
              <Select
                id={`course-${group.id}`}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                <option value="">Choose a course…</option>
                {addable.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-[160px]">
            <Field
              label="Taught as"
              htmlFor={`mode-${group.id}`}
              hint="Decides which dashboard this group's students see."
            >
              <Select
                id={`mode-${group.id}`}
                value={mode}
                onChange={(e) => setMode(e.target.value as LearningMode)}
              >
                <option value="recorded">Recorded</option>
                <option value="live">Live</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={busy || !courseId}>
            Add course
          </Button>
        </form>
      )}

      <p className="mt-[var(--sp-3)] text-[var(--fs-xs)] text-fg-3">
        Adding a course here enrols nobody. Students enrol separately; placing
        them in this group decides which cohort they sit in and what work they
        are set.
      </p>
    </Panel>
  );
}
