'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatRelative,
  isQuizWork,
} from '@/lib/format';
import type { AssessmentDetail } from '@/lib/types';
import {
  Panel,
  EmptyState,
  Loader,
  Tag,
  Button,
  ButtonLink,
  Score,
  SyncStatus,
  cx,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Student Quizzes surface (`WORK-4`, `docs/PRODUCT_SPEC.md` §6, `CLAUDE.md` §5.8).
 *
 * Course-scoped via the rail's switcher. Driven entirely by assessments with
 * `workType: 'google_form'`. There is deliberately no in-platform quiz engine,
 * iframe embed, or answer capture — students open the published Google Form
 * via a primary link, and results sync back asynchronously from Google.
 *
 * Exactly four states are rendered:
 *   1. Available, not answered -> primary "Open quiz" link leaving the app.
 *   2. Being marked -> SyncStatus with sentence-case copy, no score.
 *   3. Marked -> Score with denominator plus SyncStatus stamp.
 *   4. Locked -> inert row matching homework conventions.
 */

export default function QuizzesPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Quizzes" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <QuizList courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function QuizList({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    async (token) => {
      const list = await api.assessments.list(token, courseId);
      const quizItems = list.filter((item) => isQuizWork(item.workType));
      const details = await Promise.all(
        quizItems.map((item) => api.assessments.get(token, item.id)),
      );
      return details;
    },
    [courseId],
  );

  // Server-derived status and work expectation are grouped here, never recomputed.
  const groups = useMemo(() => {
    const open: AssessmentDetail[] = [];
    const waiting: AssessmentDetail[] = [];
    const done: AssessmentDetail[] = [];
    for (const item of data ?? []) {
      if (item.work.kind !== 'google_form') continue;
      const work = item.work;
      if (item.status === 'available' && !work.completed) {
        open.push(item);
      } else if (work.completed && work.score === null) {
        waiting.push(item);
      } else {
        done.push(item);
      }
    }
    return { open, waiting, done };
  }, [data]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {loading && (
        <Panel title="Quizzes" bodyClassName="">
          <div className="flex justify-center p-8">
            <Loader label="Loading quizzes" />
          </div>
        </Panel>
      )}

      {error && (
        <EmptyState
          icon="AlertTriangle"
          title={error.message}
          action={<Button onClick={reload}>Try again</Button>}
        />
      )}

      {data && data.length === 0 && (
        <Panel title="Quizzes" bodyClassName="">
          <EmptyState
            icon="Clipboard"
            title="Nothing set yet"
            description="Quizzes appear here as they are set."
          />
        </Panel>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-6">
          <Group
            title="Open now"
            items={groups.open}
            emptyBody="Nothing is open right now."
          />
          <Group
            title="Submitted, waiting on marking"
            items={groups.waiting}
            emptyBody="Nothing is waiting to be marked."
          />
          <Group
            title="Marked and locked"
            items={groups.done}
            emptyBody="Nothing here yet."
          />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  emptyBody,
}: {
  title: string;
  items: AssessmentDetail[];
  emptyBody: string;
}) {
  return (
    <Panel
      title={title}
      action={<span className="num text-xs text-fg-3">{items.length}</span>}
      bodyClassName=""
    >
      {items.length === 0 ? (
        <div className="px-4 py-6">
          <p className="text-base text-fg-4">{emptyBody}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-light">
          {items.map((item) => (
            <li key={item.id}>
              <QuizRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function QuizRow({ item }: { item: AssessmentDetail }) {
  if (item.work.kind !== 'google_form') return null;
  const work = item.work;

  // Exactly four states, driven by AssessmentStatus + WorkExpectation:
  const isMarked = work.score !== null;
  const isBeingMarked = !isMarked && work.completed;
  const isAvailable = !isMarked && !isBeingMarked && item.status === 'available';
  const isLocked = !isMarked && !isBeingMarked && !isAvailable;

  const statusTone: TagTone = isMarked
    ? 'green'
    : isBeingMarked
      ? 'amber'
      : isLocked
        ? 'gray'
        : 'blue';

  // No `corrected` branch: `computeStatus` returns `submitted` the moment an
  // external result lands, so google_form work never reaches `corrected`.
  const statusLabel = isMarked
    ? 'Marked'
    : isBeingMarked
      ? ASSESSMENT_STATUS_LABEL.submitted
      : isLocked
        ? ASSESSMENT_STATUS_LABEL.locked
        : ASSESSMENT_STATUS_LABEL.available;

  const row = (
    <div
      className={cx(
        'flex items-center gap-4 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        isLocked ? 'opacity-60' : 'hover:bg-wash-hover',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-fg">{item.title}</span>
          <Tag tone={statusTone}>{statusLabel}</Tag>
          {item.isOverdue && isAvailable && <Tag tone="red">Past due</Tag>}
        </div>
        <p className="mt-1 truncate text-xs text-fg-3">
          {ASSESSMENT_TYPE_LABEL[item.type]}
          {item.topics.length > 0 && ` · ${item.topics.join(', ')}`}
        </p>
      </div>

      <div className="hidden shrink-0 text-end sm:block">
        <div className="num text-xs text-fg-3">Due {formatDate(item.dueAt)}</div>
      </div>

      <div className="shrink-0 text-end">
        {isAvailable && (
          <ButtonLink
            href={work.formUrl || '#'}
            target="_blank"
            rel="noreferrer"
            variant="primary"
            size="small"
          >
            Open quiz
          </ButtonLink>
        )}

        {isBeingMarked && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-fg-3">
              Submitted — waiting on Google to mark it
            </span>
            <SyncStatus
              state="ok"
              lastSynced={work.lastSyncedAt ? formatRelative(work.lastSyncedAt) : undefined}
            />
          </div>
        )}

        {isMarked && (
          <div className="flex flex-col items-end gap-1">
            <Score value={work.score} of={work.maxScore} />
            {work.lastSyncedAt && (
              <SyncStatus
                state="ok"
                lastSynced={formatRelative(work.lastSyncedAt)}
              />
            )}
          </div>
        )}

        {isLocked && (
          <div className="w-[72px] text-end">
            <Score value={null} />
          </div>
        )}
      </div>
    </div>
  );

  // A locked assessment is inert (not a link, opacity-60, aria-disabled).
  // Other states also do not navigate inside the app; form interactions
  // happen on Google via the external link on the available state.
  return isLocked ? <div aria-disabled>{row}</div> : <div>{row}</div>;
}
