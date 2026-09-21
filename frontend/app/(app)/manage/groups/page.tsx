'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Assistant, GroupSummary, StaffCourseSummary } from '@/lib/types';
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
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * Groups: create one, name it, and decide what it studies (CLAUDE.md §5.16).
 *
 * **Admin only, and that is a deliberate narrow reading.** The client's
 * instruction covered *placement* explicitly — "the assistants and teachers can
 * add to specific group" — and said nothing about who creates a group, so
 * creation shipped teacher-only, the same call made for live-session
 * scheduling (§11). A TA reaches placement through a course's Groups tab.
 *
 * The mental model this screen has to teach: **a group is a class of
 * students studying one course** (migration 013) — not a subdivision, and
 * several groups can study the same course. Naming a course on a group
 * enrols nobody; `Enrollment` stays the access gate, which is what keeps
 * payment out of this surface entirely.
 */
export default function GroupsPage() {
  const { data, error, loading, reload } = useApi((t) => api.admin.groups(t), []);
  const courses = useApi((t) => api.staff.courses(t), []);
  const assistants = useApi((t) => api.admin.assistants(t), []);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = data?.find((g) => g.id === editingId) ?? null;

  return (
    <>
      <PageTitle title="Groups" />
      <div className="flex flex-col gap-4 p-6">
        <p className="text-base text-fg-3">
          A group is a class of students, studying one course.
        </p>

        <CreateGroup courses={courses.data ?? []} onCreated={reload} />

        {editing && (
          <EditGroup
            group={editing}
            courses={courses.data ?? []}
            assistants={(assistants.data ?? []).filter((a) => a.role === 'assistant')}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              reload();
            }}
          />
        )}

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
            description="Create one above. A group with no members has been set no work."
          />
        )}

        {data && data.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.map((group) => {
              const course = (courses.data ?? []).find((c) => c.id === group.courseId);
              return (
                <div
                  key={group.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-light px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-medium text-fg">{group.name}</span>
                    <span className="text-xs text-fg-3">
                      <Link
                        href={`/manage/courses/${group.courseId}/groups`}
                        className="underline-offset-2 hover:underline"
                      >
                        {course?.title ?? group.courseId}
                      </Link>
                      {group.meets && <> · {group.meets}</>}
                      {group.room && <> · {group.room}</>}
                      {' · created '}
                      {formatDate(group.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone="gray">
                      {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
                    </Tag>
                    <Link
                      href={`/manage/groups/${group.id}/report`}
                      className="text-base text-fg-2 underline-offset-2 hover:underline"
                    >
                      Report
                    </Link>
                    <Button size="small" onClick={() => setEditingId(group.id)}>
                      Edit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function CreateGroup({
  courses,
  onCreated,
}: {
  courses: StaffCourseSummary[];
  onCreated: () => void;
}) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !name.trim() || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.createGroup(token, { name: name.trim(), courseId });
      setName('');
      setCourseId('');
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
          <Select
            label="Course"
            id="group-course"
            className="min-w-[220px]"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={[
              { value: '', label: 'Choose a course…' },
              ...courses.map((c) => ({ value: c.id, label: c.title })),
            ]}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || !courseId}>
            {busy ? <Loader size={3} label="Creating" /> : 'Create group'}
          </Button>
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      </form>
    </Panel>
  );
}

function EditGroup({
  group,
  courses,
  assistants,
  onClose,
  onSaved,
}: {
  group: GroupSummary;
  courses: StaffCourseSummary[];
  assistants: Assistant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [name, setName] = useState(group.name);
  const [courseId, setCourseId] = useState(group.courseId);
  const [assistantId, setAssistantId] = useState(group.assistantId ?? '');
  const [meets, setMeets] = useState(group.meets ?? '');
  const [room, setRoom] = useState(group.room ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateGroup(token, group.id, {
        name: name.trim(),
        courseId,
        assistantId: assistantId || null,
        meets: meets.trim() || null,
        room: room.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this group.');
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Edit ${group.name}`}
      action={
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        {group.memberCount > 0 && (
          <p className="text-xs text-fg-3">
            This group has {group.memberCount} member{group.memberCount === 1 ? '' : 's'} —
            changing its course is refused while they would be left enrolled on the old one.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Name"
            className="min-w-[240px] flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
          <Select
            label="Course"
            className="min-w-[200px]"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
          />
          <Select
            label="Assistant"
            className="min-w-[200px]"
            hint="Display only — grants no access."
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            options={[
              { value: '', label: 'None' },
              ...assistants.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Meets"
            className="min-w-[200px]"
            value={meets}
            onChange={(e) => setMeets(e.target.value)}
            placeholder="Saturday 18:00"
            maxLength={120}
          />
          <TextInput
            label="Room"
            className="min-w-[160px]"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            maxLength={80}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
