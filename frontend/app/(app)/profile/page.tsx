'use client';

import { Suspense, useRef, useState } from 'react';
import { api, ApiError, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentProfile } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { initialsOf } from '@/components/shell/classroom';
import { ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { GoogleSignInPanel } from '@/components/account/google-sign-in-panel';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * Settings + Account (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`). Name, phone,
 * photo upload, password, Google sign-in link. The artifact's time-zone select
 * and parent's-email field have no API behind them, so they are not drawn.
 */
export default function ProfilePage() {
  const { signOut } = useSession();
  const { data, error, loading, reload } = useApi((token) => api.students.profile(token), []);

  return (
    <>
      <PageTitle title="Settings" />

      {loading && (
        <section className="cl-panel">
          <ClSkeleton rows={4} label="Loading your profile" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}

      {data && (
        <>
          <section aria-labelledby="h-set" className="cl-panel pb-3">
            <PanelHead title="Settings" id="h-set" className="mb-1" />
            <div className="flex items-center gap-4 border-t border-[var(--cl-outline)] px-2 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px]">Sign out</div>
                <div className="cl-muted mt-0.5 text-[13px]">Sign out of Dr. Tahir on this device.</div>
              </div>
              <button type="button" className="cl-btns" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </section>

          <AccountPanel profile={data} onSaved={reload} />
          <PasswordPanel />
          <Suspense fallback={null}>
            <GoogleSignInPanel returnTo="/profile" />
          </Suspense>
        </>
      )}
    </>
  );
}

function AccountPanel({ profile, onSaved }: { profile: StudentProfile; onSaved: () => void }) {
  const { token } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    setUploadError(null);
    setUploading(true);
    try {
      await api.students.uploadAvatar(token, file);
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 413) {
        setUploadError('That image is too large (max 5MB).');
      } else if (cause instanceof ApiError && cause.status === 415) {
        setUploadError('Unsupported file type. Please upload a JPG or PNG.');
      } else {
        setUploadError(cause instanceof ApiError ? cause.message : 'Could not upload avatar. Please try again.');
      }
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset input
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();

    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.students.updateProfile(token, {
        name: String(form.get('name') ?? '').trim(),
        // An empty field means "no number on file", which is null, not "".
        phone: phone === '' ? null : phone,
      });
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your details. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="h-acc" className="cl-panel">
      <PanelHead title="Account" id="h-acc" />
      <div className="flex flex-wrap items-start gap-7">
        <div className="flex flex-col items-center gap-2.5">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(profile.avatarUrl)} alt="" className="h-[120px] w-[120px] rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="cl-av"
              style={{ width: 120, height: 120, fontSize: 40, background: 'var(--cl-tone-peach-bg)', color: 'var(--cl-tone-peach-fg)' }}
            >
              {initialsOf(profile.name)}
            </span>
          )}
          <button type="button" className="cl-glink" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload profile photo"
            onChange={handleFile}
            disabled={uploading}
          />
          <span className="cl-muted text-[12.5px]">JPG, PNG or WEBP. Max 5MB.</span>
          {uploadError && (
            <span role="alert" className="max-w-[160px] text-center text-[13px]" style={{ color: 'var(--cl-bad)' }}>
              {uploadError}
            </span>
          )}
        </div>

        <form onSubmit={submit} noValidate className="cl-fgrid max-w-[520px] flex-[1_1_320px]">
          <label className="cl-fl">
            Full name
            <input className="cl-inp" name="name" autoComplete="name" defaultValue={profile.name} required />
          </label>
          <label className="cl-fl">
            Email
            <input className="cl-inp" type="email" value={profile.email} disabled readOnly />
            <span className="text-[12.5px]">Contact us to change the address on your account.</span>
          </label>
          <label className="cl-fl">
            Phone
            <input className="cl-inp" name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone ?? ''} />
            <span className="text-[12.5px]">Optional</span>
          </label>

          {error && (
            <p role="alert" className="m-0 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="cl-btnp" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span role="status" className="text-[13.5px]" style={{ color: 'var(--cl-ok)' }}>
                Saved
              </span>
            )}
          </div>
          <p className="cl-muted m-0 text-[13px]">
            {profile.enrolledCourseCount} course{profile.enrolledCourseCount === 1 ? '' : 's'} · joined{' '}
            {formatDate(profile.createdAt)}
          </p>
        </form>
      </div>
    </section>
  );
}

function PasswordPanel() {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get('newPassword') ?? '');

    if (!PASSWORD_RULE.test(newPassword)) {
      setFieldError('At least 8 characters, including one letter and one number.');
      return;
    }
    setFieldError(null);
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await api.students.changePassword(token, {
        currentPassword: String(data.get('currentPassword') ?? ''),
        newPassword,
      });
      form.reset();
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not change your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="h-pw" className="cl-panel">
      <PanelHead title="Password" id="h-pw" />
      <form onSubmit={submit} noValidate className="cl-fgrid max-w-[520px]">
        <label className="cl-fl">
          Current password
          <input className="cl-inp" id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label className="cl-fl">
          New password
          <input
            className="cl-inp"
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={fieldError ? true : undefined}
            aria-describedby="newPasswordHint"
          />
          <span id="newPasswordHint" className="text-[12.5px]" style={fieldError ? { color: 'var(--cl-bad)' } : undefined}>
            {fieldError ?? 'At least 8 characters, including one letter and one number.'}
          </span>
        </label>

        {error && (
          <p role="alert" className="m-0 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="cl-btns" disabled={busy}>
            {busy ? 'Changing password…' : 'Change password'}
          </button>
          {done && (
            <span role="status" className="text-[13.5px]" style={{ color: 'var(--cl-ok)' }}>
              Password changed
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
