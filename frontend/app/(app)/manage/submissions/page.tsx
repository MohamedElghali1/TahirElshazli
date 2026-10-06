'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { Button, EmptyState, Loader, Panel, Select, TableToolbar } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { GradeDialog, GRADING_STATUS_FILTER, SubmissionRow } from '@/components/marking/grading-queue';

type Row = GradingQueueItem & { courseTitle: string };

/**
 * `/manage/submissions`: every hand-in the caller may mark, across every
 * course they reach, in one queue - the screen "Awaiting grading" opens.
 *
 * No new route: it fans out over `GET /staff/courses/:id/submissions`, the
 * same per-course queue the course Grading tab reads, which already narrows
 * rows to the caller's own groups (`D-44`). At two or three courses a fan-out
 * is the right trade (CLAUDE.md §1). Marking on the paper itself stays on
 * `Open work`, the task's own submission page.
 */
export default function SubmissionsPage() {
  const [status, setStatus] = useState<GradingStatus | ''>('awaiting');
  const [courseId, setCourseId] = useState('');
  const [editing, setEditing] = useState<GradingQueueItem | null>(null);

  const { data: courses } = useApi((t) => api.staff.courses(t), []);

  const { data, error, loading, reload } = useApi(
    async (t): Promise<Row[]> => {
      if (!courses) return [];
      const picked = courseId ? courses.filter((c) => c.id === courseId) : courses;
      const queues = await Promise.all(
        picked.map(async (c) => {
          const queue = await api.staff.submissions(t, c.id, status || undefined);
          return queue.items.map((item) => ({ ...item, courseTitle: c.title }));
        }),
      );
      // Oldest hand-in first: the one that has waited longest is next.
      return queues.flat().sort((a, b) => a.lastSubmittedAt.localeCompare(b.lastSubmittedAt));
    },
    [courses, courseId, status],
  );

  const several = (courses?.length ?? 0) > 1 && !courseId;

  return (
    <>
      <PageTitle title="Submissions" />
      <div className="flex flex-col gap-4 p-6">
        <Panel padded={false}>
          <TableToolbar
            filters={
              <span className="inline-flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Filter submissions by status"
                  className="w-auto min-w-[170px]"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as GradingStatus | '')}
                  options={GRADING_STATUS_FILTER}
                />
                <Select
                  aria-label="Course"
                  className="w-auto min-w-[200px]"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  options={[{ value: '', label: 'All courses' }, ...(courses ?? []).map((c) => ({ value: c.id, label: c.title }))]}
                />
              </span>
            }
            actions={
              data && (
                <span className="num text-xs text-fg-3">
                  {data.length} {data.length === 1 ? 'submission' : 'submissions'}
                </span>
              )
            }
          />
          {(loading || !courses) && !data && !error && (
            <div className="flex justify-center p-8">
              <Loader label="Loading submissions" />
            </div>
          )}
          {error && (
            <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />
          )}
          {data && data.length === 0 && (
            <EmptyState
              icon="Inbox"
              title={status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'}
              description={
                status === 'awaiting'
                  ? 'Every submission you can mark has been marked.'
                  : 'Work students hand in will appear here.'
              }
            />
          )}
          {data && data.length > 0 && (
            <ul className="divide-y divide-border-light">
              {data.map((item) => (
                <li key={item.submissionId}>
                  <SubmissionRow
                    item={item}
                    context={several ? item.courseTitle : undefined}
                    onGrade={() => setEditing(item)}
                    onReturned={reload}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {editing && (
        <GradeDialog
          item={editing}
          onClose={() => setEditing(null)}
          onGraded={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}
