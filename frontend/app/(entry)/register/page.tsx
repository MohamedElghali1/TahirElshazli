'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { AUTH_UNDERLINE, Underlined, Wordmark } from '../_te/parts';
import { Field, FormAlert, StrengthMeter, SubmitButton } from '../_te/fields';
import Image from 'next/image';

/** Mirrors the backend's RegisterDto rule, so the failure is caught here first. */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function RegisterPage() {
  const { register } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
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
    if (name.length < 2) next.name = 'Enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address';
    if (!PASSWORD_RULE.test(password)) next.password = 'At least 8 characters, one letter and one number';
    if (data.get('terms') !== 'on') next.terms = 'Agree to the Terms and Privacy Policy to continue';

    setFieldErrors(next);
    setError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const result = await register(name, email, password);
      // SHELL-5: register returns { status: 'waiting' } and no credential.
      // The UI must not navigate, must not assume a session, and must not try
      // to distinguish waiting from rejected by any API error - the waiting
      // state comes only from this 201 body.
      if (result.status === 'waiting') setWaiting(true);
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
    <div className="su">
      <header className="a-head">
        <Wordmark />
        <p>
          Already have an account?{' '}
          <Link className="tl tl-inline" href="/login">Sign in</Link>
        </p>
      </header>

      <div className="su-shell">
        <div className="split">
          <section className="formcol" id="main">
            {waiting ? (
              // SHELL-5: shown after a successful registration. No session,
              // no redirect, no dashboard.
              <div className="wait bi">
                <h1 className="auth-h">
                  You’re <Underlined auth path={AUTH_UNDERLINE}>in the queue.</Underlined>
                </h1>
                <p role="status" className="auth-p">
                  Your account is being reviewed. We will let you know once your place is confirmed — this usually takes one working day.
                </p>
                <Link className="btn btn-p" href="/login">Back to sign in</Link>
              </div>
            ) : (
              <form className="form" onSubmit={submit} noValidate>
                <div className="su-head bi">
                  <span className="su-tag"><b>Free to join</b></span>
                  <h1 className="auth-h">
                    Create your <Underlined auth path={AUTH_UNDERLINE}>account</Underlined>
                  </h1>
                  <p className="sub">Join the students learning English with Tahir Elshazli.</p>
                </div>

                <Field label="Full name" name="name" autoComplete="name" placeholder="Mariam Hassan" autoFocus error={fieldErrors.name} delay={160} />
                <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={fieldErrors.email} delay={200} />
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Create a password"
                  error={fieldErrors.password}
                  onValue={setPassword}
                  below={<StrengthMeter password={password} />}
                  delay={280}
                />

                <div className="fgroup bi" style={{ animationDelay: '320ms' }}>
                  <label className="cb">
                    <input type="checkbox" name="terms" />
                    <span className="box">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                      </svg>
                    </span>
                    <span>
                      I agree to the <Link className="tl tl-inline" href="/terms">Terms</Link> and{' '}
                      <Link className="tl tl-inline" href="/privacy">Privacy Policy</Link>
                    </span>
                  </label>
                  {fieldErrors.terms ? <span className="ferr" role="alert">{fieldErrors.terms}</span> : null}
                </div>

                {error ? <FormAlert>{error}</FormAlert> : null}

                <SubmitButton busy={busy} idle="Create account" working="Creating account…" delay={360} />
              </form>
            )}
          </section>

          <aside className="panel" aria-label="A welcome from Tahir Elshazli">
            <svg className="nb" aria-hidden="true" viewBox="0 0 520 220" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0 60 H520 M0 104 H520 M0 148 H520 M0 192 H520" stroke="#D3DEF2" strokeWidth="1.5" />
              <path d="M64 0 V220" stroke="#F4C7C3" strokeWidth="1.5" />
              <text x="88" y="96" fontFamily="var(--font-caveat), cursive" fontSize="44" fontWeight="700" fill="#0B57D0">Aa</text>
              <text x="380" y="140" fontFamily="var(--font-caveat), cursive" fontSize="40" fontWeight="700" fill="#D93025">A+</text>
              <path d="M438 116 l10 10 l20 -24" stroke="#D93025" strokeWidth="2.5" />
            </svg>
            <div className="bubble bb">
              <span>Welcome! Let’s make English click.</span>
              <span>— Tahir Elshazli</span>
            </div>
            <Image
              className="pimg ru"
              src="/entry/hero.webp"
              alt="Tahir Elshazli taking a selfie with a group of smiling students"
              width={1672}
              height={832}
              priority
              sizes="(max-width: 899px) 170vw, 70vw"
            />
          </aside>
        </div>

        <p className="su-foot">
          © Tahir Elshazli 2026
          <Link className="tl" href="/privacy">Privacy</Link>
          <Link className="tl" href="/terms">Terms</Link>
        </p>
      </div>
    </div>
  );
}
