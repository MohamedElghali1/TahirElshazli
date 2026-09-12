'use client';

import { useState } from 'react';
import { UsersThreeIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { EmptyState, ErrorState, Input, RowsSkeleton } from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { PageTitle } from '@/components/app/page-chrome';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

/**
 * The student directory. Admin only - CLAUDE.md §2.2 puts the full directory
 * under the teacher and gives a TA a per-course roster instead, which is why
 * this screen has no course scoping at all: it is the unscoped read, and only
 * one role reaches it.
 *
 * Search runs server-side. Fetching everyone and filtering in the browser
 * would ship the whole student body to the client to render twenty rows.
 */
export default function StudentDirectoryPage() {
  const [search, setSearch] = useState('');

  const { data, error, loading, reload } = useApi(
    (token) => api.admin.students(token, search.trim() || undefined),
    [search],
  );

  return (
    <>
      <PageTitle icon={UsersThreeIcon} title="Students" />
      <PageBody dense className="flex flex-col gap-[var(--sp-4)]">
        <div className="max-w-[360px]">
          <label htmlFor="student-search" className="sr-only">
            Search students
          </label>
          <Input
            id="student-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
          />
        </div>

        {loading && <RowsSkeleton rows={6} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <EmptyState
            title={search ? 'No matches' : 'No students yet'}
            body={
              search
                ? 'No student account matches that name or email.'
                : 'Students who register will be listed here.'
            }
          />
        )}
        {data && data.length > 0 && (
          <TableScroll minWidth={520}>
            <thead>
              <tr className="border-b border-[var(--border-medium)]">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th align="end">Courses</Th>
                <Th align="end">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((student) => (
                <Tr key={student.id}>
                  <Td className="text-[var(--fg-primary)]">{student.name}</Td>
                  <Td>{student.email}</Td>
                  <Td align="end">
                    <span className="num">{student.enrolledCourseCount}</span>
                  </Td>
                  <Td align="end">
                    <span className="text-[var(--fg-tertiary)]">
                      {formatDate(student.createdAt)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </PageBody>
    </>
  );
}
