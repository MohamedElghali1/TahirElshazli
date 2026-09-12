'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { DownloadSimpleIcon, FileIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  formatDate,
  formatFileSize,
  MATERIAL_CATEGORY_LABEL,
} from '@/lib/format';
import type { Material, MaterialCategory } from '@/lib/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

const ORDER: MaterialCategory[] = [
  'course_notes',
  'study_materials',
  'important_files',
];

export default function MaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageBody><RowsSkeleton rows={5} /></PageBody>}>
      <MaterialsList courseId={id} />
    </Suspense>
  );
}

function MaterialsList({ courseId }: { courseId: string }) {
  // The dashboard's Materials panel deep-links with ?category=, so the filter
  // is read from the URL rather than held in component state.
  const raw = useSearchParams().get('category');
  const category = ORDER.includes(raw as MaterialCategory)
    ? (raw as MaterialCategory)
    : undefined;

  const { data, error, loading, reload } = useApi(
    (token) => api.materials.list(token, courseId, category),
    [courseId, category],
  );

  const sections = (category ? [category] : ORDER).map((key) => ({
    key,
    items: data?.[key] ?? [],
  }));

  const total = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      {loading && (
        <Panel title="Materials" bodyClassName="">
          <RowsSkeleton rows={5} />
        </Panel>
      )}

      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && total === 0 && (
        <Panel title="Materials" bodyClassName="">
          <EmptyState
            title="Nothing uploaded yet"
            body="Course notes, study material and past papers appear here as they are added."
          />
        </Panel>
      )}

      {data &&
        total > 0 &&
        sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <Panel
              key={section.key}
              title={MATERIAL_CATEGORY_LABEL[section.key]}
              action={
                <span className="num text-[var(--fs-xs)] text-fg-3">
                  {section.items.length}
                </span>
              }
              bodyClassName=""
            >
              <ul className="rows">
                {section.items.map((material) => (
                  <li key={material.id}>
                    <MaterialRow material={material} />
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
    </PageBody>
  );
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <a
      href={material.fileUrl}
      target="_blank"
      rel="noreferrer"
      className="row flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
    >
      <FileIcon size={16} className="shrink-0 text-fg-3" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--sp-2)]">
          <span className="truncate text-[var(--fs-base)] text-fg">
            {material.title}
          </span>
          {material.chapter && <Chip tone="neutral">{material.chapter}</Chip>}
        </div>
        {material.description && (
          <p className="mt-[var(--sp-1)] truncate text-[var(--fs-xs)] text-fg-3">
            {material.description}
          </p>
        )}
      </div>

      <span className="num hidden shrink-0 text-[var(--fs-xs)] text-fg-3 sm:block">
        {material.fileType.toUpperCase()} · {formatFileSize(material.fileSizeBytes)}
      </span>
      <span className="num hidden shrink-0 text-[var(--fs-xs)] text-fg-4 lg:block">
        {formatDate(material.uploadedAt)}
      </span>
      <DownloadSimpleIcon
        size={16}
        className="reveal shrink-0 text-fg-2"
      />
    </a>
  );
}
