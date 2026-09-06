'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { Chip, ErrorState, Skeleton } from '@/components/ui';
import { CourseTabs, PageHeader } from '@/components/app/page-parts';

/**
 * The course frame: title, mode and tabs, shared by every screen under it.
 * The child pages fetch their own data - this only owns the header, so a slow
 * assessments list does not delay the tabs.
 */
export default function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.courses.get(token, id),
    [id],
  );

  if (error) {
    return (
      <ErrorState
        message={
          error.isNotFound
            ? 'This course is not on your enrollment. If that looks wrong, get in touch.'
            : error.message
        }
        onRetry={error.isNotFound ? undefined : reload}
      />
    );
  }

  return (
    <>
      {loading || !data ? (
        <div className="border-b border-[var(--border-light)] px-[var(--sp-6)] py-[var(--sp-6)]">
          <Skeleton className="h-[var(--sp-3)] w-[120px]" />
          <Skeleton className="mt-[var(--sp-3)] h-[var(--sp-6)] w-[280px]" />
        </div>
      ) : (
        <PageHeader
          title={data.title}
          subtitle={data.teacherName}
          breadcrumb={[
            { href: '/dashboard', label: 'My courses' },
            { href: `/learn/${id}`, label: data.title },
          ]}
          action={
            <div className="flex items-center gap-[var(--sp-2)]">
              <Chip tone={data.learningMode === 'recorded' ? 'violet' : 'teal'}>
                {data.learningMode === 'recorded' ? 'Recorded' : 'Live'}
              </Chip>
              {data.sequentialLockEnabled && (
                <Chip tone="neutral">Lessons unlock in order</Chip>
              )}
            </div>
          }
        />
      )}
      <CourseTabs courseId={id} />
      {children}
    </>
  );
}
