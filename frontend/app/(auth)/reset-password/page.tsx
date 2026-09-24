'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, TextInput, InlineBanner } from '@/components/ui';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <>
        <h1 className="text-m-h2 font-semibold tracking-[-0.02em] text-fg">
          That link is incomplete
        </h1>
        <p className="mt-4 text-m-body leading-[1.65] text-fg-2">
          Reset links expire after an hour and work once. Request a fresh one
          and use it straight away.
        </p>
        <Link
          href="/forgot-password"
          className="mt-8 inline-block text-m-body text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Request a new link
        </Link>
      </>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(
      new FormData(event.currentTarget).get('newPassword') ?? '',
    );

    if (!PASSWORD_RULE.test(newPassword)) {
      setFieldError('At least 8 characters, including one letter and one number.');
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      await api.auth.confirmPasswordReset({ token: token!, newPassword });
      router.push('/login');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not reset your password. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-m-h2 font-semibold tracking-[-0.02em] text-fg">
        Set a new password
      </h1>
      <p className="mt-2 text-m-body text-fg-3">
        You will be signed out everywhere else once this is saved.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
        <TextInput
          label="New password"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          hint="At least 8 characters, including one letter and one number."
          error={fieldError}
          aria-invalid={Boolean(fieldError)}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <Button type="submit" variant="primary" size="medium" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </>
  );
}
