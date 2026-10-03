'use client';

import { use, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { ASSESSMENT_TYPE_LABEL, formatPercent } from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { Button, EmptyState, Loader, Panel, Select, Table, Tag } from '@/components/ui';
import { GradeDialog, GRADING_STATUS_FILTER, SubmissionRow } from '@/components/marking/grading-queue';

/**
 * The grading queue.
 *
 * This is the TA's central permission under CLAUDE.md §2.2 and the first
 * non-admin mutation the audit log records (§5.4) - every mark posted here
 * writes a `submission.graded` entry naming who set it and what it was before.
 *
 * Status is never computed in the browser. `awaiting`/`graded` and `isLate`
 * arrive already derived from the server's own timestamps (§5.10); the filter
 * below narrows a server-derived value rather than recomputing one.
 */
export default function CourseGradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<GradingStatus | ''>('awaiting');
  const [editing, setEditing] = useState<GradingQueueItem | null>(null);

  const { data, error, loading, reload } = useApi(
    (token) => api.staff.submissions(token, id, status || undefined),
    [id, status],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Per-assessment averages across every student - CLAUDE.md §5.6, the
          number that says whether a task was hard or easy. */}
      <Panel
        title="Assessment averages"
        action={
          // `D-44`: the submissions below are the caller's own groups; these
          // figures are the whole course's, the same for every viewer.
          <span className="text-xs text-fg-4">Whole course, every group</span>
        }
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading assessment averages" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            action={error.isNotFound ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.assessments.length === 0 && (
          <EmptyState
            icon="ListDetails"
            title="No assessments yet"
            description="Once this course has homework, assignments or quizzes, their cohort averages appear here."
          />
        )}
        {data && data.assessments.length > 0 && (
          <Table
            rowKey={(row) => row.assessmentId}
            rows={data.assessments}
            columns={[
              { label: 'Assessment', render: (a) => a.title },
              { label: 'Type', render: (a) => <Tag tone="gray">{ASSESSMENT_TYPE_LABEL[a.type]}</Tag> },
              { label: 'Submitted', align: 'end', render: (a) => <span className="num">{a.submissionCount}</span> },
              { label: 'Graded', align: 'end', render: (a) => <span className="num">{a.gradedCount}</span> },
              {
                label: 'Class average',
                align: 'end',
                render: (a) => <span className="num text-fg">{formatPercent(a.averageScorePercent)}</span>,
              },
            ]}
          />
        )}
      </Panel>

      <Panel
        title="Submissions"
        action={
          <Select
            aria-label="Filter submissions by status"
            className="w-auto min-w-[150px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as GradingStatus | '')}
            options={GRADING_STATUS_FILTER}
          />
        }
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading submissions" />
          </div>
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            icon="Inbox"
            title={status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'}
            description={
              status === 'awaiting'
                ? 'Every submission on this course has been marked.'
                : 'Work submitted by students on this course will appear here.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-border-light">
            {data.items.map((item) => (
              <li key={item.submissionId}>
                <SubmissionRow item={item} onGrade={() => setEditing(item)} onReturned={reload} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
    </div>
  );
}
