'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  CheckCircleIcon,
  CircleIcon,
  VideoCameraIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatPercent,
  MATERIAL_CATEGORY_LABEL,
} from '@/lib/format';
import type { CourseProgress, LiveSession, MaterialCategory } from '@/lib/types';
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Meter,
  Metric,
  Panel,
  Skeleton,
} from '@/components/ui';
import { PageBody, StatRow } from '@/components/app/page-parts';

export default function CourseOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.dashboard.get(token, id),
    [id],
  );

  if (loading) {
    return (
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        <StatRow>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[84px]" />
          ))}
        </StatRow>
        <Skeleton className="h-[220px]" />
      </PageBody>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const { stats, progress, quickAccess, nextLiveSession } = data;

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      {/* Performance figures. Kept apart from the completion block below -
          CLAUDE.md §5.1 forbids merging the two into one number. */}
      <StatRow>
        <Metric
          label="Homework pending"
          value={stats.homeworkPending}
          href={`/learn/${id}/assessments`}
        />
        <Metric
          label="Marked and waiting"
          value={stats.answersAvailable}
          href={`/learn/${id}/assessments`}
        />
        <Metric
          label="New recordings"
          value={stats.newRecordings}
          href={`/learn/${id}/recordings`}
        />
        <Metric
          label="Overall report"
          value={formatPercent(stats.overallReportPercentage)}
          hint={
            stats.overallReportPercentage === null
              ? 'Nothing marked yet'
              : 'Across marked work'
          }
          href={`/learn/${id}/report`}
        />
      </StatRow>

      <div className="grid gap-[var(--sp-6)] xl:grid-cols-[3fr_2fr]">
        <ProgressPanel courseId={id} progress={progress} />

        <div className="flex flex-col gap-[var(--sp-6)]">
          <NextSessionPanel courseId={id} session={nextLiveSession} />
          <QuickAccessPanel courseId={id} counts={quickAccess} />
        </div>
      </div>
    </PageBody>
  );
}

/* --- Completion or attendance, depending on the learning mode (§5.2) ----- */

function ProgressPanel({
  courseId,
  progress,
}: {
  courseId: string;
  progress: CourseProgress;
}) {
  if (progress.type === 'recorded') {
    const done = progress.checkpoints.filter((c) => c.completedAt !== null);
    return (
      <Panel
        title="Course completion"
        action={
          <span className="num text-[var(--fs-base)] text-[var(--fg-secondary)]">
            {progress.completedLessons} / {progress.totalLessons}
          </span>
        }
        bodyClassName=""
      >
        <div className="px-[var(--sp-4)] pb-[var(--sp-4)] pt-[var(--sp-4)]">
          <Meter value={progress.completionPercentage} label="Course completion" />
          <p className="mt-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {formatPercent(progress.completionPercentage)} of lessons completed.
            This tracks how much of the course you have worked through, not your
            marks.
          </p>
        </div>

        {progress.checkpoints.length === 0 ? (
          <EmptyState
            title="No lessons yet"
            body="Checkpoints appear here as lessons are published to the course."
          />
        ) : (
          <ul className="rows border-t border-[var(--border-light)]">
            {progress.checkpoints.map((checkpoint) => (
              <li
                key={checkpoint.lessonId}
                className="row flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
              >
                {checkpoint.completedAt ? (
                  <CheckCircleIcon
                    size={16}
                    weight="fill"
                    className="shrink-0 text-[var(--chip-green-fg)]"
                  />
                ) : (
                  <CircleIcon size={16} className="shrink-0 text-[var(--fg-muted)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-[var(--fs-base)] text-[var(--fg-primary)]">
                  {checkpoint.title}
                </span>
                <span className="num shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                  {checkpoint.completedAt ? formatDate(checkpoint.completedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-[var(--border-light)] px-[var(--sp-4)] py-[var(--sp-3)]">
          <p className="num text-[var(--fs-xs)] text-[var(--fg-muted)]">
            {done.length} checkpoint{done.length === 1 ? '' : 's'} reached
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Attendance"
      action={
        <span className="num text-[var(--fs-base)] text-[var(--fg-secondary)]">
          {progress.attendedSessions} / {progress.totalSessions}
        </span>
      }
      bodyClassName=""
    >
      <div className="px-[var(--sp-4)] py-[var(--sp-4)]">
        <Meter value={progress.attendancePercentage} label="Attendance" />
        <p className="mt-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {formatPercent(progress.attendancePercentage)} of sessions attended.
          Attendance is a record of turning up, not a mark.
        </p>
      </div>

      {progress.timeline.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          body="Your attendance record starts with the first timetabled class."
        />
      ) : (
        <ul className="rows border-t border-[var(--border-light)]">
          {progress.timeline.map((entry) => (
            <li
              key={entry.sessionId}
              className="row flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
            >
              {entry.attended ? (
                <CheckCircleIcon
                  size={16}
                  weight="fill"
                  className="shrink-0 text-[var(--chip-green-fg)]"
                />
              ) : (
                <XCircleIcon
                  size={16}
                  weight="fill"
                  className="shrink-0 text-[var(--chip-red-fg)]"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[var(--fs-base)] text-[var(--fg-primary)]">
                {entry.title}
              </span>
              <span className="num shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                {formatDate(entry.sessionDate)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[var(--border-light)] px-[var(--sp-4)] py-[var(--sp-3)]">
        <ButtonLink href={`/learn/${courseId}/sessions`} size="sm">
          Open timetable
        </ButtonLink>
      </div>
    </Panel>
  );
}

/* --- The next class: a time and a link. Nothing embeds. ------------------ */

function NextSessionPanel({
  courseId,
  session,
}: {
  courseId: string;
  session: LiveSession | null;
}) {
  if (!session) {
    return (
      <Panel title="Next live session">
        <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          Nothing scheduled. The next class appears here with its joining link
          as soon as it is set.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Next live session"
      action={
        <Link
          href={`/learn/${courseId}/sessions`}
          className="text-[var(--fs-xs)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]"
        >
          All sessions
        </Link>
      }
    >
      <h3 className="text-[var(--fs-md)] font-medium text-[var(--fg-primary)]">
        {session.title}
      </h3>
      <p className="num mt-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)]">
        {formatDateTime(session.scheduledAt)}
      </p>
      <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
        {formatMinutes(session.durationMinutes)}
      </p>
      <Button
        variant="primary"
        className="mt-[var(--sp-4)] w-full"
        onClick={() =>
          window.open(session.zoomLink, '_blank', 'noopener,noreferrer')
        }
      >
        <VideoCameraIcon size={14} weight="fill" />
        Join the class
      </Button>
      <p className="mt-[var(--sp-2)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
        Opens in a new tab.
      </p>
    </Panel>
  );
}

/* --- Materials by category, straight from the dashboard's counts --------- */

function QuickAccessPanel({
  courseId,
  counts,
}: {
  courseId: string;
  counts: Record<MaterialCategory, number>;
}) {
  const entries = Object.entries(counts) as [MaterialCategory, number][];
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <Panel title="Materials" bodyClassName="">
      {total === 0 ? (
        <EmptyState
          title="Nothing uploaded yet"
          body="Notes, study material and past papers appear here as they are added."
        />
      ) : (
        <ul className="rows">
          {entries.map(([category, count]) => (
            <li key={category}>
              <Link
                href={`/learn/${courseId}/materials?category=${category}`}
                className="row flex items-center justify-between gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
              >
                <span className="text-[var(--fs-base)] text-[var(--fg-primary)]">
                  {MATERIAL_CATEGORY_LABEL[category]}
                </span>
                <span className="num text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                  {count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
