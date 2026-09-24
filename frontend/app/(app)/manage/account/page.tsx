'use client';

import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import type { StaffProfile } from '@/lib/types';
import { Panel, EmptyState, Loader, Button, TextInput, InlineBanner, Tag } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { GoogleSignInPanel } from '@/components/account/google-sign-in-panel';

export default function AccountPage() {
  const { data, error, loading, reload } = useApi((token) => api.staff.profile(token), []);

  return (
    <>
      <PageTitle title="Account" />
      <div className="grid gap-6 p-6 xl:grid-cols-2">
        {loading && (
          <div className="flex justify-center p-12 xl:col-span-2">
            <Loader label="Loading your profile" />
          </div>
        )}
        {error && (
          <div className="xl:col-span-2">
            <EmptyState
              icon="AlertTriangle"
              title={error.message}
              action={<Button onClick={reload}>Try again</Button>}
            />
          </div>
        )}
        {data && (
          <>
            <DetailsPanel profile={data} onSaved={reload} />
            <Suspense fallback={null}>
              <GoogleSignInPanel returnTo="/manage/account" />
            </Suspense>
          </>
        )}
      </div>
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
      setError(
        cause instanceof ApiError ? cause.message : 'Could not save your details. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Your details">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextInput label="Full name" id="name" name="name" autoComplete="name" defaultValue={profile.name} required />

        <TextInput
          label="Email"
          id="email"
          value={profile.email}
          disabled
          readOnly
          hint="Contact us to change the address on your account."
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center justify-between gap-4 border-t border-border-light pt-4">
          <div>
            <Tag tone="blue">{profile.role}</Tag>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span role="status" className="text-xs text-status-green-text">
                Saved
              </span>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader size={3} label="Saving" /> : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
