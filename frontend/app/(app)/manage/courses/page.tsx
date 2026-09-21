'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { ManageCourseCard } from '@/lib/types';
import { Button, EmptyState, Loader, Table, Tag, type Column } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';

/**
 * Every course the caller may work on.
 *
 * Reuses the overview endpoint rather than `/staff/courses`, because the cards
 * it returns already carry the counts this list wants - fetching the bare
 * course list and then a count per course is the N+1 CLAUDE.md §7.1 asks new
 * screens not to introduce.
 */
export default function ManageCoursesPage() {
  const router = useRouter();
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);

  const columns: Column<ManageCourseCard>[] = [
    { label: 'Course', render: (course) => course.title },
    {
      label: 'Teacher',
      render: (course) => (
        <span className="text-fg-3">
          {course.teacherName}
          {course.assignedAt && ` · assigned ${formatDate(course.assignedAt)}`}
        </span>
      ),
    },
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
      <PageTitle title="Courses" />
      <div className="flex flex-col gap-4 p-6">
        <span className="text-base font-medium text-fg-2">
          {admin ? 'All courses' : 'Assigned to you'}
          {data && <> · <span className="num">{data.courses.length}</span></>}
        </span>

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading courses" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.courses.length === 0 && (
          <EmptyState
            icon="Book"
            title={admin ? 'No courses yet' : 'Nothing assigned to you'}
            description={
              admin
                ? 'Courses added to the platform will appear here.'
                : 'Ask Dr. Tahir to assign you to a course.'
            }
          />
        )}
        {data && data.courses.length > 0 && (
          <Table
            columns={columns}
            rows={data.courses}
            rowKey={(course) => course.id}
            rowLabel={(course) => `Open ${course.title}`}
            onRowClick={(course) => router.push(`/manage/courses/${course.id}`)}
          />
        )}
      </div>
    </>
  );
}
