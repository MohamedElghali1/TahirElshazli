'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { addDays, formatTime, formatWeekday, startOfWeek } from '@/lib/format';
import type { StudentSessionView } from '@/lib/types';
import { Panel, EmptyState, Loader, Button, IconButton } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Timetable (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Week grid; Join appears
 * only where a session is live"). `D-9` collapsed "live and online" to just
 * "live" - every session is online, so there is no mode to gate on.
 *
 * Every group the student sits in, across every course - `GET
 * /students/me/timetable` takes no course id and no `groupId` (`SESS-6`), so
 * this is not scoped through the rail's course switcher the way `/lessons` or
 * `/homework` are. `useSelectedCourse` is read only for the "do you have any
 * courses at all" empty state `CourseGate` needs.
 */
export default function TimetablePage() {
  const { courses, loading } = useSelectedCourse();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Full ISO instants, never bare `YYYY-MM-DD` - the server widens a bare date
  // to `T23:59:59.999Z` UTC, which is two to three hours off the school's
  // Egypt-time week (`PHASE_PLAN.md` §4).
  const from = weekStart.toISOString();
  const to = useMemo(() => {
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }, [weekStart]);

  const {
    data,
    error,
    loading: sessionsLoading,
    reload,
  } = useApi((token) => api.students.timetable(token, { from, to }), [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, StudentSessionView[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const session of data ?? []) {
      const key = new Date(session.scheduledAt).toDateString();
      map.get(key)?.push(session);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [data, days]);

  const rangeLabel = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <>
      <PageTitle title="Timetable" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        <div className="p-6">
          <Panel
            title={rangeLabel}
            action={
              <span className="inline-flex items-center gap-1">
                <IconButton
                  icon="ChevronLeft"
                  label="Previous week"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                />
                <Button size="small" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                  This week
                </Button>
                <IconButton
                  icon="ChevronRight"
                  label="Next week"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                />
              </span>
            }
            bodyClassName=""
          >
            {sessionsLoading && !data && (
              <div className="flex justify-center p-8">
                <Loader label="Loading timetable" />
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
            {data && (
              <div className="grid grid-cols-1 sm:grid-cols-7">
                {days.map((day) => (
                  <div
                    key={day.toDateString()}
                    className="flex flex-col border-border-light sm:border-s sm:first:border-s-0"
                  >
                    <div className="border-b border-border-light px-3 py-2">
                      <p className="text-xxs font-semibold uppercase text-fg-4">
                        {formatWeekday(day.toISOString())}
                      </p>
                      <p className="num text-xs text-fg-3">{day.getDate()}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      {(byDay.get(day.toDateString()) ?? []).length === 0 ? (
                        <p className="px-1 py-2 text-xxs text-fg-4">—</p>
                      ) : (
                        (byDay.get(day.toDateString()) ?? []).map((session) => (
                          <SessionCell key={session.id} session={session} />
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </CourseGate>
    </>
  );
}

function SessionCell({ session }: { session: StudentSessionView }) {
  return (
    <div className="rounded-sm bg-surface-2 p-2">
      <p className="truncate text-xs font-medium text-fg">{session.title}</p>
      <p className="num mt-1 text-xxs text-fg-3">{formatTime(session.scheduledAt)}</p>
      {/* `meetingLink` is absent from the response until 30 minutes before
          `scheduledAt` (the T-30 rule) - gated on the key's presence, never on
          a client-computed window. No countdown to a link that is not there. */}
      {session.meetingLink && (
        <Button
          variant="primary"
          size="small"
          iconRight="ArrowUpRight"
          className="mt-2 w-full"
          onClick={() => window.open(session.meetingLink, '_blank', 'noopener,noreferrer')}
        >
          Join
        </Button>
      )}
    </div>
  );
}
