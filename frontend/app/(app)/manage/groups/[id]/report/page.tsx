'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatPercent } from '@/lib/format';
import { PageTitle } from '@/components/shell/page-chrome';
import { initialsOf } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';

const COLS = '2.2fr 2fr 0.9fr 0.9fr 1fr';

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

  return (
    <>
      <PageTitle title={data ? `${data.groupName} — report` : 'Group report'} backHref="/manage/groups" />
      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={4} label="Loading report" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}

      {data && (
        <>
          <section aria-labelledby="gr-rep" className="cl-panel">
            <PanelHead id="gr-rep" title={data.groupName}>
              <span className="cl-muted text-[14px]">{data.courseTitle}</span>
              <button type="button" className="cl-btnp print:hidden" onClick={() => window.print()}>
                Print / save as PDF
              </button>
            </PanelHead>
            <div className="cl-stats">
              <ClStat value={data.memberCount} label="Members" />
              <ClStat value={data.assessmentCount} label="Assessments set" />
              <ClStat value={formatPercent(data.averageScorePercent)} label="Average score" />
            </div>
            <p className="cl-muted mb-0 mt-3 text-[13px]">
              Average score: every graded submission&apos;s own share, averaged once across the group.
            </p>
          </section>

          <section aria-labelledby="gr-stu" className="cl-panel">
            <PanelHead id="gr-stu" title="Students" />
            {data.entries.length === 0 ? (
              <ClEmpty icon="people" tone="cl-tone-blue" title="Nobody is in this group yet" />
            ) : (
              <div className="overflow-x-auto">
                <div className="cl-gt" role="table" aria-label="Group report">
                  <div className="hd" role="row" style={{ gridTemplateColumns: COLS }}>
                    <span>Name</span>
                    <span>Email</span>
                    <span className="r">Submitted</span>
                    <span className="r">Graded</span>
                    <span className="r">Average</span>
                  </div>
                  {data.entries.map((e) => (
                    <div key={e.studentId} className="rw" role="row" style={{ gridTemplateColumns: COLS }}>
                      <span className="inline-flex items-center gap-3">
                        <span className="cl-av">{initialsOf(e.name)}</span>
                        <span className="truncate">{e.name}</span>
                      </span>
                      <span className="cl-muted truncate">{e.email}</span>
                      <span className="r">{e.submittedCount}</span>
                      <span className="r">{e.gradedCount}</span>
                      <span className="r">{formatPercent(e.averageScorePercent)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
