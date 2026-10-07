'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClEmpty, ClError, ClSegmented, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { GradeDialog, GRADING_STATUS_FILTER, SubmissionRow } from '@/components/marking/grading-queue';

type Row = GradingQueueItem & { courseTitle: string };

/**
 * `/manage/submissions`: every hand-in the caller may mark, across every
 * course they reach, in one queue - the screen "Awaiting grading" opens.
 * Redesign V2: the artifact's "To review" panel.
 *
 * No new route: it fans out over `GET /staff/courses/:id/submissions`, the
 * same per-course queue the course Grading tab reads, which already narrows
 * rows to the caller's own groups (`D-44`). At two or three courses a fan-out
 * is the right trade (CLAUDE.md §1). Marking on the paper itself stays on
 * `Open work`, the task's own submission page. Weekly reports live on
 * `/manage/reports`; admins reach them from the panel header.
 */
export default function SubmissionsPage() {
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
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
      <section aria-labelledby="sub-h" className="cl-panel pb-4">
        <PanelHead id="sub-h" title="Submissions to mark">
          <ClSegmented
            label="Filter submissions by status"
            options={GRADING_STATUS_FILTER}
            value={status}
            onChange={setStatus}
          />
          <select
            aria-label="Course"
            className="cl-inp"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">All courses</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {data && (
            <span className="cl-muted text-[13px]">
              {data.length} {data.length === 1 ? 'submission' : 'submissions'}
            </span>
          )}
          {admin && (
            <Link href="/manage/reports" className="cl-glink">
              Weekly reports
            </Link>
          )}
        </PanelHead>

        {(loading || !courses) && !data && !error && <ClSkeleton rows={3} label="Loading submissions" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <ClEmpty
            icon="check"
            title={status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'}
            hint={
              status === 'awaiting'
                ? 'Every submission you can mark has been marked.'
                : 'Work students hand in will appear here.'
            }
          />
        )}
        {data?.map((item) => (
          <SubmissionRow
            key={item.submissionId}
            item={item}
            context={several ? item.courseTitle : undefined}
            onGrade={() => setEditing(item)}
            onReturned={reload}
          />
        ))}
      </section>

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
