'use client';

import { use, useMemo, useState } from 'react';
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
import type { ChipTone } from '@/components/ui';
import {
  Chip,
  EmptyState,
  ErrorState,
  Panel,
  RowsSkeleton,
  cx,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

const TYPES: { value: AssessmentType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'homework', label: 'Homework' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'quiz', label: 'Quizzes' },
];

export default function AssessmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [type, setType] = useState<AssessmentType | 'all'>('all');

  const { data, error, loading, reload } = useApi(
    (token) =>
      api.assessments.list(token, id, type === 'all' ? undefined : { type }),
    [id, type],
  );

  // Server-derived status (§5.10) is grouped here, never recomputed. "Needs
  // your attention" is a presentation grouping over the status the API sent.
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
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      <div
        role="tablist"
        aria-label="Filter by type"
        className="flex flex-wrap gap-[var(--sp-1)]"
      >
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={type === option.value}
            onClick={() => setType(option.value)}
            className={cx(
              'h-[var(--h-sm)] rounded-[var(--r-md)] px-[var(--sp-3)] text-[var(--fs-xs)]',
              'transition-colors duration-[var(--dur-fast)]',
              type === option.value
                ? 'bg-[var(--bg-wash)] font-medium text-fg'
                : 'text-fg-3 hover:bg-[var(--bg-wash-subtle)] hover:text-fg',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <Panel title="Work" bodyClassName="">
          <RowsSkeleton rows={5} />
        </Panel>
      )}

      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.length === 0 && (
        <Panel title="Work" bodyClassName="">
          <EmptyState
            title="Nothing set yet"
            body={
              type === 'all'
                ? 'Homework, assignments and quizzes appear here as they are published.'
                : 'Nothing of this type has been set on the course yet.'
            }
          />
        </Panel>
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-[var(--sp-6)]">
          <Group
            title="Open now"
            items={groups.open}
            courseId={id}
            emptyBody="Nothing is open for submission right now."
          />
          <Group
            title="Submitted, waiting on marking"
            items={groups.waiting}
            courseId={id}
            emptyBody="Nothing is waiting to be marked."
          />
          <Group
            title="Marked and locked"
            items={groups.done}
            courseId={id}
            emptyBody="Nothing here yet."
          />
        </div>
      )}
    </PageBody>
  );
}

function Group({
  title,
  items,
  courseId,
  emptyBody,
}: {
  title: string;
  items: AssessmentListItem[];
  courseId: string;
  emptyBody: string;
}) {
  return (
    <Panel
      title={title}
      action={
        <span className="num text-[var(--fs-xs)] text-fg-3">
          {items.length}
        </span>
      }
      bodyClassName=""
    >
      {items.length === 0 ? (
        <div className="px-[var(--sp-4)] py-[var(--sp-6)]">
          <p className="text-[var(--fs-base)] text-fg-4">{emptyBody}</p>
        </div>
      ) : (
        <ul className="rows">
          {items.map((item) => (
            <li key={item.id}>
              <AssessmentRow item={item} courseId={courseId} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AssessmentRow({
  item,
  courseId,
}: {
  item: AssessmentListItem;
  courseId: string;
}) {
  const locked = item.status === 'locked';

  const row = (
    <div
      className={cx(
        'row flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)]',
        'transition-colors duration-[var(--dur-fast)]',
        locked && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--sp-2)]">
          <span className="truncate text-[var(--fs-base)] font-medium text-fg">
            {item.title}
          </span>
          <Chip tone={ASSESSMENT_STATUS_CHIP[item.status] as ChipTone}>
            {ASSESSMENT_STATUS_LABEL[item.status]}
          </Chip>
          {item.isOverdue && item.status === 'available' && (
            <Chip tone="red">Past due</Chip>
          )}
        </div>
        <p className="mt-[var(--sp-1)] truncate text-[var(--fs-xs)] text-fg-3">
          {ASSESSMENT_TYPE_LABEL[item.type]}
          {item.topics.length > 0 && ` · ${item.topics.join(', ')}`}
        </p>
      </div>

      <div className="hidden shrink-0 text-end sm:block">
        <div className="num text-[var(--fs-xs)] text-fg-3">
          Due {formatDate(item.dueAt)}
        </div>
      </div>

      <div className="w-[72px] shrink-0 text-end">
        {item.score === null ? (
          <span className="num text-[var(--fs-xs)] text-fg-4">--</span>
        ) : (
          <span className="num text-[var(--fs-base)] text-fg">
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
    <Link href={`/learn/${courseId}/assessments/${item.id}`}>{row}</Link>
  );
}
