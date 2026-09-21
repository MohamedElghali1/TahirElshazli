'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatFileSize, MATERIAL_CATEGORY_LABEL } from '@/lib/format';
import type { Material, MaterialCategory } from '@/lib/types';
import { Panel, Tag, EmptyState, Loader, Button, Icon } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';

const ORDER: MaterialCategory[] = ['course_notes', 'study_materials', 'important_files'];

/**
 * Materials has no slot in the flat rail (`docs/PRODUCT_SPEC.md` §6 does not
 * list it), but it is real, working, course-scoped functionality — kept
 * reachable by direct link (from Overview's own Materials panel) rather than
 * dropped, per the same precedent slice 4a set for Courses/Blog.
 */
export default function MaterialsPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Materials" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && (
          <Suspense
            fallback={
              <div className="flex justify-center p-12">
                <Loader label="Loading materials" />
              </div>
            }
          >
            <MaterialsList courseId={selectedId} />
          </Suspense>
        )}
      </CourseGate>
    </>
  );
}

function MaterialsList({ courseId }: { courseId: string }) {
  const params = useSearchParams();
  // Overview's own Materials panel deep-links with `?category=` (via
  // `CourseLink`, which sets the rail's course selection in the same click).
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
      <div className="flex justify-center p-12">
        <Loader label="Loading materials" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon="AlertTriangle"
          title={error.message}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {total === 0 ? (
        <Panel bodyClassName="">
          <EmptyState
            icon="Folder"
            title="Nothing uploaded yet"
            description="Course notes, study material and past papers appear here as they are added."
          />
        </Panel>
      ) : (
        sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <Panel
              key={section.key}
              title={MATERIAL_CATEGORY_LABEL[section.key]}
              action={<span className="num text-xs text-fg-3">{section.items.length}</span>}
              bodyClassName=""
            >
              <ul className="divide-y divide-border-light">
                {section.items.map((material) => (
                  <li key={material.id}>
                    <MaterialRow material={material} />
                  </li>
                ))}
              </ul>
            </Panel>
          ))
      )}
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <a
      href={material.fileUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-4 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
    >
      <Icon name="FileText" size={16} className="shrink-0 text-fg-3" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base text-fg">{material.title}</span>
          {material.chapter && <Tag>{material.chapter}</Tag>}
        </div>
        {material.description && (
          <p className="mt-1 truncate text-xs text-fg-3">{material.description}</p>
        )}
      </div>

      <span className="num hidden shrink-0 text-xs text-fg-3 sm:block">
        {material.fileType.toUpperCase()} · {formatFileSize(material.fileSizeBytes)}
      </span>
      <span className="num hidden shrink-0 text-xs text-fg-4 lg:block">
        {formatDate(material.uploadedAt)}
      </span>
      <Icon name="ArrowDown" size={16} className="shrink-0 text-fg-2" />
    </a>
  );
}
