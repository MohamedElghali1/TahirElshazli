'use client';

import Link from 'next/link';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * A link into a course-scoped route (`/lessons`, `/homework`, `/marks`,
 * `/timetable`, `/materials`, …) that names a specific course — a row on
 * Overview naming one of several enrolled courses, say.
 *
 * Those routes read the rail's `CourseSwitcher` selection, not a URL segment
 * (`SHELL-3`), so a link that only changes the URL would land on the *wrong*
 * course whenever the switcher already held a different one. This sets the
 * selection first, in the same click, so the destination is scoped correctly
 * without a page ever having to read a query string.
 */
export function CourseLink({
  courseId,
  href,
  className,
  children,
}: {
  courseId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { selectCourse } = useSelectedCourse();
  return (
    <Link href={href} onClick={() => selectCourse(courseId)} className={className}>
      {children}
    </Link>
  );
}
