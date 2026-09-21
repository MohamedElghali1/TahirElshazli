'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatPercent } from '@/lib/format';
import type { GroupReportEntry } from '@/lib/types';
import { Button, EmptyState, Loader, StatNumber, Table, type Column } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * The group report (`GROUP-4`): stats plus a per-student table. Performance
 * only - no completion/progress figure sits beside it (`CLAUDE.md` §11.1).
 *
 * No PDF file: there is no server-side PDF library in this stack (`CLAUDE.md`
 * §5), so "PDF" here is the browser's own print-to-PDF over this page - the
 * shell's nav and header hide themselves under `print:hidden`
 * (`components/shell/console-shell.tsx`).
 */
export default function GroupReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.staff.groupReport(token, groupId),
    [groupId],
  );

  const columns: Column<GroupReportEntry>[] = [
    { label: 'Name', render: (e) => e.name },
    { label: 'Email', render: (e) => e.email },
    {
      label: 'Submitted',
      align: 'end',
      render: (e) => <span className="num">{e.submittedCount}</span>,
    },
    {
      label: 'Graded',
      align: 'end',
      render: (e) => <span className="num">{e.gradedCount}</span>,
    },
    {
      label: 'Average',
      align: 'end',
      render: (e) => (
        <span className="num text-fg">{formatPercent(e.averageScorePercent)}</span>
      ),
    },
  ];

  return (
    <>
      <PageTitle title={data ? `${data.groupName} — report` : 'Group report'} backHref="/manage/groups" />
      <div className="flex flex-col gap-5 p-6 print:p-0">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading report" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}

        {data && (
          <>
            <div className="flex items-start justify-between gap-4 print:hidden">
              <div>
                <h1 className="text-[20px] font-semibold text-fg">{data.groupName}</h1>
                <p className="text-base text-fg-3">{data.courseTitle}</p>
              </div>
              <Button variant="primary" onClick={() => window.print()}>
                Print / save as PDF
              </Button>
            </div>

            {/* Shown in the printed output, where the header row above is hidden. */}
            <div className="hidden print:block">
              <h1 className="text-[20px] font-semibold text-fg">{data.groupName}</h1>
              <p className="text-base text-fg-3">{data.courseTitle}</p>
            </div>

            <div className="flex flex-wrap gap-8">
              <StatNumber label="Members" value={data.memberCount} />
              <StatNumber label="Assessments set" value={data.assessmentCount} />
              <StatNumber
                label="Average score"
                value={formatPercent(data.averageScorePercent)}
                caption="Every graded submission's own share, averaged once across the group."
              />
            </div>

            {data.entries.length === 0 ? (
              <EmptyState icon="Users" title="Nobody is in this group yet" />
            ) : (
              <Table columns={columns} rows={data.entries} rowKey={(e) => e.studentId} />
            )}
          </>
        )}
      </div>
    </>
  );
}
