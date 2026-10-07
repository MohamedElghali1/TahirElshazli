'use client';

import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import type { StaffProfile } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { TEACHER_AVATAR, initialsOf } from '@/components/shell/classroom';
import { ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { GoogleSignInPanel } from '@/components/account/google-sign-in-panel';

/** Staff account, Redesign V2 "ACCOUNT": big avatar, the editable name, read-only email and role. */
export default function AccountPage() {
  const { data, error, loading, reload } = useApi((token) => api.staff.profile(token), []);

  return (
    <>
      <PageTitle title="Account" />
      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={3} label="Loading your profile" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}
      {data && (
        <>
          <DetailsPanel profile={data} onSaved={reload} />
          <Suspense fallback={null}>
            <GoogleSignInPanel returnTo="/manage/account" />
          </Suspense>
        </>
      )}
    </>
  );
}

function DetailsPanel({ profile, onSaved }: { profile: StaffProfile; onSaved: () => void }) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);

    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.staff.updateProfile(token, {
        name: String(form.get('name') ?? '').trim(),
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
    <section aria-labelledby="ac-h" className="cl-panel">
      <PanelHead id="ac-h" title="Your details" />
      <div className="flex flex-wrap items-start gap-8">
        <span className="cl-av shrink-0 text-[40px]" style={{ width: 120, height: 120 }}>
          {profile.role === 'teacher' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={TEACHER_AVATAR} alt="" />
          ) : (
            initialsOf(profile.name)
          )}
        </span>
        <form onSubmit={submit} noValidate className="cl-fgrid min-w-[260px] flex-1">
          <label className="cl-fl">
            Full name
            <input className="cl-inp" id="name" name="name" autoComplete="name" defaultValue={profile.name} required />
          </label>
          <div className="cl-f2">
            <label className="cl-fl">
              Email
              <input className="cl-inp" id="email" value={profile.email} disabled readOnly />
            </label>
            <label className="cl-fl">
              Role
              <input className="cl-inp" id="role" value={profile.role} disabled readOnly />
            </label>
          </div>
          <p className="cl-muted m-0 text-[13px]">Contact us to change the address on your account.</p>

          {error && <ClError message={error} />}

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span role="status" className="text-[13px]" style={{ color: 'var(--cl-ok)' }}>
                Saved
              </span>
            )}
            <button type="submit" className="cl-btnp" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
