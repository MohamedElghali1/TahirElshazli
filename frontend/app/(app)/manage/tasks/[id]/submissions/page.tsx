'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatDateTime } from '@/lib/format';
import type { SubmissionStatus, TaskSubmissionRow } from '@/lib/types';
import {
  Button,
  EmptyState,
  Loader,
  Panel,
  Score,
  Select,
  StatNumber,
  Table,
  TableToolbar,
  Tag,
  type Column,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/** Amber for a queue, never red (CLAUDE.md §11.1). Saved and returned differ. */
const STATUS: Record<SubmissionStatus, { label: string; tone: TagTone }> = {
  not_submitted: { label: 'Not submitted', tone: 'gray' },
  submitted: { label: 'To mark', tone: 'amber' },
  marked: { label: 'Marked, not returned', tone: 'blue' },
  returned: { label: 'Returned', tone: 'green' },
};

/**
 * `/manage/tasks/[id]/submissions` (`MARK-3`): every student the task was set
 * for - **including those who have not submitted**, which is the answer to the
 * old missing `missed` status. Group-grain on the server: an assistant sees
 * only the groups they hold, and a task they reach through none is not found.
 *
 * The per-group figures are each a fact about that group and are never summed
 * across groups. Thirty rows: no pagination.
 */
export default function TaskSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [groupId, setGroupId] = useState('');
  const { data, error, loading, reload } = useApi((t) => api.staff.taskSubmissions(t, id), [id]);

  const rows = (data?.rows ?? []).filter((r) => !groupId || r.groupId === groupId);

  const columns: Column<TaskSubmissionRow>[] = [
    // `dir="auto"` so an Arabic name sets its own direction inside an LTR table.
    { label: 'Student', render: (r) => <span dir="auto">{r.studentName}</span> },
    { label: 'Group', render: (r) => r.groupName },
    {
      label: 'Status',
      render: (r) => {
        const s = STATUS[r.status];
        // Past due with nothing handed in is still a queue item, so amber.
        const tone: TagTone = r.status === 'not_submitted' && r.isOverdue ? 'amber' : s.tone;
        return (
          <span className="inline-flex items-center gap-2">
            <Tag tone={tone}>{r.status === 'not_submitted' && r.isOverdue ? 'Overdue' : s.label}</Tag>
            {r.isLate && <Tag tone="amber">Late</Tag>}
          </span>
        );
      },
    },
    {
      label: 'Handed in',
      render: (r) => (r.lastSubmittedAt ? formatDateTime(r.lastSubmittedAt) : '—'),
    },
    { label: 'Mark', align: 'end', render: (r) => <Score value={r.score} of={data?.maxScore} /> },
    {
      label: 'Marks on paper',
      align: 'end',
      render: (r) => (r.submissionId ? <span className="num">{r.annotationCount}</span> : '—'),
    },
  ];

  return (
    <>
      <PageTitle title={data ? `Submissions: ${data.title}` : 'Submissions'} backHref={`/manage/tasks/${id}`} />
      <div className="flex flex-col gap-4 p-6">
        {loading && !data && (
          <div className="flex justify-center p-8">
            <Loader label="Loading submissions" />
          </div>
        )}
        {error && (
          <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />
        )}
        {data && (
          <>
            <p className="text-base text-fg-3">
              Due {formatDate(data.dueAt)} · Marker {data.markerName ?? 'not yet claimed - the first mark claims it'}
            </p>
            {data.groups.length > 0 && (
              <Panel>
                <div className="flex flex-wrap gap-8">
                  {data.groups.map((g) => (
                    <StatNumber
                      key={g.groupId}
                      label={g.groupName}
                      value={
                        <span>
                          {g.submitted + g.marked + g.returned}
                          <span className="text-fg-4">/{g.memberCount}</span>
                        </span>
                      }
                      caption={`${g.submitted} to mark · ${g.marked} marked · ${g.returned} returned · ${g.notSubmitted} not submitted`}
                    />
                  ))}
                </div>
              </Panel>
            )}
            <Panel padded={false}>
              <TableToolbar
                filters={
                  data.groups.length > 1 ? (
                    <Select
                      aria-label="Group"
                      className="w-[200px]"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      options={[
                        { value: '', label: 'All my groups' },
                        ...data.groups.map((g) => ({ value: g.groupId, label: g.groupName })),
                      ]}
                    />
                  ) : undefined
                }
              />
              <Table
                columns={columns}
                rows={rows}
                rowKey={(r) => r.studentId}
                onRowClick={(r) => {
                  if (r.submissionId) router.push(`/manage/tasks/${id}/submissions/${r.submissionId}`);
                }}
                rowLabel={(r) => (r.submissionId ? `Mark ${r.studentName}'s work` : `${r.studentName} has not submitted`)}
                empty={<EmptyState icon="Users" title="Nobody is set this task in your groups" />}
              />
            </Panel>
            <p className="text-xs text-fg-4">— means not marked yet. Marks reach a student only when returned.</p>
          </>
        )}
      </div>
    </>
  );
}
