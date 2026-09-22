'use client';

import * as React from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';

export interface SwitchableCourseSummary {
  id: string;
  title: string;
}

interface CourseContextValue {
  /** `null` while the course list is still loading. */
  courses: SwitchableCourseSummary[] | null;
  /** The course every course-scoped route reads. `null` with no enrollment. */
  selectedId: string | null;
  selectCourse: (id: string) => void;
  loading: boolean;
}

const CourseContext = React.createContext<CourseContextValue | null>(null);

const STORAGE_KEY = 'te.selectedCourseId';

/**
 * `sessionStorage` has no same-tab change event, so this is the smallest
 * external store around it: `selectCourse` writes, then notifies; every
 * `CourseProvider` instance (there is ever one, but the pattern does not
 * assume that) re-reads through `useSyncExternalStore`, which is also what
 * keeps the server and the first client render in agreement — the server
 * snapshot is always `null`, exactly like `app/(app)/dashboard/page.tsx`'s
 * `useNow`.
 */
let listeners: Array<() => void> = [];
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
function getSnapshot(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function getServerSnapshot(): string | null {
  return null;
}

/**
 * The one place the flat student IA's course scoping lives
 * (`docs/phases/unit-4/PHASE_PLAN.md` `SHELL-3`). Wraps `StudentShell` so both
 * the rail's `CourseSwitcher` and every course-scoped route (`/lessons`,
 * `/homework`, `/marks`, `/timetable`, `/attendance`, `/classmates`,
 * `/materials`) read and change the same selection.
 *
 * Persisted in `sessionStorage` rather than the URL — a switch has to survive
 * a rail click into any of those routes, and none of `lib/api.ts`'s
 * course-scoped calls take the course id from a query string.
 */
export function CourseProvider({ children }: { children: React.ReactNode }) {
  const { data: courseList } = useApi((token) => api.courses.list(token), []);
  const courses = React.useMemo(
    () => courseList?.map((c) => ({ id: c.id, title: c.title })) ?? null,
    [courseList],
  );

  const stored = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const selectCourse = React.useCallback((id: string) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Nothing to persist to — the in-memory selection below still updates.
    }
    notify();
  }, []);

  const selectedId =
    (stored && courses?.some((c) => c.id === stored) ? stored : null) ??
    courses?.[0]?.id ??
    null;

  const value = React.useMemo(
    () => ({ courses, selectedId, selectCourse, loading: courseList === null }),
    [courses, selectedId, selectCourse, courseList],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

/** Every course-scoped route and the rail's switcher share this selection. */
export function useSelectedCourse(): CourseContextValue {
  const ctx = React.useContext(CourseContext);
  if (!ctx) throw new Error('useSelectedCourse must be used inside <CourseProvider>');
  return ctx;
}
