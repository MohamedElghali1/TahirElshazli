'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AUTH_UNDERLINE, Decos, Underlined, Wordmark } from '../_te/parts';
import { Field, FormAlert, StrengthMeter, SubmitButton } from '../_te/fields';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('newPassword') ?? '');

    if (!PASSWORD_RULE.test(newPassword)) {
      setFieldError('At least 8 characters, including one letter and one number.');
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await api.auth.confirmPasswordReset({ token: token!, newPassword });
      router.push('/login');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reset your password. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="si">
      <header className="a-head">
        <Wordmark />
        <p>
          Back to <Link className="tl tl-inline" href="/login">Sign in</Link>
        </p>
      </header>

      <main id="main" className="si-main">
        <Decos />

        <div className="si-card bi">
          {!token ? (
            <div className="form">
              <div className="fgroup" style={{ marginBottom: 4 }}>
                <h1 className="auth-h">
                  That link is <Underlined auth path={AUTH_UNDERLINE}>incomplete</Underlined>
                </h1>
                <p className="auth-p">
                  Reset links expire after an hour and work once. Request a fresh one and use it straight away.
                </p>
              </div>
              <Link href="/forgot-password" className="btn btn-p btn-block">Request a new link</Link>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <div className="fgroup" style={{ marginBottom: 4 }}>
                <h1 className="auth-h">
                  Set a new <Underlined auth path={AUTH_UNDERLINE}>password</Underlined>
                </h1>
                <p className="auth-p">You will be signed out everywhere else once this is saved.</p>
              </div>

              <Field
                label="New password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a new password"
                autoFocus
                error={fieldError}
                onValue={setPassword}
                below={<StrengthMeter password={password} />}
              />

              {error ? <FormAlert>{error}</FormAlert> : null}

              <SubmitButton busy={busy} idle="Save password" working="Saving…" />
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
