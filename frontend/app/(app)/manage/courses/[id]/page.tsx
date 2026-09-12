'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatPercent } from '@/lib/format';
import {
  Chip,
  EmptyState,
  ErrorState,
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

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
 */
export default function CourseRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.staff.roster(token, id),
    [id],
  );

  return (
    <PageBody>
      <Panel
        title="Enrolled students"
        action={
          data && (
            <span className="num text-[var(--fs-xs)] text-fg-3">
              {data.entries.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={5} />}
        {error && (
          <ErrorState
            message={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            onRetry={error.isNotFound ? undefined : reload}
          />
        )}
        {data && data.entries.length === 0 && (
          <EmptyState
            title="Nobody enrolled yet"
            body="Students who join this course will be listed here with their submitted work and average mark."
          />
        )}
        {data && data.entries.length > 0 && (
          <TableScroll>
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  <Th>Student</Th>
                  <Th>Mode</Th>
                  <Th align="end">Submitted</Th>
                  <Th align="end">Graded</Th>
                  <Th align="end">Average</Th>
                  <Th align="end">Joined</Th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <Tr key={entry.studentId}>
                    <Td>
                      <span className="block text-[var(--fs-base)] text-fg">
                        {entry.name}
                      </span>
                      <span className="block text-[var(--fs-xxs)] text-fg-4">
                        {entry.email}
                      </span>
                    </Td>
                    <Td>
                      <Chip tone={entry.learningMode === 'live' ? 'violet' : 'blue'}>
                        {entry.learningMode === 'live' ? 'Live' : 'Recorded'}
                      </Chip>
                    </Td>
                    <Td align="end">
                      <span className="num">
                        {entry.submittedCount}
                        <span className="text-fg-4">
                          /{data.assessmentCount}
                        </span>
                      </span>
                    </Td>
                    <Td align="end">
                      <span className="num">{entry.gradedCount}</span>
                    </Td>
                    <Td align="end">
                      {/* A numeral, never a meter. Meters are for completion
                          only, so a grade can never be misread as progress. */}
                      <span className="num text-fg">
                        {formatPercent(entry.averageScorePercent)}
                      </span>
                    </Td>
                    <Td align="end">
                      <span className="text-fg-3">
                        {formatDate(entry.enrolledAt)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
          </TableScroll>
        )}
      </Panel>
    </PageBody>
  );
}
