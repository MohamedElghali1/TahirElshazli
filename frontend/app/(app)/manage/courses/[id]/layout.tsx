'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { ManageCourseTabs, PageHeader } from '@/components/app/page-parts';

/**
 * The course workspace: one header and one set of tabs for every section a TA
 * or the teacher works in.
 *
 * The roster read doubles as the existence check. A course this actor is not
 * assigned to comes back 404, not 403 (CLAUDE.md §5.11) - so an unassigned TA
 * cannot tell a course they do not hold from one that does not exist, and this
 * header renders the same "not found" either way.
 */
export default function ManageCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useSession();
  const admin = isAdminRole(user?.role);

  const { data, error } = useApi((token) => api.staff.roster(token, id), [id]);

  return (
    <>
      <PageHeader
        title={data?.courseTitle ?? (error?.isNotFound ? 'Course not found' : ' ')}
        subtitle={
          data
            ? `${data.entries.length} enrolled · ${data.assessmentCount} assessment${
                data.assessmentCount === 1 ? '' : 's'
              }`
            : undefined
        }
        breadcrumb={[{ href: '/manage/courses', label: 'Courses' }]}
      />
      {!error?.isNotFound && <ManageCourseTabs courseId={id} admin={admin} />}
      {children}
    </>
  );
}
