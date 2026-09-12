'use client';

import Link from 'next/link';
import { ArrowRightIcon, SquaresFourIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import {
  Chip,
  EmptyState,
  ErrorState,
  Metric,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody, StatRow } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

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
      <PageTitle icon={SquaresFourIcon} title={firstName ? `Welcome back, ${firstName}` : 'Management'} />
      <PageBody dense className="flex flex-col gap-[var(--sp-4)]">
        <p className="text-[var(--fs-base)] text-fg-3">
          {admin
            ? 'Courses, students, recordings and grading across the platform.'
            : 'Grade work, mark attendance and post materials for your courses.'}
        </p>
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

            {/* Twenty's own object-list idiom (TASK 4): a view chip and a
                dense table instead of a bordered card - no earnings widget
                either way (CLAUDE.md §1). */}
            <div className="flex h-[var(--topbar-h)] items-center justify-between px-[var(--sp-2)]">
              <span className="inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)] bg-[var(--bg-primary)] py-[var(--sp-1)] ps-[var(--sp-1)] pe-[var(--sp-2)] text-[var(--fs-base)] font-medium text-fg-2">
                {admin ? 'All courses' : 'Your courses'}
                {' · '}
                <span className="num">{data.courses.length}</span>
              </span>
              <Link
                href="/manage/courses"
                className="text-[var(--fs-base)] font-medium text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg"
              >
                See all
              </Link>
            </div>

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
              <TableScroll minWidth={520}>
                <thead>
                  <tr className="border-b border-[var(--border-medium)]">
                    <Th>Course</Th>
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
          </>
        )}
      </PageBody>
    </>
  );
}
