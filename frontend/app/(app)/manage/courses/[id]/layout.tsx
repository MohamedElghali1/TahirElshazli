'use client';

import { use } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClTabs, type ClTab } from '@/components/classroom/ui';

/**
 * The course workspace: one header and one set of tabs for every section a TA
 * or the teacher works in.
 *
 * The roster read doubles as the existence check. A course this actor is not
 * assigned to comes back 404, not 403 (CLAUDE.md §5.11) - so an unassigned TA
 * cannot tell a course they do not hold from one that does not exist, and this
 * header renders the same "not found" either way.
 *
 * Redesign V2: route tabs (`ClTabs`) over the course's sections, the page
 * bodies below stacking as panels in the shell's column.
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

  const { data, error } = useApi((token) => api.staff.roster(token, id), [id]);

  const base = `/manage/courses/${id}`;
  const tabs: ClTab[] = [
    { value: base, label: 'Roster', href: base },
    // Groups and Work are both TA-reachable: the client granted placement
    // (CLAUDE.md section 5.16) and authoring (section 5.18, answered
    // 2026-09-10) to assistants explicitly, so neither is gated on `admin`.
    { value: `${base}/groups`, label: 'Groups', href: `${base}/groups` },
    { value: `${base}/assessments`, label: 'Work', href: `${base}/assessments` },
    { value: `${base}/grading`, label: 'Grading', href: `${base}/grading` },
    { value: `${base}/recordings`, label: 'Recordings', href: `${base}/recordings` },
    // Assistant management lives at /manage/assistants, not a per-course tab
    // (REM-014; the old `/staff` sub-page was deleted and this tab 404'd).
  ];
  // The longest tab path the URL sits under (the roster tab is every path's prefix).
  const current =
    [...tabs].reverse().find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? base;

  return (
    <>
      <PageTitle
        title={data?.courseTitle ?? (error?.isNotFound ? 'Course not found' : ' ')}
        backHref="/manage/courses"
      />
      {data && (
        <p className="cl-muted m-0 text-[13.5px]">
          {data.entries.length} enrolled · {data.assessmentCount} assessment
          {data.assessmentCount === 1 ? '' : 's'}
        </p>
      )}
      {!error?.isNotFound && <ClTabs tabs={tabs} value={current} label="Course management sections" />}
      {children}
    </>
  );
}
