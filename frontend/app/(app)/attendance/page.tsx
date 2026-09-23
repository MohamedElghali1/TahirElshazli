'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AttendanceStatus, StudentAttendanceHistoryItem } from '@/lib/types';
import { Panel, EmptyState, Loader, Tag, Button, StatNumber, InlineBanner } from '@/components/ui';
import type { TagTone } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const STATUS_TAG: Record<AttendanceStatus, { label: string; tone: TagTone }> = {
  present: { label: 'Present', tone: 'green' },
  late: { label: 'Late', tone: 'amber' },
  absent: { label: 'Absent', tone: 'red' },
};

/**
 * Attendance (`docs/PRODUCT_SPEC.md` §6: `[NEW]` as a route, "Three states,
 * with 'records can lag'"). `GET /students/me/attendance` (`SESS-7`) is
 * every group the student sits in, not one course at a time - the same
 * whole-student scope as `/timetable`, so there is no course switcher here.
 *
 * `late` is its own count, folded into neither `present` nor `absent`
 * (CLAUDE.md §11.1) - this is attendance, never progress and never
 * performance, so the headline figures are `StatNumber`s, not a `Meter`.
 */
export default function AttendancePage() {
  const { data, error, loading, reload } = useApi(
    (token) => api.students.attendance(token),
    [],
  );

  return (
    <>
      <PageTitle title="Attendance" />
      <div className="flex flex-col gap-4 p-6">
        {loading && !data && (
          <div className="flex justify-center p-12">
            <Loader label="Loading attendance" />
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
            <InlineBanner tone="blue">
              Records can lag behind the live session by a day or two.
            </InlineBanner>

            <Panel>
              <div className="flex flex-wrap gap-8">
                <StatNumber label="Present" value={`${data.present} / ${data.expected}`} caption={`${data.percentage}% attendance`} />
                <StatNumber label="Late" value={data.late} />
                <StatNumber label="Absent" value={data.absent} />
              </div>
            </Panel>

            <Panel title="History" bodyClassName="">
              {data.history.length === 0 ? (
                <EmptyState
                  icon="CircleCheck"
                  title="No sessions yet"
                  description="Your record starts after the first timetabled class ends."
                />
              ) : (
                <ul className="divide-y divide-border-light">
                  {data.history.map((item) => (
                    <li key={item.sessionId}>
                      <HistoryRow item={item} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}

function HistoryRow({ item }: { item: StudentAttendanceHistoryItem }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base text-fg">{item.title}</p>
        <p className="num mt-1 text-xs text-fg-3">{formatDate(item.scheduledAt)}</p>
      </div>
      {/* A missing mark is an em-dash, never a status - the session happened
          but attendance has not been recorded for it yet. */}
      {item.status === null ? (
        <span className="font-mono text-fg-4" aria-label="Not yet recorded">
          —
        </span>
      ) : (
        <Tag tone={STATUS_TAG[item.status].tone}>{STATUS_TAG[item.status].label}</Tag>
      )}
    </div>
  );
}
