'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatPercent } from '@/lib/format';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

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
 * No "Mode" column: `RosterEntry` no longer carries a learning mode
 * (`AUTH-2`'s group-grain migration moved it off the roster row).
 */
const GRID = '2.4fr 1fr 0.8fr 1fr 1fr';

export default function CourseRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi((token) => api.staff.roster(token, id), [id]);

  return (
    <section aria-labelledby="ros-h" className="cl-panel pb-4">
      <PanelHead id="ros-h" title="Enrolled students">
        {data && <span className="cl-muted text-[13px]">{data.entries.length}</span>}
      </PanelHead>
      {loading && !data && <ClSkeleton rows={4} label="Loading the roster" />}
      {error && (
        <ClError
          message={error.isNotFound ? 'This course does not exist, or it is not assigned to you.' : error.message}
          onRetry={error.isNotFound ? undefined : reload}
        />
      )}
      {data && data.entries.length === 0 && (
        <ClEmpty
          icon="people"
          tone="cl-tone-blue"
          title="Nobody enrolled yet"
          hint="Students who join this course will be listed here with their submitted work and average mark."
        />
      )}
      {data && data.entries.length > 0 && (
        <div className="overflow-x-auto">
          <div className="cl-gt" role="table" aria-label="Enrolled students" style={{ minWidth: 640 }}>
            <div className="hd" role="row" style={{ gridTemplateColumns: GRID }}>
              <span>Student</span>
              <span className="r">Submitted</span>
              <span className="r">Graded</span>
              <span className="r">Average</span>
              <span className="r">Joined</span>
            </div>
            {data.entries.map((entry) => (
              <div key={entry.studentId} className="rw" role="row" style={{ gridTemplateColumns: GRID }}>
                <span className="min-w-0">
                  <span className="block truncate">{entry.name}</span>
                  <span className="cl-sub block truncate">{entry.email}</span>
                </span>
                <span className="r">
                  {entry.submittedCount} of {data.assessmentCount}
                </span>
                <span className="r">{entry.gradedCount}</span>
                {/* A numeral, never a meter: a grade must not read as progress. */}
                <span className="r">{formatPercent(entry.averageScorePercent)}</span>
                <span className="r cl-muted">{formatDate(entry.enrolledAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
