'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { LiveSessionWithAttendance } from '@/lib/types';
import { Panel, EmptyState, Loader, Tag, Button, Icon } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Attendance (`docs/PRODUCT_SPEC.md` §6: `[NEW]` as a route, "Three states,
 * with 'records can lag'"). The three-state enum is a recorded, undelivered
 * backend decision (`docs/CHANGELOG.md` "Attendance becomes a three-state
 * enum") — `attended` is still a boolean in `lib/types.ts`, so this reads the
 * two states that exist today rather than inventing the third. Course-scoped
 * via the rail's switcher.
 */
export default function AttendancePage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Attendance" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <AttendanceRecord courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function AttendanceRecord({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    (token) => api.liveSessions.list(token, courseId),
    [courseId],
  );

  const attended = data?.past.filter((s) => s.attended).length ?? 0;

  return (
    <div className="p-6">
      <Panel
        title="Attendance record"
        action={
          data && (
            <span className="num text-xs text-fg-3">
              {attended} / {data.past.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading attendance" />
          </div>
        )}
        {error && (
          <div className="p-6">
            <EmptyState
              icon="AlertTriangle"
              title={error.message}
              action={<Button onClick={reload}>Try again</Button>}
            />
          </div>
        )}
        {data && data.past.length === 0 && !loading && (
          <EmptyState
            icon="CircleCheck"
            title="No sessions yet"
            description="Your record starts after the first timetabled class."
          />
        )}
        {data && data.past.length > 0 && (
          <ul className="divide-y divide-border-light">
            {data.past.map((session) => (
              <li key={session.id}>
                <PastRow session={session} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PastRow({ session }: { session: LiveSessionWithAttendance }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon
        name={session.attended ? 'CircleCheck' : 'X'}
        size={16}
        className={session.attended ? 'shrink-0 text-status-green-text' : 'shrink-0 text-status-red-text'}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base text-fg">{session.title}</p>
        <p className="num mt-1 text-xs text-fg-3">{formatDate(session.scheduledAt)}</p>
      </div>
      <Tag tone={session.attended ? 'green' : 'red'}>
        {session.attended ? 'Attended' : 'Missed'}
      </Tag>
    </div>
  );
}
