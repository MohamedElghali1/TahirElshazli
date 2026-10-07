'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StaffTask, StaffTaskStatus, VisibilityState, WorkType } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { DeleteTaskModal } from './task-form';
import { ClEmpty, ClError, ClRowMenu, ClSkeleton, ClTabs, PanelHead, type ClMenuItem } from '@/components/classroom/ui';

const WORK_LABEL: Record<WorkType, string> = {
  file_upload: 'Document',
  link: 'Link',
  google_form: 'Google Form',
};

const VISIBILITY_LABEL: Record<VisibilityState, string> = {
  published: 'Published',
  scheduled: 'Scheduled',
  hidden: 'Hidden',
};

/** Amber for a queue, never red (CLAUDE.md §11.1). */
const STATUS: Record<StaffTaskStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'var(--cl-blue)' },
  marking: { label: 'Marking', color: 'var(--cl-warn)' },
  marked: { label: 'Marked', color: 'var(--cl-ok)' },
  // `D-34`: past due with nothing submitted - nothing to mark.
  closed: { label: 'Closed', color: 'var(--cl-muted)' },
};

const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'marking', label: 'Marking' },
  { value: 'marked', label: 'Marked' },
  { value: 'closed', label: 'Closed' },
] as const;

const COLS = 'minmax(220px,2.4fr) minmax(120px,1.2fr) 110px 150px 48px';

/**
 * `/manage/tasks` (`TASK-7`): every task the caller reaches, across courses.
 * Redesign V2: the artifact's "TASKS" panel.
 *
 * Group-grain, and the server does all of it: an assistant receives only tasks
 * set for a group they hold, with the targets narrowed to those groups
 * (`GET /staff/tasks`). The filters are query parameters, not a post-filter
 * over a wider read. Status, `scheduled` and marker drift are server-derived.
 * No per-row counts (`D-30`), and nothing here is a score or a completion
 * figure, so progress and performance cannot meet on this screen.
 */
export default function TasksPage() {
  const params = useSearchParams();
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  // `?status=` lets the overview's "Awaiting grading" figure land pre-filtered.
  const initialStatus = params.get('status');
  const [status, setStatus] = useState<'' | StaffTaskStatus>(
    initialStatus && initialStatus in STATUS ? (initialStatus as StaffTaskStatus) : '',
  );
  // `?search=` is what the sidebar search sends.
  const initialSearch = params.get('search')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);

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
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [everything]);

  const [deleting, setDeleting] = useState<StaffTask | null>(null);
  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));

  function menuFor(t: StaffTask): ClMenuItem[] {
    const items: ClMenuItem[] = [{ label: 'Open and edit', href: `/manage/tasks/${t.id}` }];
    // Uploaded work only: link and Google Form work is not handed in here (A-6).
    if (t.workType === 'file_upload') items.push({ label: 'Submissions', href: `/manage/tasks/${t.id}/submissions` });
    if (t.workType === 'google_form') items.push({ label: 'Results', href: `/manage/tasks/${t.id}/results` });
    items.push({ label: 'Delete', danger: true, onSelect: () => setDeleting(t) });
    return items;
  }

  return (
    <>
      <PageTitle title="Tasks" />
      <section aria-labelledby="tk-h" className="cl-panel pb-4">
        <PanelHead id="tk-h" title="Tasks">
          <Link href="/manage/tasks/drafts" className="cl-btns">
            Drafts
          </Link>
          <Link href="/manage/tasks/new" className="cl-btnp">
            <ClIcon name="plus" small />
            New task
          </Link>
        </PanelHead>

        <ClTabs
          label="Task status"
          tabs={TABS}
          value={status}
          onChange={(v) => setStatus(v as '' | StaffTaskStatus)}
          className="mb-4"
        />

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search by title"
            className="cl-inp w-[240px]"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select aria-label="Course" className="cl-inp" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select aria-label="Group" className="cl-inp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {groupOptions.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        {loading && !data && <ClSkeleton rows={4} label="Loading tasks" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <ClEmpty icon="tasks" title="No tasks match" hint="Tasks set for groups you hold appear here." />
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <div className="cl-gt">
              <div className="hd" style={{ gridTemplateColumns: COLS }}>
                <span>Task</span>
                <span>Group</span>
                <span>Due</span>
                <span>Status</span>
                <span />
              </div>
              {data.map((t) => {
                const s = STATUS[t.status];
                return (
                  <div key={t.id} className="rw" style={{ gridTemplateColumns: COLS }}>
                    <span className="flex min-w-0 items-center gap-3 py-2">
                      <span className={t.type === 'quiz' ? 'cl-ic34 cl-ic40 cl-tone-blue' : 'cl-ic34 cl-ic40 cl-tone-peach'}>
                        <ClIcon name={t.type === 'quiz' ? 'quiz' : 'pen'} small />
                      </span>
                      <span className="min-w-0">
                        <Link href={`/manage/tasks/${t.id}`} className="block truncate text-fg no-underline hover:underline">
                          {t.title}
                        </Link>
                        <span className="cl-sub truncate" style={{ display: 'block' }}>
                          {t.type} · {WORK_LABEL[t.workType]} · {courseTitle.get(t.courseId) ?? '—'}
                          {t.visibilityState !== 'published' && ` · ${VISIBILITY_LABEL[t.visibilityState]}`}
                        </span>
                        {/* `D-43`: advisory, and claimed by the first saved mark - never by opening a page. */}
                        <span className="cl-sub truncate" style={{ display: 'block' }}>
                          Marker: {t.markerName ?? 'first to mark'}
                          {t.markerDrift && (
                            <span style={{ color: 'var(--cl-warn)' }}> · no longer reaches every group</span>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className="cl-muted truncate text-[13.5px]">
                      {t.targets.map((x) => x.groupName).join(', ') || '—'}
                    </span>
                    <span>{formatDate(t.dueAt)}</span>
                    <span className="inline-flex items-center gap-2" style={{ color: s.color }}>
                      <span className="cl-dot" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="r">
                      <ClRowMenu label={`Actions for ${t.title}`} items={menuFor(t)} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      {deleting && (
        <DeleteTaskModal
          task={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      )}
    </>
  );
}
