'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { GroupSummary, LearningMode, StaffCourseSummary } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Tag,
  TextInput,
} from '@/components/ui';
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
      <PageTitle title="Groups" />
      <div className="flex flex-col gap-4 p-6">
        <p className="text-base text-fg-3">
          A group is a class of students. A course is taught to one or more of them.
        </p>
        <CreateGroup onCreated={reload} />

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading groups" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}

        {data && data.length === 0 && (
          <EmptyState
            icon="Hierarchy2"
            title="No groups yet"
            description={
              'Create one above, then add the courses it studies. Students ' +
              'who enrol but sit in no group are set no work, so a course ' +
              'with no groups shows its students an empty page.'
            }
          />
        )}

        {data?.map((group) => (
          <GroupPanel key={group.id} group={group} courses={courses.data ?? []} onChanged={reload} />
        ))}
      </div>
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
      setError(err instanceof ApiError ? err.message : 'Could not create that group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New group">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Name"
            id="group-name"
            className="min-w-[260px] flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="IGCSE Chemistry — Saturday 18:00"
            hint="How Dr. Tahir tells one cohort from another — a subject, a day and a time."
            maxLength={120}
            required
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? <Loader size={3} label="Creating" /> : 'Create group'}
          </Button>
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      </form>
    </Panel>
  );
}

const MODE_OPTIONS: { value: LearningMode; label: string }[] = [
  { value: 'recorded', label: 'Recorded' },
  { value: 'live', label: 'Live' },
];

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
      await api.admin.addGroupCourse(token, group.id, { courseId, learningMode: mode });
      setCourseId('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that course.');
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
      setError(err instanceof ApiError ? err.message : 'Could not remove that course.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={group.name}
      action={
        <div className="flex items-center gap-2">
          <Tag tone="gray">
            {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
          </Tag>
          <span className="text-xs text-fg-3">created {formatDate(group.createdAt)}</span>
        </div>
      }
    >
      {error && <InlineBanner tone="danger" className="mb-4">{error}</InlineBanner>}

      <h3 className="mb-2 text-xs font-medium text-fg-2">Studying</h3>
      {group.courses.length === 0 ? (
        <p className="mb-4 text-base text-fg-3">
          Nothing yet. A group with no course has members but no lessons, no timetable and no work.
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-border-light">
          {group.courses.map((pairing) => {
            const course = courses.find((c) => c.id === pairing.courseId);
            return (
              <li
                key={pairing.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <Link
                    href={`/manage/courses/${pairing.courseId}/groups`}
                    className="text-base text-fg underline-offset-2 hover:underline"
                  >
                    {course?.title ?? pairing.courseId}
                  </Link>
                  {/* §5.2 — the mode belongs to this pairing, not to a student. */}
                  <Tag tone={pairing.learningMode === 'live' ? 'violet' : 'gray'}>
                    {pairing.learningMode === 'live' ? 'Live' : 'Recorded'}
                  </Tag>
                </span>
                <Button variant="tertiary" size="small" disabled={busy} onClick={() => removeCourse(pairing.courseId)}>
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {addable.length > 0 && (
        <form onSubmit={addCourse} className="flex flex-wrap items-end gap-3">
          <Select
            label="Add a course"
            id={`course-${group.id}`}
            className="min-w-[220px]"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={[
              { value: '', label: 'Choose a course…' },
              ...addable.map((course) => ({ value: course.id, label: course.title })),
            ]}
          />
          <Select
            label="Taught as"
            id={`mode-${group.id}`}
            className="min-w-[160px]"
            hint="Decides which dashboard this group's students see."
            value={mode}
            onChange={(e) => setMode(e.target.value as LearningMode)}
            options={MODE_OPTIONS}
          />
          <Button type="submit" disabled={busy || !courseId}>
            Add course
          </Button>
        </form>
      )}

      <p className="mt-3 text-xs text-fg-3">
        Adding a course here enrols nobody. Students enrol separately; placing them in this group
        decides which cohort they sit in and what work they are set.
      </p>
    </Panel>
  );
}
