'use client';

import { use, useRef, useState } from 'react';
import { api, ApiError, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { AdminStudentUpdate, StudentDetail, UserStatus } from '@/lib/types';
import { initialsOf } from '@/components/shell/classroom';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

const STATUS_LABEL: Record<UserStatus, string> = {
  waiting: 'Waiting',
  active: 'Active',
  rejected: 'Rejected',
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
      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={4} label="Loading student" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}
      {data && <StudentEditor student={data} onSaved={reload} />}
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(student.avatarUrl);
  // Preview of a fresh upload: behind private storage the stored url is not fetchable, readUrl is.
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync local form state whenever a fresh read lands - e.g. after saving,
  // or after switching to a different student without unmounting. Derived
  // during render, not in an effect: React's guidance for deriving state from
  // a changed prop.
  const [lastStudent, setLastStudent] = useState(student);
  if (lastStudent !== student) {
    setLastStudent(student);
    setForm(formFor(student));
    setSaved(false);
    setPhotoUrl(student.avatarUrl);
  }

  async function changePhoto(file: File) {
    if (!token) return;
    setPhotoError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    setPhotoBusy(true);
    try {
      const config = await api.staff.uploadConfig(token);
      if (!config.enabled) {
        setPhotoError('File uploads are not enabled on this server yet, so a photo cannot be set.');
        return;
      }
      const uploaded = await api.staff.upload(token, file);
      await api.admin.updateStudent(token, student.id, { avatarUrl: uploaded.url });
      setPhotoUrl(uploaded.url);
      setPreview(uploaded.readUrl || null);
      onSaved();
    } catch (cause) {
      setPhotoError(cause instanceof ApiError ? cause.message : 'Could not change the photo.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    if (!token) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await api.admin.updateStudent(token, student.id, { avatarUrl: null });
      setPhotoUrl(null);
      setPreview(null);
      onSaved();
    } catch (cause) {
      setPhotoError(cause instanceof ApiError ? cause.message : 'Could not remove the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const photoSrc = preview ?? (photoUrl ? mediaSrc(photoUrl) : null);

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
    <section aria-labelledby="sd-h" className="cl-panel">
      <PanelHead id="sd-h" title="Details">
        <span className="cl-muted text-[14px]">
          {student.email} · {STATUS_LABEL[student.status]} · Joined {formatDate(student.createdAt)} ·{' '}
          {student.enrolledCourseCount} course{student.enrolledCourseCount === 1 ? '' : 's'}
        </span>
      </PanelHead>
      <div className="mb-5 flex flex-wrap items-center gap-5">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt="" width={112} height={112} className="size-28 rounded-full object-cover" />
        ) : (
          <span className="cl-av flex size-28 items-center justify-center text-[32px]" aria-hidden>
            {initialsOf(student.name)}
          </span>
        )}
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="cl-btns" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? 'Working…' : 'Change photo'}
            </button>
            {photoUrl && (
              <button type="button" className="cl-glink cl-glink--danger" disabled={photoBusy} onClick={() => void removePhoto()}>
                Remove photo
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Student photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void changePhoto(f);
            }}
          />
          <span className="cl-muted text-[13px]">JPEG, PNG or WebP.</span>
          {photoError && (
            <p role="alert" className="m-0 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
              {photoError}
            </p>
          )}
        </div>
      </div>
      <form onSubmit={save} className="cl-fgrid">
        {error && (
          <p role="alert" className="cl-soft m-0" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="cl-soft m-0" style={{ color: 'var(--cl-ok)' }}>
            Saved.
          </p>
        )}

        <div className="cl-f2">
          <label className="cl-fl">
            Full name
            <input
              className="cl-inp"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="cl-fl">
            Phone
            <input
              className="cl-inp"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
        </div>
        <div className="cl-f2">
          <label className="cl-fl">
            School
            <input
              className="cl-inp"
              value={form.schoolName}
              onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
            />
          </label>
          <label className="cl-fl">
            Parent email
            <input
              className="cl-inp"
              type="email"
              value={form.parentEmail}
              onChange={(e) => setForm((f) => ({ ...f, parentEmail: e.target.value }))}
            />
          </label>
        </div>
        <label className="cl-fl">
          Staff notes
          <textarea
            className="cl-inp"
            rows={4}
            value={form.staffNotes}
            onChange={(e) => setForm((f) => ({ ...f, staffNotes: e.target.value }))}
          />
        </label>

        <div>
          <button type="submit" className="cl-btnp" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}
