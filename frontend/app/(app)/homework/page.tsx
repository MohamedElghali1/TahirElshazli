'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  ASSESSMENT_STATUS_CHIP,
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
} from '@/lib/format';
import type { AssessmentListItem, AssessmentType } from '@/lib/types';
import { Panel, EmptyState, Loader, Tag, Button, cx, type TagTone } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Homework (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Homework only — no quiz
 * appears here"). Splitting quiz-type work out is content scope this unit
 * does not do (`PHASE_PLAN.md` §1 keeps Quizzes itself out entirely, and this
 * screen's own type filter, including its Quizzes tab, is ported verbatim
 * rather than half-applying that rule and hiding a working feature with
 * nowhere else to go this slice). Course-scoped via the rail's switcher.
 */

// `ASSESSMENT_STATUS_CHIP` (`lib/format.ts`, untouched by the redesign) still
// speaks the legacy tone name `'neutral'` — the new `Tag` scale calls it `'gray'`.
const TONE: Record<string, TagTone> = {
  neutral: 'gray',
  blue: 'blue',
  amber: 'amber',
  green: 'green',
  red: 'red',
  violet: 'violet',
};

const TYPES: { value: AssessmentType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'homework', label: 'Homework' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'quiz', label: 'Quizzes' },
];

export default function HomeworkPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Homework" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <HomeworkList courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function HomeworkList({ courseId }: { courseId: string }) {
  const [type, setType] = useState<AssessmentType | 'all'>('all');

  const { data, error, loading, reload } = useApi(
    (token) => api.assessments.list(token, courseId, type === 'all' ? undefined : { type }),
    [courseId, type],
  );

  // Server-derived status (§5.10) is grouped here, never recomputed.
  const groups = useMemo(() => {
    const open: AssessmentListItem[] = [];
    const waiting: AssessmentListItem[] = [];
    const done: AssessmentListItem[] = [];
    for (const item of data ?? []) {
      if (item.status === 'available') open.push(item);
      else if (item.status === 'submitted') waiting.push(item);
      else done.push(item);
    }
    return { open, waiting, done };
  }, [data]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div role="tablist" aria-label="Filter by type" className="flex flex-wrap gap-1">
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={type === option.value}
            onClick={() => setType(option.value)}
            className={cx(
              'h-6 rounded-md px-3 text-xs transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
              type === option.value
                ? 'bg-wash-hover font-medium text-fg'
                : 'text-fg-3 hover:bg-wash-hover hover:text-fg',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <Panel title="Work" bodyClassName="">
          <div className="flex justify-center p-8">
            <Loader label="Loading homework" />
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
        <Panel title="Work" bodyClassName="">
          <EmptyState
            icon="Clipboard"
            title="Nothing set yet"
            description={
              type === 'all'
                ? 'Homework, assignments and quizzes appear here as they are published.'
                : 'Nothing of this type has been set on the course yet.'
            }
          />
        </Panel>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-6">
          <Group
            title="Open now"
            items={groups.open}
            emptyBody="Nothing is open for submission right now."
          />
          <Group
            title="Submitted, waiting on marking"
            items={groups.waiting}
            emptyBody="Nothing is waiting to be marked."
          />
          <Group title="Marked and locked" items={groups.done} emptyBody="Nothing here yet." />
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
  items: AssessmentListItem[];
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
              <AssessmentRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AssessmentRow({ item }: { item: AssessmentListItem }) {
  const locked = item.status === 'locked';

  const row = (
    <div
      className={cx(
        'flex items-center gap-4 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        locked ? 'opacity-60' : 'hover:bg-wash-hover',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-fg">{item.title}</span>
          <Tag tone={TONE[ASSESSMENT_STATUS_CHIP[item.status]] ?? 'gray'}>
            {ASSESSMENT_STATUS_LABEL[item.status]}
          </Tag>
          {item.isOverdue && item.status === 'available' && <Tag tone="red">Past due</Tag>}
        </div>
        <p className="mt-1 truncate text-xs text-fg-3">
          {ASSESSMENT_TYPE_LABEL[item.type]}
          {item.topics.length > 0 && ` · ${item.topics.join(', ')}`}
        </p>
      </div>

      <div className="hidden shrink-0 text-end sm:block">
        <div className="num text-xs text-fg-3">Due {formatDate(item.dueAt)}</div>
      </div>

      <div className="w-[72px] shrink-0 text-end">
        {item.score === null ? (
          <span className="num text-xs text-fg-4">—</span>
        ) : (
          <span className="num text-base text-fg">
            {item.score}
            <span className="text-fg-4">/{item.maxScore}</span>
          </span>
        )}
      </div>
    </div>
  );

  // A locked assessment is not a link. The detail endpoint would refuse it,
  // and a dead-end navigation is worse than an inert row.
  return locked ? (
    <div aria-disabled>{row}</div>
  ) : (
    <Link href={`/homework/${item.id}`}>{row}</Link>
  );
}
