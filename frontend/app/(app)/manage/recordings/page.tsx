'use client';

import Link from 'next/link';
import { ArrowRightIcon, VideoIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  EmptyState,
  ErrorState,
  Metric,
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody, PageHeader, StatRow } from '@/components/app/page-parts';

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
      <PageHeader
        title="Recordings"
        subtitle="Recorded lessons students watch on demand. Pick a course to upload or manage its library."
      />
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
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

            <Panel title="By course" bodyClassName="">
              {data.courses.length === 0 ? (
                <EmptyState
                  title="No courses yet"
                  body="Recordings are uploaded into a course, against a lesson in its outline."
                />
              ) : (
                <ul className="rows">
                  {data.courses.map((course) => (
                    <li key={course.id}>
                      <Link
                        href={`/manage/courses/${course.id}/recordings`}
                        className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-subtle)]"
                      >
                        <span
                          aria-hidden
                          className="flex h-[var(--h-md)] w-[var(--h-md)] shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-wash)] text-[var(--fg-tertiary)]"
                        >
                          <VideoIcon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[var(--fs-base)] text-[var(--fg-primary)]">
                          {course.title}
                        </span>
                        <span className="num shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                          {course.recordingCount} recording
                          {course.recordingCount === 1 ? '' : 's'}
                        </span>
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
