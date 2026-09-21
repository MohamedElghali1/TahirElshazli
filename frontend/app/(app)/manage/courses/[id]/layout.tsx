'use client';

import { use } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { TabList, type TabItem } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * The course workspace: one header and one set of tabs for every section a TA
 * or the teacher works in.
 *
 * The roster read doubles as the existence check. A course this actor is not
 * assigned to comes back 404, not 403 (CLAUDE.md §5.11) - so an unassigned TA
 * cannot tell a course they do not hold from one that does not exist, and this
 * header renders the same "not found" either way.
 *
 * The tab list has exactly one caller now that `/learn/[id]/*` (the other
 * former consumer of this shape, `components/app/page-parts.tsx`'s
 * `CourseTabs`) was deleted with the flat student IA in slice 4b-i, so it is
 * built inline rather than factored into a shared component with one call
 * site.
 */
export default function ManageCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const { user } = useSession();
  const admin = isAdminRole(user?.role);

  const { data, error } = useApi((token) => api.staff.roster(token, id), [id]);

  const base = `/manage/courses/${id}`;
  const tabs: TabItem[] = [
    { href: base, label: 'Roster' },
    // Groups and Work are both TA-reachable: the client granted placement
    // (CLAUDE.md section 5.16) and authoring (section 5.18, answered
    // 2026-09-10) to assistants explicitly, so neither is gated on `admin`.
    { href: `${base}/groups`, label: 'Groups' },
    { href: `${base}/assessments`, label: 'Work' },
    { href: `${base}/grading`, label: 'Grading' },
    { href: `${base}/recordings`, label: 'Recordings' },
    // `staff` and `recordings`-write are both omitted for a teaching
    // assistant: CLAUDE.md section 2.2 gives a TA no account management. That
    // is presentation only - `/admin/*` is `@Roles(Role.Teacher)` on the
    // server, and hiding a tab has never been what stops anyone (section 8).
    ...(admin ? [{ href: `${base}/staff`, label: 'Assistants' }] : []),
  ];

  return (
    <>
      <PageTitle
        title={data?.courseTitle ?? (error?.isNotFound ? 'Course not found' : ' ')}
        backHref="/manage/courses"
      />
      {data && (
        <p className="border-b border-border-light px-4 py-2 text-xs text-fg-3">
          {data.entries.length} enrolled · {data.assessmentCount} assessment
          {data.assessmentCount === 1 ? '' : 's'}
        </p>
      )}
      {!error?.isNotFound && (
        <TabList tabs={tabs} value={pathname} label="Course management sections" className="px-4" />
      )}
      {children}
    </>
  );
}
