'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AttendanceStatus, StudentAttendanceHistoryItem } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';

const STATUS: Record<AttendanceStatus, { label: string; color: string; tone: string }> = {
  present: { label: 'Attended', color: 'var(--cl-ok)', tone: 'cl-tone-mint' },
  late: { label: 'Late', color: 'var(--cl-warn)', tone: 'cl-tone-sand' },
  absent: { label: 'Absent', color: 'var(--cl-bad)', tone: 'cl-tone-peach' },
};

/**
 * Attendance (`docs/PRODUCT_SPEC.md` §6: `[NEW]` as a route). `GET
 * /students/me/attendance` (`SESS-7`) is every group the student sits in.
 * `late` is its own count, folded into neither `present` nor `absent`
 * (CLAUDE.md §11.1) - attendance, never progress and never performance, so
 * the figures are numbers, not a bar. The response carries no upcoming
 * session, so there is no "Upcoming" strip here - that lives on Home and
 * Schedule.
 */
export default function AttendancePage() {
  const { data, error, loading, reload } = useApi((token) => api.students.attendance(token), []);

  return (
    <>
      <PageTitle title="Live sessions" />

      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={4} label="Loading attendance" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}

      {data && (
        <>
          <section aria-labelledby="h-att" className="cl-panel">
            <PanelHead title="Attendance" id="h-att" />
            <div className="cl-stats">
              <ClStat
                value={data.expected > 0 ? `${data.percentage}%` : '—'}
                label={`Present · ${data.present} of ${data.expected}`}
              />
              <ClStat value={data.late} label="Late" />
              <ClStat value={data.absent} label="Absent" />
            </div>
            <p className="cl-muted m-0 mt-4 px-2 text-[13px]">Records can lag behind the live session by a day or two.</p>
          </section>

          <section aria-labelledby="h-past" className="cl-panel pb-4">
            <PanelHead title="Past sessions" id="h-past" className="mb-2" />
            {data.history.length === 0 ? (
              <ClEmpty icon="check" title="No sessions yet" hint="Your record starts after the first timetabled class ends." />
            ) : (
              data.history.map((item) => <HistoryRow key={item.sessionId} item={item} />)
            )}
          </section>
        </>
      )}
    </>
  );
}

function HistoryRow({ item }: { item: StudentAttendanceHistoryItem }) {
  // A missing mark is an em-dash, never a status - the session happened but
  // attendance has not been recorded for it yet.
  const s = item.status === null ? null : STATUS[item.status];
  return (
    <div className="cl-grow" style={{ cursor: 'default' }}>
      <span className={`cl-ic40 ${s?.tone ?? 'cl-tone-sky'}`}>
        <ClIcon name="live" small />
      </span>
      <span className="cl-grow-main">
        <span className="block truncate">{item.title}</span>
        <span className="cl-sub">
          {formatDate(item.scheduledAt)} ·{' '}
          {s ? <span style={{ color: s.color }}>{s.label}</span> : <span aria-label="Not yet recorded">—</span>}
        </span>
      </span>
    </div>
  );
}
