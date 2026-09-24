'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { Button, TextInput, InlineBanner } from '@/components/ui';

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
      <h1 className="text-m-h2 font-semibold tracking-[-0.02em] text-fg">
        Sign in
      </h1>
      <p className="mt-2 text-m-body text-fg-3">
        Use the email address your place was booked under.
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

        <TextInput
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <Button type="submit" variant="primary" size="medium" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-m-body text-fg-3">
        <Link
          href="/forgot-password"
          className="text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Forgot your password?
        </Link>
        <p className="text-fg-3">
          No account yet?{' '}
          <Link
            href="/register"
            className="text-fg-2 underline underline-offset-4 hover:text-fg"
          >
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
