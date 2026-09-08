'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { Button, Field, FormError, Input } from '@/components/ui';

export default function LoginPage() {
  const { signIn } = useSession();
  const router = useRouter();
  // Set by the public course pages, so someone who clicked "Sign in to enroll"
  // arrives at the catalog rather than at a dashboard they did not ask for.
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);
    try {
      const account = await signIn(
        String(data.get('email') ?? '').trim(),
        String(data.get('password') ?? ''),
      );
      // Dr. Tahir and his assistants land in the management console, students
      // in the LMS or wherever `next` pointed. Routing on the returned account
      // rather than on session state avoids a render where the destination is
      // not known yet.
      router.push(resolvePostAuthPath(account.role, next));
    } catch (cause) {
      // The backend answers unknown-email and wrong-password identically, on
      // purpose. Do not narrow the message here or that work is undone.
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not sign you in. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-[var(--fg-primary)]">
        Sign in
      </h1>
      <p className="mt-[var(--sp-2)] text-[var(--fs-body)] text-[var(--fg-tertiary)]">
        Use the email address your place was booked under.
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

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Sign in
        </Button>
      </form>

      <div className="mt-[var(--sp-6)] flex flex-col gap-[var(--sp-3)] text-[var(--fs-base)]">
        <Link
          href="/forgot-password"
          className="text-[var(--fg-secondary)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
        >
          Forgot your password?
        </Link>
        <p className="text-[var(--fg-tertiary)]">
          No account yet?{' '}
          <Link
            href="/register"
            className="text-[var(--fg-secondary)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
          >
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
