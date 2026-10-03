'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { goToGoogle } from '@/lib/google-flow';
import { AuthAside, AuthShell, Field, FormError, SubmitButton, textLink } from '../_za/auth-shell';

export default function LoginPage() {
  const { signIn } = useSession();
  const router = useRouter();
  // Set by the public course pages, so someone who clicked "Sign in to enroll"
  // arrives at the catalog rather than at a dashboard they did not ask for.
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // `GAUTH-1`. Google is offered beside the password, never instead of it: an
  // account must already be connected to Google from its settings (`D-49`),
  // and a server without a Google client answers 503 with a message saying to
  // use the password, which is shown here as it is.
  async function continueWithGoogle() {
    setGoogleError(null);
    setGoogleBusy(true);
    try {
      goToGoogle('sign-in', await api.auth.googleStart(), next);
    } catch (cause) {
      setGoogleError(
        cause instanceof ApiError ? cause.message : 'Could not reach Google sign-in. Use your password.',
      );
      setGoogleBusy(false);
    }
  }

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
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in and pick up where you stopped."
      lead="Your lessons, notes, past-paper drills and progress are waiting exactly where you left them."
      aside={
        <AuthAside
          heading="Patient. Disciplined. Focused on your result."
          body="Every lesson is built to strengthen critical thinking, build confidence and prepare you for the exam — and for what comes after it."
        />
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-10">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
        />

        <div className="flex flex-wrap items-center justify-end gap-4">
          <Link
            href="/forgot-password"
            className="text-za-sm text-za-muted-foreground transition-colors duration-300 ease-in-expo hover:text-za-foreground"
          >
            Forgot your password?
          </Link>
        </div>

        {error ? <FormError>{error}</FormError> : null}

        <SubmitButton disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>

      <div className="mt-10 flex flex-col gap-3 border-t border-solid border-za-input pt-10">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={googleBusy}
          className="w-full rounded-full border border-solid border-za-foreground px-8 py-5 text-za-base transition-colors duration-300 ease-in-expo hover:bg-za-foreground hover:text-za-background disabled:cursor-wait disabled:opacity-60"
        >
          {googleBusy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="text-za-xs text-za-muted-foreground">
          For accounts already connected to Google in their settings.
        </p>
        {googleError ? (
          <p role="status" className="text-za-sm text-za-muted-foreground">
            {googleError}
          </p>
        ) : null}
      </div>

      <p className="mt-10 text-za-sm text-za-muted-foreground">
        New here?{' '}
        <Link href="/register" className={textLink}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
