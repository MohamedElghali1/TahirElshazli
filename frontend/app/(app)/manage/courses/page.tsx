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
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

/**
 * Every course the caller may work on.
 *
 * Reuses the overview endpoint rather than `/staff/courses`, because the cards
 * it returns already carry the counts this list wants - fetching the bare
 * course list and then a count per course is the N+1 CLAUDE.md §7.1 asks new
 * screens not to introduce.
 */
export default function ManageCoursesPage() {
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi(
    (token) => api.staff.overview(token),
    [],
  );

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={
          admin
            ? 'Every course on the platform.'
            : 'The courses you have been assigned to.'
        }
      />
      <PageBody>
        <Panel bodyClassName="">
          {loading && <RowsSkeleton rows={5} />}
          {error && <ErrorState message={error.message} onRetry={reload} />}
          {data && data.courses.length === 0 && (
            <EmptyState
              title={admin ? 'No courses yet' : 'Nothing assigned to you'}
              body={
                admin
                  ? 'Courses added to the platform will appear here.'
                  : 'Ask Dr. Tahir to assign you to a course.'
              }
            />
          )}
          {data && data.courses.length > 0 && (
            <ul className="rows">
              {data.courses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={`/manage/courses/${course.id}`}
                    className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-4)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-subtle)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
                        {course.title}
                      </span>
                      <span className="mt-[var(--sp-1)] block text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                        {course.teacherName}
                        {course.assignedAt &&
                          ` · assigned ${formatDate(course.assignedAt)}`}
                      </span>
                    </span>
                    <span className="num hidden shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)] sm:block">
                      {course.studentCount} students
                    </span>
                    <span className="num hidden shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)] md:block">
                      {course.recordingCount} recordings
                    </span>
                    {course.awaitingGrading > 0 && (
                      <Chip tone="amber">{course.awaitingGrading} to grade</Chip>
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
      </PageBody>
    </>
  );
}
