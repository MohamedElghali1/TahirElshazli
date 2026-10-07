'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatDateOnly,
} from '@/lib/format';
import type { AssessmentStatus, AssessmentType, WeeklyReportView } from '@/lib/types';
import { Score } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { BackLink, ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';

/**
 * One group-week's weekly reports (`REM-031`, `D-63`, `D-66`). Admin only,
 * same 403 as the list page. Redesign V2 "REPORTS" detail: back link, figure
 * row, the publish action, then one expandable row per student.
 *
 * Not drawn: the artifact's notes/strengths fields - the report content the
 * API returns is attendance and homework only.
 */
export default function WeeklyReportGroupWeekPage({
  params,
}: {
  params: Promise<{ groupId: string; weekStart: string }>;
}) {
  const { groupId, weekStart } = use(params);

  const { data, error, loading, reload } = useApi(
    (token) => api.admin.weeklyReports(token, groupId, weekStart),
    [groupId, weekStart],
  );
  // Only for the group's name - the reports themselves carry everything else.
  const { data: weeks } = useApi((token) => api.admin.weeklyReportWeeks(token), []);
  const week = weeks?.find((w) => w.groupId === groupId && w.weekStart === weekStart);

  const dateLabel = formatDateOnly(weekStart);
  const draftCount = data?.filter((r) => r.status === 'draft').length ?? 0;
  // Held here, not in PublishPanel: the reload after a publish takes drafts to
  // 0, which unmounts the panel along with any message it held.
  const [published, setPublished] = useState<string | null>(null);

  return (
    <>
      <PageTitle
        title={week ? `${week.groupName} - week of ${dateLabel}` : `Week of ${dateLabel}`}
        backHref="/manage/reports"
      />
      <BackLink href="/manage/reports">All reports</BackLink>

      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={3} label="Loading weekly reports" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        </section>
      )}
      {data && data.length === 0 && (
        <section className="cl-panel">
          <ClEmpty icon="doc" tone="cl-tone-sand" title="No weekly reports yet." />
        </section>
      )}
      {data && data.length > 0 && (
        <>
          <section aria-labelledby="wr-sum" className="cl-panel">
            <PanelHead id="wr-sum" title={`Week of ${dateLabel}${week ? ` · ${week.groupName}` : ''}`}>
              {draftCount === 0 && (
                <span className="text-[14px]" style={{ color: 'var(--cl-ok)' }}>
                  Published
                </span>
              )}
            </PanelHead>
            <div className="cl-stats mb-4">
              <ClStat value={data.length} label="Reports" />
              <ClStat value={draftCount} label="Drafts" />
              <ClStat value={data.length - draftCount} label="Published" />
            </div>
            {published && (
              <p role="status" className="m-0 mb-3 px-2 text-[14px]" style={{ color: 'var(--cl-ok)' }}>
                {published}
              </p>
            )}
            {draftCount > 0 && (
              <PublishPanel
                groupId={groupId}
                weekStart={weekStart}
                groupName={week?.groupName ?? 'this group'}
                dateLabel={dateLabel}
                draftCount={draftCount}
                onPublished={(message) => {
                  setPublished(message);
                  reload();
                }}
              />
            )}
          </section>

          <section aria-labelledby="wr-st" className="cl-panel pb-4">
            <PanelHead id="wr-st" title="Students" />
            {data.map((report) => (
              <StudentReportRow key={report.id} report={report} />
            ))}
          </section>
        </>
      )}
    </>
  );
}

function PublishPanel({
  groupId,
  weekStart,
  groupName,
  dateLabel,
  draftCount,
  onPublished,
}: {
  groupId: string;
  weekStart: string;
  groupName: string;
  dateLabel: string;
  draftCount: number;
  onPublished: (message: string) => void;
}) {
  const { token } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const published = await api.admin.publishWeeklyReports(token, groupId, weekStart);
      setConfirming(false);
      onPublished(`Published ${published.length} report${published.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not publish these reports.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ClError message={error} />}
      {!confirming ? (
        <button type="button" className="cl-btnp self-start" onClick={() => setConfirming(true)}>
          Publish {draftCount} report{draftCount === 1 ? '' : 's'}
        </button>
      ) : (
        <div className="cl-soft flex flex-wrap items-center gap-3">
          <p className="m-0 min-w-[240px] flex-1 text-[14px]">
            Publish {draftCount} report{draftCount === 1 ? '' : 's'} for {groupName}, week of {dateLabel}? Students will
            be notified. This cannot be undone.
          </p>
          <button type="button" className="cl-btns" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cl-btnp" onClick={() => void publish()} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      )}
    </div>
  );
}

function StudentReportRow({ report }: { report: WeeklyReportView }) {
  const [open, setOpen] = useState(false);
  const { attendance, homework } = report.content;

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="cl-grow w-full text-start">
        <span className="cl-ic40 cl-tone-sand">
          <ClIcon name="doc" small />
        </span>
        <span className="cl-grow-main">
          <span dir="auto" className="block truncate">
            {report.studentName}
          </span>
          <span className="cl-sub">
            Attendance {attendance.present} of {attendance.expected}
            {(attendance.late > 0 || attendance.absent > 0 || attendance.unmarked > 0) && (
              <>
                {' '}
                ({[
                  attendance.late > 0 && `${attendance.late} late`,
                  attendance.absent > 0 && `${attendance.absent} absent`,
                  attendance.unmarked > 0 && `${attendance.unmarked} unmarked`,
                ]
                  .filter(Boolean)
                  .join(', ')}
                )
              </>
            )}{' '}
            · Homework {homework.submitted} of {homework.due}
          </span>
        </span>
        <span
          className="shrink-0 text-[14px]"
          style={{ color: report.status === 'draft' ? 'var(--cl-warn)' : 'var(--cl-ok)' }}
        >
          {report.status === 'draft' ? 'Draft' : 'Published'}
        </span>
        <span aria-hidden className={open ? 'shrink-0' : 'shrink-0 -rotate-90 rtl:rotate-90'}>
          <ClIcon name="chevDown" small />
        </span>
      </button>

      {open && (
        <div className="cl-soft mx-2 mb-2 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="cl-label">Sessions</span>
            {attendance.sessions.length === 0 ? (
              <p className="cl-muted m-0 text-[14px]">No sessions this week.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {attendance.sessions.map((s) => (
                  <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-[14px]">
                    <span className="min-w-40 flex-1 truncate">{s.title}</span>
                    <span className="cl-muted shrink-0">{formatDate(s.scheduledAt)}</span>
                    <span className="shrink-0">
                      {s.status === 'present' ? 'Present' : s.status === 'late' ? 'Late' : s.status === 'absent' ? 'Absent' : 'Not marked'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="cl-label">Tasks</span>
            {homework.tasks.length === 0 ? (
              <p className="cl-muted m-0 text-[14px]">No tasks due this week.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {homework.tasks.map((t) => (
                  <li key={t.assessmentId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-[14px]">
                    <span className="min-w-40 flex-1 truncate">{t.title}</span>
                    <span className="cl-muted shrink-0">{ASSESSMENT_TYPE_LABEL[t.type as AssessmentType] ?? t.type}</span>
                    <span className="cl-muted shrink-0">{formatDate(t.dueAt)}</span>
                    <span className="shrink-0">{ASSESSMENT_STATUS_LABEL[t.status as AssessmentStatus] ?? t.status}</span>
                    <Score value={t.score} of={t.maxScore} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
