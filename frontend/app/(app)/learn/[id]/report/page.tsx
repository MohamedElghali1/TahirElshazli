'use client';

import { use } from 'react';
import { FileTextIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatPercent } from '@/lib/format';
import type { CourseProgress, TopicScore } from '@/lib/types';
import {
  EmptyState,
  ErrorState,
  Meter,
  Metric,
  Panel,
  RowsSkeleton,
  Skeleton,
} from '@/components/ui';
import { PageBody, StatRow } from '@/components/app/page-parts';

/**
 * The report screen is where CLAUDE.md §5.1 is most visible: the top row is
 * PERFORMANCE (marks) and the panel below it is PROGRESS (completion or
 * attendance). They are labelled, separated and never averaged together.
 */
export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const summary = useApi((token) => api.reports.summary(token, id), [id]);
  const documents = useApi((token) => api.reports.documents(token, id), [id]);

  if (summary.loading) {
    return (
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        <StatRow>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[84px]" />
          ))}
        </StatRow>
        <Skeleton className="h-[200px]" />
      </PageBody>
    );
  }

  if (summary.error) {
    return <ErrorState message={summary.error.message} onRetry={summary.reload} />;
  }
  if (!summary.data) return null;

  const { performance, progress, strongAreas, needsImprovement } = summary.data;

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      <section aria-labelledby="performance-heading" className="flex flex-col gap-[var(--sp-3)]">
        <h2
          id="performance-heading"
          className="text-[var(--fs-base)] font-semibold text-fg"
        >
          Performance
        </h2>
        <p className="text-[var(--fs-xs)] text-fg-3">
          What you are scoring on marked work. Separate from how much of the
          course you have completed.
        </p>
        <StatRow>
          <Metric
            label="Quiz average"
            value={formatPercent(performance.quizAverage)}
          />
          <Metric
            label="Assignment average"
            value={formatPercent(performance.assignmentAverage)}
          />
          <Metric
            label="Homework handed in"
            value={formatPercent(performance.homeworkSubmissionRate)}
          />
          <Metric
            label="Overall"
            value={formatPercent(performance.overallPercentage)}
            hint={`${performance.gradedCount} piece${performance.gradedCount === 1 ? '' : 's'} marked`}
          />
        </StatRow>
      </section>

      <div className="grid gap-[var(--sp-6)] xl:grid-cols-[2fr_3fr]">
        <ProgressSummary progress={progress} />

        <div className="grid gap-[var(--sp-6)] sm:grid-cols-2 xl:grid-cols-1">
          <TopicPanel
            title="Strong topics"
            topics={strongAreas}
            empty="Nothing has been marked in enough topics yet."
          />
          <TopicPanel
            title="Needs work"
            topics={needsImprovement}
            empty="No weak topics identified yet."
          />
        </div>
      </div>

      <Panel
        title="Report documents"
        action={
          documents.data && (
            <span className="num text-[var(--fs-xs)] text-fg-3">
              {documents.data.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {documents.loading && <RowsSkeleton rows={2} />}
        {documents.error && (
          <ErrorState
            message={documents.error.message}
            onRetry={documents.reload}
          />
        )}
        {documents.data && documents.data.length === 0 && (
          <EmptyState
            title="No reports issued yet"
            body="Written reports are released by Dr. Tahir at the end of each period."
          />
        )}
        {documents.data && documents.data.length > 0 && (
          <ul className="rows">
            {documents.data.map((doc) => (
              <li key={doc.id}>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="row flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
                >
                  <FileTextIcon size={16} className="shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[var(--fs-base)] text-fg">
                      {doc.title}
                    </p>
                    <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-fg-3">
                      {doc.period} · issued {formatDate(doc.issuedAt)}
                    </p>
                  </div>
                  <span className="num shrink-0 text-[var(--fs-base)] text-fg">
                    {formatPercent(doc.overallPercentage)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}

function ProgressSummary({ progress }: { progress: CourseProgress }) {
  const isRecorded = progress.type === 'recorded';
  const value = isRecorded
    ? progress.completionPercentage
    : progress.attendancePercentage;
  const label = isRecorded ? 'Course completion' : 'Attendance';
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons completed`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <Panel title="Progress">
      <p className="text-[var(--fs-xs)] text-fg-3">
        How far through the course you are. This is not a grade.
      </p>
      <div className="mt-[var(--sp-4)] flex items-baseline justify-between">
        <span className="text-[var(--fs-base)] text-fg-2">
          {label}
        </span>
        <span className="num text-[var(--fs-xl)] leading-none text-fg">
          {formatPercent(value)}
        </span>
      </div>
      <div className="mt-[var(--sp-3)]">
        <Meter value={value} label={label} />
      </div>
      <p className="num mt-[var(--sp-2)] text-[var(--fs-xs)] text-fg-4">
        {detail}
      </p>
    </Panel>
  );
}

function TopicPanel({
  title,
  topics,
  empty,
}: {
  title: string;
  topics: TopicScore[];
  empty: string;
}) {
  return (
    <Panel title={title} bodyClassName="">
      {topics.length === 0 ? (
        <div className="px-[var(--sp-4)] py-[var(--sp-6)]">
          <p className="text-[var(--fs-base)] text-fg-4">{empty}</p>
        </div>
      ) : (
        <ul className="rows">
          {topics.map((topic) => (
            <li
              key={topic.topic}
              className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)]"
            >
              <span className="min-w-0 flex-1 truncate text-[var(--fs-base)] text-fg">
                {topic.topic}
              </span>
              <span className="num shrink-0 text-[var(--fs-xxs)] text-fg-4">
                {topic.gradedCount} marked
              </span>
              <span className="num w-[48px] shrink-0 text-end text-[var(--fs-base)] text-fg">
                {formatPercent(topic.percentage)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
