'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { goToGoogle } from '@/lib/google-flow';
import { CONTACT } from '@/lib/site-content';
import { AUTH_UNDERLINE, Decos, Underlined, Wordmark } from '../_te/parts';
import { Field, FormAlert, GoogleMark, SubmitButton } from '../_te/fields';

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
    <div className="si">
      <header className="a-head">
        <Wordmark />
        <p>
          New here?{' '}
          <Link className="tl tl-inline" href="/register">Create an account</Link>
        </p>
      </header>

      <main id="main" className="si-main">
        <Decos />

        <div className="si-card bi">
          <form className="form" onSubmit={submit} noValidate>
            <div className="fgroup" style={{ marginBottom: 4 }}>
              <h1 className="auth-h">
                Welcome <Underlined auth path={AUTH_UNDERLINE}>back</Underlined>
              </h1>
              <p className="auth-p">Pick up right where you left off.</p>
            </div>

            <button type="button" className="btn btn-o btn-block" onClick={continueWithGoogle} disabled={googleBusy}>
              <GoogleMark />
              {googleBusy ? 'Opening Google…' : 'Continue with Google'}
            </button>
            {googleError ? <div role="status" className="note">{googleError}</div> : null}

            <div className="sep">or</div>

            <Field label="Email" name="email" type="email" autoComplete="username" placeholder="you@example.com" autoFocus />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              aside={<Link className="tl tl-sm" href="/forgot-password">Forgot password?</Link>}
            />

            {error ? (
              <FormAlert>
                {error}{' '}
                <Link href="/forgot-password" style={{ color: '#8C1D18', fontWeight: 600 }}>Reset your password</Link>.
              </FormAlert>
            ) : null}

            <SubmitButton busy={busy} idle="Sign in" working="Signing in…" />
          </form>
        </div>

        <p className="si-help bi" style={{ animationDelay: '200ms' }}>
          Trouble signing in?{' '}
          <a className="tl tl-inline" href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer">Message support</a>
        </p>
      </main>
    </div>
  );
}
