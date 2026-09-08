'use client';

import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import {
  Chip,
  EmptyState,
  ErrorState,
  Metric,
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody, PageHeader, StatRow } from '@/components/app/page-parts';

/**
 * The management console's landing screen, shared by Dr. Tahir and his
 * assistants.
 *
 * The same endpoint serves both: the backend scopes a TA to their assigned
 * courses and leaves the teacher unscoped, and `scope` in the response says
 * which happened. That word is rendered rather than assumed, because
 * "18 students" means the platform to one reader and two courses to the other.
 *
 * There is no revenue figure anywhere on this screen and there must not be -
 * CLAUDE.md §1: the client removed the earnings widget from the dashboard.
 */
export default function ManageOverviewPage() {
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi(
    (token) => api.staff.overview(token),
    [],
  );

  const firstName = user?.name.split(' ')[0] ?? '';
  const scopeNote =
    data?.scope === 'platform'
      ? 'Everything across the platform.'
      : 'Your assigned courses only.';

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Management'}
        subtitle={
          admin
            ? 'Courses, students, recordings and grading across the platform.'
            : 'Grade work, mark attendance and post materials for your courses.'
        }
      />
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && (
          <>
            <StatRow>
              <Metric label="Courses" value={data.courseCount} hint={scopeNote} />
              <Metric
                label="Students"
                value={data.studentCount}
                hint="Distinct people, not a sum of rosters."
              />
              <Metric
                label="Awaiting grading"
                value={data.awaitingGrading}
                hint="Submissions nobody has corrected yet."
              />
              <Metric label="Recordings" value={data.recordingCount} />
            </StatRow>

            <Panel
              title="Courses"
              action={
                <Link
                  href="/manage/courses"
                  className="text-[var(--fs-xs)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
                >
                  See all
                </Link>
              }
              bodyClassName=""
            >
              {data.courses.length === 0 ? (
                <EmptyState
                  title={admin ? 'No courses yet' : 'Nothing assigned to you'}
                  body={
                    admin
                      ? 'Courses added to the platform will appear here.'
                      : 'Dr. Tahir assigns assistants to courses. Once you are on one, it shows up here.'
                  }
                />
              ) : (
                <ul className="rows">
                  {data.courses.map((course) => (
                    <li key={course.id}>
                      <Link
                        href={`/manage/courses/${course.id}`}
                        className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-subtle)]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
                            {course.title}
                          </span>
                          <span className="mt-[var(--sp-1)] block text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                            {course.studentCount} student
                            {course.studentCount === 1 ? '' : 's'} ·{' '}
                            {course.recordingCount} recording
                            {course.recordingCount === 1 ? '' : 's'}
                            {course.assignedAt &&
                              ` · assigned ${formatDate(course.assignedAt)}`}
                          </span>
                        </span>
                        {course.awaitingGrading > 0 && (
                          <Chip tone="amber">
                            {course.awaitingGrading} to grade
                          </Chip>
                        )}
                        <ArrowRightIcon
                          size={14}
                          className="shrink-0 text-[var(--fg-muted)] rtl:rotate-180"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}
