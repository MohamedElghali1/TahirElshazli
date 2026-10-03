'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { AuthAside, AuthShell, Field, FormError, SubmitButton, textLink } from '../_za/auth-shell';

const ASIDE = (
  <AuthAside
    heading="Chemistry that finally makes sense."
    body="Reactions, equations and theories explained with real-life examples and a structure that makes the hardest topics approachable."
  />
);

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
    const confirm = String(data.get('confirmPassword') ?? '');

    const next: Record<string, string> = {};
    if (name.length < 2) next.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Please enter a valid email address.';
    if (!PASSWORD_RULE.test(password))
      next.password =
        'At least 8 characters, including one letter and one number.';
    else if (password !== confirm)
      next.confirmPassword = 'The two passwords do not match yet.';

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
      <AuthShell
        eyebrow="Account created"
        title="Your account is being reviewed."
        lead="We will let you know once your place is confirmed. This usually takes one working day."
        aside={ASIDE}
      >
        <p role="status" className="text-za-sm text-za-muted-foreground">
          <Link href="/login" className={textLink}>
            Back to sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title="Join the chemistry class."
      lead="One account gives you the lessons, the problem sets, the past-paper drills and the feedback. Setting it up takes less than a minute."
      aside={ASIDE}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-10">
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Nour Hassan"
          required
          autoFocus
          error={fieldErrors.name}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={fieldErrors.email}
        />

        <div className="grid gap-10 sm:grid-cols-2">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            hint="At least 8 characters, including one letter and one number."
            error={fieldErrors.password}
          />

          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat it once more"
            required
            error={fieldErrors.confirmPassword}
          />
        </div>

        {error ? <FormError>{error}</FormError> : null}

        <SubmitButton disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</SubmitButton>

        <p className="text-za-sm text-za-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className={textLink}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
