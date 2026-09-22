'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatMinutes, formatRelative, formatWeekday, formatTime } from '@/lib/format';
import type { LiveSession } from '@/lib/types';
import { Panel, EmptyState, Loader, Button } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Timetable (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Week grid; Join appears
 * only where a session is live and online"). The week-grid layout is a
 * content redesign out of this unit's scope (`PHASE_PLAN.md` §1) — this is
 * the existing upcoming-sessions list, course-scoped via the rail's switcher.
 *
 * A live session is just a scheduled time plus whatever link the teacher
 * pasted (Google Meet, Zoom). Nothing is embedded and nothing is automated.
 */
export default function TimetablePage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Timetable" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <UpcomingSessions courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function UpcomingSessions({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    (token) => api.liveSessions.list(token, courseId),
    [courseId],
  );

  return (
    <div className="p-6">
      <Panel
        title="Coming up"
        action={data && <span className="num text-xs text-fg-3">{data.upcoming.length}</span>}
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading sessions" />
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
        {data && data.upcoming.length === 0 && (
          <EmptyState
            icon="CalendarEvent"
            title="Nothing scheduled"
            description="The next class shows here with its time and joining link as soon as it is set."
          />
        )}
        {data && data.upcoming.length > 0 && (
          <ul className="divide-y divide-border-light">
            {data.upcoming.map((session) => (
              <li key={session.id}>
                <UpcomingRow session={session} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function UpcomingRow({ session }: { session: LiveSession }) {
  return (
    <div className="flex items-center gap-4 px-4 py-4">
      <div className="w-[52px] shrink-0 rounded-sm bg-surface-3 py-2 text-center">
        <div className="num text-lg leading-none text-fg">
          {new Date(session.scheduledAt).getDate()}
        </div>
        <div className="mt-1 text-xxs uppercase text-fg-3">
          {new Date(session.scheduledAt).toLocaleDateString(undefined, { month: 'short' })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-fg">{session.title}</p>
        <p className="num mt-1 text-xs text-fg-3">
          {formatWeekday(session.scheduledAt)} {formatTime(session.scheduledAt)} ·{' '}
          {formatMinutes(session.durationMinutes)}
        </p>
        <p className="mt-1 text-xxs text-fg-4">Starts {formatRelative(session.scheduledAt)}</p>
      </div>

      <Button
        variant="primary"
        size="small"
        iconRight="ArrowUpRight"
        className="shrink-0"
        onClick={() => window.open(session.zoomLink, '_blank', 'noopener,noreferrer')}
      >
        Join
      </Button>
    </div>
  );
}
