'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatPercent } from '@/lib/format';
import type { RosterEntry } from '@/lib/types';
import { Button, EmptyState, Loader, Panel, Table, type Column } from '@/components/ui';

/**
 * The course roster - read-only, for both roles.
 *
 * CLAUDE.md §2.2 gives a TA a read-only roster: no edit, no unenroll. There is
 * no write on this screen for either role, because unenrollment is an admin
 * power that does not exist server-side yet - shipping the button first would
 * be a dead control, and shipping it for a TA would contradict the preset.
 *
 * Submitted/graded counts and the average are *performance*. Completion
 * progress is a different measurement and is deliberately not shown beside
 * them as if it were the same thing (§5.1).
 *
 * No "Mode" column: the pre-port screen read `entry.learningMode` off each
 * roster row, but `AUTH-2`'s group-grain migration moved learning mode onto
 * the group-course pairing and `RosterEntry` no longer carries it
 * (`lib/types.ts`). Restoring an equivalent reading means joining the
 * roster against the course's groups, which is a data-shape decision this
 * slice does not make - dropped rather than left reading a field that no
 * longer exists on the wire.
 */
export default function CourseRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi((token) => api.staff.roster(token, id), [id]);

  const columns: Column<RosterEntry>[] = [
    {
      label: 'Student',
      render: (entry) => (
        <>
          <span className="block text-base text-fg">{entry.name}</span>
          <span className="block text-xxs text-fg-4">{entry.email}</span>
        </>
      ),
    },
    {
      label: 'Submitted',
      align: 'end',
      render: (entry) => (
        <span className="num">
          {entry.submittedCount}
          <span className="text-fg-4">/{data?.assessmentCount}</span>
        </span>
      ),
    },
    {
      label: 'Graded',
      align: 'end',
      render: (entry) => <span className="num">{entry.gradedCount}</span>,
    },
    {
      label: 'Average',
      align: 'end',
      // A numeral, never a meter. Meters are for completion only, so a grade
      // can never be misread as progress.
      render: (entry) => <span className="num text-fg">{formatPercent(entry.averageScorePercent)}</span>,
    },
    {
      label: 'Joined',
      align: 'end',
      render: (entry) => <span className="text-fg-3">{formatDate(entry.enrolledAt)}</span>,
    },
  ];

  return (
    <div className="p-6">
      <Panel
        title="Enrolled students"
        action={data && <span className="num text-xs text-fg-3">{data.entries.length}</span>}
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading the roster" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            action={error.isNotFound ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.entries.length === 0 && (
          <EmptyState
            icon="Users"
            title="Nobody enrolled yet"
            description="Students who join this course will be listed here with their submitted work and average mark."
          />
        )}
        {data && data.entries.length > 0 && (
          <Table columns={columns} rows={data.entries} rowKey={(entry) => entry.studentId} />
        )}
      </Panel>
    </div>
  );
}
