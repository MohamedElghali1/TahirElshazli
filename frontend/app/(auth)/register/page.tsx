'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, TextInput, InlineBanner } from '@/components/ui';

/** Mirrors the backend's RegisterDto rule, so the failure is caught here first. */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function RegisterPage() {
  const { register } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // SHELL-5: the waiting state comes from register's own 201 body, not from a
  // session or a redirect. A waiting account cannot authenticate at all.
  const [waiting, setWaiting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    const next: Record<string, string> = {};
    if (name.length < 2) next.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Please enter a valid email address.';
    if (!PASSWORD_RULE.test(password))
      next.password =
        'At least 8 characters, including one letter and one number.';

    setFieldErrors(next);
    setError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const result = await register(name, email, password);
      // SHELL-5: register returns { status: 'waiting' } and no credential.
      // The UI must not navigate, must not assume a session, and must not try
      // to distinguish waiting from rejected by any API error — the waiting
      // state comes only from this 201 body.
      if (result.status === 'waiting') {
        setWaiting(true);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not create your account. Please try again.',
      );
      setBusy(false);
    }
  }

  // SHELL-5: the waiting-for-approval state, shown after a successful
  // registration. No session, no redirect, no dashboard.
  if (waiting) {
    return (
      <div role="status">
        <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-fg">
          Your account is being reviewed
        </h1>
        <p className="mt-[var(--sp-4)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
          We will let you know once your place is confirmed. This usually takes
          one working day.
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
        Create your account
      </h1>
      <p className="mt-[var(--sp-2)] text-[var(--fs-body)] text-fg-3">
        Once your place is confirmed, this is where your course appears.
      </p>

      <form onSubmit={submit} noValidate className="mt-[var(--sp-8)] flex flex-col gap-[var(--sp-6)]">
        <TextInput
          label="Full name"
          id="name"
          name="name"
          autoComplete="name"
          required
          autoFocus
          error={fieldErrors.name}
          aria-invalid={Boolean(fieldErrors.name)}
        />

        <TextInput
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
          aria-invalid={Boolean(fieldErrors.email)}
        />

        <TextInput
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, including one letter and one number."
          error={fieldErrors.password}
          aria-invalid={Boolean(fieldErrors.password)}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <Button type="submit" variant="primary" size="medium" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-[var(--sp-6)] text-[var(--fs-base)] text-fg-3">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
