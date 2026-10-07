'use client';

import { Suspense, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/shell/page-chrome';
import { TEACHER_AVATAR, TEACHER_NAME } from '@/components/shell/classroom';
import { BackLink, ClEmpty, ClSkeleton } from '@/components/classroom/ui';
import { AnnouncementView, PREVIEW_KEY, type PreviewPayload } from '@/components/classroom/announcement-view';

const subscribe = () => () => {};
function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

/**
 * What the student will see. The composer (unsaved draft) and each posted row
 * hand the announcement over through sessionStorage - there is no read-one
 * route, and the list the row came from already holds every field.
 */
function PreviewBody() {
  const { user } = useSession();
  const id = useSearchParams().get('id');
  // `null` on the server and first client render, then the stored value.
  const raw = useSyncExternalStore(subscribe, readStored, () => undefined);

  let item: PreviewPayload | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as PreviewPayload) : null;
    if (parsed && (!id || parsed.id === id)) item = parsed;
  } catch {
    item = null;
  }

  const teacher = user?.role === 'teacher';
  return (
    <>
      <PageTitle title="Preview" backHref="/manage/announcements" />
      <BackLink href="/manage/announcements">Back to announcements</BackLink>
      <section aria-label="Student preview" className="cl-panel">
        {raw === undefined ? (
          <ClSkeleton rows={2} label="Loading the preview" />
        ) : item ? (
          <>
            <p className="cl-soft mb-3 mt-0">This is how students will see it.</p>
            <AnnouncementView
              data={item}
              author={teacher ? TEACHER_NAME : (user?.name ?? 'Staff')}
              avatar={teacher ? TEACHER_AVATAR : undefined}
              meta={[item.audienceLabel, formatDate(item.date ?? new Date().toISOString())].filter(Boolean).join(' · ')}
            />
          </>
        ) : (
          <ClEmpty
            icon="announce"
            title="Nothing to preview"
            hint="Open Preview from the composer or from a posted announcement."
          />
        )}
      </section>
    </>
  );
}

export default function AnnouncementPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewBody />
    </Suspense>
  );
}
