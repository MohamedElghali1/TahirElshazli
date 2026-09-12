'use client';

import Link from 'next/link';
import { ArrowRightIcon, VideoIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { EmptyState, ErrorState, Metric, RowsSkeleton } from '@/components/ui';
import { PageBody, StatRow } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

/**
 * The recording library, by course.
 *
 * Uploading is per-course because a recording has to hang off a lesson in that
 * course's outline - `recordings.module_id` and `lesson_id` are NOT NULL - so
 * this screen routes into the course rather than offering a global upload form
 * that would need a course picker as its first field anyway.
 */
export default function RecordingLibraryPage() {
  const { data, error, loading, reload } = useApi(
    (token) => api.staff.overview(token),
    [],
  );

  const withRecordings = data?.courses.filter((c) => c.recordingCount > 0) ?? [];

  return (
    <>
      <PageTitle icon={VideoIcon} title="Recordings" />
      <PageBody dense className="flex flex-col gap-[var(--sp-4)]">
        <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          Recorded lessons students watch on demand. Pick a course to upload or manage its library.
        </p>
        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {data && (
          <>
            <StatRow>
              <Metric label="Recordings" value={data.recordingCount} />
              <Metric
                label="Courses with recordings"
                value={withRecordings.length}
                hint={`of ${data.courseCount}`}
              />
            </StatRow>

            <div className="flex h-[var(--topbar-h)] items-center px-[var(--sp-2)]">
              <span className="inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)] bg-[var(--bg-primary)] py-[var(--sp-1)] ps-[var(--sp-1)] pe-[var(--sp-2)] text-[var(--fs-base)] font-medium text-[var(--fg-secondary)]">
                By course
                {' · '}
                <span className="num">{data.courses.length}</span>
              </span>
            </div>

            {data.courses.length === 0 ? (
              <EmptyState
                title="No courses yet"
                body="Recordings are uploaded into a course, against a lesson in its outline."
              />
            ) : (
              <TableScroll minWidth={480}>
                <thead>
                  <tr className="border-b border-[var(--border-medium)]">
                    <Th>Course</Th>
                    <Th align="end">Recordings</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.courses.map((course) => (
                    <Tr key={course.id}>
                      <Td>
                        <Link
                          href={`/manage/courses/${course.id}/recordings`}
                          className="inline-flex h-[var(--h-tag)] max-w-full items-center gap-[var(--sp-1)] rounded-[var(--r-sm)] bg-[var(--bg-wash-nav)] px-[var(--sp-1)] text-[var(--fs-base)] font-medium text-[var(--fg-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)]"
                        >
                          <VideoIcon size={14} className="shrink-0 text-[var(--fg-tertiary)]" />
                          <span className="truncate">{course.title}</span>
                        </Link>
                      </Td>
                      <Td align="end">
                        <span className="num">{course.recordingCount}</span>
                      </Td>
                      <Td align="end">
                        <ArrowRightIcon
                          size={14}
                          className="ms-auto shrink-0 text-[var(--fg-muted)] rtl:rotate-180"
                        />
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
