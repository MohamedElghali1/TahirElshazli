'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AUTH_UNDERLINE, Decos, Underlined, Wordmark } from '../_te/parts';
import { Field, FormAlert, SubmitButton } from '../_te/fields';

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
      setError(cause instanceof ApiError ? cause.message : 'Could not send the reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="si">
      <header className="a-head">
        <Wordmark />
        <p>
          Remembered it? <Link className="tl tl-inline" href="/login">Sign in</Link>
        </p>
      </header>

      <main id="main" className="si-main">
        <Decos />

        <div className="si-card bi">
          {sent ? (
            <div className="form" role="status">
              <div className="fgroup" style={{ marginBottom: 4 }}>
                <h1 className="auth-h">
                  Check your <Underlined auth path={AUTH_UNDERLINE}>inbox</Underlined>
                </h1>
                <p className="auth-p">
                  If that address has an account, a reset link is on its way. The link works once and expires in an
                  hour.
                </p>
              </div>
              <Link href="/login" className="btn btn-o btn-block">Back to sign in</Link>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <div className="fgroup" style={{ marginBottom: 4 }}>
                <h1 className="auth-h">
                  Reset your <Underlined auth path={AUTH_UNDERLINE}>password</Underlined>
                </h1>
                <p className="auth-p">We will email you a link to set a new one.</p>
              </div>

              <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" autoFocus />

              {error ? <FormAlert>{error}</FormAlert> : null}

              <SubmitButton busy={busy} idle="Send reset link" working="Sending…" />
              <Link className="tl tl-sm" href="/login" style={{ alignSelf: 'center' }}>Back to sign in</Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
