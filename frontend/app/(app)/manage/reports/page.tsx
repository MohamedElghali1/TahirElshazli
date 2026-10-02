'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDateOnly } from '@/lib/format';
import type { WeeklyReportWeekView } from '@/lib/types';
import { Button, EmptyState, Loader, Table, Tag, type Column } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * Weekly reports, the group-weeks list (`REM-031`, `D-63`, `D-66`). Admin
 * only - an assistant reaching `GET /admin/weekly-reports/weeks` gets the
 * ordinary 403, rendered the same way `/manage/students` does (T9).
 */
export default function WeeklyReportsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(
    (token) => api.admin.weeklyReportWeeks(token),
    [],
  );

  const columns: Column<WeeklyReportWeekView>[] = [
    { label: 'Week', render: (w) => `Week of ${formatDateOnly(w.weekStart)}` },
    { label: 'Group', render: (w) => w.groupName },
    { label: 'Course', render: (w) => w.courseTitle },
    {
      label: 'Drafts',
      align: 'end',
      render: (w) =>
        w.drafts > 0 ? (
          <Tag tone="amber">{w.drafts}</Tag>
        ) : (
          <span className="num text-fg-4">0</span>
        ),
    },
    {
      label: 'Published',
      align: 'end',
      render: (w) => <span className="num">{w.published}</span>,
    },
  ];

  return (
    <>
      <PageTitle title="Reports" />
      <div className="flex flex-col gap-4 p-6">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading weekly reports" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.isAuth ? "You don't have access to this page." : error.message}
            action={error.isAuth ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.length === 0 && (
          <EmptyState
            icon="ChartPie"
            title="No weekly reports yet."
            description="Drafts appear after the first week ends."
          />
        )}
        {data && data.length > 0 && (
          <Table
            columns={columns}
            rows={data}
            rowKey={(w) => `${w.groupId}:${w.weekStart}`}
            rowLabel={(w) => `Open ${w.groupName}, week of ${formatDateOnly(w.weekStart)}`}
            onRowClick={(w) => router.push(`/manage/reports/${w.groupId}/${w.weekStart}`)}
          />
        )}
      </div>
    </>
  );
}
