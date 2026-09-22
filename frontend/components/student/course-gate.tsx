'use client';

import { Loader, EmptyState } from '@/components/ui';

/**
 * Every course-scoped student route (`/lessons`, `/homework`, `/marks`,
 * `/timetable`, `/attendance`, `/classmates`, `/materials`) needs the same
 * two guard states before it has a course id to fetch against — this is that
 * pair, factored out once rather than repeated seven times.
 */
export function CourseGate({
  loading,
  hasCourses,
  children,
}: {
  loading: boolean;
  hasCourses: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader label="Loading your courses" />
      </div>
    );
  }

  if (!hasCourses) {
    return (
      <div className="p-6">
        <EmptyState
          icon="Book"
          title="No courses yet"
          description="Once you are accepted onto a course, it appears here with its lessons, homework and timetable."
        />
      </div>
    );
  }

  return <>{children}</>;
}
