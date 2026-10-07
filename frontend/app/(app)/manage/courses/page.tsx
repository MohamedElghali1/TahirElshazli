'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { AdminCourse } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClSkeleton, PanelHead } from '@/components/classroom/ui';

export default function ManageCoursesPage() {
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageTitle title="Courses" />
      <section aria-labelledby="crs-h" className="cl-panel pb-4">
        <PanelHead id="crs-h" title={admin ? 'All courses' : 'Assigned to you'}>
          {data && <span className="cl-muted text-[13px]">{data.courses.length}</span>}
          {admin && (
            <button type="button" className="cl-btnp" onClick={() => setCreating(true)}>
              <ClIcon name="plus" small />
              New course
            </button>
          )}
        </PanelHead>

        {loading && !data && <ClSkeleton rows={3} label="Loading courses" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {data && data.courses.length === 0 && (
          <ClEmpty
            icon="book"
            tone="cl-tone-blue"
            title={admin ? 'No courses yet' : 'Nothing assigned to you'}
            hint={admin ? 'Courses added to the platform will appear here.' : 'Ask Dr. Tahir to assign you to a course.'}
          />
        )}
        {data?.courses.map((course) => (
          <div key={course.id} className="cl-grow">
            <Link
              href={`/manage/courses/${course.id}`}
              className="flex min-w-0 flex-1 items-center gap-4 text-fg no-underline hover:no-underline"
              aria-label={`Open ${course.title}`}
            >
              <span className="cl-ic40 cl-tone-blue">
                <ClIcon name="book" small />
              </span>
              <span className="cl-grow-main">
                <span className="block truncate">{course.title}</span>
                <span className="cl-sub">
                  {course.teacherName}
                  {course.assignedAt && ` · assigned ${formatDate(course.assignedAt)}`} · {course.studentCount}{' '}
                  {course.studentCount === 1 ? 'student' : 'students'} · {course.recordingCount}{' '}
                  {course.recordingCount === 1 ? 'recording' : 'recordings'}
                </span>
              </span>
              {course.awaitingGrading > 0 && (
                <span className="shrink-0 text-[14px]" style={{ color: 'var(--cl-warn)' }}>
                  {course.awaitingGrading} to grade
                </span>
              )}
            </Link>
            {admin && (
              <button type="button" className="cl-btns" onClick={() => setEditingId(course.id)}>
                Edit
              </button>
            )}
          </div>
        ))}
      </section>

      {admin && creating && (
        <CourseModal
          course={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {admin && editingId && (
        <EditCourse
          courseId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/** Create (course `null`) or edit one course, in the artifact's modal. */
function CourseModal({
  course,
  onClose,
  onSaved,
}: {
  course: AdminCourse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();
    const teacherName = String(form.get('teacherName') ?? '').trim();
    if (!title || !slug || !teacherName) return;

    const body = {
      title,
      slug,
      description: String(form.get('description') ?? '').trim(),
      teacherName,
      thumbnailUrl: String(form.get('thumbnailUrl') ?? '').trim() || null,
      sequentialLockEnabled: form.get('sequentialLockEnabled') === 'on',
      isPublished: form.get('isPublished') === 'on',
    };
    setBusy(true);
    setError(null);
    try {
      if (course) await api.admin.updateCourse(token, course.id, body);
      else await api.admin.createCourse(token, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : course ? 'Could not save course.' : 'Could not create course.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClModal
      open
      title={course ? `Edit ${course.title}` : 'New course'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="course-form" className="cl-btnp" disabled={busy}>
            {busy ? 'Saving…' : course ? 'Save' : 'Create course'}
          </button>
        </>
      }
    >
      <form id="course-form" onSubmit={submit} className="cl-fgrid">
        <div className="cl-f2">
          <label className="cl-fl">
            Title
            <input className="cl-inp" name="title" defaultValue={course?.title} required />
          </label>
          <label className="cl-fl">
            Slug (URL-friendly path segment)
            <input className="cl-inp" name="slug" defaultValue={course?.slug} required />
          </label>
        </div>
        <div className="cl-f2">
          <label className="cl-fl">
            Teacher name
            <input className="cl-inp" name="teacherName" defaultValue={course?.teacherName} required />
          </label>
          <label className="cl-fl">
            Thumbnail URL (optional)
            <input className="cl-inp" name="thumbnailUrl" defaultValue={course?.thumbnailUrl ?? ''} />
          </label>
        </div>
        <label className="cl-fl">
          Description
          <input className="cl-inp" name="description" defaultValue={course?.description} required />
        </label>
        <div className="flex flex-wrap gap-5 text-[14px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="sequentialLockEnabled" defaultChecked={course?.sequentialLockEnabled} /> Sequential lock
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isPublished" defaultChecked={course?.isPublished} /> Published
          </label>
        </div>
        {error && (
          <div role="alert" className="cl-soft" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
      </form>
    </ClModal>
  );
}

function EditCourse({ courseId, onClose, onSaved }: { courseId: string; onClose: () => void; onSaved: () => void }) {
  const { data: course, loading, error } = useApi((t) => api.admin.course(t, courseId), [courseId]);

  if (loading || error || !course) {
    return (
      <ClModal open title="Edit course" onClose={onClose}>
        {loading ? <ClSkeleton rows={2} label="Loading course" /> : <ClError message={error?.message ?? 'Not found'} />}
      </ClModal>
    );
  }
  return <CourseModal course={course} onClose={onClose} onSaved={onSaved} />;
}
