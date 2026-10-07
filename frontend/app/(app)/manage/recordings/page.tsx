'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';

/**
 * The recording library, by course.
 *
 * Uploading is per-course because a recording has to hang off a lesson in that
 * course's outline - `recordings.module_id` and `lesson_id` are NOT NULL - so
 * this screen routes into the course rather than offering a global upload form
 * that would need a course picker as its first field anyway.
 *
 * Redesign V2: the artifact's "Recordings" panel, one row per course. Its skill
 * chips and per-recording rows live on the course's own recordings tab, where
 * the data is.
 */
export default function RecordingLibraryPage() {
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);

  const withRecordings = data?.courses.filter((c) => c.recordingCount > 0) ?? [];

  return (
    <>
      <PageTitle title="Recordings" />
      <section aria-labelledby="rc-h" className="cl-panel pb-4">
        <PanelHead id="rc-h" title="Recordings" className="mb-1" />
        <p className="cl-muted mb-4 mt-0 px-2 text-[13.5px]">
          Recorded lessons students watch on demand. Pick a course to add or manage its recordings.
        </p>

        {loading && !data && <ClSkeleton rows={3} label="Loading courses" />}
        {error && <ClError message={error.message} onRetry={reload} />}

        {data && (
          <>
            <div className="cl-stats mb-4">
              <ClStat value={data.recordingCount} label="Recordings" />
              <ClStat value={`${withRecordings.length} of ${data.courseCount}`} label="Courses with recordings" />
            </div>
            <hr className="cl-hr mb-2" />
            {data.courses.length === 0 ? (
              <ClEmpty
                icon="play"
                tone="cl-tone-blue"
                title="No courses yet"
                hint="Recordings are added to a course, against a lesson in its outline."
              />
            ) : (
              data.courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/manage/courses/${course.id}/recordings`}
                  className="cl-grow"
                  aria-label={`Open recordings for ${course.title}`}
                >
                  <span className="cl-ic40 cl-tone-blue">
                    <ClIcon name="play" small />
                  </span>
                  <span className="cl-grow-main">
                    <span className="block truncate">{course.title}</span>
                    <span className="cl-sub">
                      {course.recordingCount} {course.recordingCount === 1 ? 'recording' : 'recordings'}
                    </span>
                  </span>
                  <span className="cl-glink">Open</span>
                </Link>
              ))
            )}
          </>
        )}
      </section>
    </>
  );
}
