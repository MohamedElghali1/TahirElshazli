'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StaffTask, StaffTaskStatus, VisibilityState, WorkType } from '@/lib/types';
import {
  Button,
  ButtonLink,
  EmptyState,
  Loader,
  Panel,
  SearchInput,
  Select,
  Table,
  TableToolbar,
  Tag,
  type Column,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const WORK_LABEL: Record<WorkType, string> = {
  file_upload: 'Document',
  link: 'Link',
  google_form: 'Google Form',
};

const VISIBILITY: Record<VisibilityState, { label: string; tone: TagTone }> = {
  published: { label: 'Published', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  hidden: { label: 'Hidden', tone: 'gray' },
};

/** Amber for a queue, never red (CLAUDE.md §11.1). */
const STATUS: Record<StaffTaskStatus, { label: string; tone: TagTone }> = {
  open: { label: 'Open', tone: 'blue' },
  marking: { label: 'Marking', tone: 'amber' },
  marked: { label: 'Marked', tone: 'green' },
  // `D-34`: past due with nothing submitted - nothing to mark.
  closed: { label: 'Closed', tone: 'gray' },
};

/**
 * `/manage/tasks` (`TASK-7`): every task the caller reaches, across courses.
 *
 * Group-grain, and the server does all of it: an assistant receives only tasks
 * set for a group they hold, with the targets narrowed to those groups
 * (`GET /staff/tasks`). The filters are query parameters, not a post-filter
 * over a wider read. Status, `scheduled` and marker drift are server-derived.
 * No per-row counts (`D-30`), and nothing here is a score or a completion
 * figure, so progress and performance cannot meet on this screen.
 */
export default function TasksPage() {
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<'' | StaffTaskStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // A short debounce, so a search is one request per pause, not per key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: courses } = useApi((t) => api.staff.courses(t), []);
  // The unfiltered list, only to build the group filter from the groups the
  // caller can actually see in targets.
  const { data: everything } = useApi((t) => api.staff.tasks(t), []);
  const { data, error, loading, reload } = useApi(
    (t) =>
      api.staff.tasks(t, {
        courseId: courseId || undefined,
        groupId: groupId || undefined,
        status: status || undefined,
        search: search || undefined,
      }),
    [courseId, groupId, status, search],
  );

  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of everything ?? []) {
      for (const target of task.targets) seen.set(target.groupId, target.groupName);
    }
    return [
      { value: '', label: 'All groups' },
      ...[...seen].map(([value, label]) => ({ value, label })),
    ];
  }, [everything]);

  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));

  const columns: Column<StaffTask>[] = [
    {
      label: 'Title',
      render: (t) => (
        <Link href={`/manage/tasks/${t.id}`} className="text-fg underline-offset-4 hover:underline">
          {t.title}
        </Link>
      ),
    },
    { label: 'Type', render: (t) => <Tag tone="gray">{t.type}</Tag> },
    { label: 'Course', render: (t) => <span className="text-fg-2">{courseTitle.get(t.courseId) ?? '—'}</span> },
    {
      label: 'Set for',
      render: (t) => <span className="text-fg-2">{t.targets.map((x) => x.groupName).join(', ') || '—'}</span>,
    },
    { label: 'Due', render: (t) => formatDate(t.dueAt) },
    { label: 'Work', render: (t) => <span className="text-fg-2">{WORK_LABEL[t.workType]}</span> },
    {
      label: 'Visibility',
      render: (t) => <Tag tone={VISIBILITY[t.visibilityState].tone}>{VISIBILITY[t.visibilityState].label}</Tag>,
    },
    {
      label: 'Status',
      render: (t) => <Tag tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Tag>,
    },
    {
      label: 'Submissions',
      // Uploaded work only: link and Google Form work is not handed in here (A-6).
      render: (t) =>
        t.workType === 'file_upload' ? (
          <Link href={`/manage/tasks/${t.id}/submissions`} className="text-accent underline-offset-4 hover:underline">
            Open
          </Link>
        ) : (
          '—'
        ),
    },
    {
      label: 'Marker',
      render: (t) => (
        <span className="inline-flex items-center gap-2 text-fg-2">
          {/* `D-43`: advisory, and claimed by the first saved mark - never by opening a page. */}
          {t.markerName ?? 'First to mark'}
          {t.markerDrift && <Tag tone="amber">No longer reaches every group</Tag>}
        </span>
      ),
    },
    {
      label: 'Results',
      render: (t) =>
        t.workType === 'google_form' ? (
          <ButtonLink href={`/manage/tasks/${t.id}/results`} icon="Table" size="small">
            Results
          </ButtonLink>
        ) : null,
    },
  ];

  return (
    <>
      <PageTitle title="Tasks" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink href="/manage/tasks/drafts" icon="FileText">
            Draft library
          </ButtonLink>
          <ButtonLink href="/manage/tasks/new" variant="primary" icon="Plus">
            New task
          </ButtonLink>
        </div>

        <Panel padded={false}>
          <TableToolbar
            search={
              <SearchInput
                label="Search tasks"
                placeholder="Search by title"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-[240px]"
              />
            }
            filters={
              <>
                <Select
                  aria-label="Course"
                  className="w-[200px]"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  options={[{ value: '', label: 'All courses' }, ...(courses ?? []).map((c) => ({ value: c.id, label: c.title }))]}
                />
                <Select
                  aria-label="Group"
                  className="w-[200px]"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  options={groupOptions}
                />
                <Select
                  aria-label="Status"
                  className="w-[160px]"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | StaffTaskStatus)}
                  options={[
                    { value: '', label: 'Any status' },
                    { value: 'open', label: 'Open' },
                    { value: 'marking', label: 'Marking' },
                    { value: 'marked', label: 'Marked' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
              </>
            }
          />
          {loading && !data && (
            <div className="flex justify-center p-8">
              <Loader label="Loading tasks" />
            </div>
          )}
          {error && (
            <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />
          )}
          {data && (
            <Table
              columns={columns}
              rows={data}
              rowKey={(t) => t.id}
              empty={
                <EmptyState
                  icon="ListDetails"
                  title="No tasks match"
                  description="Tasks set for groups you hold appear here."
                />
              }
            />
          )}
        </Panel>
      </div>
    </>
  );
}
