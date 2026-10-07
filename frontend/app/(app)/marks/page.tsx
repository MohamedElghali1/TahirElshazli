'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatDateOnly,
  formatPercent,
} from '@/lib/format';
import type { AssessmentStatus, AssessmentType, CourseProgress, TopicScore, WeeklyReport } from '@/lib/types';
import { Score } from '@/components/ui';
import { ClBar, ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';
import { ClIcon } from '@/components/shell/classroom';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Marks (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "The weekly report *is* the
 * page; the marks table is secondary"). Redesign V2: a Reports list (weekly
 * reports, then issued report documents) that opens a report detail, followed
 * by the course-scoped summary.
 *
 * CLAUDE.md §11.1.2 is drawn most literally here: Performance (marks) and
 * Progress (completion) are two labelled sections that are never averaged
 * together; completion is a bar, performance is a figure.
 */
export default function MarksPage() {
  const { courses, selectedId, loading } = useSelectedCourse();
  const weekly = useApi((token) => api.reports.weekly(token), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = weekly.data?.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageTitle title="Marks & reports" />
      {open ? (
        <WeeklyReportDetail report={open} onClose={() => setOpenId(null)} />
      ) : (
        <>
          <WeeklyReportsList
            data={weekly.data}
            loading={weekly.loading}
            error={weekly.error}
            reload={weekly.reload}
            onOpen={setOpenId}
          />
          <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
            {selectedId && <ReportSummary courseId={selectedId} />}
          </CourseGate>
        </>
      )}
    </>
  );
}

/**
 * The student's weekly reports (`RPT-9`, `REM-031`): not scoped to the course
 * switcher, newest first.
 */
function WeeklyReportsList({
  data,
  loading,
  error,
  reload,
  onOpen,
}: {
  data: WeeklyReport[] | null | undefined;
  loading: boolean;
  error: { message: string } | null | undefined;
  reload: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="cl-panel" aria-labelledby="wr-h">
      <PanelHead title="Weekly reports" id="wr-h" />
      {loading && <ClSkeleton rows={3} label="Loading weekly reports" />}
      {error && <ClError message={error.message} onRetry={reload} />}
      {data && data.length === 0 && <ClEmpty icon="chart" title="No weekly reports yet." />}
      {data &&
        data.map((report) => (
          <button key={report.id} type="button" className="cl-grow" onClick={() => onOpen(report.id)}>
            <span className="cl-ic40 cl-tone-sand">
              <ClIcon name="doc" small />
            </span>
            <span className="cl-grow-main">
              Week of {formatDateOnly(report.weekStart)}
              <span className="cl-sub num">
                Attendance {report.content.attendance.present} of {report.content.attendance.expected} · Homework{' '}
                {report.content.homework.submitted} of {report.content.homework.due}
              </span>
            </span>
          </button>
        ))}
    </section>
  );
}

function WeeklyReportDetail({ report, onClose }: { report: WeeklyReport; onClose: () => void }) {
  const { attendance, homework } = report.content;
  const breakdown = [
    attendance.late > 0 && `${attendance.late} late`,
    attendance.absent > 0 && `${attendance.absent} absent`,
    attendance.unmarked > 0 && `${attendance.unmarked} unmarked`,
  ].filter(Boolean);

  return (
    <section className="cl-panel" aria-labelledby="wd-h">
      <PanelHead title={`Week of ${formatDateOnly(report.weekStart)}`} id="wd-h">
        <button type="button" className="cl-glink" onClick={onClose}>
          <span aria-hidden className="rtl:rotate-180">
            ←
          </span>{' '}
          All reports
        </button>
      </PanelHead>

      <div className="cl-stats num">
        <ClStat value={`${attendance.present} of ${attendance.expected}`} label="Attendance" />
        <ClStat value={`${homework.submitted} of ${homework.due}`} label="Homework handed in" />
      </div>
      {breakdown.length > 0 && <p className="cl-muted num mt-3 px-2 text-[13px]">{breakdown.join(', ')}</p>}

      <hr className="cl-hr" />

      <h3 className="mb-2 px-2 text-[15px] font-medium">Homework this week</h3>
      {homework.tasks.length === 0 ? (
        <p className="cl-muted px-2 text-[14px]">No homework was due this week.</p>
      ) : (
        homework.tasks.map((t) => (
          <div key={t.assessmentId} className="cl-grow flex-wrap">
            <span className="cl-ic40 cl-tone-peach">
              <ClIcon name="pen" small />
            </span>
            <span className="cl-grow-main">
              {t.title}
              <span className="cl-sub num">
                {ASSESSMENT_TYPE_LABEL[t.type as AssessmentType] ?? t.type} · due {formatDate(t.dueAt)} ·{' '}
                {ASSESSMENT_STATUS_LABEL[t.status as AssessmentStatus] ?? t.status}
              </span>
            </span>
            <Score value={t.score} of={t.maxScore} />
          </div>
        ))
      )}
    </section>
  );
}

function ReportSummary({ courseId }: { courseId: string }) {
  const summary = useApi((token) => api.reports.summary(token, courseId), [courseId]);
  const documents = useApi((token) => api.reports.documents(token, courseId), [courseId]);

  if (summary.loading) {
    return (
      <section className="cl-panel" aria-busy>
        <ClSkeleton rows={3} label="Loading your report" />
      </section>
    );
  }

  if (summary.error) {
    return (
      <section className="cl-panel">
        <ClError message={summary.error.message} onRetry={summary.reload} />
      </section>
    );
  }
  if (!summary.data) return null;

  const { performance, progress, strongAreas, needsImprovement } = summary.data;

  return (
    <>
      <section className="cl-panel" aria-labelledby="documents-h">
        <PanelHead title="Report documents" id="documents-h">
          {documents.data && <span className="cl-muted num text-[13px]">{documents.data.length}</span>}
        </PanelHead>
        {documents.loading && <ClSkeleton rows={2} label="Loading documents" />}
        {documents.error && <ClError message={documents.error.message} onRetry={documents.reload} />}
        {documents.data && documents.data.length === 0 && (
          <ClEmpty
            icon="doc"
            title="No reports issued yet"
            hint="Written reports are released by Dr. Tahir at the end of each period."
          />
        )}
        {documents.data?.map((doc) => (
          <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer" className="cl-grow">
            <span className="cl-ic40 cl-tone-sand">
              <ClIcon name="doc" small />
            </span>
            <span className="cl-grow-main">
              {doc.title}
              <span className="cl-sub num">
                {doc.period} · issued {formatDate(doc.issuedAt)}
              </span>
            </span>
            <span className="cl-muted num text-sm">Overall {formatPercent(doc.overallPercentage)}</span>
          </a>
        ))}
      </section>

      <section className="cl-panel" aria-labelledby="performance-heading">
        <PanelHead title="Performance" id="performance-heading" />
        <p className="cl-muted mb-4 px-2 text-[13.5px]">
          What you are scoring on marked work. Separate from how much of the course you have completed.
        </p>
        <div className="cl-stats num">
          <ClStat value={formatPercent(performance.quizAverage)} label="Quiz average" />
          <ClStat value={formatPercent(performance.assignmentAverage)} label="Assignment average" />
          <ClStat value={formatPercent(performance.homeworkSubmissionRate)} label="Homework handed in" />
          <ClStat
            value={formatPercent(performance.overallPercentage)}
            label={`Overall · ${performance.gradedCount} piece${performance.gradedCount === 1 ? '' : 's'} marked`}
          />
        </div>
      </section>

      <ProgressSummary progress={progress} />

      <section className="cl-panel" aria-label="Strengths and areas to improve">
        <div className="grid gap-6 md:grid-cols-2">
          <TopicList
            title="Strong topics"
            color="var(--cl-ok)"
            topics={strongAreas}
            empty="Nothing has been marked in enough topics yet."
          />
          <TopicList
            title="Needs work"
            color="var(--cl-warn)"
            topics={needsImprovement}
            empty="No weak topics identified yet."
          />
        </div>
      </section>
    </>
  );
}

function ProgressSummary({ progress }: { progress: CourseProgress }) {
  // Completion is the figure this panel means (`D-9` retired the attendance
  // branch with `learning_mode`); attendance has its own page.
  const value = progress.completionPercentage;
  const label = 'Course completion';

  return (
    <section className="cl-panel" aria-labelledby="progress-h">
      <PanelHead title="Progress" id="progress-h" />
      <p className="cl-muted px-2 text-[13.5px]">How far through the course you are. This is not a grade.</p>
      <div className="mt-4 flex items-baseline justify-between px-2">
        <span>{label}</span>
        <span className="num text-[22px] leading-none">{formatPercent(value)}</span>
      </div>
      <div className="mt-3 px-2">
        <ClBar value={value} label={label} />
      </div>
      <p className="cl-muted num mt-2 px-2 text-[13px]">
        {progress.completedLessons} of {progress.totalLessons} lessons completed
      </p>
    </section>
  );
}

function TopicList({
  title,
  color,
  topics,
  empty,
}: {
  title: string;
  color: string;
  topics: TopicScore[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-medium" style={{ color }}>
        {title}
      </h3>
      {topics.length === 0 ? (
        <p className="cl-muted text-[14px]">{empty}</p>
      ) : (
        <ul>
          {topics.map((topic) => (
            <li key={topic.topic} className="flex items-center gap-4 py-2 text-[14.5px]">
              <span className="min-w-0 flex-1 truncate">{topic.topic}</span>
              <span className="cl-muted num text-[12.5px]">{topic.gradedCount} marked</span>
              <span className="num w-12 text-end">{formatPercent(topic.percentage)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
