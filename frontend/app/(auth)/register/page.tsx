'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Field, FormError, Input } from '@/components/ui';

/** Mirrors the backend's RegisterDto rule, so the failure is caught here first. */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function RegisterPage() {
  const { register } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
      await register(name, email, password);
      router.push('/dashboard');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not create your account. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-[var(--fg-primary)]">
        Create your account
      </h1>
      <p className="mt-[var(--sp-2)] text-[var(--fs-body)] text-[var(--fg-tertiary)]">
        Once your place is confirmed, this is where your course appears.
      </p>

      <form onSubmit={submit} noValidate className="mt-[var(--sp-8)] flex flex-col gap-[var(--sp-6)]">
        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            autoFocus
            aria-invalid={Boolean(fieldErrors.name)}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters, including one letter and one number."
          error={fieldErrors.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Create account
        </Button>
      </form>

      <p className="mt-[var(--sp-6)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-[var(--fg-secondary)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
