'use client';

import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { ClChips, ClTabs } from '@/components/classroom/ui';
import { useSelectedCourse } from '@/components/shell/course-context';

/**
 * The student course page's banner and route tabs. A course's page is three
 * routes (Stream is `/homework`); this is the one header they share. The
 * course picker only appears when the student holds more than one course.
 */
const TABS = [
  { value: '/homework', label: 'Stream', href: '/homework' },
  { value: '/materials', label: 'Materials', href: '/materials' },
  { value: '/classmates', label: 'People', href: '/classmates' },
] as const;

export function CourseHeader() {
  const { courses, selectedId, selectCourse } = useSelectedCourse();
  const pathname = usePathname();
  const { data: list } = useApi((token) => api.courses.list(token), []);

  const course = list?.find((c) => c.id === selectedId);
  const title = course?.title ?? courses?.find((c) => c.id === selectedId)?.title ?? 'Your course';
  const active = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.value ?? '/homework';

  return (
    <>
      <section className="cl-banner" aria-label={title}>
        <span className="ring" />
        <div className="cl-banner-t">
          <div>{title}</div>
          {course?.teacherName && <div>{course.teacherName}</div>}
        </div>
      </section>
      {courses && courses.length > 1 && selectedId && (
        <ClChips
          label="Course"
          value={selectedId}
          onChange={selectCourse}
          options={courses.map((c) => ({ value: c.id, label: c.title }))}
        />
      )}
      <div style={{ background: 'var(--cl-panel)', border: '1px solid var(--cl-line)', borderRadius: 16, padding: '0 12px' }}>
        <ClTabs label="Course sections" tabs={TABS} value={active} />
      </div>
    </>
  );
}
