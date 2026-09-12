'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Field, FormError, Input } from '@/components/ui';

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
        <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-fg">
          Check your inbox
        </h1>
        <p className="mt-[var(--sp-4)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
          If that address has an account, a reset link is on its way. The link
          works once and expires in an hour.
        </p>
        <Link
          href="/login"
          className="mt-[var(--sp-8)] inline-block text-[var(--fs-base)] text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-fg">
        Reset your password
      </h1>
      <p className="mt-[var(--sp-2)] text-[var(--fs-body)] text-fg-3">
        We will email you a link to set a new one.
      </p>

      <form onSubmit={submit} noValidate className="mt-[var(--sp-8)] flex flex-col gap-[var(--sp-6)]">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" variant="primary" size="md" loading={busy}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-[var(--sp-6)] inline-block text-[var(--fs-base)] text-fg-2 underline underline-offset-4 hover:text-fg"
      >
        Back to sign in
      </Link>
    </>
  );
}
