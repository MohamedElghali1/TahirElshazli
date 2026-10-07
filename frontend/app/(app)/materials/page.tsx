'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, mediaSrc } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatFileSize, MATERIAL_CATEGORY_LABEL } from '@/lib/format';
import type { Material, MaterialCategory } from '@/lib/types';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { CourseHeader } from '@/components/student/course-header';
import { useSelectedCourse } from '@/components/shell/course-context';

const ORDER: MaterialCategory[] = ['course_notes', 'study_materials', 'important_files'];

/**
 * Materials — a tab of the course page (`docs/PRODUCT_SPEC.md` §6 does not
 * list it in the rail, but it is real, course-scoped functionality).
 */
export default function MaterialsPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Materials" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && (
          <>
            <CourseHeader />
            <Suspense
              fallback={
                <section className="cl-panel">
                  <ClSkeleton label="Loading materials" />
                </section>
              }
            >
              <MaterialsList courseId={selectedId} />
            </Suspense>
          </>
        )}
      </CourseGate>
    </>
  );
}

function MaterialsList({ courseId }: { courseId: string }) {
  const params = useSearchParams();
  // Overview's own Materials panel deep-links with `?category=` (via
  // `CourseLink`, which sets the course selection in the same click).
  const raw = params.get('category');
  const category = ORDER.includes(raw as MaterialCategory) ? (raw as MaterialCategory) : undefined;

  const { data, error, loading, reload } = useApi(
    (token) => api.materials.list(token, courseId, category),
    [courseId, category],
  );

  const sections = (category ? [category] : ORDER).map((key) => ({
    key,
    items: data?.[key] ?? [],
  }));
  const total = sections.reduce((sum, s) => sum + s.items.length, 0);

  if (loading) {
    return (
      <section className="cl-panel">
        <ClSkeleton label="Loading materials" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="cl-panel">
        <ClError message={error.message} onRetry={reload} />
      </section>
    );
  }

  if (total === 0) {
    return (
      <section className="cl-panel">
        <ClEmpty
          icon="folder"
          title="Nothing uploaded yet"
          hint="Course notes, study material and past papers appear here as they are added."
        />
      </section>
    );
  }

  return (
    <>
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.key} className="cl-panel" aria-labelledby={`mat-${section.key}`}>
            <PanelHead id={`mat-${section.key}`} title={MATERIAL_CATEGORY_LABEL[section.key]}>
              <span className="cl-muted text-[14px]">{section.items.length}</span>
            </PanelHead>
            {section.items.map((material) => (
              <MaterialRow key={material.id} material={material} />
            ))}
          </section>
        ))}
    </>
  );
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <div className="cl-chip-row">
      <span className="cl-ic34 cl-ic40 cl-tone-sky">
        <ClIcon name="doc" small />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {material.title}
          {material.chapter && <span className="cl-muted text-[13px]"> · {material.chapter}</span>}
        </span>
        <span className="cl-muted block truncate text-[12.5px]">
          {material.description ? `${material.description} · ` : ''}
          {material.fileType.toUpperCase()} · {formatFileSize(material.fileSizeBytes)} · {formatDate(material.uploadedAt)}
        </span>
      </span>
      <a href={mediaSrc(material.fileUrl)} target="_blank" rel="noreferrer" className="cl-btns">
        Open
      </a>
      <a href={mediaSrc(material.fileUrl)} download className="cl-btns cl-btns--quiet">
        Download
      </a>
    </div>
  );
}
