'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type { ManageCourseCard } from '@/lib/types';
import { Button, EmptyState, Loader, StatNumber, Table, Tag, type Column } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

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
  const router = useRouter();
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);

  const firstName = user?.name.split(' ')[0] ?? '';
  const scopeNote =
    data?.scope === 'platform'
      ? 'Everything across the platform.'
      : 'Your assigned courses only.';

  const columns: Column<ManageCourseCard>[] = [
    { label: 'Course', render: (course) => course.title },
    {
      label: 'Students',
      align: 'end',
      render: (course) => <span className="num">{course.studentCount}</span>,
    },
    {
      label: 'Recordings',
      align: 'end',
      render: (course) => <span className="num">{course.recordingCount}</span>,
    },
    {
      align: 'end',
      render: (course) =>
        course.awaitingGrading > 0 && <Tag tone="amber">{course.awaitingGrading} to grade</Tag>,
    },
  ];

  return (
    <>
      <PageTitle title={firstName ? `Welcome back, ${firstName}` : 'Management'} />
      <div className="flex flex-col gap-4 p-6">
        <p className="text-base text-fg-3">
          {admin
            ? 'Courses, students, recordings and grading across the platform.'
            : 'Grade work, mark attendance and post materials for your courses.'}
        </p>

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading your courses" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatNumber label="Courses" value={data.courseCount} caption={scopeNote} />
              <StatNumber
                label="Students"
                value={data.studentCount}
                caption="Distinct people, not a sum of rosters."
              />
              <StatNumber
                label="Awaiting grading"
                value={data.awaitingGrading}
                caption="Submissions nobody has corrected yet."
              />
              <StatNumber label="Recordings" value={data.recordingCount} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-fg-2">
                {admin ? 'All courses' : 'Your courses'} · <span className="num">{data.courses.length}</span>
              </span>
              <Link
                href="/manage/courses"
                className="text-base font-medium text-fg-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:text-fg"
              >
                See all
              </Link>
            </div>

            {data.courses.length === 0 ? (
              <EmptyState
                icon="Book"
                title={admin ? 'No courses yet' : 'Nothing assigned to you'}
                description={
                  admin
                    ? 'Courses added to the platform will appear here.'
                    : 'Dr. Tahir assigns assistants to courses. Once you are on one, it shows up here.'
                }
              />
            ) : (
              <Table
                columns={columns}
                rows={data.courses}
                rowKey={(course) => course.id}
                rowLabel={(course) => `Open ${course.title}`}
                onRowClick={(course) => router.push(`/manage/courses/${course.id}`)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
