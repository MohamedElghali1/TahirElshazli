'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDateOnly } from '@/lib/format';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

/**
 * Weekly reports, the group-weeks list (`REM-031`, `D-63`, `D-66`). Redesign V2
 * "REPORTS". Admin only - an assistant reaching `GET /admin/weekly-reports/weeks`
 * gets the ordinary 403, rendered the same way `/manage/students` does (T9).
 *
 * Publishing happens on the week's own page (it needs the confirmation and the
 * draft count), so the row's action is "Open"; a fully published week reads
 * "Published" in green.
 */
export default function WeeklyReportsPage() {
  const { data, error, loading, reload } = useApi((token) => api.admin.weeklyReportWeeks(token), []);

  return (
    <>
      <PageTitle title="Reports" />
      <section aria-labelledby="wr-h" className="cl-panel">
        <PanelHead id="wr-h" title="Weekly reports" />
        {loading && !data && <ClSkeleton rows={3} label="Loading weekly reports" />}
        {error && (
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <ClEmpty icon="doc" tone="cl-tone-sand" title="No weekly reports yet." hint="Drafts appear after the first week ends." />
        )}
        {data?.map((w) => (
          <Link
            key={`${w.groupId}:${w.weekStart}`}
            href={`/manage/reports/${w.groupId}/${w.weekStart}`}
            className="cl-grow"
            aria-label={`Open ${w.groupName}, week of ${formatDateOnly(w.weekStart)}`}
          >
            <span className="cl-ic40 cl-tone-sand">
              <ClIcon name="doc" small />
            </span>
            <span className="cl-grow-main">
              <span className="block truncate">
                Week of {formatDateOnly(w.weekStart)} · {w.groupName}
              </span>
              <span className="cl-sub">
                {w.courseTitle} · {w.published} published
              </span>
            </span>
            {w.drafts > 0 ? (
              <span className="shrink-0 text-[14px]" style={{ color: 'var(--cl-warn)' }}>
                {w.drafts} {w.drafts === 1 ? 'draft' : 'drafts'} to publish
              </span>
            ) : (
              <span className="shrink-0 text-[14px]" style={{ color: 'var(--cl-ok)' }}>
                Published
              </span>
            )}
            <span className="cl-glink shrink-0">Open</span>
          </Link>
        ))}
      </section>
    </>
  );
}
