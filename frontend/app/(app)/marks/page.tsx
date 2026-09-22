'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatPercent } from '@/lib/format';
import type { CourseProgress, TopicScore } from '@/lib/types';
import { Panel, EmptyState, Loader, Meter, StatNumber, Button, Icon } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Marks (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "The weekly report *is* the
 * page; the marks table is secondary" — that layout is a content redesign
 * out of this unit's scope). This is the existing report screen, course-scoped
 * via the rail's switcher.
 *
 * CLAUDE.md §5.1 is drawn most literally here: Performance (marks) and
 * Progress (completion or attendance) are two labelled sections that are
 * never averaged together.
 */
export default function MarksPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Marks" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <ReportSummary courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function ReportSummary({ courseId }: { courseId: string }) {
  const summary = useApi((token) => api.reports.summary(token, courseId), [courseId]);
  const documents = useApi((token) => api.reports.documents(token, courseId), [courseId]);

  if (summary.loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader label="Loading your report" />
      </div>
    );
  }

  if (summary.error) {
    return (
      <div className="p-6">
        <EmptyState
          icon="AlertTriangle"
          title={summary.error.message}
          action={<Button onClick={summary.reload}>Try again</Button>}
        />
      </div>
    );
  }
  if (!summary.data) return null;

  const { performance, progress, strongAreas, needsImprovement } = summary.data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <section aria-labelledby="performance-heading" className="flex flex-col gap-3">
        <h2 id="performance-heading" className="text-base font-semibold text-fg">
          Performance
        </h2>
        <p className="text-xs text-fg-3">
          What you are scoring on marked work. Separate from how much of the course you have
          completed.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatNumber label="Quiz average" value={formatPercent(performance.quizAverage)} />
          <StatNumber
            label="Assignment average"
            value={formatPercent(performance.assignmentAverage)}
          />
          <StatNumber
            label="Homework handed in"
            value={formatPercent(performance.homeworkSubmissionRate)}
          />
          <StatNumber
            label="Overall"
            value={formatPercent(performance.overallPercentage)}
            caption={`${performance.gradedCount} piece${performance.gradedCount === 1 ? '' : 's'} marked`}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <ProgressSummary progress={progress} />

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
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
            <span className="num text-xs text-fg-3">{documents.data.length}</span>
          )
        }
        bodyClassName=""
      >
        {documents.loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading documents" />
          </div>
        )}
        {documents.error && (
          <div className="p-6">
            <EmptyState
              icon="AlertTriangle"
              title={documents.error.message}
              action={<Button onClick={documents.reload}>Try again</Button>}
            />
          </div>
        )}
        {documents.data && documents.data.length === 0 && (
          <EmptyState
            icon="FileText"
            title="No reports issued yet"
            description="Written reports are released by Dr. Tahir at the end of each period."
          />
        )}
        {documents.data && documents.data.length > 0 && (
          <ul className="divide-y divide-border-light">
            {documents.data.map((doc) => (
              <li key={doc.id}>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-4 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
                >
                  <Icon name="FileText" size={16} className="shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-fg">{doc.title}</p>
                    <p className="num mt-1 text-xs text-fg-3">
                      {doc.period} · issued {formatDate(doc.issuedAt)}
                    </p>
                  </div>
                  <span className="num shrink-0 text-base text-fg">
                    {formatPercent(doc.overallPercentage)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ProgressSummary({ progress }: { progress: CourseProgress }) {
  // See the matching comment in `app/(app)/dashboard/page.tsx`'s `CourseCard`
  // - `CourseProgress` carries no mode field, so this is inferred from which
  // figures the course actually has.
  const isRecorded = progress.totalLessons > 0 || progress.totalSessions === 0;
  const value = isRecorded ? progress.completionPercentage : progress.attendancePercentage;
  const label = isRecorded ? 'Course completion' : 'Attendance';
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons completed`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <Panel title="Progress">
      <p className="text-xs text-fg-3">How far through the course you are. This is not a grade.</p>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-base text-fg-2">{label}</span>
        <span className="num text-xl leading-none text-fg">{formatPercent(value)}</span>
      </div>
      <div className="mt-3">
        <Meter value={value} name={label} />
      </div>
      <p className="num mt-2 text-xs text-fg-4">{detail}</p>
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
        <div className="px-4 py-6">
          <p className="text-base text-fg-4">{empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-light">
          {topics.map((topic) => (
            <li key={topic.topic} className="flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-base text-fg">{topic.topic}</span>
              <span className="num shrink-0 text-xxs text-fg-4">{topic.gradedCount} marked</span>
              <span className="num w-[48px] shrink-0 text-end text-base text-fg">
                {formatPercent(topic.percentage)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
