'use client';

import { use, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { ASSESSMENT_TYPE_LABEL, formatPercent } from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { GradeDialog, GRADING_STATUS_FILTER, SubmissionRow } from '@/components/marking/grading-queue';
import { ClEmpty, ClError, ClSegmented, ClSkeleton, PanelHead } from '@/components/classroom/ui';

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
const GRID = '2.4fr 1fr 1fr 1fr 1fr';

export default function CourseGradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<GradingStatus | ''>('awaiting');
  const [editing, setEditing] = useState<GradingQueueItem | null>(null);

  const { data, error, loading, reload } = useApi(
    (token) => api.staff.submissions(token, id, status || undefined),
    [id, status],
  );

  const notFound = error?.isNotFound ? 'This course does not exist, or it is not assigned to you.' : null;

  return (
    <>
      {/* Per-assessment averages across every student - CLAUDE.md §5.6, the
          number that says whether a task was hard or easy. */}
      <section aria-labelledby="gr-avg" className="cl-panel pb-4">
        <PanelHead id="gr-avg" title="Assessment averages">
          {/* `D-44`: the submissions below are the caller's own groups; these
              figures are the whole course's, the same for every viewer. */}
          <span className="cl-muted text-[13px]">Whole course, every group</span>
        </PanelHead>
        {loading && !data && <ClSkeleton rows={3} label="Loading assessment averages" />}
        {error && <ClError message={notFound ?? error.message} onRetry={error.isNotFound ? undefined : reload} />}
        {data && data.assessments.length === 0 && (
          <ClEmpty
            icon="tasks"
            tone="cl-tone-blue"
            title="No assessments yet"
            hint="Once this course has homework, assignments or quizzes, their cohort averages appear here."
          />
        )}
        {data && data.assessments.length > 0 && (
          <div className="overflow-x-auto">
            <div className="cl-gt" role="table" aria-label="Assessment averages" style={{ minWidth: 640 }}>
              <div className="hd" role="row" style={{ gridTemplateColumns: GRID }}>
                <span>Assessment</span>
                <span>Type</span>
                <span className="r">Submitted</span>
                <span className="r">Graded</span>
                <span className="r">Class average</span>
              </div>
              {data.assessments.map((a) => (
                <div key={a.assessmentId} className="rw" role="row" style={{ gridTemplateColumns: GRID }}>
                  <span className="truncate">{a.title}</span>
                  <span className="cl-muted">{ASSESSMENT_TYPE_LABEL[a.type]}</span>
                  <span className="r">{a.submissionCount}</span>
                  <span className="r">{a.gradedCount}</span>
                  <span className="r">{formatPercent(a.averageScorePercent)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="gr-sub" className="cl-panel pb-4">
        <PanelHead id="gr-sub" title="Submissions">
          <ClSegmented
            label="Filter submissions by status"
            value={status}
            onChange={setStatus}
            options={GRADING_STATUS_FILTER}
          />
        </PanelHead>
        {loading && !data && <ClSkeleton rows={3} label="Loading submissions" />}
        {data && data.items.length === 0 && (
          <ClEmpty
            icon="check"
            title={status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'}
            hint={
              status === 'awaiting'
                ? 'Every submission on this course has been marked.'
                : 'Work submitted by students on this course will appear here.'
            }
          />
        )}
        {data?.items.map((item) => (
          <SubmissionRow key={item.submissionId} item={item} onGrade={() => setEditing(item)} onReturned={reload} />
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
