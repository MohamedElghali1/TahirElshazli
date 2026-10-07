'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatRelative,
  isQuizWork,
} from '@/lib/format';
import type { AssessmentDetail, AssessmentListItem } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { CourseGate } from '@/components/student/course-gate';
import { CourseHeader } from '@/components/student/course-header';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * The course's Stream (`docs/PRODUCT_SPEC.md` §6, `STU-4`). One flat list,
 * newest first: homework, assignments and quizzes together, each row carrying
 * its own status. Course-scoped via the course picker.
 *
 * `google_form` work (`isQuizWork`) has no in-app hand-in: its row keeps the
 * quizzes page's behaviour - an "Open quiz" link out to the form and the
 * synced result - so it needs the detail's `work` block, fetched alongside.
 *
 * Statuses are the server's (`assessments.service.ts:computeStatus`), shown
 * and never recomputed.
 */

interface StreamItem {
  item: AssessmentListItem;
  /** Present for quiz work that is open to the student. */
  detail: AssessmentDetail | null;
}

export default function HomeworkPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Stream" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && (
          <>
            <CourseHeader />
            <HomeworkList courseId={selectedId} />
          </>
        )}
      </CourseGate>
    </>
  );
}

function HomeworkList({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    async (token): Promise<StreamItem[]> => {
      const list = await api.assessments.list(token, courseId);
      return Promise.all(
        list.map(async (item) => ({
          item,
          detail:
            isQuizWork(item.workType) && item.status !== 'locked'
              ? await api.assessments.get(token, item.id).catch(() => null)
              : null,
        })),
      );
    },
    [courseId],
  );

  const rows = useMemo(() => {
    const at = (i: AssessmentListItem) => new Date(i.availableFrom || i.dueAt).getTime();
    return [...(data ?? [])].sort((a, b) => at(b.item) - at(a.item));
  }, [data]);

  return (
    <section className="cl-panel" aria-labelledby="stream-h">
      <PanelHead id="stream-h" title="Stream" />

      {loading && <ClSkeleton label="Loading homework" />}
      {error && <ClError message={error.message} onRetry={reload} />}

      {data && data.length === 0 && (
        <ClEmpty
          icon="pen"
          tone="cl-tone-peach"
          title="Nothing set yet"
          hint="Homework, assignments and quizzes appear here as they are published."
        />
      )}

      {rows.map((r) => (
        <AssessmentRow key={r.item.id} item={r.item} detail={r.detail} />
      ))}
    </section>
  );
}

/** "Corrected · 17 / 20"; an unmarked score is an em-dash, never 0. */
function markedText(score: number | null, max: number): string {
  return `${ASSESSMENT_STATUS_LABEL.corrected} · ${score ?? '—'} / ${max}`;
}

function statusOf(item: AssessmentListItem): { text: string; color?: string } {
  if (item.status === 'locked') return { text: ASSESSMENT_STATUS_LABEL.locked };
  if (item.status === 'available') {
    return item.isOverdue
      ? { text: 'Missing', color: 'var(--cl-bad)' }
      : { text: `Due ${formatDate(item.dueAt)}` };
  }
  if (item.status === 'submitted') return { text: 'Handed in', color: 'var(--cl-ok)' };
  return { text: markedText(item.score, item.maxScore), color: 'var(--cl-ok)' };
}

function AssessmentRow({ item, detail }: { item: AssessmentListItem; detail: AssessmentDetail | null }) {
  const locked = item.status === 'locked';
  const quiz = item.type === 'quiz';
  const form = detail?.work.kind === 'google_form' ? detail.work : null;

  // Quiz work: the quizzes page's states, from the server's work block.
  let right: React.ReactNode = null;
  if (form) {
    if (form.score !== null) {
      right = (
        <span className="text-[14px]" style={{ color: 'var(--cl-ok)' }}>
          {markedText(form.score, form.maxScore ?? item.maxScore)}
        </span>
      );
    } else if (form.completed) {
      right = (
        <span className="text-[13px]" style={{ color: 'var(--cl-ok)' }}>
          Handed in — waiting on Google to mark it
          {form.lastSyncedAt && <span className="cl-muted"> · synced {formatRelative(form.lastSyncedAt)}</span>}
        </span>
      );
    } else if (item.status === 'available') {
      right = (
        <span className="flex flex-col items-end gap-1.5">
          <span className="text-[13px]" style={item.isOverdue ? { color: 'var(--cl-bad)' } : undefined}>
            {item.isOverdue ? 'Missing' : ASSESSMENT_STATUS_LABEL.available}
          </span>
          <a href={form.formUrl || '#'} target="_blank" rel="noreferrer" className="cl-btnp">
            Open quiz
          </a>
        </span>
      );
    }
  }
  if (!right) {
    const st = statusOf(item);
    right = (
      <span className="text-[14px]" style={st.color ? { color: st.color } : undefined}>
        {st.text}
      </span>
    );
  }

  const main = (
    <>
      <span className={`cl-ic40 ${quiz ? 'cl-tone-blue' : 'cl-tone-peach'}`}>
        <ClIcon name={quiz ? 'quiz' : 'pen'} small />
      </span>
      <span className="cl-grow-main">
        {item.title}
        <span className="cl-sub">
          {ASSESSMENT_TYPE_LABEL[item.type]} · posted {formatDate(item.availableFrom)} · due {formatDate(item.dueAt)}
          {item.topics.length > 0 && ` · ${item.topics.join(', ')}`}
        </span>
      </span>
    </>
  );
  const rightBox = <span className="shrink-0 text-end">{right}</span>;

  // A locked assessment is not a link (the detail endpoint would refuse it).
  if (locked) {
    return (
      <div className="cl-grow" aria-disabled style={{ opacity: 0.6, cursor: 'default' }}>
        {main}
        {rightBox}
      </div>
    );
  }
  // An open quiz holds its own "Open quiz" link, so the row cannot itself be one.
  if (form && right && item.status === 'available' && !form.completed && form.score === null) {
    return (
      <div className="cl-grow" style={{ cursor: 'default' }}>
        <Link href={`/homework/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4">
          {main}
        </Link>
        {rightBox}
      </div>
    );
  }
  return (
    <Link href={`/homework/${item.id}`} className="cl-grow">
      {main}
      {rightBox}
    </Link>
  );
}
