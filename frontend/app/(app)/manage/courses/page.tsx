'use client';

import Link from 'next/link';
import { ArrowRightIcon, BooksIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import { Chip, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

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
      <PageTitle icon={BooksIcon} title="Courses" />
      <PageBody dense className="flex flex-col gap-[var(--sp-2)]">
        {/* The view chip carries what the old subtitle said - Twenty has no
            page subtitle, only this bar (TASK 4). */}
        <div className="flex h-[var(--topbar-h)] items-center px-[var(--sp-2)]">
          <span className="inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)] bg-[var(--bg-primary)] py-[var(--sp-1)] ps-[var(--sp-1)] pe-[var(--sp-2)] text-[var(--fs-base)] font-medium text-fg-2">
            {admin ? 'All courses' : 'Assigned to you'}
            {data && (
              <>
                {' · '}
                <span className="num">{data.courses.length}</span>
              </>
            )}
          </span>
        </div>

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
          <TableScroll minWidth={640}>
            <thead>
              <tr className="border-b border-[var(--border-medium)]">
                <Th>Course</Th>
                <Th>Teacher</Th>
                <Th align="end">Students</Th>
                <Th align="end">Recordings</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.courses.map((course) => (
                <Tr key={course.id}>
                  <Td>
                    <Link
                      href={`/manage/courses/${course.id}`}
                      className="inline-flex h-[var(--h-tag)] max-w-full items-center gap-[var(--sp-1)] rounded-[var(--r-sm)] bg-[var(--bg-wash-nav)] px-[var(--sp-1)] text-[var(--fs-base)] font-medium text-fg transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)]"
                    >
                      <span className="truncate">{course.title}</span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-fg-3">
                      {course.teacherName}
                      {course.assignedAt && ` · assigned ${formatDate(course.assignedAt)}`}
                    </span>
                  </Td>
                  <Td align="end">
                    <span className="num">{course.studentCount}</span>
                  </Td>
                  <Td align="end">
                    <span className="num">{course.recordingCount}</span>
                  </Td>
                  <Td align="end">
                    <span className="flex items-center justify-end gap-[var(--sp-2)]">
                      {course.awaitingGrading > 0 && (
                        <Chip tone="amber">{course.awaitingGrading} to grade</Chip>
                      )}
                      <ArrowRightIcon
                        size={14}
                        className="shrink-0 text-fg-4 rtl:rotate-180"
                      />
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </PageBody>
    </>
  );
}
