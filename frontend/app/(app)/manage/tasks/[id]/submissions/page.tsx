'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatDateTime } from '@/lib/format';
import type { SubmissionStatus, TaskSubmissionRow } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon, initialsOf } from '@/components/shell/classroom';
import { BackLink, ClBar, ClEmpty, ClError, ClSkeleton, ClStat } from '@/components/classroom/ui';

/** Amber for a queue, never red (CLAUDE.md §11.1). Saved and returned differ. */
const STATUS: Record<SubmissionStatus, { label: string; color: string }> = {
  not_submitted: { label: 'Not submitted', color: 'var(--cl-muted)' },
  submitted: { label: 'To mark', color: 'var(--cl-warn)' },
  marked: { label: 'Marked, not returned', color: 'var(--cl-blue)' },
  returned: { label: 'Returned', color: 'var(--cl-ok)' },
};

const COLS = 'minmax(180px,2fr) minmax(110px,1fr) minmax(150px,1.4fr) 150px 90px 90px';

/**
 * `/manage/tasks/[id]/submissions` (`MARK-3`): every student the task was set
 * for - **including those who have not submitted**, which is the answer to the
 * old missing `missed` status. Group-grain on the server: an assistant sees
 * only the groups they hold, and a task they reach through none is not found.
 *
 * Redesign V2 "MARKING". Marking needs the annotation surface, so a row opens
 * the marking page rather than grading inline.
 *
 * The per-group figures are each a fact about that group and are never summed
 * across groups, so the stats row follows the group filter and is computed
 * from the visible rows. Thirty rows: no pagination.
 */
export default function TaskSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [groupId, setGroupId] = useState('');
  const { data, error, loading, reload } = useApi((t) => api.staff.taskSubmissions(t, id), [id]);

  const rows = (data?.rows ?? []).filter((r) => !groupId || r.groupId === groupId);
  const total = rows.length;
  const handedIn = rows.filter((r) => r.status !== 'not_submitted').length;
  const toMark = rows.filter((r) => r.status === 'submitted').length;
  const graded = rows.filter((r) => r.status === 'marked' || r.status === 'returned').length;
  // Marking progress: of the work handed in, how much has a saved mark.
  const markPct = handedIn > 0 ? Math.round((graded / handedIn) * 100) : 0;

  return (
    <>
      <PageTitle title={data ? `Submissions: ${data.title}` : 'Submissions'} backHref={`/manage/tasks/${id}`} />
      <BackLink href="/manage/tasks">All tasks</BackLink>

      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={4} label="Loading submissions" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}

      {data && (
        <>
          <section className="cl-panel" aria-labelledby="sb-h">
            <div className="flex flex-wrap items-center gap-4">
              <span className="cl-ic48 cl-tone-peach">
                <ClIcon name="pen" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 id="sb-h" className="cl-pt m-0">
                  {data.title}
                </h1>
                <div className="cl-sub">
                  Due {formatDate(data.dueAt)} · out of {data.maxScore} · Marker{' '}
                  {data.markerName ?? 'not yet claimed - the first mark claims it'}
                </div>
              </div>
              <Link href={`/manage/tasks/${id}`} className="cl-btns">
                Edit task
              </Link>
            </div>
            <hr className="cl-hr" />
            <div className="cl-stats">
              <ClStat value={`${handedIn} of ${total}`} label="Submitted" />
              <ClStat value={total - handedIn} label="Not submitted" />
              <ClStat value={graded} label="Graded" />
              <ClStat value={toMark} label="To mark" tone="var(--cl-warn)" />
              <div className="min-w-[160px] flex-1">
                <div className="cl-stat-v">{markPct}%</div>
                <ClBar value={markPct} label="Marking progress" />
                <div className="cl-stat-k">Marking progress</div>
              </div>
            </div>
          </section>

          <section className="cl-panel pb-4" aria-label="Students">
            {data.groups.length > 1 && (
              <div className="mb-4">
                <select
                  aria-label="Group"
                  className="cl-inp w-[220px]"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">All my groups</option>
                  {data.groups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.groupName} ({g.submitted + g.marked + g.returned} of {g.memberCount})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {rows.length === 0 ? (
              <ClEmpty icon="people" title="Nobody is set this task in your groups" />
            ) : (
              <div className="overflow-x-auto">
                <div className="cl-gt">
                  <div className="hd" style={{ gridTemplateColumns: COLS }}>
                    <span>Student</span>
                    <span>Group</span>
                    <span>Status</span>
                    <span>Handed in</span>
                    <span className="r">Mark</span>
                    <span className="r">On paper</span>
                  </div>
                  {rows.map((r) => (
                    <Row key={r.studentId} r={r} taskId={id} maxScore={data.maxScore} />
                  ))}
                </div>
              </div>
            )}
            <p className="cl-muted mt-4 text-[13px]">— means not marked yet. Marks reach a student only when returned.</p>
          </section>
        </>
      )}
    </>
  );
}

function Row({ r, taskId, maxScore }: { r: TaskSubmissionRow; taskId: string; maxScore: number }) {
  const s = STATUS[r.status];
  // Past due with nothing handed in is still a queue item, so amber.
  const overdue = r.status === 'not_submitted' && r.isOverdue;
  const color = overdue ? 'var(--cl-warn)' : s.color;
  const cells = (
    <>
      <span className="flex min-w-0 items-center gap-3 py-2">
        <span className="cl-av">{initialsOf(r.studentName)}</span>
        {/* `dir="auto"` so an Arabic name sets its own direction inside an LTR table. */}
        <span dir="auto" className="truncate">
          {r.studentName}
        </span>
      </span>
      <span className="cl-muted truncate">{r.groupName}</span>
      <span className="inline-flex flex-wrap items-center gap-2" style={{ color }}>
        <span className="cl-dot" style={{ background: color }} />
        {overdue ? 'Overdue' : s.label}
        {r.isLate && <span style={{ color: 'var(--cl-warn)' }}>· Late</span>}
      </span>
      <span>{r.lastSubmittedAt ? formatDateTime(r.lastSubmittedAt) : '—'}</span>
      <span className="r">{r.score != null ? `${r.score} of ${maxScore}` : '—'}</span>
      <span className="r">{r.submissionId ? r.annotationCount : '—'}</span>
    </>
  );
  return r.submissionId ? (
    <Link
      href={`/manage/tasks/${taskId}/submissions/${r.submissionId}`}
      className="rw"
      style={{ gridTemplateColumns: COLS }}
      aria-label={`Mark ${r.studentName}'s work`}
    >
      {cells}
    </Link>
  ) : (
    <div className="rw" style={{ gridTemplateColumns: COLS }}>
      {cells}
    </div>
  );
}
