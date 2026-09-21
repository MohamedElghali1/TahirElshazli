'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentDirectoryEntry } from '@/lib/types';
import { Button, EmptyState, Loader, SearchInput, Table, type Column } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';

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

  const columns: Column<StudentDirectoryEntry>[] = [
    { label: 'Name', render: (student) => student.name },
    { label: 'Email', render: (student) => student.email },
    {
      label: 'Courses',
      align: 'end',
      render: (student) => <span className="num">{student.enrolledCourseCount}</span>,
    },
    {
      label: 'Joined',
      align: 'end',
      render: (student) => formatDate(student.createdAt),
    },
  ];

  return (
    <>
      <PageTitle title="Students" />
      <div className="flex flex-col gap-4 p-6">
        <SearchInput
          label="Search students"
          className="max-w-[360px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading students" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.length === 0 && (
          <EmptyState
            icon="Users"
            title={search ? 'No matches' : 'No students yet'}
            description={
              search
                ? 'No student account matches that name or email.'
                : 'Students who register will be listed here.'
            }
          />
        )}
        {data && data.length > 0 && (
          <Table columns={columns} rows={data} rowKey={(student) => student.id} />
        )}
      </div>
    </>
  );
}
