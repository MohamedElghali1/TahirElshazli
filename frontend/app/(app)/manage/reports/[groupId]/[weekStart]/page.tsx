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
import {
  Button,
  EmptyState,
  Icon,
  InlineBanner,
  Loader,
  Panel,
  Score,
  Tag,
  cx,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * One group-week's weekly reports (`REM-031`, `D-63`, `D-66`). Admin only,
 * same 403 as the list page.
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
          <EmptyState icon="ChartPie" title="No weekly reports yet." />
        )}
        {data && data.length > 0 && (
          <>
            {published && <InlineBanner tone="green">{published}</InlineBanner>}
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
            <Panel bodyClassName="">
              <div className="flex flex-col divide-y divide-border-light">
                {data.map((report) => (
                  <StudentReportRow key={report.id} report={report} />
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
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
      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      {!confirming ? (
        <Button variant="primary" onClick={() => setConfirming(true)} className="self-start">
          Publish {draftCount} report{draftCount === 1 ? '' : 's'}
        </Button>
      ) : (
        <InlineBanner
          tone="amber"
          action={
            <div className="flex items-center gap-2">
              <Button size="small" variant="tertiary" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="small" variant="primary" onClick={() => void publish()} disabled={busy}>
                {busy ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          }
        >
          Publish {draftCount} report{draftCount === 1 ? '' : 's'} for {groupName}, week of{' '}
          {dateLabel}? Students will be notified. This cannot be undone.
        </InlineBanner>
      )}
    </div>
  );
}

const STATUS_TONE = { draft: 'amber', published: 'green' } as const;

function StudentReportRow({ report }: { report: WeeklyReportView }) {
  const [open, setOpen] = useState(false);
  const { attendance, homework } = report.content;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
      >
        <span dir="auto" className="min-w-40 flex-1 truncate font-medium text-fg">
          {report.studentName}
        </span>
        <Tag tone={STATUS_TONE[report.status]}>
          {report.status === 'draft' ? 'Draft' : 'Published'}
        </Tag>
        <span className="num shrink-0 text-xs text-fg-3">
          Attendance {attendance.present} of {attendance.expected}
          {(attendance.late > 0 || attendance.absent > 0 || attendance.unmarked > 0) && (
            <span className="text-fg-4">
              {' '}
              ({attendance.late > 0 && `${attendance.late} late`}
              {attendance.late > 0 && (attendance.absent > 0 || attendance.unmarked > 0) && ', '}
              {attendance.absent > 0 && `${attendance.absent} absent`}
              {attendance.absent > 0 && attendance.unmarked > 0 && ', '}
              {attendance.unmarked > 0 && `${attendance.unmarked} unmarked`})
            </span>
          )}
        </span>
        <span className="num shrink-0 text-xs text-fg-3">
          Homework {homework.submitted} of {homework.due}
        </span>
        <Icon
          name="ChevronDown"
          size={14}
          className={cx(
            'shrink-0 text-fg-4 transition-transform duration-[var(--dur-fast)]',
            !open && '-rotate-90',
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 bg-surface-2 px-4 py-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.04em] text-fg-3">
              Sessions
            </span>
            {attendance.sessions.length === 0 ? (
              <p className="text-base text-fg-4">No sessions this week.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-light">
                {attendance.sessions.map((s) => (
                  <li
                    key={s.sessionId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2 text-base"
                  >
                    <span className="min-w-40 flex-1 truncate text-fg">{s.title}</span>
                    <span className="num shrink-0 text-xs text-fg-3">
                      {formatDate(s.scheduledAt)}
                    </span>
                    <span className="shrink-0 text-xs text-fg-3">
                      {s.status === 'present' ? 'Present' : s.status === 'late' ? 'Late' : s.status === 'absent' ? 'Absent' : 'Not marked'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.04em] text-fg-3">
              Tasks
            </span>
            {homework.tasks.length === 0 ? (
              <p className="text-base text-fg-4">No tasks due this week.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-light">
                {homework.tasks.map((t) => (
                  <li
                    key={t.assessmentId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2 text-base"
                  >
                    <span className="min-w-40 flex-1 truncate text-fg">{t.title}</span>
                    <span className="shrink-0 text-xs text-fg-3">
                      {ASSESSMENT_TYPE_LABEL[t.type as AssessmentType] ?? t.type}
                    </span>
                    <span className="num shrink-0 text-xs text-fg-3">{formatDate(t.dueAt)}</span>
                    <span className="shrink-0 text-xs text-fg-3">
                      {ASSESSMENT_STATUS_LABEL[t.status as AssessmentStatus] ?? t.status}
                    </span>
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
