'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { ManageCourseCard } from '@/lib/types';
import { Button, EmptyState, Loader, Table, Tag, type Column, Panel, TextInput, InlineBanner } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

export default function ManageCoursesPage() {
  const router = useRouter();
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const { data, error, loading, reload } = useApi((token) => api.staff.overview(token), []);
  const [editingId, setEditingId] = useState<string | null>(null);

  const columns: Column<ManageCourseCard>[] = [
    { label: 'Course', render: (course) => course.title },
    {
      label: 'Teacher',
      render: (course) => (
        <span className="text-fg-3">
          {course.teacherName}
          {course.assignedAt && ` · assigned ${formatDate(course.assignedAt)}`}
        </span>
      ),
    },
    {
      label: 'Students',
      align: 'end',
      render: (course) => <span className="num">{course.studentCount}</span>,
    },
    {
      label: 'Recordings',
      align: 'end',
      render: (course) => <span className="num">{course.recordingCount}</span>,
    },
    {
      align: 'end',
      render: (course) => (
        <div className="flex items-center justify-end gap-2">
          {course.awaitingGrading > 0 && <Tag tone="amber">{course.awaitingGrading} to grade</Tag>}
          {admin && (
            <Button size="small" onClick={(e) => { e.stopPropagation(); setEditingId(course.id); }}>
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle title="Courses" />
      <div className="flex flex-col gap-4 p-6">
        <span className="text-base font-medium text-fg-2">
          {admin ? 'All courses' : 'Assigned to you'}
          {data && <> · <span className="num">{data.courses.length}</span></>}
        </span>

        {admin && <CreateCourse onCreated={reload} />}

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

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading courses" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.courses.length === 0 && (
          <EmptyState
            icon="Book"
            title={admin ? 'No courses yet' : 'Nothing assigned to you'}
            description={
              admin
                ? 'Courses added to the platform will appear here.'
                : 'Ask Dr. Tahir to assign you to a course.'
            }
          />
        )}
        {data && data.courses.length > 0 && (
          <Table
            columns={columns}
            rows={data.courses}
            rowKey={(course) => course.id}
            rowLabel={(course) => `Open ${course.title}`}
            onRowClick={(course) => router.push(`/manage/courses/${course.id}`)}
          />
        )}
      </div>
    </>
  );
}

function CreateCourse({ onCreated }: { onCreated: () => void }) {
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

    setBusy(true);
    setError(null);
    try {
      await api.admin.createCourse(token, {
        title,
        slug,
        description: String(form.get('description') ?? '').trim(),
        teacherName,
        thumbnailUrl: String(form.get('thumbnailUrl') ?? '').trim() || null,
        sequentialLockEnabled: form.get('sequentialLockEnabled') === 'on',
        isPublished: form.get('isPublished') === 'on',
      });
      event.currentTarget.reset();
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create course.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New course">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Title" name="title" required />
          <TextInput label="Slug" name="slug" required hint="URL-friendly path segment" />
          <TextInput label="Teacher Name" name="teacherName" required />
          <TextInput label="Thumbnail URL" name="thumbnailUrl" hint="Optional" />
        </div>
        <TextInput label="Description" name="description" required />
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-14 font-medium text-fg">
            <input type="checkbox" name="sequentialLockEnabled" /> Sequential Lock
          </label>
          <label className="flex items-center gap-2 text-14 font-medium text-fg">
            <input type="checkbox" name="isPublished" /> Published
          </label>
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader size={3} label="Creating" /> : 'Create course'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function EditCourse({
  courseId,
  onClose,
  onSaved,
}: {
  courseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: course, loading, error: fetchError } = useApi((t) => api.admin.course(t, courseId), [courseId]);

  if (loading) return <Panel title="Edit Course"><Loader label="Loading course" /></Panel>;
  if (fetchError || !course) return <Panel title="Edit Course"><EmptyState icon="AlertTriangle" title={fetchError?.message ?? 'Not found'} /></Panel>;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();
    const teacherName = String(form.get('teacherName') ?? '').trim();
    
    if (!title || !slug || !teacherName) return;

    setBusy(true);
    setError(null);
    try {
      await api.admin.updateCourse(token, courseId, {
        title,
        slug,
        description: String(form.get('description') ?? '').trim(),
        teacherName,
        thumbnailUrl: String(form.get('thumbnailUrl') ?? '').trim() || null,
        sequentialLockEnabled: form.get('sequentialLockEnabled') === 'on',
        isPublished: form.get('isPublished') === 'on',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save course.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Edit ${course.title}`}
      action={
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Title" name="title" defaultValue={course.title} required />
          <TextInput label="Slug" name="slug" defaultValue={course.slug} required hint="URL-friendly path segment" />
          <TextInput label="Teacher Name" name="teacherName" defaultValue={course.teacherName} required />
          <TextInput label="Thumbnail URL" name="thumbnailUrl" defaultValue={course.thumbnailUrl ?? ''} hint="Optional" />
        </div>
        <TextInput label="Description" name="description" defaultValue={course.description} required />
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-14 font-medium text-fg">
            <input type="checkbox" name="sequentialLockEnabled" defaultChecked={course.sequentialLockEnabled} /> Sequential Lock
          </label>
          <label className="flex items-center gap-2 text-14 font-medium text-fg">
            <input type="checkbox" name="isPublished" defaultChecked={course.isPublished} /> Published
          </label>
        </div>
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
