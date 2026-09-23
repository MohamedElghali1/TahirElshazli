'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentProfile } from '@/lib/types';
import { Panel, EmptyState, Loader, Button, TextInput, InlineBanner, Avatar } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * Settings (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Profile photo upload —
 * the upload route is staff-only today"). The upload capability has no
 * backend yet, so this is the existing profile screen — name, phone,
 * password — ported as-is; adding a photo control with nothing to call
 * would be inventing a feature that does not work.
 */
export default function ProfilePage() {
  const { data, error, loading, reload } = useApi((token) => api.students.profile(token), []);

  return (
    <>
      <PageTitle title="Settings" />
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
            <AvatarPanel profile={data} onSaved={reload} />
            <DetailsPanel profile={data} onSaved={reload} />
            <PasswordPanel />
          </>
        )}
      </div>
    </>
  );
}

function AvatarPanel({ profile, onSaved }: { profile: StudentProfile; onSaved: () => void }) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    setError(null);
    setBusy(true);
    try {
      await api.students.uploadAvatar(token, file);
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 413) {
        setError('That image is too large (max 5MB).');
      } else if (cause instanceof ApiError && cause.status === 415) {
        setError('Unsupported file type. Please upload a JPG or PNG.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Could not upload avatar. Please try again.');
      }
    } finally {
      setBusy(false);
      event.target.value = ''; // Reset input
    }
  }

  return (
    <Panel title="Profile picture">
      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <Avatar
            name={profile.name}
            src={profile.avatarUrl ?? undefined}
            size={64}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer">
              <Button type="button" variant="secondary" disabled={busy} onClick={(e) => {
                const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                if (input) input.click();
              }}>
                {busy ? <Loader size={3} label="Uploading" /> : 'Upload photo'}
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
                disabled={busy}
              />
            </label>
          </div>
          <p className="text-xs text-fg-3">
            JPG, PNG or WEBP. Max 5MB.
          </p>
          {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        </div>
      </div>
    </Panel>
  );
}

function DetailsPanel({ profile, onSaved }: { profile: StudentProfile; onSaved: () => void }) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

        <TextInput
          label="Phone"
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ''}
          hint="Optional"
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center justify-between gap-4 border-t border-border-light pt-4">
          <p className="num text-xxs text-fg-4">
            {profile.enrolledCourseCount} course{profile.enrolledCourseCount === 1 ? '' : 's'} · joined{' '}
            {formatDate(profile.createdAt)}
          </p>
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
      setError(
        cause instanceof ApiError ? cause.message : 'Could not change your password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextInput
          label="Current password"
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />

        <TextInput
          label="New password"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, including one letter and one number."
          error={fieldError}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center justify-end gap-3 border-t border-border-light pt-4">
          {done && (
            <span role="status" className="text-xs text-status-green-text">
              Password changed
            </span>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader size={3} label="Changing password" /> : 'Change password'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
