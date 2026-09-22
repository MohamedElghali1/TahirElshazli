'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AdminStudentUpdate, StudentDetail, UserStatus } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Tag,
  TextArea,
  TextInput,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const STATUS_TONE: Record<UserStatus, TagTone> = {
  waiting: 'amber',
  active: 'green',
  rejected: 'red',
};

/** The staff detail + edit screen (`PEOPLE-2`). */
export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.admin.studentDetail(token, id),
    [id],
  );

  return (
    <>
      <PageTitle title={data?.name ?? 'Student'} backHref="/manage/students" />
      <div className="flex flex-col gap-4 p-6">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading student" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && <StudentEditor student={data} onSaved={reload} />}
      </div>
    </>
  );
}

function StudentEditor({
  student,
  onSaved,
}: {
  student: StudentDetail;
  onSaved: () => void;
}) {
  const { token } = useSession();

  function formFor(s: StudentDetail) {
    return {
      name: s.name,
      phone: s.phone ?? '',
      schoolName: s.schoolName ?? '',
      parentEmail: s.parentEmail ?? '',
      staffNotes: s.staffNotes ?? '',
    };
  }

  const [form, setForm] = useState(() => formFor(student));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync local form state whenever a fresh read lands - e.g. after saving,
  // or after switching to a different student without unmounting. Derived
  // during render, not in an effect: the same pattern the shells already use
  // for `lastPathname` - React's own guidance for deriving state from a
  // changed prop, and the only way to avoid an extra render on every load.
  const [lastStudent, setLastStudent] = useState(student);
  if (lastStudent !== student) {
    setLastStudent(student);
    setForm(formFor(student));
    setSaved(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const update: AdminStudentUpdate = {
      name: form.name,
      phone: form.phone.trim() || null,
      schoolName: form.schoolName.trim() || null,
      parentEmail: form.parentEmail.trim() || null,
      staffNotes: form.staffNotes.trim() || null,
    };
    try {
      await api.admin.updateStudent(token, student.id, update);
      onSaved();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save this student.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Details">
      <form onSubmit={save} className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <p className="text-base text-fg-3">{student.email}</p>
          <Tag tone={STATUS_TONE[student.status]}>{student.status}</Tag>
          <p className="text-base text-fg-3">Joined {formatDate(student.createdAt)}</p>
          <p className="text-base text-fg-3">
            {student.enrolledCourseCount} course{student.enrolledCourseCount === 1 ? '' : 's'}
          </p>
        </div>

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        {saved && !error && <InlineBanner tone="green">Saved.</InlineBanner>}

        <TextInput
          label="Full name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextInput
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <TextInput
          label="School"
          value={form.schoolName}
          onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
        />
        <TextInput
          label="Parent email"
          type="email"
          value={form.parentEmail}
          onChange={(e) => setForm((f) => ({ ...f, parentEmail: e.target.value }))}
        />
        <TextArea
          label="Staff notes"
          rows={4}
          value={form.staffNotes}
          onChange={(e) => setForm((f) => ({ ...f, staffNotes: e.target.value }))}
        />

        <Button type="submit" variant="primary" disabled={busy} className="self-start">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Panel>
  );
}
