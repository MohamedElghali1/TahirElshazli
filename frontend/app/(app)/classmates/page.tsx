'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import type { ClassmateGroup } from '@/lib/types';
import { Panel, EmptyState, Loader, Tag, Button } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * Classmates (`docs/PRODUCT_SPEC.md` §6: `[EXISTING]`, "Names and avatars
 * only. Already correct."). Course-scoped via the rail's switcher.
 *
 * Never an email, a mark, progress or attendance (CLAUDE.md §5.17) — a
 * classmate list carrying a grade is a leaderboard, a different product
 * decision. Two groups on the same course means two lists, not one merged
 * set, and an empty group is the normal state for a student who has
 * registered but not yet been placed (§7.2) — the copy says so.
 */
export default function ClassmatesPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Classmates" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <ClassmatesList courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function ClassmatesList({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    (token) => api.students.classmates(token, courseId),
    [courseId],
  );

  return (
    <div className="p-6">
      <Panel title="Your class" bodyClassName="">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading classmates" />
          </div>
        )}
        {error && (
          <div className="p-6">
            <EmptyState
              icon="AlertTriangle"
              title={error.message}
              action={<Button onClick={reload}>Try again</Button>}
            />
          </div>
        )}
        {data && data.length === 0 && (
          <EmptyState
            icon="Users"
            title="You have not been added to a class yet"
            description="Dr. Tahir or a teaching assistant will place you in a group. Until then this course will not show you any work — that is expected, not a fault."
          />
        )}
        {data && data.length > 0 && (
          <div className="flex flex-col divide-y divide-border-light">
            {data.map((group: ClassmateGroup) => (
              <div key={group.groupId} className="px-4 py-4">
                <p className="text-xs text-fg-3">{group.groupName}</p>
                {group.classmates.length === 0 ? (
                  <p className="mt-1 text-xs text-fg-2">
                    You are the only student in this class so far.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {group.classmates.map((classmate) => (
                      <li key={classmate.studentId}>
                        <Tag>{classmate.name}</Tag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
