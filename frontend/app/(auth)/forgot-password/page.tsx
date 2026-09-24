'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, TextInput, InlineBanner } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setError(null);
    setBusy(true);
    try {
      await api.auth.requestPasswordReset({ email });
      // The endpoint answers the same whether or not the account exists, and
      // so does this screen. Confirming an address is registered is an account
      // enumeration leak.
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not send the reset link. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <h1 className="text-m-h2 font-semibold tracking-[-0.02em] text-fg">
          Check your inbox
        </h1>
        <p className="mt-4 text-m-body leading-[1.65] text-fg-2">
          If that address has an account, a reset link is on its way. The link
          works once and expires in an hour.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block text-m-body text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-m-h2 font-semibold tracking-[-0.02em] text-fg">
        Reset your password
      </h1>
      <p className="mt-2 text-m-body text-fg-3">
        We will email you a link to set a new one.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
        <TextInput
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <Button type="submit" variant="primary" size="medium" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-6 inline-block text-m-body text-fg-2 underline underline-offset-4 hover:text-fg"
      >
        Back to sign in
      </Link>
    </>
  );
}
