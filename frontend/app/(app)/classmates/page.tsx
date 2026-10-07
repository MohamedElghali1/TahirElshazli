'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { CONTACT } from '@/lib/site-content';
import type { ClassmateGroup } from '@/lib/types';
import { TEACHER_AVATAR, TEACHER_NAME, initialsOf } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { CourseHeader } from '@/components/student/course-header';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * People — a tab of the course page (`docs/PRODUCT_SPEC.md` §6: `[EXISTING]`,
 * "**Names only** — no avatar.").
 *
 * Client ruling 2026-09-24: **no photographs of students.** The initials disc
 * is not an avatar — it carries no image. Do not add one back because a design
 * shows a circle. Dr. Tahir's own portrait is the teacher's, not a student's.
 *
 * Never an email, a mark, progress or attendance (CLAUDE.md §5.17). Two groups
 * on the same course means two lists, not one merged set, and an empty group is
 * the normal state for a student who has registered but not yet been placed
 * (§7.2) — the copy says so.
 */
export default function ClassmatesPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="People" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && (
          <>
            <CourseHeader />
            <People courseId={selectedId} />
          </>
        )}
      </CourseGate>
    </>
  );
}

function People({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useApi(
    (token) => api.students.classmates(token, courseId),
    [courseId],
  );

  return (
    <>
      <section className="cl-panel" aria-labelledby="teachers-h">
        <PanelHead id="teachers-h" title="Teachers" />
        <div className="cl-grow" style={{ cursor: 'default' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TEACHER_AVATAR} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
          <span className="cl-grow-main">{TEACHER_NAME}</span>
          <a href={CONTACT.whatsappUrl} target="_blank" rel="noreferrer" className="cl-glink">
            Message on WhatsApp
          </a>
        </div>
      </section>

      <section className="cl-panel" aria-labelledby="classmates-h">
        <PanelHead id="classmates-h" title="Classmates">
          {data && data.length > 0 && (
            <span className="cl-muted text-[14px]">
              {data.reduce((n, g) => n + g.classmates.length, 0)} classmates
            </span>
          )}
        </PanelHead>

        {loading && <ClSkeleton label="Loading classmates" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <ClEmpty
            icon="people"
            title="You have not been added to a class yet"
            hint="Dr. Tahir or a teaching assistant will place you in a group. Until then this course will not show you any work — that is expected, not a fault."
          />
        )}
        {data &&
          data.map((group: ClassmateGroup) => (
            <div key={group.groupId} className="mt-2">
              <div className="cl-label px-2 py-2">{group.groupName}</div>
              {group.classmates.length === 0 ? (
                <p className="cl-muted px-2 pb-3 text-[14px]">You are the only student in this class so far.</p>
              ) : (
                group.classmates.map((classmate) => (
                  <div key={classmate.studentId} className="cl-grow" style={{ cursor: 'default' }}>
                    <span className="cl-ic40" dir="auto">
                      {initialsOf(classmate.name)}
                    </span>
                    <span dir="auto">{classmate.name}</span>
                  </div>
                ))
              )}
            </div>
          ))}
      </section>
    </>
  );
}
