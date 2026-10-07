'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { addDays, formatTime, formatWeekday, startOfWeek } from '@/lib/format';
import type { StudentSessionView } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { useSelectedCourse } from '@/components/shell/course-context';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

/**
 * Timetable (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`). `D-9` collapsed "live and
 * online" to just "live" - every session is online, so there is no mode to
 * gate on. Every group the student sits in, across every course - `GET
 * /students/me/timetable` takes no course id (`SESS-6`), so the rail's course
 * switcher does not scope it; `useSelectedCourse` is read only for the "no
 * courses at all" empty state.
 */
export default function TimetablePage() {
  const { courses, loading } = useSelectedCourse();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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
      map.get(new Date(session.scheduledAt).toDateString())?.push(session);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [data, days]);

  const rangeLabel = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  if (!loading && !(courses && courses.length > 0)) {
    return (
      <>
        <PageTitle title="Schedule" />
        <section className="cl-panel">
          <ClEmpty
            icon="book"
            tone="cl-tone-blue"
            title="No courses yet"
            hint="Once you are accepted onto a course, it appears here with its lessons, homework and timetable."
          />
        </section>
      </>
    );
  }

  const isThisWeek = weekStart.getTime() === startOfWeek(new Date()).getTime();

  return (
    <>
      <PageTitle title="Schedule" />
      <section aria-labelledby="h-sched" className="cl-panel pb-4">
        <PanelHead title={rangeLabel} id="h-sched" className="mb-2">
          <button type="button" className="cl-gib" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            <span aria-hidden className="rtl:rotate-180"><ClIcon name="back" small /></span>
          </button>
          <button
            type="button"
            className={isThisWeek ? 'cl-btns cl-btns--quiet' : 'cl-btns'}
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            This week
          </button>
          <button type="button" className="cl-gib" aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            <span aria-hidden className="rtl:rotate-180"><ClIcon name="chevRight" small /></span>
          </button>
        </PanelHead>

        {sessionsLoading && !data && <ClSkeleton rows={4} label="Loading timetable" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {data &&
          days.map((day, i) => {
            const sessions = byDay.get(day.toDateString()) ?? [];
            const iso = day.toISOString();
            if (sessions.length === 0) {
              return (
                <div key={iso} className="cl-grow" style={{ cursor: 'default' }}>
                  <DayCol weekday={formatWeekday(iso)} num={day.getDate()} />
                  <span className="cl-grow-main cl-muted text-[14px]">No sessions</span>
                </div>
              );
            }
            return sessions.map((session, j) => (
              <div key={session.id} className="cl-grow" style={{ cursor: 'default' }}>
                {j === 0 ? <DayCol weekday={formatWeekday(iso)} num={day.getDate()} /> : <span className="w-[52px] shrink-0" aria-hidden />}
                <span
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{ background: i % 2 ? 'var(--cl-blue-soft)' : 'var(--cl-blue)' }}
                  aria-hidden
                />
                <span className="cl-grow-main">
                  <span className="block truncate">{session.title}</span>
                  <span className="cl-sub">{formatTime(session.scheduledAt)} · Live with Dr. Tahir</span>
                </span>
                {/* `meetingLink` is absent from the response until 30 minutes
                    before `scheduledAt` (the T-30 rule) - gated on the key's
                    presence, never on a client-computed window. */}
                {session.meetingLink && (
                  <a href={session.meetingLink} target="_blank" rel="noopener noreferrer" className="cl-btnp shrink-0">
                    Join
                  </a>
                )}
              </div>
            ));
          })}
      </section>
    </>
  );
}

function DayCol({ weekday, num }: { weekday: string; num: number }) {
  return (
    <span className="w-[52px] shrink-0 text-center">
      <span className="cl-muted block text-[12px] uppercase">{weekday}</span>
      <span className="block text-[22px] leading-none">{num}</span>
    </span>
  );
}
