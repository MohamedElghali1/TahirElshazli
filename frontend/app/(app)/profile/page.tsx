'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentProfile } from '@/lib/types';
import {
  Button,
  ErrorState,
  Field,
  FormError,
  Input,
  Panel,
  Skeleton,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function ProfilePage() {
  const { data, error, loading, reload } = useApi(
    (token) => api.students.profile(token),
    [],
  );

  return (
    <>
      <PageHeader title="Profile" subtitle="Your details and sign-in." />
      <PageBody className="grid gap-[var(--sp-6)] xl:grid-cols-2">
        {loading && (
          <>
            <Skeleton className="h-[280px]" />
            <Skeleton className="h-[240px]" />
          </>
        )}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {data && (
          <>
            <DetailsPanel profile={data} onSaved={reload} />
            <PasswordPanel />
          </>
        )}
      </PageBody>
    </>
  );
}

function DetailsPanel({
  profile,
  onSaved,
}: {
  profile: StudentProfile;
  onSaved: () => void;
}) {
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
        cause instanceof ApiError
          ? cause.message
          : 'Could not save your details. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Your details">
      <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--sp-4)]">
        <Field label="Full name" htmlFor="name">
          <Input
            id="name"
            name="name"
            autoComplete="name"
            defaultValue={profile.name}
            required
          />
        </Field>

        <Field
          label="Email"
          htmlFor="email"
          hint="Contact us to change the address on your account."
        >
          <Input id="email" value={profile.email} disabled readOnly />
        </Field>

        <Field label="Phone" htmlFor="phone" hint="Optional">
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={profile.phone ?? ''}
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-between gap-[var(--sp-4)] border-t border-[var(--border-light)] pt-[var(--sp-4)]">
          <p className="num text-[var(--fs-xxs)] text-fg-4">
            {profile.enrolledCourseCount} course
            {profile.enrolledCourseCount === 1 ? '' : 's'} · joined{' '}
            {formatDate(profile.createdAt)}
          </p>
          <div className="flex items-center gap-[var(--sp-3)]">
            {saved && (
              <span
                role="status"
                className="text-[var(--fs-xs)] text-chip-green-fg"
              >
                Saved
              </span>
            )}
            <Button type="submit" variant="primary" loading={busy}>
              Save changes
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
        cause instanceof ApiError
          ? cause.message
          : 'Could not change your password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--sp-4)]">
        <Field label="Current password" htmlFor="currentPassword">
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          hint="At least 8 characters, including one letter and one number."
          error={fieldError}
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldError)}
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-[var(--sp-3)] border-t border-[var(--border-light)] pt-[var(--sp-4)]">
          {done && (
            <span
              role="status"
              className="text-[var(--fs-xs)] text-chip-green-fg"
            >
              Password changed
            </span>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
