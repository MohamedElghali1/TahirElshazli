'use client';

import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatPercent } from '@/lib/format';
import type { CourseListItem } from '@/lib/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  Meter,
  RowsSkeleton,
  ButtonLink,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

/**
 * The app's landing screen: every course the student is enrolled on, with its
 * completion figure. The per-course dashboard lives at /learn/[id] because
 * the backend's dashboard endpoint is itself per-course.
 */
export default function DashboardPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(
    (token) => api.courses.list(token),
    [],
  );

  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle="Pick up where you left off."
        action={
          <ButtonLink href="/catalog" variant="secondary">
            Browse courses
          </ButtonLink>
        }
      />
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        {loading && <RowsSkeleton rows={3} />}

        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && data.length === 0 && (
          <EmptyState
            title="No courses yet"
            body="Pick a course from the catalog and it appears here with its timetable, work and recordings."
            action={
              <ButtonLink href="/catalog" variant="primary">
                Browse courses
              </ButtonLink>
            }
          />
        )}

        {data && data.length > 0 && (
          <div className="grid gap-[var(--sp-4)] lg:grid-cols-2">
            {data.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

function CourseCard({ course }: { course: CourseListItem }) {
  const { progress } = course;

  // CLAUDE.md §5.2 - the enrollment's mode decides what "progress" means here.
  const isRecorded = progress.type === 'recorded';
  const percentage = isRecorded
    ? progress.completionPercentage
    : progress.attendancePercentage;
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons done`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <Link
      href={`/learn/${course.id}`}
      className="group flex flex-col rounded-[var(--r-sm)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
    >
      <div className="flex items-start justify-between gap-[var(--sp-3)]">
        <div className="min-w-0">
          <h2 className="truncate text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
            {course.title}
          </h2>
          <p className="mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {course.teacherName}
          </p>
        </div>
        <Chip tone={isRecorded ? 'violet' : 'teal'}>
          {isRecorded ? 'Recorded' : 'Live'}
        </Chip>
      </div>

      <p className="mt-[var(--sp-3)] line-clamp-2 text-[var(--fs-base)] text-[var(--fg-secondary)]">
        {course.description}
      </p>

      <div className="mt-[var(--sp-4)] flex items-baseline justify-between">
        <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {isRecorded ? 'Course completion' : 'Attendance'}
        </span>
        <span className="num text-[var(--fs-md)] text-[var(--fg-primary)]">
          {formatPercent(percentage)}
        </span>
      </div>
      <div className="mt-[var(--sp-2)]">
        <Meter
          value={percentage}
          label={isRecorded ? 'Course completion' : 'Attendance'}
        />
      </div>
      <p className="num mt-[var(--sp-2)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
        {detail}
      </p>

      <span className="mt-[var(--sp-4)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] group-hover:text-[var(--fg-primary)]">
        Open course
        <ArrowRightIcon size={14} />
      </span>
    </Link>
  );
}
