'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import type { ManageCourseCard } from '@/lib/types';
import { Button, EmptyState, Loader, StatNumber, Table, type Column } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';

/**
 * The recording library, by course.
 *
 * Uploading is per-course because a recording has to hang off a lesson in that
 * course's outline - `recordings.module_id` and `lesson_id` are NOT NULL - so
 * this screen routes into the course rather than offering a global upload form
 * that would need a course picker as its first field anyway.
 */
export default function RecordingLibraryPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);

  const withRecordings = data?.courses.filter((c) => c.recordingCount > 0) ?? [];

  const columns: Column<ManageCourseCard>[] = [
    { label: 'Course', icon: 'PlayerPlay', render: (course) => course.title },
    {
      label: 'Recordings',
      align: 'end',
      render: (course) => <span className="num">{course.recordingCount}</span>,
    },
  ];

  return (
    <>
      <PageTitle title="Recordings" />
      <div className="flex flex-col gap-4 p-6">
        <p className="text-base text-fg-3">
          Recorded lessons students watch on demand. Pick a course to upload or manage its library.
        </p>

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

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatNumber label="Recordings" value={data.recordingCount} />
              <StatNumber
                label="Courses with recordings"
                value={withRecordings.length}
                caption={`of ${data.courseCount}`}
              />
            </div>

            {data.courses.length === 0 ? (
              <EmptyState
                icon="PlayerPlay"
                title="No courses yet"
                description="Recordings are uploaded into a course, against a lesson in its outline."
              />
            ) : (
              <Table
                columns={columns}
                rows={data.courses}
                rowKey={(course) => course.id}
                rowLabel={(course) => `Open recordings for ${course.title}`}
                onRowClick={(course) => router.push(`/manage/courses/${course.id}/recordings`)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
